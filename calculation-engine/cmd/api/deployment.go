package main

import "net/http"

// deploymentCommit is embedded in the binary, never supplied by the request.
var deploymentCommit = "local"

type deploymentResponseWriter struct {
	http.ResponseWriter
	commit      string
	wroteHeader bool
}

func (w *deploymentResponseWriter) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	w.Header().Set("X-Deployment-Commit", w.commit)
	w.Header().Set("Cache-Control", "no-store")
	w.ResponseWriter.WriteHeader(status)
}

func (w *deploymentResponseWriter) Write(body []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func (w *deploymentResponseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func deploymentIdentity(next http.Handler, environment, commit string) http.Handler {
	if environment != "staging" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Deployment-Commit", commit)
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(&deploymentResponseWriter{ResponseWriter: w, commit: commit}, r)
	})
}
