package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// stagedFrameworkEffectsRequest is the original ordinary declared Call's Effects
// source. It shares the operation queue, not the implemented lexical-body recipe.
func stagedFrameworkEffectsRequest(call, caller *ast.Node) sourceStagedOperationRequest {
	return sourceStagedOperationRequest{producer: sourceStagedOperationKey{operation: call, declaration: caller, kind: relativeDemandEffects}, consumer: caller, use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}, edge: fmt.Sprintf("framework-call-effects:%d", call.Pos())}
}

// frameworkEffectsInputOwned bounds this first source connection to a plain
// initialized formal/function reference or an original construction expression. Property,
// spread, adapted and nested-call evaluation keep their existing source owners.
// Formal contents may remain runtime-unknown; this is not a value/NoUser test.
func frameworkEffectsInputOwned(view *sourceFrameworkStorageView, caller *ast.Node, owner *executableBodyOwner) bool {
	if view == nil || owner == nil || owner.values == nil {
		return false
	}
	if stagedEmptyArrayDataConstruction(view.argument) || ast.IsObjectLiteralExpression(view.argument) || ast.IsNewExpression(view.argument) {
		return true
	}
	if !ast.IsIdentifier(view.argument) {
		return false
	}
	binding := stagedBindingDataDeclaration(view.argument, caller, owner)
	return binding != nil && (ast.IsParameterDeclaration(binding) && binding.Initializer() == nil || ast.IsFunctionDeclaration(binding) && binding.Body() != nil)
}

func validStagedFrameworkEffectsRecipe(recipe sourceStagedOperationRecipe) bool {
	view := recipe.frameworkEffects
	if view == nil || view.generation == nil || view.call == nil || !ast.IsCallExpression(view.call) || recipe.key.operation != view.call || recipe.key.kind != relativeDemandEffects || recipe.key.selector != (sourceStagedOperationSelector{}) || !sourceStagedOccurrenceOwned(view.call, recipe.key.declaration) || view.declaration == nil || !ast.IsFunctionDeclaration(view.declaration) || view.declaration.Body() != nil {
		return false
	}
	if recipe.moduleArgument != nil || recipe.declarationCall != nil || recipe.entryLaw != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.hasInstance != nil || recipe.callResult != nil || recipe.memberSource != nil || recipe.nativeGet != nil || recipe.constructed != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 {
		return false
	}
	actuals := restrictedInvocationArguments(view.call.AsCallExpression())
	if len(actuals) != 1 || actuals[0] != view.argument || ast.IsSpreadElement(actuals[0]) || view.cut != (sourceRelativeCut{operation: view.call, use: view.call, reading: view.argument}) || view.input.target != (sourceRelativeRole{kind: relativeRoleFormal, declaration: view.declaration, slot: 0}) || view.inputGap != relativeInputsSupported || view.input.unknown || len(view.input.pending) != 0 || len(view.input.sources) != 1 || view.input.sources[0].cut != view.cut || len(view.projection) != 0 {
		return false
	}
	// Actual MAY writes, captures, environments and uncertainty publish through the
	// original fact appenders, never a second flattened environment-effect channel.
	return operationDeltaSize(recipe.delta) == 0
}

func (work *callableEffectWork) registerStagedFrameworkEffects(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) (sourceStagedOperationRequest, bool) {
	if owner == nil || owner.values == nil || owner.project == nil || owner.values.generation == nil || owner.project.activeGeneration != owner.values.generation || caller < 0 || caller >= len(facts) || facts[caller].normalInputs != nil || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return sourceStagedOperationRequest{}, false
	}
	publisher := owner.pendingMemberPublishers[facts[caller].node]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] {
		return sourceStagedOperationRequest{}, false
	}
	work.indexOperationSources(facts)
	if work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return sourceStagedOperationRequest{}, false
	}
	work.operationGeneration = owner.values.generation
	source, valid := work.describeStagedFrameworkResult(facts, caller, call, owner)
	if !valid || !frameworkEffectsInputOwned(source.frameworkView, facts[caller].node, owner) {
		return sourceStagedOperationRequest{}, false
	}
	request := stagedFrameworkEffectsRequest(call, facts[caller].node)
	prior, exists := work.operationRecipes[request.producer]
	if exists {
		return request, validStagedFrameworkEffectsRecipe(prior) && sameFrameworkStorageView(prior.frameworkEffects, source.frameworkView)
	}
	view := projectFrameworkStorageView(*source.frameworkView, nil)
	return request, work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, frameworkEffects: &view})
}

