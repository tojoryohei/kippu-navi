package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"split-pass-api/internal/domain"
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

// SegmentResponse は駅名を含む評価済みの区間を表現します。
type SegmentResponse struct {
	Path           []string                   `json:"path"`
	Via            []string                   `json:"via"`
	Result         *usecase.CalculationResult `json:"result"`
	TotalEigyoKilo domain.DeciKilo            `json:"totalEigyoKilo"`
}

// ResultResponse は1つの最適な分割パターンを表現します。
type ResultResponse struct {
	TotalAmount int               `json:"totalAmount"`
	Segments    []SegmentResponse `json:"segments"`
}

// CalculateResponse はレスポンスのペイロードを表現します。
type CalculateResponse struct {
	Normal  *ResultResponse  `json:"normal,omitempty"`
	Results []ResultResponse `json:"results"`
	Error   string           `json:"error,omitempty"`
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

	mapToResultResponse := func(res usecase.SplitResult) ResultResponse {
		apiSegments := make([]SegmentResponse, len(res.Segments))
		for j, seg := range res.Segments {
			pathNames := make([]string, len(seg.Path))
			for k, id := range seg.Path {
				pathNames[k] = h.graph.GetName(id)
			}
			viaNames := usecase.GetVia(h.graph, seg.Path)

			var eigyo domain.DeciKilo
			if seg.Result != nil {
				eigyo = seg.Result.TotalEigyoKilo
			}

			apiSegments[j] = SegmentResponse{
				Path:           pathNames,
				Via:            viaNames,
				Result:         seg.Result,
				TotalEigyoKilo: eigyo,
			}
		}
		return ResultResponse{
			TotalAmount: res.TotalAmount,
			Segments:    apiSegments,
		}
	}

	var normalResp *ResultResponse
	if optResult.Normal.TotalAmount > 0 {
		nr := mapToResultResponse(optResult.Normal)
		normalResp = &nr
	}

	apiResults := make([]ResultResponse, len(optResult.Optimals))
	for i, res := range optResult.Optimals {
		apiResults[i] = mapToResultResponse(res)
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
