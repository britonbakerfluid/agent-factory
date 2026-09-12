package hooks

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func qaHookCommand(t *testing.T, serverURL string, fakeCurl bool) (*exec.Cmd, string) {
	t.Helper()
	if _, err := exec.LookPath("jq"); err != nil {
		t.Skip("jq is required to run the hook")
	}
	fixtureHome := t.TempDir()
	dir := filepath.Join(fixtureHome, ".config", "agent-factory")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	config, _ := json.Marshal(map[string]string{"username": "QA", "serverUrl": serverURL})
	if err := os.WriteFile(filepath.Join(dir, "config.json"), config, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "identity.json"), []byte(`{"version":1,"secret":"afd1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	// Await only the fixture's child curl process so denial assertions are deterministic.
	script := strings.TrimSuffix(string(hookScript), "exit 0\n") + "wait\n"
	hookPath := filepath.Join(fixtureHome, "hook.sh")
	if err := os.WriteFile(hookPath, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	capture := filepath.Join(fixtureHome, "curl-args")
	binDir := filepath.Join(fixtureHome, "bin")
	if err := os.MkdirAll(binDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if fakeCurl {
		if err := os.WriteFile(filepath.Join(binDir, "curl"), []byte("#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$QA_CAPTURE\"\n"), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	// A user's global redirect preference must not change the hook's policy.
	if err := os.WriteFile(filepath.Join(fixtureHome, ".curlrc"), []byte("location\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	command := exec.Command("bash", hookPath)
	command.Stdin = strings.NewReader(`{"session_id":"qa-only","hook_event_name":"SessionStart","cwd":"/qa-fixture"}`)
	command.Env = append(os.Environ(), "HOME="+fixtureHome, "CURL_HOME="+fixtureHome, "PATH="+binDir+string(os.PathListSeparator)+os.Getenv("PATH"), "QA_CAPTURE="+capture)
	return command, capture
}

func TestQAHookRefusesUnsafeDestinationsBeforeInvokingCurl(t *testing.T) {
	for _, serverURL := range []string{"http://factory.example", "http://localhost.evil", "http://127.0.0.1.evil", "ftp://localhost", "https://user:secret@factory.example", "https://factory.example?query=x", "https://factory.example#fragment", "https://factory.example\\@evil", "http://127.0.0.256", "http://127.1", "http://127.0.0.01", "https://"} {
		t.Run(serverURL, func(t *testing.T) {
			command, capture := qaHookCommand(t, serverURL, true)
			if output, err := command.CombinedOutput(); err != nil {
				t.Fatalf("hook failed: %v %s", err, output)
			}
			if _, err := os.Stat(capture); !os.IsNotExist(err) {
				t.Fatal("unsafe request reached curl")
			}
		})
	}
}

func TestQAHookPreservesHTTPSAndLoopbackWithRedirectsDisabled(t *testing.T) {
	for _, serverURL := range []string{"https://factory.example/prefix/", "http://localhost:4242", "http://127.0.0.1:4242", "http://127.1.2.3:4242", "http://[::1]:4242"} {
		t.Run(serverURL, func(t *testing.T) {
			command, capture := qaHookCommand(t, serverURL, true)
			if output, err := command.CombinedOutput(); err != nil {
				t.Fatalf("hook failed: %v %s", err, output)
			}
			args, err := os.ReadFile(capture)
			if err != nil {
				t.Fatal("supported request did not reach curl")
			}
			if !bytes.HasPrefix(args, []byte("--disable\n")) || !bytes.Contains(args, []byte("--max-redirs\n0\n")) || !bytes.Contains(args, []byte("Authorization: Bearer afd1_")) {
				t.Fatal("request lost authentication or redirect safeguards")
			}
		})
	}
}

func TestQAHookDoesNotFollowRedirectFromGlobalCurlConfig(t *testing.T) {
	if _, err := exec.LookPath("curl"); err != nil {
		t.Skip("curl required")
	}
	forwarded := false
	var received atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { forwarded = true }))
	defer target.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received.Store(r.Header.Get("Authorization") != "")
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer source.Close()
	command, _ := qaHookCommand(t, source.URL, false)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("hook failed: %v %s", err, output)
	}
	if forwarded {
		t.Fatal("hook followed a redirect and forwarded the credential")
	}
	if !received.Load() {
		t.Fatal("the authenticated source request never reached the loopback fixture")
	}
}

func TestQAHookDistributionCopiesRemainIdentical(t *testing.T) {
	source, err := os.ReadFile("../../../hooks/agent-factory-hook.sh")
	if err != nil {
		t.Fatal(err)
	}
	installer, err := os.ReadFile("../../../hooks/team-install.sh")
	if err != nil {
		t.Fatal(err)
	}
	const marker = "<< 'HOOKEOF'\n"
	parts := strings.SplitN(string(installer), marker, 2)
	if len(parts) != 2 {
		t.Fatal("installer hook block missing")
	}
	embedded := strings.SplitN(parts[1], "\nHOOKEOF", 2)[0] + "\n"
	if !bytes.Equal(source, hookScript) || embedded != string(hookScript) {
		t.Fatal("distributed hook security policies differ")
	}
}
