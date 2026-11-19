package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedDescriptorSource is an original callee discovery demand. It is
// neither the selected Object branch nor an Effects/result completion receipt.
// Pending descriptions survive cloning; the new graph must receive a genuine
// selected Get before this role can deliver. No work, publisher or query escapes.
type sourceStagedDescriptorSource struct {
	request, original sourceStagedOperationRequest
	generation        *projectGeneration
}

func descriptorSourceRequest(original sourceStagedOperationRequest) sourceStagedOperationRequest {
	if original.use == nil || !ast.IsCallExpression(original.use) {
		return sourceStagedOperationRequest{}
	}
	request := original
	request.producer.selector = sourceStagedOperationSelector{occurrence: original.use.Expression(), field: "descriptor-callee-source"}
	request.edge += ":descriptor-callee-source"
	return request
}

func sameDescriptorSource(a, b *sourceStagedDescriptorSource) bool {
	return a == b || a != nil && b != nil && a.generation == b.generation && sameOperationRequest(a.request, b.request) && sameOperationRequest(a.original, b.original)
}

func validDescriptorSourceRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.descriptorSource
	if source == nil || source.generation == nil || !validStagedMemberParent(source.original) || !sameOperationRequest(source.request, descriptorSourceRequest(source.original)) || recipe.key != source.request.producer {
		return false
	}
	call := source.original.use
	if !descriptorRetrievalIntent(call) || recipe.frameworkEffects != nil || recipe.moduleArgument != nil || recipe.declarationCall != nil || recipe.declarationCallGeneration != nil || recipe.entryLaw != nil || recipe.constructionEffects != nil || recipe.assignment != nil || recipe.hasInstance != nil || recipe.callResult != nil || recipe.memberSource != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.writer != nil || recipe.getter != nil || recipe.returning != nil || recipe.constructedDisposition != nil || recipe.constructed != nil || recipe.nativeGet != nil || len(recipe.writerRequired)+len(recipe.constructedInputs)+len(recipe.constructedGroup)+len(recipe.fieldForwards) != 0 {
		return false
	}
	if operationDeltaSize(recipe.delta) == 0 {
		return !recipe.delta.extracted
	}
	root := sourceStagedNativeGetSource{request: source.original, get: call.Expression()}
	return len(recipe.delta.required) == 1 && operationDeltaSize(recipe.delta) == 1 && sameOperationRequest(recipe.delta.required[0], nativeRootDebtRequest(&root, "callee-get"))
}

// descriptorRetrievalIntent bounds source registration only. The actual
// standard entry and every modeled replacement still belong to the original Get.
func descriptorRetrievalIntent(call *ast.Node) bool {
	if call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || !ast.IsPropertyAccessExpression(call.Expression()) && !ast.IsElementAccessExpression(call.Expression()) {
		return false
	}
	_, name := accessorReceiver(call.Expression())
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	return name == "getOwnPropertyDescriptor" && len(actuals) == 2 && !ast.IsSpreadElement(actuals[0]) && !ast.IsSpreadElement(actuals[1])
}

