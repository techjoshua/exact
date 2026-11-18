package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This is the existing collector's prepared-source/extraction/propagation entry,
// kept live through inspection. No synthetic facts, operation IDs, input edges,
// ready flags or member coverage are installed. The unchanged fixture has no JSX,
// components, assets or policy handlers requiring other collector inputs.
func withOriginalSetEffectsCollector(t *testing.T, source string, inspect func(*executableBodyOwner, *ast.SourceFile, []callableFacts, *callableEffectWork)) {
	t.Helper()
	withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
		prepared := prepareCallableSourceFacts(file, owner.checker, nil, owner)
		facts := prepared.facts
		work := registerCallableEffectWork(facts)
		restore := registerWriterInputFacts(owner, facts, &work)
		defer restore()
		installBuildingInitializers(owner, file, facts)
		for {
			task, available := work.nextExtraction()
			if !available {
				break
			}
			if task.operation.index != 0 {
				work.extractOperation(facts, task, owner)
				continue
			}
			i := task.callable
			if callableIsInteractiveHandler(facts[i].node) {
				t.Fatal("original fixture unexpectedly requires interactive collector setup")
			}
			collectDirectCallableEffects(&facts[i], i, facts, prepared.symbolTargets, prepared.syntacticTargets, prepared.nodeTargets, file, owner.checker, nil, nil, prepared.importBindings, prepared.contextBindings, assetAnalysis{}, owner, &work)
			work.finishExtraction(facts, i)
		}
		sealMapInputs(facts, prepared.nodeTargets)
		// Pending remains observable and is not changed into successful analysis.
		_ = resolveCallableEffectsWithWork(facts, owner, &work)
		inspect(owner, file, facts, &work)
	})
}

func originalSetEffectsRoot(t *testing.T, file *ast.SourceFile, work *callableEffectWork) sourceStagedOperationRequest {
	t.Helper()
	for _, recipe := range work.operationRecipes {
		if recipe.assignment != nil && recipe.assignment.phase == "" && sourceText(file, recipe.assignment.root.use) == "receiver().work=input.value" {
			return recipe.assignment.root
		}
	}
	t.Fatal("authentic original596 Set recipe absent")
	return sourceStagedOperationRequest{}
}

