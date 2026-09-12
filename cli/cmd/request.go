package cmd

import (
	"bytes"
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"

	"github.com/wolzey/agent-factory/cli/internal/identity"
)

func newAuthenticatedJSONRequest(
	ctx context.Context,
	method string,
	address string,
	payload []byte,
) (*http.Request, error) {
	if err := validateAuthenticatedURL(address); err != nil {
		return nil, err
	}
	device, err := identity.LoadOrCreate()
	if err != nil {
		return nil, err
	}
	return newDeviceJSONRequest(ctx, method, address, payload, device.Secret)
}

// Validate before adding a credential: the remote server can only refuse HTTP
// after the bearer token has already crossed the wire.
func validateAuthenticatedURL(address string) error {
	endpoint, err := url.Parse(address)
	if err != nil || endpoint.Host == "" || endpoint.Hostname() == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.ForceQuery || endpoint.Fragment != "" || endpoint.Opaque != "" {
		return fmt.Errorf("invalid factory server address")
	}
	ip := net.ParseIP(endpoint.Hostname())
	local := endpoint.Hostname() == "localhost" || ip != nil && ip.IsLoopback()
	if endpoint.Scheme != "https" && !(endpoint.Scheme == "http" && local) {
		return fmt.Errorf("use an HTTPS factory address for installation authentication")
	}
	return nil
}

func newDeviceJSONRequest(ctx context.Context, method, address string, payload []byte, secret string) (*http.Request, error) {
	if err := validateAuthenticatedURL(address); err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, method, address, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("could not prepare factory request")
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+secret)
	return request, nil
}

func doAuthenticatedRequest(client *http.Client, request *http.Request) (*http.Response, error) {
	if err := validateAuthenticatedURL(request.URL.String()); err != nil {
		return nil, err
	}
	// A same-host redirect can change ports or downgrade HTTPS to HTTP while Go
	// retains Authorization. Stop every redirect, including on supplied clients.
	safeClient := *client
	safeClient.CheckRedirect = func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }
	response, err := safeClient.Do(request)
	if err != nil {
		// Transport errors can contain the request URL or reflected credentials.
		return nil, fmt.Errorf("could not reach the factory")
	}
	return response, nil
}
