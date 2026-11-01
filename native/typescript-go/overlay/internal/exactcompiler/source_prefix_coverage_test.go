package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Source emission and additive ordinary opacity are independent of the retired
// prefix refusal metadata. An unknown contribution must retain a known donor.
func TestSourceBindingEffectsRemainAdditive(t *testing.T) {
	const id = "/virtual/prefix-coverage.ts"
	const source = `export {};
const Q = {done: false, value: 3};
const I = {
    result: Q,
    next: function(this: {result: typeof Q}) { return this.result; },
    return: function(this: {result: typeof Q}) { return this.result; }
};
const O = {iterator: I, [Symbol.iterator]: function(this: {iterator: typeof I}) { return this.iterator; }};
const A: {[Symbol.iterator]: number | ((this: {iterator: typeof I}) => typeof I)} = O;
A[Symbol.iterator] = 9;
A[Symbol.iterator] = 9;
const [x] = O;`
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal("invalid source witness", response.Error, response.Diagnostics)
	}
	var fact *callableFacts
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		for _, candidate := range project.callableCache.merged.facts {
			if candidate.sourceFile.FileName() == id && ast.IsExpressionStatement(candidate.node) {
				copied := candidate
				fact = &copied
				break
			}
		}
	}
	if fact == nil {
		t.Fatal("missing authored assignment effect owner")
	}
	fact.summary.DirectEffectSources = []EnvironmentEffectSource{environmentSource("browser", "independent source", fact.summary.Name)}
	appendOpaqueAccessorEffect(fact, accessorCandidates{opaque: true})
	browser, unknown := false, false
	for _, effect := range fact.summary.DirectEffectSources {
		browser = browser || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !browser || !unknown || environmentEffectFor(fact.summary.DirectEffectSources) != "unknown" {
		t.Fatal("ordinary opacity discarded an independent known source", fact.summary.DirectEffectSources)
	}
}
