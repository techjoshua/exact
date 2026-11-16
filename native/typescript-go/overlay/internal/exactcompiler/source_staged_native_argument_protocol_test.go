package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original module/project-clone journey must connect both actual Get and Set
// protocol readers. This assertion never issues an extra source query to seed an
// otherwise absent producer; a missing original eager event is an issuer gap.
func assertGlobalStoreNativeArgumentProtocols(t *testing.T, work *callableEffectWork, facts []callableFacts, owner *executableBodyOwner) {
	t.Helper()
	if owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration || len(facts) == 0 {
		t.Fatal("original live source graph missing")
	}
	var template *ast.Node
	var required sourceStagedOperationRequest
	for _, recipe := range work.operationRecipes {
		if stagedNativeArgumentProtocolProducer(recipe) {
			template = recipe.nativeGet.input.input.expression
			required = nativeRootDebtRequest(recipe.nativeGet, "eager-inputs")
		}
	}
	readers, getReaders, setReaders := 0, 0, 0
	for _, recipe := range work.operationRecipes {
		source := recipe.memberSource
		if source == nil || !source.candidate.protocol || !ast.IsTemplateExpression(source.candidate.operation) {
			continue
		}
		parent := source.parent.producer.operation
		if ast.IsBinaryExpression(parent) {
			parent = parent.AsBinaryExpression().Left
		}
		if !ast.IsElementAccessExpression(parent) || !ast.IsIdentifier(parent.Expression()) || parent.Expression().Text() != "scope" {
			continue
		}
		readers++
		if template == nil {
			continue
		}
		if source.candidate.operation != template || source.protocolSource == nil || source.protocolSource.nativeArgument == nil || !validStagedMemberProtocolRecipe(recipe) || !sameOperationRequest(source.protocolSource.required, required) || len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], required) {
			t.Fatalf("original Template protocol lacks its issued eager source: reader=%d parent=%d sameTemplate=%t payload=%t valid=%t required=%d extraction=%t", source.candidate.operation.Pos(), source.parent.producer.operation.Pos(), source.candidate.operation == template, source.protocolSource != nil && source.protocolSource.nativeArgument != nil, validStagedMemberProtocolRecipe(recipe), len(recipe.delta.required), source.extraction != nil)
		}
		if source.extraction != nil && source.extraction.mode&accessorSet != 0 {
			setReaders++
		} else {
			getReaders++
		}
		clone := cloneStagedMemberSource(source)
		if clone.protocolSource.nativeArgument == source.protocolSource.nativeArgument || !sameStagedNativeArgumentProtocol(clone.protocolSource.nativeArgument, source.protocolSource.nativeArgument) {
			t.Fatal("native argument clone changed association or aliases description")
		}
		for _, change := range []func(*sourceStagedNativeArgumentProtocol){
			func(p *sourceStagedNativeArgumentProtocol) { p.root.cut.reading = template },
			func(p *sourceStagedNativeArgumentProtocol) { p.input.input.expression = p.root.use },
			func(p *sourceStagedNativeArgumentProtocol) { p.input.input.role.slot++ },
			func(p *sourceStagedNativeArgumentProtocol) { p.generation = new(projectGeneration) },
		} {
			invalid := recipe
			invalid.memberSource = cloneStagedMemberSource(source)
			change(invalid.memberSource.protocolSource.nativeArgument)
			if validStagedMemberProtocolRecipe(invalid) {
				t.Fatal("changed native argument factory supplied protocol association")
			}
		}
	}
	if template == nil {
		t.Fatalf("original Template eager source was not issued; protocol readers=%d (no query replay)", readers)
	}
	if getReaders == 0 || setReaders == 0 {
		t.Fatalf("original Get and Set did not share native argument producer: Get=%d Set=%d", getReaders, setReaders)
	}
}
