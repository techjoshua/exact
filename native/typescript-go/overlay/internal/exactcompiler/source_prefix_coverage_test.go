package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Three authored keys stay outside the finite two-key prefix proof. Historical
// refusal coverage cannot erase an independent source effect.
func TestPrefixCoveragePreservesIndependentEffects(t *testing.T) {
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
	var facts []callableFacts
	var owner *executableBodyOwner
	for _, project := range session.projects {
		if project.callableCache != nil && project.program.GetSourceFile(id) != nil {
			facts, owner = project.callableCache.merged.facts, project.callableCache.owner
		}
	}
	coveredIndex, finalIndex := -1, -1
	for i := range facts {
		fact := &facts[i]
		if fact.sourceFile.FileName() != id {
			continue
		}
		if ast.IsExpressionStatement(fact.node) {
			coveredIndex = i
		}
		if fact.initializerDeclaration != nil && bindingElementSource(fact.initializerDeclaration, 0) != nil && bindingElementSource(fact.initializerDeclaration, 1) == nil {
			finalIndex = i
		}
	}
	if coveredIndex < 0 || finalIndex < 0 || owner == nil {
		t.Fatal("missing authored assignment or binding owner")
	}
	coverage := facts[finalIndex].prefixCoverage
	if coverage == nil || coverage.stamp.owner != nil || coverage.stamp.generation == nil || coverage.stamp.generation.active || facts[coveredIndex].prefixCoverage != coverage || !coverage.finalOwner(&facts[finalIndex], coverage.mode) {
		t.Fatal("historical coverage retained a live owner or lost source identity")
	}
	wrongMode := coverage.mode
	wrongMode[0] ^= 1
	copied := facts[coveredIndex]
	if coverage.coveredModule(&copied, wrongMode) || !coverage.coveredModule(&copied, coverage.mode) {
		t.Fatal("coverage was transferable to a foreign mode or lost on a fact copy")
	}
	build := func(drop bool) ([]callableFacts, map[*ast.Node]int) {
		out := append([]callableFacts(nil), facts...)
		targets := make(map[*ast.Node]int)
		for i := range out {
			out[i].summary.DirectEffectSources = append([]EnvironmentEffectSource(nil), out[i].summary.DirectEffectSources...)
			targets[out[i].node] = i
		}
		out[coveredIndex].prefixCoverage = nil
		out[coveredIndex].summary.DirectEffectSources = []EnvironmentEffectSource{environmentSource("browser", "independent source", out[coveredIndex].summary.Name)}
		if drop {
			out[finalIndex].prefixCoverage = nil
			out[finalIndex].pendingPrefixCoverage = nil
		}
		return out, targets
	}
	got, targets := build(false)
	applyPrefixSourceCoverage(got, targets, owner, coverage.mode)
	if got[coveredIndex].prefixCoverage != coverage || len(got[coveredIndex].summary.DirectEffectSources) != 2 || environmentEffectFor(got[coveredIndex].summary.DirectEffectSources) != "unknown" {
		t.Fatal("typed coverage failed to retain the independent source")
	}
	applyPrefixSourceCoverage(got, targets, owner, coverage.mode)
	if len(got[coveredIndex].summary.DirectEffectSources) != 2 {
		t.Fatal("coverage settled twice")
	}
	bad, targets := build(true)
	applyPrefixSourceCoverage(bad, targets, owner, coverage.mode)
	if bad[coveredIndex].prefixCoverage != nil || environmentEffectFor(bad[coveredIndex].summary.DirectEffectSources) != "browser" {
		t.Fatal("aggregate unknown substituted for the typed source relation")
	}
}