// registerDescriptorWriterSource is lent by the original publisher registry.
// It enrolls pending work only. In particular it performs no receiver query,
// selection replay or source observation inside writer recovery.
func (work *callableEffectWork) registerDescriptorWriterSource(facts []callableFacts, owner *executableBodyOwner, publisher *sourcePendingMemberPublisher, q *sourceValueQuery, r *sourceWriterInputRequest) {
	if owner == nil || owner.values == nil || owner.project == nil || publisher == nil || !publisher.live || publisher.fact == nil || q == nil || r == nil || !r.live || r.issuer != q || q.executable != owner || q.owner == nil || q.owner.program != owner.values.program || q.owner.checker != owner.values.checker || q.owner.generation != owner.values.generation || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || r.consumer != q.effectOwner || r.use != q.effectUse() || r.original != ([4]*ast.Node{q.reading, q.initializing, q.returning, q.invoking}) || !descriptorRetrievalIntent(r.call) || owner.pendingMemberPublishers[r.consumer] != publisher || publisher.fact.node != r.consumer || owner.values.generation == nil || owner.project.activeGeneration != owner.values.generation || work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return
	}
	caller, known := work.memberNodes[r.consumer]
	if !known || caller >= len(facts) || &facts[caller] != publisher.fact || len(work.operationFacts) != len(facts) || &work.operationFacts[caller] != publisher.fact || publisher.fact.writerInputs != r.graph || publisher.fact.sourceFile == nil || owner.values.program.GetSourceFile(publisher.fact.sourceFile.FileName()) != publisher.fact.sourceFile || ast.GetSourceFileOfNode(r.call) != publisher.fact.sourceFile || !stagedNativeInputSourceOwner(publisher.fact, r.call, owner) || !stagedNativeInputEligible(r.call, publisher.fact, owner) || !standardLibraryCallRoot(r.call.Expression(), owner.checker) {
		return
	}
	if work.operationGeneration == nil {
		work.operationGeneration = owner.values.generation
	}
	original, issued := stagedNativeInputOccurrenceRequest(publisher.fact, r.call)
	if !issued {
		return
	}
	request := descriptorSourceRequest(original)
	recipe := sourceStagedOperationRecipe{key: request.producer, descriptorSource: &sourceStagedDescriptorSource{request: request, original: original, generation: work.operationGeneration}}
	if prior, registered := work.operationRecipes[request.producer]; registered {
		if !sameDescriptorSource(prior.descriptorSource, recipe.descriptorSource) || !validDescriptorSourceRecipe(prior) {
			return
		}
	} else if !work.registerOperationRecipe(facts, recipe) {
		return
	}
	if !work.registerOperationUse(facts, sourceStagedOperationUse{request: request}) {
		return
	}
	work.queueDescriptorSource(facts, work.operationRecipes[original.producer].nativeGet)
	descriptor := request
	r.descriptorWork, r.descriptorIssuer, r.descriptorSource = work, r, &descriptor
}

// descriptorCalleeSourceCurrent is deliberately callee-only. Argument,
// capture/default discovery and the original Call's Effects are not paid here.
// The established current Get receipt, not this description, owns coverage.
func (work *callableEffectWork) descriptorCalleeSourceCurrent(recipe sourceStagedOperationRecipe) bool {
	if work.operationGeneration == nil || !work.operationGeneration.active || work.operationGeneration.project == nil || work.operationGeneration.project.activeGeneration != work.operationGeneration || !validDescriptorSourceRecipe(recipe) || recipe.descriptorSource.generation != work.operationGeneration {
		return false
	}
	root := work.operationRecipes[recipe.descriptorSource.original.producer]
	return validNativeGetRecipe(root) && validDescriptorRetrieval(root.nativeGet) && sameOperationRequest(root.nativeGet.request, recipe.descriptorSource.original) && work.nativeEffectsGetCurrent(root.nativeGet)
}

// prepareDescriptorSource consumes an existing original publisher's delivery.
// It cannot query a native callee or promote a pending source into runtime MAY.
func (work *callableEffectWork) prepareDescriptorSource(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil || owner.project == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	recipe := work.operationRecipes[work.operations[id.index].key]
	// ACK transport is a wakeup key only; currentness below still requires a
	// fresh original Get receipt and never refreshes its semantic snapshot.
	work.operations[id.index].writerSourceRevisions = work.sourceObservationRevisions(id)
	if !work.descriptorCalleeSourceCurrent(recipe) {
		return
	}
	caller, known := work.memberNodes[recipe.key.declaration]
	publisher := owner.pendingMemberPublishers[recipe.key.declaration]
	if !known || caller >= len(facts) || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].sourceFile == nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return
	}
	root := work.operationRecipes[recipe.descriptorSource.original.producer].nativeGet
	recipe.delta = sourceStagedOperationDelta{required: []sourceStagedOperationRequest{nativeRootDebtRequest(root, "callee-get")}, extracted: true}
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, recipe.delta)
	}
}

// queueDescriptorSource connects only the exact registered original request to
// a genuine native publisher. It enrolls prerequisites and schedules the existing
// queue; it cannot deliver selection or turn a pending Get into an observation.
func (work *callableEffectWork) queueDescriptorSource(facts []callableFacts, root *sourceStagedNativeGetSource) {
	if root != nil {
		current := work.operationRecipes[root.request.producer].nativeGet
		if !sameNativeGetSource(current, root) {
			return
		}
		root = current
	}
	if !validDescriptorRetrieval(root) || root.descriptorRead.generation != work.operationGeneration {
		return
	}
	request := descriptorSourceRequest(root.request)
	recipe := work.operationRecipes[request.producer]
	if !validDescriptorSourceRecipe(recipe) || !sameOperationRequest(recipe.descriptorSource.original, root.request) || recipe.descriptorSource.generation != work.operationGeneration {
		return
	}
	if len(recipe.delta.required) == 0 {
		recipe.delta.required = []sourceStagedOperationRequest{nativeRootDebtRequest(root, "callee-get")}
		if !work.attachOperationSource(facts, recipe) {
			return
		}
	}
	id, registered := work.operationIDs[request.producer]
	if !registered || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) || work.operations[id.index].invalid {
		return
	}
	work.attachSourceObservationDependencies(facts, id)
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery {
			return
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[request.consumer], operation: id})
}

