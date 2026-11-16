package exactcompiler

import (
	"context"
	"testing"
)

// The shared Effects registrar must use the invocation authenticated by its
// successful admission arm. A delivered default binder is not a direct SOURCE
// description; an identifier actual must not dereference that absent packet.
func TestSourceJoinDefaultInvocationOriginalPackets(t *testing.T) {
	for _, row := range []struct {
		name, parameters, actual, formal string
		selection                        sourceRelativeDefaultSelection
		bound                            bool
	}{
		{"direct", "", "quiet", "callback:()=>string", relativeDefaultRequired, false},
		{"providedIdentifier", "", "quiet", "callback:()=>string=quiet", relativeDefaultBypassed, true},
		{"omitted", "", "", "callback:()=>string=quiet", relativeDefaultRequired, true},
		{"explicitUndefined", "", "undefined", "callback:()=>string=quiet", relativeDefaultRequired, true},
		{"runtimeUnknown", "other:(()=>string)|undefined", "other", "callback:()=>string=quiet", relativeDefaultConditional, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := "function quiet(){return document.title}function factory(" + row.formal + "){window.name;return callback}export function invoke(" + row.parameters + "){return factory(" + row.actual + ")}"
			const id = "/virtual/source-join-default-invocation.ts"
			request := Request{Kind: "compile", ID: id, Source: source, Target: TargetClient, Diagnostics: "semantic"}
			session := NewSession()
			response := session.Execute(request)
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal("original public invocation entry", response.Error, response.Diagnostics)
			}
			browser := false
			for _, effect := range executableSummary(t, response, "invoke").EffectSources {
				browser = browser || effect.Environment == "browser" && effect.Description == "window"
				if effect.Environment == "browser" && effect.Description == "document" {
					t.Fatal("stored default callback BODY was invoked by description", effect)
				}
			}
			if !browser {
				t.Fatal("actual factory BODY donor disappeared")
			}
			project, diagnostics, err := newProjectStateWithSources(request, id, map[string]string{id: source})
			if err != nil || len(diagnostics) != 0 {
				t.Fatal("live source owner setup", err, diagnostics)
			}
			generation, err := project.advance(context.Background(), id, source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			collectProjectCallableEffects(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
			cache := project.callableCache
			if cache == nil || cache.owner == nil || !generation.active || project.activeGeneration != generation || cache.owner.values.program != generation.program || cache.owner.checker != generation.checker || cache.owner.values.generation != generation {
				t.Fatal("UNREACHED original live collector owner")
			}
			facts, owner := cache.merged.facts, cache.owner
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
			if consumer < 0 || original == nil || !validStagedDataResultCall(*original) {
				t.Fatal("UNREACHED original factory Call packet")
			}
			if row.bound && (original.inputs == nil || !original.inputs.delivered || original.sourceInputs != nil || original.legacyInputs || original.inputConsumerWait != nil || len(original.inputs.bound.defaults) != 1 || original.inputs.bound.defaults[0].selection != row.selection || original.inputs.relative.unsupported != relativeInputsSupported) {
				t.Fatal("UNREACHED authentic bound default selection")
			}
			work := registerCallableEffectWork(facts)
			restore := registerPendingMemberFacts(owner, facts)
			defer restore()
			r, registered := work.registerStagedDeclarationCallEffects(facts, consumer, original.invocation.operation, owner)
			if !registered {
				t.Fatal("shared Effects registrar refused original packet")
			}
			recipe := work.operationRecipes[r.producer]
			call := recipe.declarationCall
			if call == nil || call.invocation.operation != original.invocation.operation || call.invocation.declaration != original.invocation.declaration || len(call.invocation.actuals) != len(original.invocation.actuals) || call.invocation.actualsKnown != original.invocation.actualsKnown || !validStagedDeclarationCallEffectsRecipe(recipe) {
				t.Fatal("shared registrar retargeted the actual invocation")
			}
			// SOURCE descriptors retain their own observation cuts; delivered B
			// may have different optional endpoint precision for the same actual.
			// Authenticate the original ordered AST vector across those domains.
			for i, actual := range call.invocation.actuals {
				prior := original.invocation.actuals[i]
				if actual.expression != prior.expression || actual.ordinal != prior.ordinal || actual.spread != prior.spread {
					t.Fatal("shared registrar changed an original actual")
				}
			}
			if row.bound && (call.inputs != original.inputs || call.sourceInputs != nil || !sameSourceRelativeInvocation(call.invocation, original.invocation)) || !row.bound && (call.sourceInputs == nil || !sameSourceRelativeInvocation(call.invocation, call.sourceInputs.invocation)) {
				t.Fatal("direct/default admission arms borrowed the other packet")
			}
			if work.operationGeneration != generation || recipe.declarationCallGeneration != generation || facts[consumer].sourceFile == nil || owner.values.program.GetSourceFile(facts[consumer].sourceFile.FileName()) != facts[consumer].sourceFile {
				t.Fatal("shared registrar used another source generation")
			}
			if !row.bound {
				packet := call.sourceInputs
				op := original.invocation.operation
				cut := sourceRelativeCut{operation: op, use: op, reading: op}
				if call.invocation.cut != cut || r.cut != cut || packet.bindings.declaration != call.invocation.declaration || packet.bindings.operation != op || packet.bindings.use != op || packet.bindings.cut != cut {
					t.Fatal("direct SOURCE lost its own original input envelope")
				}
				for _, actual := range packet.invocation.actuals {
					if actual.endpoint.producer != op || actual.endpoint.cut != (sourceRelativeCut{operation: op, use: op, reading: actual.expression}) {
						t.Fatal("direct SOURCE borrowed an actual read cut")
					}
				}
			}
			if len(recipe.delta.exposures) != 0 || len(work.operationIDs) != 0 {
				t.Fatal("Effects description granted DATA or consumer adoption")
			}
		})
	}
}
