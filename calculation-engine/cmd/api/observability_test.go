package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestObserveRequestsPropagatesRequestID(t *testing.T) {
	handler := observeRequests(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodGet, "/api/test?from=東京", nil)
	request.Header.Set("X-Request-ID", "request-123")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("ステータス = %d, 期待値 %d", response.Code, http.StatusNoContent)
	}
	if got := response.Header().Get("X-Request-ID"); got != "request-123" {
		t.Fatalf("X-Request-ID = %q, 期待値 request-123", got)
	}
}

func TestObserveRequestsRecoversPanic(t *testing.T) {
	handler := observeRequests(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("機密の経路データ")
	}))
	request := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("ステータス = %d, 期待値 %d", response.Code, http.StatusInternalServerError)
	}
}
