// Package groq provides a minimal client for Groq's OpenAI-compatible chat
// completions API. Only the vision path used for photo validation is implemented.
package groq

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	apiURL = "https://api.groq.com/openai/v1/chat/completions"
	// Llama 4 Scout — multimodal (text + vision), fast, free tier on Groq.
	model = "meta-llama/llama-4-scout-17b-16e-instruct"
)

// Verdict is the model's classification of a submitted photo + claim.
type Verdict string

const (
	VerdictValid      Verdict = "valid"      // photo matches the claim → save normally
	VerdictSuspicious Verdict = "suspicious" // unclear / can't verify → save as pending
	VerdictReject     Verdict = "reject"     // photo clearly contradicts claim → block
)

// Result holds the model's verdict and a short human-readable reason.
type Result struct {
	Verdict Verdict
	Reason  string
}

// Client calls Groq chat completions.
type Client struct {
	apiKey string
	http   *http.Client
}

// New returns a Client. If apiKey is empty, every ValidatePhoto call returns
// VerdictValid immediately so the server can run without a key configured.
func New(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		http:   &http.Client{Timeout: 20 * time.Second},
	}
}

// ValidatePhoto sends photoURL + a natural-language claim to Llama 4 Scout and
// returns a structured verdict. The photo URL must be publicly reachable.
func (c *Client) ValidatePhoto(ctx context.Context, photoURL, claim string) (Result, error) {
	if c.apiKey == "" {
		return Result{Verdict: VerdictValid, Reason: "validation skipped (no GROQ_API_KEY)"}, nil
	}

	prompt := fmt.Sprintf(`You are a strict photo auditor for a Ukrainian urban-accessibility map.
A user submitted a photo and the following claim about a location:

CLAIM: %s

Your task: verify that EVERY accessibility feature listed in the claim is UNAMBIGUOUSLY VISIBLE in the photo.

STRICT rules — apply them in order:
1. REJECT if the photo is a selfie, food, nature, interior room, or anything unrelated to an urban location.
2. REJECT if ANY stated accessibility feature (ramp, curb cut, tactile paving, step-free entrance, lit path, etc.) is NOT clearly visible in the photo. "Might be there", "potential", "possible", "partially visible" does NOT count — only features you can see beyond any doubt.
3. REJECT if the location category does not match what you see (e.g. claim says transit stop but photo shows a cafe).
4. SUSPICIOUS if the photo is too blurry, dark, or low-resolution to verify the claims.
5. VALID only if the location matches the category AND every claimed accessibility feature is clearly present.

Reply ONLY with valid JSON — no markdown, no extra text:
{"verdict":"valid","reason":"<one sentence: which features you confirmed>"}
{"verdict":"suspicious","reason":"<one sentence: why you cannot verify>"}
{"verdict":"reject","reason":"<one sentence: which specific feature is missing or what is wrong>"}`, claim)

	body, _ := json.Marshal(map[string]any{
		"model": model,
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{"type": "image_url", "image_url": map[string]string{"url": photoURL}},
					{"type": "text", "text": prompt},
				},
			},
		},
		"max_tokens":  200,
		"temperature": 0,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("groq request: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return Result{}, fmt.Errorf("groq %d: %s", resp.StatusCode, truncate(string(raw), 200))
	}

	var gr struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &gr); err != nil || len(gr.Choices) == 0 {
		return Result{}, fmt.Errorf("groq bad response: %s", truncate(string(raw), 200))
	}

	content := strings.TrimSpace(gr.Choices[0].Message.Content)
	// Strip markdown fences if the model wraps its JSON.
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var result struct {
		Verdict string `json:"verdict"`
		Reason  string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		// Model didn't follow the format — treat as suspicious, don't block.
		return Result{Verdict: VerdictSuspicious, Reason: "could not parse model response"}, nil
	}

	v := Verdict(result.Verdict)
	if v != VerdictValid && v != VerdictSuspicious && v != VerdictReject {
		v = VerdictSuspicious
	}
	return Result{Verdict: v, Reason: result.Reason}, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