// descriptorWriterDisposition consumes callee-only source accounting for this
// exact live original recovery. It never excludes argument/capture discovery.
func (r *sourceWriterInputRequest) descriptorWriterDisposition(q *sourceValueQuery) sourceStagedWriterCallDisposition {
	if r == nil || r.descriptorWork == nil || r.descriptorSource == nil || r.descriptorIssuer != r || !r.live || r.issuer != q || q == nil || q.executable == nil || q.owner == nil || r.consumer != q.effectOwner || r.use != q.effectUse() || q.pendingMemberRequest != r || q.initializing != r.call || q.reading != r.original[0] || q.returning != r.original[2] || q.invoking != r.original[3] || r.graph != q.executable.writerInputFacts[r.consumer] {
		return sourceStagedWriterCallDisposition{}
	}
	work := r.descriptorWork
	caller, known := work.memberNodes[r.consumer]
	publisher := q.executable.pendingMemberPublishers[r.consumer]
	if !known || caller >= len(work.operationFacts) || publisher == nil || !publisher.live || publisher.fact != &work.operationFacts[caller] || publisher.workRegistrar == nil || publisher.workRegistrar.descriptorSource == nil || q.executable.values == nil || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.values.checker || q.owner.generation != q.executable.values.generation || q.owner.generation != work.operationGeneration || q.executable.project == nil || q.executable.project.activeGeneration != work.operationGeneration {
		return sourceStagedWriterCallDisposition{}
	}
	if q.currentPendingInvocationSource(r.call) != publisher.fact {
		return sourceStagedWriterCallDisposition{}
	}
	request := *r.descriptorSource
	recipe := work.operationRecipes[request.producer]
	if !validDescriptorSourceRecipe(recipe) || !sameOperationRequest(recipe.descriptorSource.request, request) || recipe.descriptorSource.original.use != r.call {
		return sourceStagedWriterCallDisposition{}
	}
	id, adopted := work.operationIDs[request.producer]
	if !adopted {
		return sourceStagedWriterCallDisposition{}
	}
	// This factory can only consume an already observed Get; its dispatcher
	// contains no acquisition/replay path. Required closure remains central.
	work.extractOperation(work.operationFacts, callableExtractionTask{operation: id}, q.executable)
	delivery, delivered := work.consumeOperation(id, request)
	return sourceStagedWriterCallDisposition{handled: true, calleeOnly: delivered && delivery.delta.extracted && work.descriptorCalleeSourceCurrent(recipe)}
}

// currentPendingInvocationSource authenticates the original live writer ticket.
// It supplies source ownership only, never an invocation or result receipt.
func (q *sourceValueQuery) currentPendingInvocationSource(node *ast.Node) *callableFacts {
	r := q.pendingMemberRequest
	if r == nil || !r.live || r.issuer != q || r.call != node || r.consumer != q.effectOwner || r.use != q.effectUse() || q.reading != r.original[0] || q.initializing != node || q.returning != r.original[2] || q.invoking != r.original[3] || r.member == nil || q.owner == nil || q.owner.generation == nil || q.executable == nil || q.executable.values == nil || q.executable.project == nil || q.owner.generation != q.executable.values.generation || q.owner.generation != q.executable.project.activeGeneration || q.owner.program == nil || q.owner.program != q.executable.values.program || r.graph != q.executable.writerInputFacts[q.effectOwner] {
		return nil
	}
	publisher, ticket := q.executable.pendingMemberPublishers[q.effectOwner], r.member
	if publisher == nil || publisher != ticket.publisher || !publisher.live || publisher.fact == nil || ticket.phase == memberRevoked || ticket.demand == nil {
		return nil
	}
	fact, source := publisher.fact, ticket.demand
	if fact.node != q.effectOwner || fact.writerInputs != r.graph || fact.normalInputs != nil || fact.sourceFile == nil || q.owner.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile || ast.GetSourceFileOfNode(node) != fact.sourceFile || fact.pendingMembers == nil || fact.pendingMembers.sites[node] != source || source.declaration != q.effectOwner || source.call != node || source.get != unwrapSourceCallableReference(node.Expression()) {
		return nil
	}
	return fact
}
