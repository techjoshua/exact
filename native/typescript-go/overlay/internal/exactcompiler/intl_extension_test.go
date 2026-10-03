package exactcompiler

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

// Extension requests bypass normal lowering. Protect the analyzer protocol at its real session
// boundary, including payload bounds that downstream locale-profile generation normally satisfies.
func TestIntlExtensionPayloadContracts(t *testing.T) {
	root := t.TempDir()
	session := NewSession()
	execute := func(namespace string, payload any) Response {
		return session.Execute(Request{Kind: "extension", ID: filepath.Join(root, "Report.tsx"), Root: root,
			Source:    `export function Report(value:number){return()=> <p intl:message>Hello {value}</p>;}`,
			Extension: &ExtensionRequest{Namespace: namespace, Payload: payload}})
	}
	valid := func() map[string]any { return map[string]any{"owner": "example", "sourceLocale": "en-US"} }
	cases := []struct {
		name    string
		payload any
		message string
	}{
		{"missing owner", map[string]any{"sourceLocale": "en-US"}, "requires owner"},
		{"missing locale", map[string]any{"owner": "example"}, "requires owner and sourceLocale"},
		{"wrong payload shape", []string{"invalid"}, "could not decode"},
		{"empty unit label", map[string]any{"unitLabels": map[string]string{"": "meter"}}, "unit profile contains"},
		{"long unit label", map[string]any{"unitLabels": map[string]string{strings.Repeat("u", 129): "meter"}}, "unit profile contains"},
		{"unknown unit", map[string]any{"unitLabels": map[string]string{"length": "unsupported"}}, "unsupported unit"},
		{"invalid currency", map[string]any{"currencyLabels": map[string]any{"dollars": map[string]string{"currency": "usd", "display": "name"}}}, "three uppercase"},
		{"invalid display", map[string]any{"currencyLabels": map[string]any{"dollars": map[string]string{"currency": "USD", "display": "code"}}}, "display symbol or name"},
		{"empty currency label", map[string]any{"currencyLabels": map[string]any{"": map[string]string{"currency": "USD", "display": "symbol"}}}, "nonempty labels"},
		{"long currency label", map[string]any{"currencyLabels": map[string]any{strings.Repeat("c", 257): map[string]string{"currency": "USD", "display": "symbol"}}}, "256 bytes"},
		{"empty default label", map[string]any{"defaultCurrencyLabels": []string{""}}, "default-currency profile requires"},
		{"long default label", map[string]any{"defaultCurrencyLabels": []string{strings.Repeat("c", 65)}}, "64 bytes"},
		{"empty ordinal", map[string]any{"ordinalMarkers": []string{""}}, "ordinal profile requires"},
		{"long ordinal", map[string]any{"ordinalMarkers": []string{strings.Repeat("o", 129)}}, "128 bytes"},
		{"empty wrapper", map[string]any{"ordinalWrappers": []map[string]string{{"prefix": "", "suffix": ""}}}, "nonempty prefix or suffix"},
		{"long wrapper", map[string]any{"ordinalWrappers": []map[string]string{{"prefix": strings.Repeat("o", 65)}}}, "64 bytes"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			payload := valid()
			if additions, ok := test.payload.(map[string]any); ok {
				for key, value := range additions {
					payload[key] = value
				}
				if test.name == "missing owner" {
					delete(payload, "owner")
				}
				if test.name == "missing locale" {
					delete(payload, "sourceLocale")
				}
			}
			var input any = payload
			if test.name == "wrong payload shape" {
				input = test.payload
			}
			response := execute(intlAnalyzeNamespace, input)
			if !strings.Contains(response.Error, test.message) {
				t.Fatalf("missing causal error %q: %s", test.message, response.Error)
			}
			control := execute(intlAnalyzeNamespace, valid())
			if control.Error != "" {
				t.Fatalf("valid control rejected after invalid request: %s", control.Error)
			}
		})
	}
	for _, profile := range []struct {
		name  string
		limit int
	}{{"unitLabels", 512}, {"currencyLabels", 1024}, {"defaultCurrencyLabels", 32}, {"ordinalMarkers", 64}, {"ordinalWrappers", 32}} {
		t.Run(profile.name, func(t *testing.T) {
			for _, count := range []int{profile.limit, profile.limit + 1} {
				payload := valid()
				entries := map[string]any{}
				labels := []string{}
				wrappers := []map[string]string{}
				for i := 0; i < count; i++ {
					key := fmt.Sprintf("label%d", i)
					entries[key] = "meter"
					if profile.name == "currencyLabels" {
						entries[key] = map[string]string{"currency": "USD", "display": "symbol"}
					}
					labels = append(labels, key)
					wrappers = append(wrappers, map[string]string{"prefix": key})
				}
				switch profile.name {
				case "unitLabels", "currencyLabels":
					payload[profile.name] = entries
				case "ordinalWrappers":
					payload[profile.name] = wrappers
				default:
					payload[profile.name] = labels
				}
				response := execute(intlAnalyzeNamespace, payload)
				if count == profile.limit && response.Error != "" {
					t.Fatalf("valid boundary rejected: %s", response.Error)
				}
				if count > profile.limit && !strings.Contains(response.Error, "exceeds") {
					t.Fatalf("oversized profile accepted: %#v", response)
				}
			}
		})
	}
	if response := execute("unsupported", valid()); !strings.Contains(response.Error, "unsupported native extension namespace") {
		t.Fatalf("unknown namespace accepted: %#v", response)
	}
}

func TestIntlExtensionSemanticPatterns(t *testing.T) {
	root := t.TempDir()
	session := NewSession()
	for _, test := range []struct{ name, content, kind string }{
		{"message", `<p intl:message>Hello {value}</p>`, "value"},
		{"currency", `<output intl:currency="USD">{value}</output>`, "format"},
		{"unit", `<output intl:unit="distance-road">{value} miles</output>`, "format"},
		{"plural", `<p intl:message>{value===1?'item':'items'}</p>`, "select"},
		{"property", `<img alt="Hello" intl:alt />`, "text"},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `export function Report(value:number){return()=> ` + test.content + `;}`
			response := session.Execute(Request{Kind: "extension", ID: filepath.Join(root, "Report.tsx"), Root: root, Source: source, Extension: &ExtensionRequest{Namespace: intlAnalyzeNamespace, Payload: map[string]any{"owner": "example", "sourceLocale": "en-US"}}})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			analysis, ok := response.Extension.(intlAnalysis)
			if !ok || len(analysis.Descriptors) != 1 || len(analysis.Diagnostics) != 0 {
				t.Fatalf("expected one valid descriptor: %#v", response.Extension)
			}
			descriptor := analysis.Descriptors[0]
			if descriptor.Owner != "example" || descriptor.OwnerComponentID == "" || descriptor.SourceRange.Start < 0 || descriptor.SourceRange.Start+descriptor.SourceRange.Length > len(source) {
				t.Fatalf("lost owner or source range: %#v", descriptor)
			}
			encoded, err := json.Marshal(analysis)
			if err != nil || !strings.Contains(string(encoded), `"kind":"`+test.kind+`"`) {
				t.Fatalf("missing semantic pattern %s: %s (%v)", test.kind, encoded, err)
			}
		})
	}
}
