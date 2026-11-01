package exactcompiler

import (
	"strings"
	"testing"
)

// Ordinary analysis preserves the setter effect while a returned record stays
// private. Owner-unit checks below are separate from this installed-context path.
func TestEnvelopeScopedAnalysis(t *testing.T) {
	source := `const state={set audit(v:unknown){window.location.hash='observed'}};function make(payload:{value:string}){return {audit:payload,error:''}}function consume(payload:{value:string}){const update=make(payload);state.audit=update.audit;return update.error}export function run(payload:{value:string}){return consume(payload)}`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/envelope-scoped-analysis.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("invalid source: %s %#v", response.Error, response.Diagnostics)
	}
	for _, c := range response.Analysis.Callables {
		if c.Name != "run" {
			continue
		}
		browser := false
		for _, effect := range c.EffectSources {
			browser = browser || effect.Environment == "browser" && strings.Contains(effect.Description, "window")
		}
		if c.Effect != "browser" || !browser {
			t.Fatalf("lost setter or added uncertainty: %#v", c)
		}
		return
	}
	t.Fatal("missing run")
}
