package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The actual collector must bind the default before the central Effects source
// registrar can reuse that delivered packet. Reading quiet never invokes it.
const stagedLexicalDefaultEffectsEntry = `function quiet(){return document.title}function factory(callback:()=>string=quiet){window.name;return callback}export function invoke(){return factory()}`

func TestStagedLexicalDefaultDeclarationEffectsOriginalBoundSource(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/default-effects-entry.ts", Source: stagedLexicalDefaultEffectsEntry, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal("entry experiment compilation failed", response.Error, response.Diagnostics)
			}
			known := false
			for _, effect := range executableSummary(t, response, "invoke").EffectSources {
				known = known || effect.Environment == "browser" && effect.Description == "window"
				if effect.Environment == "unknown" || effect.Environment == "browser" && effect.Description == "document" {
					t.Fatal("default reference invoked its stored body or lost Effects precision", effect)
				}
			}
			if !known {
				t.Fatal("actual factory BODY effect was not retained")
			}
			cache := qualifiedIncrementalProject(t, session).callableCache
			if cache == nil || cache.owner == nil || cache.merged.facts == nil {
				t.Fatal("entry experiment has no canonical merged source owner")
			}
			retiredFacts, retiredOwner := cache.merged.facts, cache.owner
			retiredConsumer, retiredCall := stagedLexicalDefaultEffectsBoundCall(t, retiredFacts)
			retiredWork := registerCallableEffectWork(retiredFacts)
			if _, registered := retiredWork.registerStagedDeclarationCallEffects(retiredFacts, retiredConsumer, retiredCall.invocation.operation, retiredOwner); registered {
				t.Fatal("completed Session generation renewed the source")
			}
			// Public Session returns after final generation release. Collect fresh
			// original bindings in this independently owned live generation instead.
			const fixtureID = "/virtual/default-effects-entry.ts"
			setupRequest := Request{Kind: "analyze", ID: fixtureID, Source: stagedLexicalDefaultEffectsEntry, Target: target, Diagnostics: "semantic"}
			project, diagnostics, err := newProjectStateWithSources(setupRequest, fixtureID, map[string]string{fixtureID: stagedLexicalDefaultEffectsEntry})
			if err != nil || len(diagnostics) != 0 {
				t.Fatal("live owner setup", err, diagnostics)
			}
			generation, err := project.advance(context.Background(), fixtureID, stagedLexicalDefaultEffectsEntry)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			collectProjectCallableEffects(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
			cache = project.callableCache
			if cache == nil || cache.owner == nil || cache.merged.facts == nil || !generation.active || project.activeGeneration != generation || cache.owner.project != project || cache.owner.values.generation != generation || cache.owner.values.program != generation.program || cache.owner.checker != generation.checker || cache.owner.values.checker != generation.checker {
				t.Fatal("UNREACHED: collector did not retain this live program/checker/generation")
			}
			facts, owner := cache.merged.facts, cache.owner
			consumer, original := stagedLexicalDefaultEffectsBoundCall(t, facts)
			work := registerCallableEffectWork(facts)
			restore := registerPendingMemberFacts(owner, facts)
			defer restore()
			request, registered := work.registerStagedDeclarationCallEffects(facts, consumer, original.invocation.operation, owner)
			if !registered {
				t.Fatal("UNREACHED: central Effects registrar refused the delivered default source")
			}
			recipe := work.operationRecipes[request.producer]
			if recipe.declarationCall == nil || recipe.declarationCall.inputs != original.inputs || recipe.declarationCall.sourceInputs != nil || !sameSourceRelativeInvocation(recipe.declarationCall.invocation, original.invocation) || !work.passiveDeclarationCallEffectsReady(recipe) || len(recipe.delta.exposures)+len(recipe.delta.effects) != 0 {
				t.Fatal("central fallback did not retain the exact original B packet and Effects-only contract")
			}
			if reached, current := work.currentDeclarationCallEffects(recipe); !current || reached.inputs != original.inputs {
				t.Fatal("central source lost the authentic collector Call edge or current binder")
			}
			id, adopted := work.requireOperation(facts, request)
			if !adopted {
				t.Fatal("real Effects consumer refused the source")
			}
			if work.closedOperationDependencies()[id.index] {
				t.Fatal("source/default B registration replaced independent BODY delivery")
			}
			work.initializePropagation(facts)
			work.prepareOperationUses(facts, owner)
			state := &work.operations[id.index]
			if len(state.memberActivations) != 1 || !work.declarationCallEffectsAccounted(state, work.operationRecipes[request.producer]) || !work.closedOperationDependencies()[id.index] {
				t.Fatal("actual Effects consumer did not close through its canonical BODY dependency")
			}
			body := state.memberActivations[0]
			membership := work.stagedRequired[sourceStagedDependencyKey{consumer, body.edge}]
			if membership == nil || membership.operation != original.invocation.operation || membership.cut != request.cut || membership.invalid || membership.projectionPending {
				t.Fatal("Effects BODY membership lost the original operation/cut")
			}
		})
	}
}

// The same authored default without original collector binding remains pending.
// A passive source query must not select a default or manufacture a Call edge.
func TestStagedLexicalDefaultDeclarationEffectsUnboundSourceRefuses(t *testing.T) {
	withStagedReturnProgram(t, stagedLexicalDefaultEffectsEntry, func(owner *executableBodyOwner, call *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
		restore := registerPendingMemberFacts(owner, facts)
		defer restore()
		work := registerCallableEffectWork(facts)
		consumer := work.memberNodes[enclosingCallableNode(call)]
		if _, registered := work.registerStagedDeclarationCallEffects(facts, consumer, call, owner); registered {
			t.Fatal("unbound default gained central Effects source authority")
		}
		if len(facts[consumer].staged.calls) != 0 || len(facts[consumer].summary.Calls) != 0 || len(work.operationIDs) != 0 || len(work.declarationCallObserved) != 0 {
			t.Fatal("refused source manufactured binder, Call, adoption or observation")
		}
	})
}

// Inspect only the actual collector's detached packet; never invoke a binder or
// choose a default from source syntax to satisfy this API control.
func stagedLexicalDefaultEffectsBoundCall(t *testing.T, facts []callableFacts) (int, *sourceStagedDeclarationCall) {
	t.Helper()
	consumer := -1
	var original *sourceStagedDeclarationCall
	for i := range facts {
		if facts[i].summary.Name != "invoke" {
			continue
		}
		consumer = i
		for j := range facts[i].staged.calls {
			call := &facts[i].staged.calls[j]
			if call.invocation.declaration != nil && call.invocation.declaration.Name() != nil && call.invocation.declaration.Name().Text() == "factory" {
				original = call
			}
		}
	}
	if consumer < 0 || original == nil || original.inputs == nil || original.sourceInputs != nil || original.legacyInputs || original.inputConsumerWait != nil || !original.inputs.delivered || !validStagedDataResultCall(*original) || len(original.inputs.bound.defaults) != 1 || original.inputs.bound.defaults[0].selection != relativeDefaultRequired || original.inputs.relative.unsupported != relativeInputsSupported {
		t.Fatal("UNREACHED: actual collector did not deliver the original default binder")
	}
	return consumer, original
}
