package cmd

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Independent regression probes: only loopback fixtures or an in-memory transport.
func TestQASecurityLoginDoesNotForwardCredentialOnTLSHTTPRedirect(t *testing.T) {
	const secret = "qa-fixture-not-a-real-secret"
	forwarded := ""
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		forwarded = r.Header.Get("Authorization")
		_, _ = io.WriteString(w, `{"code":"fixture","expiresIn":60}`)
	}))
	defer target.Close()
	source := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL+"/capture", http.StatusTemporaryRedirect)
	}))
	defer source.Close()
	_, err := requestLoginHandoff(context.Background(), source.Client(), source.URL, "QA", secret)
	if forwarded != "" {
		t.Error("login forwarded installation credential from HTTPS to a different HTTP port")
	}
	if err == nil {
		t.Error("login accepted a redirected handoff")
	}
}

type qaSecurityTransport func(*http.Request) (*http.Response, error)

func (roundTrip qaSecurityTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	return roundTrip(r)
}

func TestQASecurityLoginRejectsRemoteHTTPBeforeSendingCredential(t *testing.T) {
	sent := false
	client := &http.Client{Transport: qaSecurityTransport(func(r *http.Request) (*http.Response, error) {
		sent = r.Header.Get("Authorization") != ""
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header),
			Body: io.NopCloser(strings.NewReader(`{"code":"fixture","expiresIn":60}`)), Request: r}, nil
	})}
	_, err := requestLoginHandoff(context.Background(), client, "http://factory.example", "QA", "qa-fixture")
	if sent {
		t.Error("login attempted to send installation credential over remote HTTP")
	}
	if err == nil {
		t.Error("login accepted a remote plaintext server address")
	}
}

func TestQASecurityAuthenticatedRequestsValidateURLs(t *testing.T) {
	for _, address := range []string{
		"http://factory.example/api/chat", "ftp://localhost/api/emote",
		"https://user:qa-fixture@factory.example/api/auth/handoff", "https:///api/chat",
		"https://factory.example/api/chat?x=1", "https://factory.example/api/chat#x",
		"https://factory.example/api/chat?", "https://factory.example/%zz",
	} {
		t.Run(address, func(t *testing.T) {
			t.Setenv("HOME", t.TempDir())
			_, err := newAuthenticatedJSONRequest(context.Background(), http.MethodPost, address, []byte(`{}`))
			if err == nil {
				t.Fatal("accepted unsafe authenticated request")
			}
			if strings.Contains(err.Error(), "qa-fixture") {
				t.Fatal("included URL credential in error")
			}
		})
	}
	for _, address := range []string{"https://factory.example/api/chat", "http://localhost:4242/api/chat", "http://127.0.0.2:4242/api/emote", "http://[::1]:4242/api/chat"} {
		if _, err := newDeviceJSONRequest(context.Background(), http.MethodPost, address, []byte(`{}`), "fixture-only"); err != nil {
			t.Errorf("refused supported address: %v", err)
		}
	}
}

func TestQASecuritySharedClientRefusesEveryRedirectEvenWhenCallerAllowsIt(t *testing.T) {
	for _, status := range []int{301, 302, 303, 307, 308} {
		calls := 0
		client := &http.Client{CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return nil },
			Transport: qaSecurityTransport(func(r *http.Request) (*http.Response, error) {
				calls++
				if calls > 1 {
					t.Fatal("credential request reached redirect target")
				}
				return &http.Response{StatusCode: status, Header: http.Header{"Location": []string{"http://factory.example/capture"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
			})}
		request, err := newDeviceJSONRequest(context.Background(), http.MethodPost, "https://factory.example/api/chat", []byte(`{}`), "fixture-only")
		if err != nil {
			t.Fatal(err)
		}
		response, err := doAuthenticatedRequest(client, request)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != status || calls != 1 {
			t.Errorf("redirect %d was not returned unchanged", status)
		}
	}
}

func TestQASecurityLoginDoesNotIncludeCredentialInErrors(t *testing.T) {
	for _, transportFailure := range []bool{false, true} {
		client := &http.Client{Transport: qaSecurityTransport(func(r *http.Request) (*http.Response, error) {
			if transportFailure {
				return nil, errors.New("failed with qa-fixture-secret")
			}
			return &http.Response{StatusCode: 401, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"error":"invalid qa-fixture-secret"}`)), Request: r}, nil
		})}
		_, err := requestLoginHandoff(context.Background(), client, "https://factory.example", "QA", "qa-fixture-secret")
		if err == nil || strings.Contains(err.Error(), "qa-fixture-secret") {
			t.Fatalf("unsafe error: %v", err)
		}
	}
}