// stageFrameworkEffects is called at the original canonical collector entry.
// The ordinary publisher runs once on this graph's queued source operation.
// Original child traversal still collects argument/reference Effects normally.
func (work *callableEffectWork) stageFrameworkEffects(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) bool {
	request, registered := work.registerStagedFrameworkEffects(facts, caller, call, owner)
	return registered && work.registerOperationUse(facts, sourceStagedOperationUse{request: request})
}

// frameworkEffectsCompilerPending excludes unrepresented source work, not the
// ordinary declaration's unavailable output marker. This result comes solely
// from a fresh direct imported-declaration Effects traversal with no input frame,
// source-return/view consumer or implementation body. Its unavailable value is
// preserved on the original result and is never used as normal output.
func frameworkEffectsCompilerPending(c accessorCandidates) bool {
	return len(c.fieldCalls)+len(c.inputs) != 0 || frameworkEffectsCompilerPendingWithoutSourceBodies(c)
}

// Source bodies may be accounted only by their synchronous producer and exact
// retained publication. Every other compiler-debt category remains unchanged.
func frameworkEffectsCompilerPendingWithoutSourceBodies(c accessorCandidates) bool {
	if c.opaque || c.receiverIncomplete || c.fieldReceiverIncomplete || c.thenIncomplete || len(c.fieldFallbacks)+len(c.callFallbacks)+len(c.descriptorFallbacks)+len(c.owned)+len(c.ownedLocalCauses)+len(c.producers)+len(c.ownedGets)+len(c.normalCalls)+len(c.nativeCalls)+len(c.accessorMutations)+len(c.nativeDescriptorEffects) != 0 {
		return true
	}
	for _, source := range c.environmentEffects {
		if source.provenanceIncomplete {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) liveFrameworkEffects(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) (int, sourceStagedOperationRecipe, bool) {
	if owner == nil || owner.values == nil || owner.project == nil || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || owner.project.activeGeneration != work.operationGeneration || owner.values.generation != work.operationGeneration {
		return 0, sourceStagedOperationRecipe{}, false
	}
	state := &work.operations[id.index]
	recipe := work.operationRecipes[state.key]
	caller, known := work.memberNodes[recipe.key.declaration]
	if !known || caller >= len(facts) || len(work.operationFacts) != len(facts) || &work.operationFacts[caller] != &facts[caller] || work.operationIDs[state.key] != id || !validStagedFrameworkEffectsRecipe(recipe) || recipe.frameworkEffects.generation != work.operationGeneration || facts[caller].normalInputs != nil {
		return 0, sourceStagedOperationRecipe{}, false
	}
	publisher := owner.pendingMemberPublishers[facts[caller].node]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return 0, sourceStagedOperationRecipe{}, false
	}
	current, valid := work.describeStagedFrameworkResult(facts, caller, recipe.key.operation, owner)
	return caller, recipe, valid && sameFrameworkStorageView(current.frameworkView, recipe.frameworkEffects) && frameworkEffectsInputOwned(recipe.frameworkEffects, facts[caller].node, owner)
}

// prepareStagedFrameworkEffects invokes the maintained ordinary per-call Effects
// publisher, not a source-return projection. It retains every original appender
// contribution in the owning fact; no scope, candidate packet or receipt escapes.
// Graph-local issuance is rebuilt after clone, independently of description X.
func (work *callableEffectWork) prepareStagedFrameworkEffects(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	caller, recipe, live := work.liveFrameworkEffects(facts, id, owner)
	if !live {
		return
	}
	state := &work.operations[id.index]
	if state.writerSourceRunning {
		return
	}
	if state.resultSourceRequested {
		work.publishOperation(id, recipe.delta)
		return
	}
	state.writerSourceRunning = true
	defer func() { work.operations[id.index].writerSourceRunning = false }()
	// This exact appender calls sourceInvocationDependencies -> query.invocation.
	// That consumer has no sourceReturn/sourceView and cannot demand this result.
	candidates := appendArgumentAccessorEffects(&facts[caller], recipe.key.operation, work.memberNodes, facts[caller].sourceFile, owner.checker, owner, nil)
	// This graph has consumed the real publisher once even when its source
	// requirements remain pending. A retry cannot silently reacquire arguments
	// or replace compiler debt with the contract's runtime alternative.
	work.operations[id.index].resultSourceRequested = true
	_, current, stillLive := work.liveFrameworkEffects(facts, id, owner)
	if !stillLive {
		return
	}
	bodies, represented := work.requireFrameworkEffectsBodies(facts, current, candidates)
	work.operations[id.index].memberActivations = bodies
	if !represented || frameworkEffectsCompilerPending(candidates) {
		return
	}
	current.delta = sourceStagedOperationDelta{extracted: true}
	if work.attachOperationSource(facts, current) {
		work.operations[id.index].resultSourceRequested = true
		work.publishOperation(id, current.delta)
	}
}

// requireFrameworkEffectsBodies consumes only the original publisher's actual
// source effect edges. Canonical declaration MAY membership is not invocation,
// capture DATA, normal output or getter completion. Existing subscriber delivery
// keeps every known body pending until its current summary has been consumed.
func (work *callableEffectWork) requireFrameworkEffectsBodies(facts []callableFacts, recipe sourceStagedOperationRecipe, candidates accessorCandidates) ([]sourceStagedMemberRequirement, bool) {
	var bodies []sourceStagedMemberRequirement
	consumer, known := work.memberNodes[recipe.key.declaration]
	if !known {
		return bodies, false
	}
	request := stagedFrameworkEffectsRequest(recipe.key.operation, recipe.key.declaration)
	for _, contribution := range candidates.effects {
		target, found := work.memberNodes[contribution.declaration]
		if !found || contribution.operation == nil {
			return bodies, false
		}
		edge := ""
		for _, actual := range facts[consumer].summary.Calls {
			if actual.Resolved && actual.TargetID == facts[target].summary.ID && facts[consumer].fieldEdgeOperations[actual.ID] == contribution.operation {
				edge = actual.ID
				break
			}
		}
		if edge == "" {
			return bodies, false
		}
		work.requireStagedSummary(facts, consumer, target, edge, request.use, request.cut)
		present := false
		for _, prior := range bodies {
			present = present || prior.edge == edge && prior.producer == target
		}
		if !present {
			bodies = append(bodies, sourceStagedMemberRequirement{producer: target, edge: edge})
		}
		if facts[target].staged.ready {
			work.observeStagedSummary(facts, consumer, target, edge)
		}
	}
	return bodies, true
}

// frameworkEffectBodiesCurrent consumes existing summary deliveries; no value,
// Call receipt or hidden-entry capability can follow from definition MAY.
func (work *callableEffectWork) frameworkEffectBodiesCurrent(consumer int, bodies []sourceStagedMemberRequirement) bool {
	for _, body := range bodies {
		dependency := work.stagedRequired[sourceStagedDependencyKey{consumer, body.edge}]
		if dependency == nil || dependency.invalid || dependency.projectionPending || dependency.producer != body.producer || body.producer < 0 || body.producer >= len(work.stagedRevisions) || !work.operationFacts[body.producer].staged.ready || work.stagedRevisions[body.producer] == 0 || dependency.consumed != work.stagedRevisions[body.producer] {
			return false
		}
	}
	return true
}
