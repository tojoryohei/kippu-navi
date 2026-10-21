package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDeploymentIdentity(t *testing.T) {
	for _, env := range []string{"staging", "production", ""} {
		for _, status := range []int{200, 400, 500} {
			handler := deploymentIdentity(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
			}), env, "built-sha")
			request := httptest.NewRequest(http.MethodGet, "/api/split/auto/ticket", nil)
			request.Header.Set("X-Deployment-Commit", "forged-sha")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			want := "built-sha"
			if response.Header().Get("X-Deployment-Commit") != want || response.Code != status {
				t.Fatalf("env=%q status=%d: incorrect deployment identity", env, status)
			}
			if env != "staging" && response.Header().Get("Cache-Control") != "" {
				t.Fatal("production cache headers changed")
			}
		}
	}
}

func TestDeploymentIdentityOverridesHandlerCachePolicy(t *testing.T) {
	for _, environment := range []string{"staging", "production"} {
		for _, explicitStatus := range []bool{true, false} {
			handler := deploymentIdentity(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Cache-Control", "public, s-maxage=2592000")
				w.Header().Set("X-Deployment-Commit", "wrong")
				if explicitStatus {
					w.WriteHeader(http.StatusOK)
				}
				_, _ = w.Write([]byte("body"))
			}), environment, "build")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
			wantCache := "public, s-maxage=2592000"
			if environment == "staging" {
				wantCache = "no-store"
			}
			if response.Result().Header.Get("Cache-Control") != wantCache || response.Result().Header.Get("X-Deployment-Commit") != "build" {
				t.Fatalf("環境%sの識別ヘッダーまたはキャッシュ方針が一致しません", environment)
			}
		}
	}
}