// assertSetRHSSourceAccounting inspects original already-delivered dependencies.
// The formal remains a role, and no RHS value/effect substitution is inferred.
// In particular the shared RHS ACK also serves the root's fixed five phases;
// this proves input SOURCE dependency accounting only, not a new effect payload.
func assertSetRHSSourceAccounting(t *testing.T, owner *executableBodyOwner, facts []callableFacts, work *callableEffectWork, root, setRequest, next sourceStagedOperationRequest) {
	t.Helper()
	rhsRequest := stagedAssignmentRequest(root, "rhs")
	set := work.operationRecipes[setRequest.producer]
	mapped := false
	for _, required := range set.delta.required {
		mapped = mapped || sameOperationRequest(required, rhsRequest)
	}
	if !mapped {
		t.Fatal("original Set formal-to-RHS SOURCE mapping missing on writer dependency path")
	}

	lhs, rhs := root.use.AsBinaryExpression().Left, root.use.AsBinaryExpression().Right
	formal := work.operationRecipes[next.producer]
	setter := next.consumer
	if !ast.IsSetAccessorDeclaration(setter) || len(setter.Parameters()) != 1 || formal.callResult == nil || formal.callResult.binding != setter.Parameters()[0] || enclosingCallableNode(next.use) != setter || next.use.Parent == nil || !ast.IsBinaryExpression(next.use.Parent) || next.use.Parent.AsBinaryExpression().Right != next.use || next.use.Parent.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		t.Fatal("SOURCE mapping lost original store-only formal/read identity")
	}
	if !sameOperationRequest(next, stagedBindingResultRequest(next.use, setter)) || next.inputs != nil || len(formal.delta.exposures) != 1 {
		t.Fatal("original formal SOURCE request/exposure identity changed")
	}
	endpoint := formal.delta.exposures[0].endpoint
	expectedRole := sourceRelativeRole{kind: relativeRoleFormal, declaration: setter, slot: 0}
	if endpoint.kind != relativeEndpointRole || endpoint.role != expectedRole || endpoint.expression != next.use || endpoint.producer != next.use || endpoint.get != nil || endpoint.creation != nil || endpoint.returning != nil || len(endpoint.projection) != 0 || endpoint.cut != (sourceRelativeCut{operation: next.use, use: next.use, reading: next.use}) {
		t.Fatal("closed formal SOURCE was misinterpreted as original RHS/creating output")
	}
	observation := work.assignmentObserved[root.producer]
	physical := sourceRelativeCut{operation: root.use, reading: lhs}
	if observation == nil || observation.disposition == nil || observation.disposition.cut != physical || observation.disposition.generation != owner.values.generation || observation.disposition.issuer == nil || observation.disposition.issuer.operation != root.use || observation.disposition.issuer.get != lhs {
		t.Fatal("formal mapping borrowed wrong original Set SOURCE issuer/cut")
	}
	rhsPhase := work.operationRecipes[rhsRequest.producer]
	if rhsPhase.assignment == nil || rhsPhase.assignment.phase != "rhs" || rhsPhase.assignment.generation != owner.values.generation || !sameOperationRequest(rhsPhase.assignment.root, root) || !sameOperationRequest(rhsPhase.assignment.request, rhsRequest) || rhsRequest.inputs != nil || rhsRequest.cut != (sourceRelativeCut{operation: root.use, use: root.use, reading: root.use}) {
		t.Fatal("Set input mapping lost original RHS phase owner/graph cut")
	}
	getRequest := stagedGetResultRequest(rhs, root.consumer, "effects", nil)
	originalGet := false
	for _, required := range rhsPhase.delta.required {
		originalGet = originalGet || sameOperationRequest(required, getRequest)
	}
	get := work.operationRecipes[getRequest.producer]
	if !originalGet || get.callResult == nil || get.callResult.getResult == nil || get.callResult.getResult.role != "effects" || get.callResult.generation != owner.values.generation || !sameOperationRequest(get.callResult.request, getRequest) || getRequest.producer.operation != rhs || getRequest.cut != (sourceRelativeCut{operation: rhs, use: rhs, reading: rhs}) {
		t.Fatal("formal input path misrouted original RHS Get Effects SOURCE")
	}

	// Inspect the actual graph/subscribers; do not require, resolve or redeliver.
	applied := func(parent sourceStagedOperationID, request sourceStagedOperationRequest) sourceStagedOperationID {
		t.Helper()
		id, issued := work.operationIDs[request.producer]
		if !issued || id.epoch != work.operationEpoch || id.index == 0 {
			t.Fatal("original input dependency never enrolled", request.edge)
		}
		found := false
		for _, dependency := range work.operations[parent.index].dependencies {
			found = found || dependency.producer == id && sameOperationRequest(dependency.request, request)
		}
		state := &work.operations[id.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		if !found || !state.dependenciesRegistered || state.invalid || state.revision == 0 || subscriber == nil || !sameOperationRequest(subscriber.request, request) || subscriber.blocked || subscriber.applied != state.revision {
			t.Fatal("original writer input path did not consume SOURCE revision", request.edge)
		}
		return id
	}
	rootID, issued := work.operationIDs[root.producer]
	if !issued {
		t.Fatal("actual writer has no original Set producer")
	}
	setID := applied(rootID, setRequest)
	rhsID := applied(setID, rhsRequest)
	_ = applied(rhsID, getRequest)
	_ = applied(setID, next)
	writer := false
	for key, recipe := range work.operationRecipes {
		source := recipe.memberSource
		if source == nil || source.protocolSource == nil || !source.protocolSource.setEffects || stagedSetWriterOperation(source.candidate) != root.use || !validStagedSetWriterRecipe(recipe) {
			continue
		}
		id, issued := work.operationIDs[key]
		if !issued {
			continue
		}
		for _, dependency := range work.operations[id.index].dependencies {
			if dependency.producer == rootID && sameOperationRequest(dependency.request, root) {
				_ = applied(id, root)
				writer = true
			}
		}
	}
	if !writer {
		t.Fatal("no actual original writer consumes the mapped SOURCE dependency path")
	}

	// The root also requires RHS independently: this extra Set path does not by
	// itself add an effect, and cannot repair a demanded BODY role projection.
	caller, body := work.memberNodes[root.consumer], work.memberNodes[setter]
	invocation := sourceRelativeInvocation{declaration: setter, operation: root.use, use: physical.use, cut: physical}
	edge := stagedDeclarationCallEdge(facts[caller].summary.ID, invocation) + ":source-effects"
	dependency := work.stagedRequired[sourceStagedDependencyKey{caller, edge}]
	if dependency == nil || dependency.producer != body || dependency.operation != root.use || dependency.cut != physical || dependency.invalid || body >= len(work.stagedRevisions) || work.stagedRevisions[body] == 0 || dependency.consumed != work.stagedRevisions[body] {
		t.Fatal("original canonical BODY contribution revision was not consumed")
	}
	blocked := len(facts[body].staged.invoked) != 0
	for _, source := range facts[body].summary.DirectEffectSources {
		blocked = blocked || source.relativeInput != nil || source.relativeMutation != nil || source.provenanceIncomplete && source.Opaque
	}
	if blocked && !dependency.projectionPending {
		t.Fatal("demanded effect-role/opaque debt was acknowledged without substitution")
	}
	if dependency.projectionPending && facts[caller].staged.settled {
		t.Fatal("pending BODY substitution was published as complete")
	}
}

