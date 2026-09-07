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

	"github.com/wolzey/agent-factory/cli/internal/config"
)

var avatarHTTPClient = &http.Client{
	Timeout:       8 * time.Second,
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
}

type avatarProfile struct {
	Avatar config.AvatarConfig `json:"avatar"`
	Saved  bool                `json:"saved"`
}

func syncAvatar(ctx context.Context, client *http.Client, serverURL, secret string, avatar *config.AvatarConfig) (avatarProfile, error) {
	var result avatarProfile
	endpoint, err := url.Parse(strings.TrimRight(serverURL, "/") + "/api/avatar/installation")
	if err != nil || endpoint.Host == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" {
		return result, fmt.Errorf("invalid factory server address")
	}
	ip := net.ParseIP(endpoint.Hostname())
	local := endpoint.Hostname() == "localhost" || ip != nil && ip.IsLoopback()
	if endpoint.Scheme != "https" && !(endpoint.Scheme == "http" && local) {
		return result, fmt.Errorf("use an HTTPS factory address to sync your avatar")
	}
	method := http.MethodGet
	var payload []byte
	if avatar != nil {
		method = http.MethodPut
		payload, err = json.Marshal(map[string]any{"avatar": avatar})
		if err != nil {
			return result, fmt.Errorf("could not prepare avatar")
		}
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint.String(), bytes.NewReader(payload))
	if err != nil {
		return result, fmt.Errorf("could not prepare avatar request")
	}
	request.Header.Set("Authorization", "Bearer "+secret)
	request.Header.Set("Content-Type", "application/json")
	// Never forward installation credentials or an avatar payload to a redirect.
	safeClient := *client
	safeClient.CheckRedirect = avatarHTTPClient.CheckRedirect
	response, err := safeClient.Do(request)
	if err != nil {
		return result, fmt.Errorf("could not reach the factory")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		if response.StatusCode == http.StatusNotFound {
			return result, fmt.Errorf("this factory server needs the avatar sync update")
		}
		return result, fmt.Errorf("the factory could not sync your avatar (status %d)", response.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&result); err != nil || result.Avatar.Color == "" {
		return result, fmt.Errorf("the factory returned an unreadable avatar")
	}
	if avatar != nil && !result.Saved {
		return result, fmt.Errorf("the factory did not confirm the avatar save")
	}
	return result, nil
}
