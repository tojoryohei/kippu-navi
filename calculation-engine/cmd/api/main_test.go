package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIRoutes(t *testing.T) {
	handler := func(name string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("X-Test-Handler", name)
			w.WriteHeader(http.StatusNoContent)
		}
	}
	mux := newAPIMux(handler("pass"), handler("icpass"), handler("ticket"))
	for _, tc := range []struct {
		method, path, handler string
		status                int
	}{
		{http.MethodPost, "/api/fare", "", http.StatusNotFound},
		{http.MethodPost, "/api/fare/ticket", "", http.StatusNotFound},
		{http.MethodGet, "/api/fare", "", http.StatusNotFound},
		{http.MethodGet, "/api/fare/ticket", "", http.StatusNotFound},
		{http.MethodGet, "/api/split-pass", "pass", http.StatusNoContent},
		{http.MethodGet, "/api/split-icpass", "icpass", http.StatusNoContent},
		{http.MethodGet, "/api/split-ticket", "ticket", http.StatusNoContent},
	} {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest(tc.method, tc.path, nil))
			if response.Code != tc.status {
				t.Fatalf("ステータス = %d, 期待値 %d", response.Code, tc.status)
			}
			if got := response.Header().Get("X-Test-Handler"); got != tc.handler {
				t.Errorf("ハンドラー = %q, 期待値 %q", got, tc.handler)
			}
		})
	}
}

func TestLocalDevelopmentCORSMethods(t *testing.T) {
	handler := allowLocalDevelopmentCORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("プリフライトリクエストがAPIハンドラーに到達しました")
	}))
	request := httptest.NewRequest(http.MethodOptions, "/api/split-ticket", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("ステータス = %d, 期待値 %d", response.Code, http.StatusNoContent)
	}
	if got := response.Header().Get("Access-Control-Allow-Methods"); got != "GET, OPTIONS" {
		t.Errorf("許可するメソッド = %q, 期待値 GET, OPTIONS", got)
	}
}
