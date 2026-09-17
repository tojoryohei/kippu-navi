package handler

import (
	"calculation-engine/internal/pass/graph"
	"calculation-engine/internal/pass/usecase"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// Split は分割定期券の最適解を計算するHTTPリクエストを処理します。
type Split struct {
	graph interface {
		graph.StationProvider
		graph.TopologyProvider
	}
	search *usecase.SearchOptimalSplit
}

// NewSplit は新しい Split を作成します。
func NewSplit(
	g interface {
		graph.StationProvider
		graph.TopologyProvider
	},
	search *usecase.SearchOptimalSplit,
) *Split {
	return &Split{
		graph:  g,
		search: search,
	}
}

// CalculateResponse はレスポンスのペイロードを表現します。
type CalculateResponse struct {
	Normal  []string   `json:"normal"`
	Results [][]string `json:"results"`
	Error   string     `json:"error,omitempty"`
}

// HandleCalculate は計算リクエストを処理します。
func (h *Split) HandleCalculate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeErrorResponse(w, http.StatusMethodNotAllowed, "許可されていないメソッドです")
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=86400, s-maxage=604800")

	query := r.URL.Query()
	from := query.Get("from")
	to := query.Get("to")
	monthsStr := query.Get("months")

	if from == "" || to == "" || monthsStr == "" {
		writeErrorResponse(w, http.StatusBadRequest, "必要なパラメーター(from, to, months)が不足しています")
		return
	}

	months, err := strconv.Atoi(monthsStr)
	if err != nil || (months != 1 && months != 3 && months != 6) {
		writeErrorResponse(w, http.StatusBadRequest, "定期券の期間は1箇月、3箇月、6箇月のいずれかを指定してください")
		return
	}

	reqStart := from
	reqEnd := to
	reqMonths := months

	startID, okStart := h.graph.GetID(reqStart)
	endID, okEnd := h.graph.GetID(reqEnd)

	if !okStart || !okEnd {
		writeErrorResponse(w, http.StatusBadRequest, "存在しない駅名が含まれています")
		return
	}

	if startID == endID {
		writeErrorResponse(w, http.StatusBadRequest, "出発駅と到着駅が同じです")
		return
	}

	// O(1) 事前バリデーション: 連結成分（エリア）のチェック
	startGroupID := h.graph.GetGroupID(startID)
	endGroupID := h.graph.GetGroupID(endID)
	if startGroupID == 0 || endGroupID == 0 || startGroupID != endGroupID {
		writeErrorResponse(w, http.StatusUnprocessableEntity, "指定された区間は対象外エリア、または異なるエリア間にまたがっています")
		return
	}

	maxSections, err := parseMaxSplits(query)
	if err != nil {
		writeErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}
	if h.search.MaxSectionsLimit() > 0 && query.Has("maxSplits") {
		if maxSections == 0 || maxSections > h.search.MaxSectionsLimit() {
			writeErrorResponse(w, http.StatusBadRequest, "IC定期券の最大分割数は1回まで指定できます")
			return
		}
	}
	lockedStations, err := parseLockedStationIDs(query, h.graph)
	if err != nil {
		writeErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}
	optResult, err := h.search.ExecuteWithOptions(startID, endID, reqMonths, maxSections, lockedStations)
	if err != nil {
		log.Printf("分割定期券の計算エラー: %v", err)

		errMsg := err.Error()
		if lastIdx := strings.LastIndex(errMsg, ":"); lastIdx != -1 {
			errMsg = strings.TrimSpace(errMsg[lastIdx+1:])
		}

		writeErrorResponse(w, http.StatusInternalServerError, errMsg)
		return
	}

	var normalResp []string
	var apiResults [][]string

	for i, path := range optResult {
		names := make([]string, len(path))
		for j, id := range path {
			names[j] = h.graph.GetName(id)
		}
		if i == 0 {
			normalResp = names
		} else {
			apiResults = append(apiResults, names)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(CalculateResponse{
		Normal:  normalResp,
		Results: apiResults,
	}); err != nil {
		log.Printf("レスポンスのエンコードエラー: %v", err)
	}
}

// parseMaxSplits は分割回数指定を内部の最大区間数へ変換します。
// 省略または0の場合は0（無制限）を返します。
func parseMaxSplits(query url.Values) (int, error) {
	if !query.Has("maxSplits") {
		return 0, nil
	}
	raw := query.Get("maxSplits")
	maxSplits, err := strconv.Atoi(raw)
	if err != nil || maxSplits < 0 || maxSplits > 10 {
		return 0, fmt.Errorf("maxSplitsは0以上10以下の整数で指定してください")
	}
	if maxSplits == 0 {
		return 0, nil
	}
	return maxSplits + 1, nil
}

func parseLockedStationIDs(query url.Values, stations graph.StationProvider) ([]int, error) {
	values, ok := query["noSplitStation"]
	if !ok {
		return nil, nil
	}
	ids := make([]int, 0, len(values))
	seen := make(map[int]struct{}, len(values))
	for _, name := range values {
		name = strings.TrimSpace(name)
		if name == "" {
			return nil, fmt.Errorf("noSplitStationに空の駅名は指定できません")
		}
		id, exists := stations.GetID(name)
		if !exists {
			return nil, fmt.Errorf("存在しない分割禁止駅名が含まれています: %s", name)
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids, nil
}

func writeErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(CalculateResponse{Error: message}); err != nil {
		log.Printf("エラーレスポンスのエンコードエラー: %v", err)
	}
}
