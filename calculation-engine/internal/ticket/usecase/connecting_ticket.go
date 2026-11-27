package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"slices"
)

type transportKind uint8

const (
	jrOnly transportKind = iota
	privateOnly
	connectingTransport
	throughTransport
)

// start と end は最初と最後のJR辺の外端（駅の添字）。接続駅は両区間に含める。
type jrSection struct{ start, end int }

func classifyTransport(path []int, g graph.Graph) (transportKind, jrSection) {
	first, last := -1, -1
	for i := 0; i+1 < len(path); i++ {
		if isPrivateTicketEdge(path[i], path[i+1], g) {
			continue
		}
		if first < 0 {
			first = i
		} else if last != i {
			return throughTransport, jrSection{}
		}
		last = i + 1
	}
	switch {
	case first < 0:
		return privateOnly, jrSection{}
	case first == 0 && last == len(path)-1:
		return jrOnly, jrSection{first, last}
	default:
		return connectingTransport, jrSection{first, last}
	}
}

// FinalPath に連絡券の実経路を残し、ゾーンを含むJR運賃計算経路を別に保持する。
type connectingTicket struct {
	jrSection
	jrFarePath []int
}

func (u *CalculateAmount) evaluateConnection(path []int, evaluate func([]int) (*CalculationResult, error)) (*CalculationResult, error) {
	// 発売制限は、切り出したJR区間ではなく乗車券全体に適用する。
	if domain.IsKitaSenjuAyasePath(path, u.graph.GetName) {
		return nil, domain.ErrRequestedSection
	}
	kind, section := classifyTransport(path, u.graph)
	if kind != connectingTransport {
		return evaluate(path)
	}
	res, err := evaluate(path[section.start : section.end+1])
	if err != nil {
		return nil, err
	}
	for _, tail := range [][]int{path[:section.start+1], path[section.end:]} {
		if len(tail) < 2 {
			continue
		}
		private, err := u.execute(tail, false)
		if err != nil {
			return nil, err
		}
		distance := private.Distances[domain.Other]
		res.Distances[domain.Other].EigyoKilo += distance.EigyoKilo
		res.Distances[domain.Other].GiseiKilo += distance.GiseiKilo
		res.TotalPathEigyoKilo += private.TotalPathEigyoKilo
		res.PrivateFareAmounts = append(res.PrivateFareAmounts, private.PrivateFareAmounts...)
		res.Fare += private.Fare
	}
	res.connection = &connectingTicket{section, res.FinalPath}
	res.FinalPath = path
	return res, nil
}

func (r *CalculationResult) ticketEndpoints() (int, int) {
	first, last := r.FinalPath[0], r.FinalPath[len(r.FinalPath)-1]
	if c := r.connection; c != nil {
		if c.start == 0 {
			first = c.jrFarePath[0]
		}
		if c.end == len(r.FinalPath)-1 {
			last = c.jrFarePath[len(c.jrFarePath)-1]
		}
	}
	return first, last
}

func (r *CalculationResult) printedVia(mode string, steps []ViaStep, source, printed []int, g graph.Graph, zones *graphio.SpecialZoneRegistry) []string {
	c := r.connection
	if c == nil {
		return GetCalculatedFareVia(mode, steps, source, printed, r.FinalPath, g, zones)
	}
	kind, section := classifyTransport(source, g)
	if kind != connectingTransport || len(steps) != len(source) {
		source = r.FinalPath
		section = c.jrSection
		steps = cheapestViaSteps(g, source)
	}
	jrVia := GetCalculatedFareVia(mode, steps[section.start:section.end+1], source[section.start:section.end+1], c.jrFarePath, c.jrFarePath, g, zones)
	var via []string
	loadViaData()
	if section.start > 0 {
		via = GetFareVia(steps[:section.start+1])
		printer := viaPrinter{}
		printer.appendPrivateStation(steps[section.start-1].LineName, steps[section.start].StationName)
		via = append(via, printer.render()...)
	}
	via = append(via, jrVia...)
	if section.end < len(steps)-1 {
		printer := viaPrinter{}
		printer.appendPrivateStation(steps[section.end].LineName, steps[section.end].StationName)
		via = append(via, printer.render()...)
		via = append(via, GetFareVia(steps[section.end:])...)
	}
	return slices.Compact(via)
}
