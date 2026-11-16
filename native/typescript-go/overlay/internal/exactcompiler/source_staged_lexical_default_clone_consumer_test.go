package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Exercise the real production clone factory, rather than resetting flags or
// pretending that an unchanged B description is a new binder event. This API
// control does not claim a repeated Session cache hit naturally rebuilds work.
func TestStagedLexicalDefaultCloneConsumerLifecycle(t *testing.T) {
	const id = "/virtual/default-clone-consumer.ts"
	request := Request{Kind: "analyze", ID: id, Source: stagedLexicalDefaultDataSource, Target: TargetClient, Diagnostics: "semantic", stagedReplacement: true}
	project, diagnostics, err := newProjectStateWithSources(request, id, map[string]string{id: request.Source})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal("original project setup", err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if generation != nil {
			generation.release()
		}
	}()
	collectProjectCallableEffects(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
	cache := project.callableCache
	if cache == nil || !cache.ownsGeneration(generation.program, generation.checker) || len(cache.merged.pending) != 0 {
		t.Fatal("original default source collection UNREACHED")
	}
	checkDefaultCloneDescriptions(t, cache.merged.facts, true)

	// Both collections use actual cached descriptions and their own production
	// work/publisher interval. No B is allocated or selected by this test.
	first := beginProjectCallableCollection(cache, cache.owner)
	var oldID sourceStagedOperationID
	var oldRequest sourceStagedOperationRequest
	var oldRecipe sourceStagedOperationRecipe
	func() {
		defer first.close()
		oldID, oldRequest, oldRecipe = qualifyDefaultCloneConsumer(t, first, generation.sourceFile, nil, sourceStagedOperationID{}, sourceStagedOperationRequest{})
	}()
	second := beginProjectCallableCollection(cache, cache.owner)
	func() {
		defer second.close()
		if second.work.operationEpoch == oldID.epoch {
			t.Fatal("real clone factory reused graph identity")
		}
		qualifyDefaultCloneConsumer(t, second, generation.sourceFile, &oldRecipe, oldID, oldRequest)
	}()

	oldProgram := generation.program
	generation.release() // Release the actual lease before advancing the project.
	generation = nil
	next, err := project.advance(context.Background(), id, request.Source+"\n")
	if err != nil {
		t.Fatal(err)
	}
	generation = next
	if next.program == oldProgram || cache.ownsGeneration(next.program, next.checker) {
		t.Fatal("real source edit retained the retired program/checker")
	}
	collectProjectCallableEffects(project, next.sourceFile, next.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
	current := project.callableCache
	if current == nil || !current.ownsGeneration(next.program, next.checker) || len(current.merged.pending) != 0 {
		t.Fatal("edited source did not collect its own default inputs")
	}
	fresh := beginProjectCallableCollection(current, current.owner)
	defer fresh.close()
	consumer, _ := defaultCloneOmittedCall(t, fresh.facts)
	if _, accepted := fresh.work.registerStagedDeclarationCallEffects(fresh.facts, consumer, oldRecipe.key.operation, current.owner); accepted {
		t.Fatal("fresh actual source registrar accepted retired default Call AST")
	}
	qualifyDefaultCloneConsumer(t, fresh, next.sourceFile, &oldRecipe, oldID, oldRequest)
}

// The only inspected B packets came from original collection. Required,
// bypassed and conditional defaults must retain their real donor/actual role.
func checkDefaultCloneDescriptions(t *testing.T, facts []callableFacts, closed bool) {
	t.Helper()
	seen := make(map[string]bool)
	for _, fact := range facts {
		for _, call := range fact.staged.calls {
			if call.invocation.declaration == nil || call.invocation.declaration.Name() == nil || call.invocation.declaration.Name().Text() != "factory" {
				continue
			}
			if call.inputs == nil || !call.inputs.delivered || call.sourceInputs != nil || call.legacyInputs || call.inputConsumerWait != nil || !validStagedDataResultCall(call) || len(call.inputs.bound.defaults) != 2 || call.inputs.relative.unsupported != relativeInputsSupported || closed && fact.staged.operationsPending {
				t.Fatal("original default description or resolved closure lost", fact.summary.Name)
			}
			want := relativeDefaultRequired
			if fact.summary.Name == "provided" {
				want = relativeDefaultBypassed
			} else if fact.summary.Name == "partial" && len(call.invocation.actuals) == 1 && call.invocation.actuals[0].endpoint.kind == relativeEndpointRole {
				want = relativeDefaultConditional
				role, donor := false, false
				for _, binding := range call.inputs.relative.bindings {
					if binding.target.kind != relativeRoleFormal || binding.target.slot != 0 {
						continue
					}
					for _, source := range binding.sources {
						role = role || source.kind == relativeEndpointRole && source.role == call.invocation.actuals[0].endpoint.role
						donor = donor || source.kind == relativeEndpointExpression && source.expression != nil && source.expression.Name() != nil && source.expression.Name().Text() == "quiet"
					}
				}
				if !role || !donor {
					t.Fatal("clone dropped conditional caller role or quiet donor")
				}
			} else if fact.summary.Name == "partial" {
				want = relativeDefaultBypassed
			}
			if call.inputs.bound.defaults[0].selection != want || call.inputs.bound.defaults[1].selection != relativeDefaultRequired {
				t.Fatal("clone changed original default selection", fact.summary.Name)
			}
			seen[fact.summary.Name] = true
		}
	}
	for _, name := range []string{"provided", "omitted", "explicitUndefined", "partial", "expose"} {
		if !seen[name] {
			t.Fatal("original default clone descriptor UNREACHED", name)
		}
	}
}

func defaultCloneOmittedCall(t *testing.T, facts []callableFacts) (int, sourceStagedDeclarationCall) {
	t.Helper()
	for i := range facts {
		if facts[i].summary.Name != "omitted" {
			continue
		}
		for _, call := range facts[i].staged.calls {
			if call.invocation.declaration != nil && call.invocation.declaration.Name() != nil && call.invocation.declaration.Name().Text() == "factory" && call.inputs != nil {
				return i, call
			}
		}
	}
	t.Fatal("original omitted factory Call UNREACHED")
	return -1, sourceStagedDeclarationCall{}
}

// The real Effects registrar consumes the cloned B description, while a new
// graph must independently observe SOURCE and canonical BODY delivery. Old IDs
// are offered to the actual operation consumer, never a synthetic stale flag.
func qualifyDefaultCloneConsumer(t *testing.T, collection *projectCallableCollection, source *ast.SourceFile, old *sourceStagedOperationRecipe, oldID sourceStagedOperationID, oldRequest sourceStagedOperationRequest) (sourceStagedOperationID, sourceStagedOperationRequest, sourceStagedOperationRecipe) {
	t.Helper()
	facts, work, owner := collection.facts, &collection.work, collection.owner
	checkDefaultCloneDescriptions(t, facts, false)
	consumer, call := defaultCloneOmittedCall(t, facts)
	if old != nil {
		if _, current := work.currentDeclarationCallEffects(*old); current {
			t.Fatal("clone inherited prior graph SOURCE observation")
		}
		if _, consumed := work.consumeOperation(oldID, oldRequest); consumed {
			t.Fatal("actual consumer accepted old graph execution authority")
		}
	}
	request, registered := work.registerStagedDeclarationCallEffects(facts, consumer, call.invocation.operation, owner)
	if !registered {
		t.Fatal("real clone consumer renewal UNREACHED")
	}
	recipe := work.operationRecipes[request.producer]
	if recipe.declarationCall == nil || recipe.declarationCall.inputs != call.inputs || !work.passiveDeclarationCallEffectsReady(recipe) {
		t.Fatal("clone consumer lost authentic original B description")
	}
	operation, adopted := work.requireOperation(facts, request)
	if !adopted || work.closedOperationDependencies()[operation.index] {
		t.Fatal("new clone source description bypassed independent BODY delivery")
	}
	collection.collect()
	analysis := collection.resolve(source)
	if len(analysis.pending) != 0 {
		t.Fatal("clone graph failed original source closure", analysis.pending)
	}
	state := &work.operations[operation.index]
	if !work.declarationCallEffectsAccounted(state, work.operationRecipes[request.producer]) || !work.closedOperationDependencies()[operation.index] {
		t.Fatal("fresh real consumer did not close its own BODY/dependencies")
	}
	if _, accepted := work.consumeOperation(operation, request); !accepted {
		t.Fatal("actual current operation consumer UNREACHED")
	}
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || subscriber.consumed != state.revision || state.revision == 0 {
		t.Fatal("fresh consumer lacks its own actual revision/consumed/APPLIED")
	}
	checkDefaultCloneDescriptions(t, analysis.facts, true)
	seen := make(map[string]bool)
	for _, fact := range analysis.facts {
		name := fact.summary.Name
		if name != "provided" && name != "omitted" && name != "explicitUndefined" && name != "partial" && name != "expose" {
			continue
		}
		known, unknown, dormant := false, false, false
		for _, effect := range fact.summary.EffectSources {
			known = known || effect.Environment == "browser" && effect.Description == "window"
			unknown = unknown || effect.Environment == "unknown"
			dormant = dormant || effect.Environment == "browser" && effect.Description == "document"
		}
		if known != (name == "provided" || name == "partial") || unknown != (name == "partial") || dormant {
			t.Fatal("clone lost known/default/runtimeunknown or invoked dormant work", name)
		}
		seen[name] = true
	}
	if len(seen) != 5 {
		t.Fatal("clone output consumers UNREACHED")
	}
	return operation, request, work.operationRecipes[request.producer]
}
