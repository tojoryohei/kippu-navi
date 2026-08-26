package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/usecase"
)

type Ticket struct {
	graph     graph.Graph
	corrector usecase.PathCorrector
	evaluator *usecase.TicketSegmentEvaluator
}

func NewTicket(g graph.Graph, c usecase.PathCorrector, e *usecase.TicketSegmentEvaluator) *Ticket {
	return &Ticket{
		graph:     g,
		corrector: c,
		evaluator: e,
	}
}

type PathStep struct {
	StationName string  `json:"stationName"`
	LineName    *string `json:"lineName"`
}

type RouteRequest struct {
	FullPath        []PathStep `json:"fullPath"`
	CalculationMode string     `json:"calculationMode"`
}

type KippuData struct {
	TotalEigyoKilo   int      `json:"totalEigyoKilo"`
	DepartureStation string   `json:"departureStation"`
	ArrivalStation   string   `json:"arrivalStation"`
	PrintedViaLines  []string `json:"printedViaLines"`
	Fare             int      `json:"fare"`
	ValidDays        int      `json:"validDays"`
}

type RouteResponse struct {
	Data KippuData `json:"data"`
	Time float64   `json:"time"`
}

type ErrorResponse struct {
	Error string  `json:"error"`
	Time  float64 `json:"time"`
}

func (h *Ticket) HandleCalculateFare(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	if r.Method != http.MethodPost {
		h.writeError(w, http.StatusMethodNotAllowed, "許可されていないメソッドです", start)
		return
	}

	var req RouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.writeError(w, http.StatusBadRequest, "リクエストの解析に失敗しました", start)
		return
	}

	if len(req.FullPath) < 2 {
		h.writeError(w, http.StatusBadRequest, "経路がありません。", start)
		return
	}
	if len(req.FullPath) >= 3000 {
		h.writeError(w, http.StatusBadRequest, "経由路線の上限は3000です。", start)
		return
	}

	pathIDs := make([]int, 0, len(req.FullPath))
	for _, p := range req.FullPath {
		id, ok := h.graph.GetID(p.StationName)
		if !ok {
			h.writeError(w, http.StatusBadRequest, "不明な駅が含まれています: "+p.StationName, start)
			return
		}
		pathIDs = append(pathIDs, id)
	}

	// 経路補正（calculationModeに応じて処理を変える場合はここで分岐可能ですが、一旦すべて同じ処理とします）
	correctedPath, err := h.corrector.Correct(pathIDs, h.graph)
	if err != nil {
		h.writeError(w, http.StatusBadRequest, "経路の補正に失敗しました: "+err.Error(), start)
		return
	}

	// 運賃計算（TicketSegmentEvaluator に委譲）
	res, err := h.evaluator.Execute(correctedPath, 0)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "運賃計算に失敗しました: "+err.Error(), start)
		return
	}

	// 有効日数の計算（JR・他社線の合計営業キロから算出）
	validDays := domain.CalculateValidDaysFromKilo(res.TotalPathEigyoKilo)

	kippuData := KippuData{
		TotalEigyoKilo:   int(res.TotalEigyoKilo),
		DepartureStation: h.graph.GetName(res.FinalPath[0]),
		ArrivalStation:   h.graph.GetName(res.FinalPath[len(res.FinalPath)-1]),
		PrintedViaLines:  []string{}, // 経由印字は現在未実装のため空配列
		Fare:             res.TotalAmount(),
		ValidDays:        validDays,
	}

	response := RouteResponse{
		Data: kippuData,
		Time: float64(time.Since(start).Nanoseconds()) / 1000000.0,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func (h *Ticket) writeError(w http.ResponseWriter, statusCode int, message string, start time.Time) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(ErrorResponse{
		Error: message,
		Time:  float64(time.Since(start).Nanoseconds()) / 1000000.0,
	})
}
