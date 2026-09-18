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
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
	}
	if got := response.Header().Get("X-Request-ID"); got != "request-123" {
		t.Fatalf("X-Request-ID = %q, want request-123", got)
	}
}

func TestObserveRequestsRecoversPanic(t *testing.T) {
	handler := observeRequests(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("sensitive route data")
	}))
	request := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusInternalServerError)
	}
}
