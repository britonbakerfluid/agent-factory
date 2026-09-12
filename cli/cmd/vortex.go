package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/identity"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

var vortexCmd = &cobra.Command{
	Use:   "vortex",
	Short: "Trigger a massive vortex that swirls all agents for 15 seconds",
	Args:  cobra.NoArgs,
	RunE:  runVortex,
}

func runVortex(cmd *cobra.Command, args []string) error {
	if !config.Exists() {
		ui.Error("Agent Factory is not installed. Run 'agent-factory install' first.")
		return fmt.Errorf("config not found")
	}

	cfg, err := config.ReadForCurrentPath()
	if err != nil {
		ui.Error("Failed to read config: " + err.Error())
		return err
	}

	device, err := identity.LoadOrCreate()
	if err != nil {
		return err
	}
	if err := requestVortex(cmd.Context(), &http.Client{Timeout: 5 * time.Second}, cfg.ServerURL, device.Secret); err != nil {
		ui.Error(err.Error())
		return err
	}
	ui.Success("Vortex activated!")
	return nil
}

func requestVortex(ctx context.Context, client *http.Client, serverURL, secret string) error {
	endpoint, err := url.Parse(strings.TrimRight(serverURL, "/") + "/api/vortex")
	if err != nil || endpoint.Host == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" {
		return fmt.Errorf("invalid factory server address")
	}
	ip := net.ParseIP(endpoint.Hostname())
	local := endpoint.Hostname() == "localhost" || ip != nil && ip.IsLoopback()
	if endpoint.Scheme != "https" && !(endpoint.Scheme == "http" && local) {
		return fmt.Errorf("use an HTTPS factory address to start a vortex")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.String(), bytes.NewBufferString("{}"))
	if err != nil {
		return fmt.Errorf("could not prepare vortex request")
	}
	request.Header.Set("Authorization", "Bearer "+secret)
	request.Header.Set("Content-Type", "application/json")
	// Never forward the installation credential to a redirect target.
	response, err := doAuthenticatedRequest(client, request)
	if err != nil {
		return fmt.Errorf("could not reach the factory")
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusTooManyRequests {
		return fmt.Errorf("a vortex is already running; wait for it to finish")
	}
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("the factory could not start a vortex (status %d)", response.StatusCode)
	}
	var result struct {
		OK bool `json:"ok"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&result); err != nil || !result.OK {
		return fmt.Errorf("the factory did not confirm the vortex")
	}
	return nil
}
