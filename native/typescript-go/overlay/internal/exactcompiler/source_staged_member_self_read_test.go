package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This uses the actual original writer/result publisher and cached Session
// facts. Issued DATA and the real invocation must survive source relevance.
func TestStagedMemberExternalGetContextualSource(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/writer-result.ts", Source: stagedWriterResultSource, Diagnostics: "semantic", stagedReplacement: true})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	recipes := make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
	for _, fact := range stagedDeclarationFacts(session) {
		for _, recipe := range fact.staged.operationRecipes {
			recipes[recipe.key] = recipe
		}
	}
	for _, fact := range stagedDeclarationFacts(session) {
		for _, recipe := range fact.staged.operationRecipes {
			source := recipe.memberSource
			if source == nil || !source.candidate.protocol || !ast.IsPropertyAccessExpression(source.parent.producer.operation) || source.parent.producer.operation.Expression().Kind != ast.KindIdentifier || source.parent.producer.operation.Expression().Text() != "window" {
				continue
			}
			if !ast.IsCallExpression(source.candidate.operation) {
				t.Logf("sibling candidate=%v@%d proto=%t extracted=%t", source.candidate.operation.Kind, source.candidate.operation.Pos(), source.protocolSource != nil, recipe.delta.extracted)
				continue
			}
			call := source.candidate.operation
			if !ast.IsPropertyAccessExpression(call.Expression()) || call.Expression().Name().Text() != "get" {
				continue
			}
			found = true
			if source.protocolSource == nil || !source.protocolSource.selfRead {
				if source.protocolSource != nil {
					r := source.protocolSource.required
					t.Logf("existing contextual source call=%d parentGet=%d extracted=%t required=%v@%d selector=%+v", call.Pos(), source.parent.producer.operation.Pos(), recipe.delta.extracted, r.producer.operation.Kind, r.producer.operation.Pos(), r.producer.selector)
				}
				t.Fatal("actual method arrival did not refine original contextual source")
			}
			if !validStagedMemberSelfReadRecipe(recipe) {
				t.Fatal("invalid contextual source disposition")
			}
			callRecipe := recipes[sourceStagedOperationKey{declaration: source.candidate.region, operation: call, kind: relativeDemandEffects}]
			expected := []sourceStagedOperationRequest{}
			for _, member := range callRecipe.constructedGroup {
				expected = appendEntryLawRequirement(expected, constructedMemberRequest(&member, "own-writers"))
				expected = appendEntryLawRequirement(expected, constructedMemberRequest(&member, "eager-inputs"))
			}
			expected = appendEntryLawRequirement(expected, stagedMemberCoverageRequest(source.parent, source.candidate.origin, source.candidate.cut))
			if len(expected) != len(recipe.delta.required) {
				t.Fatal("lost original source children")
			}
			for i, request := range expected {
				if !sameOperationRequest(request, recipe.delta.required[i]) {
					t.Fatal("retargeted Get/own-writer/eager source child")
				}
			}

		}
	}
	if !found {
		t.Fatal("actual original Get/candidate relationship absent")
	}
	assertStagedWriterResultConnection(t, session)
}
