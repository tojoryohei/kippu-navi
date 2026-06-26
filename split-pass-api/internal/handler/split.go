package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/usecase"
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

// CalculateRequest はリクエストのペイロードを表現します。
type CalculateRequest struct {
	Start  string `json:"start"`
	End    string `json:"end"`
	Months int    `json:"months"`
}

// CalculateResponse はレスポンスのペイロードを表現します。
type CalculateResponse struct {
	Normal  []string   `json:"normal"`
	Results [][]string `json:"results"`
	Error   string     `json:"error,omitempty"`
}

// HandleCalculate は計算リクエストを処理します。
func (h *Split) HandleCalculate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		writeErrorResponse(w, http.StatusMethodNotAllowed, "許可されていないメソッドです")
		return
	}

	var req CalculateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorResponse(w, http.StatusBadRequest, "不正なリクエスト形式です")
		return
	}

	if req.Months != 1 && req.Months != 3 && req.Months != 6 {
		writeErrorResponse(w, http.StatusBadRequest, "定期券の期間は1ヶ月、3ヶ月、6ヶ月のいずれかを指定してください")
		return
	}

	startID, okStart := h.graph.GetID(req.Start)
	endID, okEnd := h.graph.GetID(req.End)

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

	optResult, err := h.search.Execute(startID, endID, req.Months)
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

func writeErrorResponse(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if err := json.NewEncoder(w).Encode(CalculateResponse{Error: message}); err != nil {
		log.Printf("エラーレスポンスのエンコードエラー: %v", err)
	}
}
