package main

import (
	"calculation-engine/internal/graphdata"
	ticketfareio "calculation-engine/internal/ticket/infra/fareio"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"
)

func init() {
	ticketDataReader = func() io.Reader { return graphdata.GetEdgesReader() }
	fareDataReaders = graphdata.GetFareGraphEdgeReaders
	graphdataSpecialZonesReader = func() io.Reader { return graphdata.GetSpecialZonesReader() }
	readZoneRoutesBytes = func() []byte {
		b, _ := io.ReadAll(graphdata.GetZoneRoutesReader())
		return b
	}
	ticketFareRegistry = ticketfareio.NewRegistry
}

func main() {
	if err := run(); err != nil {
		log.Fatalf("第114条候補スキャンに失敗しました: %v", err)
	}
}

func run() error {
	flags := flag.NewFlagSet("scan-article114", flag.ContinueOnError)
	csvPath := flags.String("csv", "article114_candidates.csv", "候補CSVの出力先")
	jsonPath := flags.String("json", "article114_summary.json", "集計JSONの出力先")
	applicableOnly := flags.Bool("applicable-only", false, "第114条適用対象だけを出力")
	if err := flags.Parse(os.Args[1:]); err != nil {
		return err
	}
	return runScan(scanOptions{CSVPath: *csvPath, JSONPath: *jsonPath, ApplicableOnly: *applicableOnly})
}

func runScan(options scanOptions) error {
	if options.CSVPath == "" || options.JSONPath == "" {
		return fmt.Errorf("出力先を指定してください")
	}
	data, err := newScanData()
	if err != nil {
		return fmt.Errorf("データ初期化: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(options.CSVPath), 0o755); err != nil && filepath.Dir(options.CSVPath) != "." {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(options.JSONPath), 0o755); err != nil && filepath.Dir(options.JSONPath) != "." {
		return err
	}
	csvFile, err := os.Create(options.CSVPath)
	if err != nil {
		return err
	}
	defer csvFile.Close()
	w := csv.NewWriter(csvFile)
	header := []string{"source", "zone", "center", "origin_station", "boundary_station", "outside_station", "direction", "threshold_deci_kilo", "center_b_eigyo", "center_c_eigyo", "center_b_gisei", "center_c_gisei", "ab_eigyo", "ab_gisei", "registered_fare", "raw_ab_fare", "raw_center_c_fare", "current_ab_fare", "current_center_c_fare", "raw_saving", "current_saving", "classification", "adjusted_match", "path_ab", "path_ac", "center_path_c", "error"}
	if err := w.Write(header); err != nil {
		return err
	}

	stats := &scanStats{StartedAt: time.Now(), Zones: len(data.zones.Zones), PerZone: make(map[string]zoneStats), DataHashes: data.dataHashes, CSVPath: options.CSVPath, JSONPath: options.JSONPath, CandidateRows: make([]map[string]any, 0)}
	seenCandidates := make(map[string]struct{})
	recordCandidate := func(candidate article114Candidate) {
		key := candidate.zoneName + "|" + candidate.source + "|" + routeKey(candidate.pathAB) + "|" + routeKey(candidate.pathAC)
		if _, exists := seenCandidates[key]; exists {
			return
		}
		seenCandidates[key] = struct{}{}
		if candidate.source == "adjusted_fare_reference" {
			evaluateAdjustedFareReference(data, &candidate)
		} else {
			evaluateCandidate(data, &candidate)
		}
		stats.Candidates++
		zs := stats.PerZone[candidate.zoneName]
		zs.Candidates++
		switch candidate.classification {
		case classificationUncovered:
			stats.Uncovered++
			zs.Uncovered++
		case classificationCovered:
			stats.Covered++
			zs.Covered++
		case classificationNone:
			stats.NotApplicable++
			zs.NotApplicable++
		case classificationError:
			stats.EvaluationError++
			zs.EvaluationError++
		}
		stats.PerZone[candidate.zoneName] = zs
		if options.ApplicableOnly && !isApplicableCandidate(candidate) {
			return
		}
		stats.OutputCandidates++
		zs.OutputCandidates++
		stats.PerZone[candidate.zoneName] = zs
		stats.CandidateRows = append(stats.CandidateRows, candidateToJSON(candidate, data.full))
		record := []string{
			candidate.source, candidate.zoneName, candidate.centerName, candidate.originName, candidate.boundaryName, candidate.outsideName, candidate.direction,
			fmt.Sprint(candidate.threshold), fmt.Sprint(candidate.centerBEigyo), fmt.Sprint(candidate.centerCEigyo), fmt.Sprint(candidate.centerBGisei), fmt.Sprint(candidate.centerCGisei),
			fmt.Sprint(candidate.abEigyo), fmt.Sprint(candidate.abGisei), fmt.Sprint(candidate.registeredFare), fmt.Sprint(candidate.rawAB), fmt.Sprint(candidate.rawXC), fmt.Sprint(candidate.currentAB), fmt.Sprint(candidate.currentXC),
			fmt.Sprint(candidate.rawAB - candidate.rawXC), fmt.Sprint(candidate.currentAB - candidate.currentXC), candidate.classification, fmt.Sprint(candidate.adjustedMatch),
			candidateNames(data.full, candidate.pathAB), candidateNames(data.full, candidate.pathAC), candidateNames(data.full, candidate.centerPathC), candidate.errorMessage,
		}
		if err := w.Write(record); err != nil {
			log.Printf("CSV書き込み: %v", err)
		}
	}
	for _, zone := range data.zones.Zones {
		zoneStarted := time.Now()
		data.scanZone(zone, stats, recordCandidate)
		log.Printf("%s: 探索完了（累計候補 %d、出力 %d、経過 %s）", zone.Name, stats.Candidates, stats.OutputCandidates, time.Since(zoneStarted).Round(time.Millisecond))
	}
	for _, candidate := range data.adjustedFareReferences() {
		recordCandidate(candidate)
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return err
	}
	stats.FinishedAt = time.Now()
	stats.DurationMillis = stats.FinishedAt.Sub(stats.StartedAt).Milliseconds()
	jsonData, err := json.MarshalIndent(stats, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(options.JSONPath, jsonData, 0o644); err != nil {
		return err
	}
	log.Printf("候補 %d 件、未登録 %d 件、対応済み %d 件、対象外 %d 件、評価エラー %d 件", stats.Candidates, stats.Uncovered, stats.Covered, stats.NotApplicable, stats.EvaluationError)
	return nil
}
