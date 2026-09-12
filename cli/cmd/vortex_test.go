package cmd

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestVortexAuthenticatesAndRequiresConfirmation(t *testing.T) {
	for _, tc := range []struct {
		status  int
		body    string
		success bool
	}{
		{200, `{"ok":true}`, true}, {200, `{"ok":false}`, false}, {200, `not-json`, false},
		{401, `{"error":"unauthorized"}`, false}, {429, `{"error":"busy"}`, false}, {503, `unavailable`, false},
	} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			body, _ := io.ReadAll(r.Body)
			if r.Method != http.MethodPost || r.URL.Path != "/api/vortex" || r.Header.Get("Authorization") != "Bearer fixture-only" || string(body) != "{}" {
				t.Error("invalid authenticated vortex request")
			}
			w.WriteHeader(tc.status)
			_, _ = w.Write([]byte(tc.body))
		}))
		err := requestVortex(context.Background(), server.Client(), server.URL, "fixture-only")
		server.Close()
		if (err == nil) != tc.success {
			t.Errorf("status %d body %s: %v", tc.status, tc.body, err)
		}
		if err != nil && strings.Contains(err.Error(), "fixture-only") {
			t.Error("credential leaked in error")
		}
	}
}

func TestVortexRejectsUnsafeURLsAndRedirects(t *testing.T) {
	for _, url := range []string{"http://factory.example", "ftp://localhost", "https://user@factory.example", "https://factory.example?query=x", "https://factory.example#fragment"} {
		if err := requestVortex(context.Background(), http.DefaultClient, url, "fixture-only"); err == nil {
			t.Errorf("accepted %s", url)
		}
	}
	forwarded := false
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { forwarded = true }))
	defer other.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL, http.StatusTemporaryRedirect)
	}))
	defer source.Close()
	if err := requestVortex(context.Background(), source.Client(), source.URL, "fixture-only"); err == nil {
		t.Error("accepted redirect")
	}
	if forwarded {
		t.Error("forwarded the credential")
	}
}