// This qualifies exact SOURCE dependency accounting on the actual writer path.
// It does not qualify a substituted BODY effect or complete Set Effects.
// The same test compiles on580; its first failure is the missing formal source.
func TestOriginalSetEffectsSourceConsumer(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		setRequest := stagedAssignmentRequest(root, "set")
		set := work.operationRecipes[setRequest.producer]
		reads := map[string]sourceStagedOperationRequest{}
		for _, required := range set.delta.required {
			if required.producer.selector.field == "binding-data" && required.use != nil && ast.IsIdentifier(required.use) && ast.IsSetAccessorDeclaration(required.producer.declaration) {
				reads[required.use.Text()] = required
			}
		}
		next, exists := reads["next"]
		if !exists {
			t.Fatal("original writer Effects lacks demanded setter next SOURCE contribution")
		}
		assertSetRHSSourceAccounting(t, owner, facts, work, root, setRequest, next)
		if !set.delta.extracted || !validStagedAssignmentRecipe(set) {
			t.Fatal("SOURCE Set phase not locally accounted; mandatory dependencies remain explicit", set.delta.extracted)
		}
		for _, name := range []string{"next", "events", "captured"} {
			read, exists := reads[name]
			if !exists {
				t.Fatalf("demanded %s read SOURCE missing", name)
			}
			id, issued := work.operationIDs[read.producer]
			if !issued {
				t.Fatalf("demanded %s SOURCE never enrolled by actual consumer", name)
			}
			state := &work.operations[id.index]
			subscriber := state.subscribers[sourceStagedOperationConsumer{read.consumer, read.edge}]
			if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || !work.closedOperationDependencies()[id.index] {
				t.Fatalf("demanded %s SOURCE not actually applied/closed", name)
			}
		}
		// The formal SOURCE remains a formal, not a fabricated Get result/B.
		formal := work.operationRecipes[next.producer]
		if formal.callResult == nil || !ast.IsParameterDeclaration(formal.callResult.binding) {
			t.Fatal("next SOURCE lost its original formal producer")
		}
		writerConsumed := false
		rootID, rootIssued := work.operationIDs[root.producer]
		if !rootIssued {
			t.Fatal("original writer never demanded Set Effects root")
		}
		for key, recipe := range work.operationRecipes {
			source := recipe.memberSource
			if source == nil || source.protocolSource == nil || !source.protocolSource.setEffects || stagedSetWriterOperation(source.candidate) != root.use {
				continue
			}
			id, issued := work.operationIDs[key]
			if !issued || !validStagedSetWriterRecipe(recipe) {
				continue
			}
			for _, dependency := range work.operations[id.index].dependencies {
				if dependency.producer != rootID || !sameOperationRequest(dependency.request, root) {
					continue
				}
				state := &work.operations[rootID.index]
				subscriber := state.subscribers[sourceStagedOperationConsumer{root.consumer, root.edge}]
				writerConsumed = subscriber != nil && !subscriber.blocked && subscriber.applied == state.revision
			}
		}
		if !writerConsumed {
			t.Fatal("actual original writer Effects subscriber did not consume new Set contribution")
		}
		for _, fact := range facts {
			for _, call := range fact.staged.calls {
				if call.invocation.operation == root.use && call.inputs != nil && call.inputs.delivered {
					t.Fatal("SOURCE-purpose handoff fabricated selected setter B")
				}
			}
		}
		value := work.operationRecipes[stagedGetResultRequest(root.use.AsBinaryExpression().Right, root.consumer, "value", nil).producer]
		if value.delta.extracted || len(value.delta.exposures) != 0 {
			t.Fatal("Set SOURCE supplied unpaid normal RHS Get output")
		}
	})
}
