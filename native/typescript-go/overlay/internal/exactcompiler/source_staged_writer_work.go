package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceStagedWriterProjectionSource seals original writer observations for one
// finite (read, write) source role. Creating Calls remain alternatives within
// that role. They do not grow the operation key or create a new scheduler.
// Fresh graph-local publication still requires the current original Get owner.
type sourceStagedWriterProjectionSource struct {
	request, parent sourceStagedOperationRequest
	generation      *projectGeneration
	reads           []sourceStagedWriterRead
	callable        bool
	projections     []*sourceStagedWriterProjection
}

func stagedWriterRHSRequest(parent sourceStagedOperationRequest, write *ast.Node) sourceStagedOperationRequest {
	request := parent
	request.reading = parent.producer
	request.producer.kind = relativeDemandDirectExposure
	request.producer.selector = sourceStagedOperationSelector{occurrence: write, association: parent.producer.selector.occurrence, field: "writer-rhs:" + parent.producer.selector.field}
	request.edge = fmt.Sprintf("%s:writer-rhs:%d", parent.edge, write.Pos())
	return request
}

func validWriterRHSRequirement(parent sourceStagedOperationKey, request sourceStagedOperationRequest) bool {
	write := request.producer.selector.occurrence
	return request.reading == parent && request.producer.declaration == parent.declaration && request.producer.operation == parent.operation && request.producer.kind == relativeDemandDirectExposure && (request.producer.selector.field == "writer-rhs:"+parent.selector.field || request.producer.selector.field == "writer-callable:"+parent.selector.field) && request.producer.selector.association == parent.selector.occurrence && write != nil && ast.IsBinaryExpression(write) && write.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken && request.consumer == parent.declaration && request.inputs == nil
}

func validStagedWriterRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.writer
	if source == nil || source.generation == nil || recipe.nativeGet != nil || recipe.constructed != nil || recipe.getter != nil || recipe.returning != nil || len(recipe.writerRequired) != 0 || recipe.key != source.request.producer || !validWriterRHSRequirement(source.parent.producer, source.request) || !sameOperationRequest(source.request, stagedWriterSourceRequest(source.parent, source.request.producer.selector.occurrence, source.callable)) || len(source.reads) == 0 {
		return false
	}
	for _, read := range source.reads {
		if read.write != recipe.key.selector.occurrence || read.readCut.use != source.parent.use || read.readCut.reading != source.parent.use || read.observation.operation != source.parent.producer.operation || read.value.expression != read.write.AsBinaryExpression().Right || read.value.get != read.write.AsBinaryExpression().Left || read.value.creation != read.call || read.value.producer != read.write {
			return false
		}
	}
	expected := writerSourceDelta(source)
	return expected.extracted == recipe.delta.extracted && operationDeltaPrefix(expected, recipe.delta) && operationDeltaPrefix(recipe.delta, expected)
}

// publishStagedWriterRead runs only inside the original owner callback. It adds
// the exact RHS dependency before publishing a known dormant prefix. Acceptance
// transfers RHS recovery only. It cannot pay aggregate own-writer coverage.
func (work *callableEffectWork) publishStagedWriterRead(facts []callableFacts, query *sourceValueQuery, parent sourceStagedOperationRequest) bool {
	if query == nil || query.stagedWriter == nil || query.stagedWriter.current == nil || !query.stagedWriter.publishing || !query.liveStagedWriterSource(query.stagedWriter, query.stagedWriter.read) || query.owner.generation != work.operationGeneration {
		return false
	}
	read := cloneStagedWriterRead(*query.stagedWriter.current)
	if read.readCut.use != parent.use || read.observation != query.relativeInputCut(parent.producer.operation) {
		return false
	}
	work.indexOperationSources(facts)
	prior, registered := work.operationRecipes[parent.producer]
	if !registered || parent.inputs != nil || parent.consumer != query.effectOwner {
		return false
	}
	// Only an already-issued own-writer source role may adopt this relationship.
	ownWriter := prior.constructed != nil && sameOperationRequest(parent, constructedMemberRequest(prior.constructed, "own-writers"))
	if prior.mapProtocol != nil && prior.nativeGet != nil && prior.nativeGet.descriptorMap != nil {
		ownWriter = ownWriter || sameOperationRequest(parent, stagedMapProtocolPhaseRequest(prior.nativeGet, "own-writers"))
	}
	ownWriter = ownWriter || stagedMemberWriterReadMatches(prior.memberSource, parent, read)
	if field, valid := fieldSourceParent(parent); valid {
		roles, _ := fieldSourceRequests(field)
		ownWriter = ownWriter || sameOperationRequest(parent, roles.ownWriters)
	}
	if !ownWriter {
		return false
	}
	request := stagedWriterRHSRequest(parent, read.write)
	source := &sourceStagedWriterProjectionSource{request: request, parent: parent, generation: query.owner.generation}
	if existing, found := work.operationRecipes[request.producer]; found {
		if existing.writer == nil || !sameOperationRequest(existing.writer.request, request) || existing.writer.generation != source.generation {
			return false
		}
		source.reads = append(source.reads, existing.writer.reads...)
		source.projections = append(source.projections, existing.writer.projections...)
	}
	for slot, previous := range source.reads {
		if previous.call == read.call && previous.write == read.write && previous.observation == read.observation && previous.origin == read.origin && sameOperationEndpoint(previous.value, read.value) && sameWriterProjection(previous, read) {
			if work.attachLiveWriterResultProjection(facts, query, source, slot) {
				update := work.operationRecipes[request.producer]
				update.writer = source
				update.delta = writerSourceDelta(source)
				if !work.attachPendingWriterProjection(facts, update) {
					return false
				}
			}
			if _, adopted := work.operationIDs[parent.producer]; adopted {
				if _, ok := work.requireOperation(facts, request); !ok {
					return false
				}
			}
			if prior.constructed != nil || stagedMemberWriterInvoked(query, prior.memberSource) {
				return work.requireWriterCallableSource(facts, query, parent, read)
			}
			return true
		}
	}
	source.reads = append(source.reads, read)
	work.attachLiveWriterResultProjection(facts, query, source, len(source.reads)-1)
	recipe := sourceStagedOperationRecipe{key: request.producer, writer: source, delta: writerSourceDelta(source)}
	if !validStagedWriterRecipe(recipe) {
		return false
	}
	if _, found := work.operationRecipes[recipe.key]; found {
		if !work.attachPendingWriterProjection(facts, recipe) {
			return false
		}
	} else if !work.registerOperationRecipe(facts, recipe) {
		return false
	}
	// Membership is source-owned and retained in the parent recipe for cloning.
	found := false
	for _, required := range prior.writerRequired {
		found = found || sameOperationRequest(required, request)
	}
	if !found {
		if prior.delta.extracted {
			return false
		}
		prior.writerRequired = append(append([]sourceStagedOperationRequest(nil), prior.writerRequired...), request)
		prior.delta = cloneOperationDelta(prior.delta)
		prior.delta.required = append(prior.delta.required, request)
		if !work.attachOperationSource(facts, prior) {
			return false
		}
	}
	if _, adopted := work.operationIDs[parent.producer]; adopted {
		if _, ok := work.requireOperation(facts, request); !ok {
			return false
		}
	}
	if prior.constructed != nil || stagedMemberWriterInvoked(query, prior.memberSource) {
		if !work.requireWriterCallableSource(facts, query, parent, read) {
			return false
		}
	}
	return true
}

// applyWriterProjectionDelivery is data transport only. The same original
// endpoints remain dormant until a separate reached consumer issues invocation.
func (work *callableEffectWork) applyWriterProjectionDelivery(use sourceStagedOperationUse, delta sourceStagedOperationDelta) bool {
	recipe := work.operationRecipes[use.request.producer]
	if recipe.writer == nil || use.call != nil || use.installed != nil || !sameOperationRequest(recipe.writer.request, use.request) || len(delta.invoked)+len(delta.effects)+len(delta.relative) != 0 || !recipe.writer.callable && len(delta.residuals) != 0 {
		return false
	}
	id, found := work.operationIDs[use.request.producer]
	if !found {
		return false
	}
	subscriber := work.operations[id.index].subscribers[sourceStagedOperationConsumer{use.request.consumer, use.request.edge}]
	if subscriber == nil {
		return false
	}
	if recipe.writer.callable {
		consumer := work.memberNodes[use.request.consumer]
		for _, residual := range delta.residuals {
			if residual.mutation != nil {
				return false
			} // Installed mutation DATA has its own original issuer.
			if residual.operation != recipe.writer.parent.producer.operation || residual.role != (sourceRelativeRole{}) {
				return false
			}
			effect := environmentSource("unknown", "unresolved invoked writer alternative", work.operationFacts[consumer].summary.Name)
			effect.Opaque, effect.provenanceIncomplete = true, true
			appendOperationEffect(&work.operationFacts[consumer], effect)
		}
	}
	for _, alternative := range delta.exposures {
		exists := false
		for _, previous := range subscriber.constructed {
			exists = exists || sameOperationAlternative(previous, alternative)
		}
		if !exists {
			subscriber.constructed = append(subscriber.constructed, cloneOperationDelta(sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{alternative}}).exposures[0])
		}
	}
	return true
}

// All matching source branches are enumerated synchronously before this queue
// can extract. Extending that unpublished envelope is not reopening a delivered
// completion. Once published, the ordinary monotone source attachment applies.
func (work *callableEffectWork) attachPendingWriterProjection(facts []callableFacts, recipe sourceStagedOperationRecipe) bool {
	prior := work.operationRecipes[recipe.key]
	if prior.writer == nil || !validStagedWriterRecipe(recipe) || !sameOperationRequest(prior.writer.request, recipe.writer.request) || prior.writer.generation != recipe.writer.generation || !operationDeltaPrefix(prior.delta, recipe.delta) {
		return false
	}
	if id, exists := work.operationIDs[recipe.key]; exists && work.operations[id.index].revision != 0 {
		return work.attachOperationSource(facts, recipe)
	}
	recipe.delta = cloneOperationDelta(recipe.delta)
	work.operationRecipes[recipe.key] = recipe
	producer, exists := work.memberNodes[recipe.key.declaration]
	if !exists {
		return false
	}
	for index := range facts[producer].staged.operationRecipes {
		if facts[producer].staged.operationRecipes[index].key == recipe.key {
			facts[producer].staged.operationRecipes[index] = recipe
			return true
		}
	}
	return false
}

func sameWriterProjection(a, b sourceStagedWriterRead) bool {
	left, right := describeStagedWriterProjection(a), describeStagedWriterProjection(b)
	return a.rhs.unsupported == b.rhs.unsupported && left.delta.extracted == right.delta.extracted && operationDeltaPrefix(left.delta, right.delta) && operationDeltaPrefix(right.delta, left.delta) && operationPrefix(left.pending, right.pending, sameOperationEndpoint) && operationPrefix(right.pending, left.pending, sameOperationEndpoint)
}

func stagedWriterSourceRequest(parent sourceStagedOperationRequest, write *ast.Node, callable bool) sourceStagedOperationRequest {
	request := stagedWriterRHSRequest(parent, write)
	if callable {
		request.producer.selector.field = "writer-callable:" + parent.producer.selector.field
		request.edge += "-callable"
	}
	return request
}

func writerSourceDelta(source *sourceStagedWriterProjectionSource) sourceStagedOperationDelta {
	out := sourceStagedOperationDelta{extracted: len(source.reads) != 0}
	for index, read := range source.reads {
		var projection *sourceStagedWriterProjection
		if index < len(source.projections) {
			projection = source.projections[index]
		}
		if projection == nil && !source.callable {
			original := describeStagedWriterProjection(read)
			projection = &original
		}
		if projection == nil {
			out.extracted = false
			continue
		}
		out.extracted = out.extracted && projection.delta.extracted && len(projection.pending) == 0
		for _, required := range projection.delta.required {
			out.required = appendEntryLawRequirement(out.required, required)
		}
		for _, alternative := range projection.delta.exposures {
			found := false
			for _, old := range out.exposures {
				found = found || sameOperationAlternative(old, alternative)
			}
			if !found {
				out.exposures = append(out.exposures, alternative)
			}
		}
		for _, residual := range projection.delta.residuals {
			found := false
			for _, old := range out.residuals {
				found = found || sameOperationResidual(old, residual)
			}
			if !found {
				out.residuals = append(out.residuals, residual)
			}
		}
	}
	return out
}

func (work *callableEffectWork) requireWriterCallableSource(facts []callableFacts, q *sourceValueQuery, parent sourceStagedOperationRequest, read sourceStagedWriterRead) bool {
	request := stagedWriterSourceRequest(parent, read.write, true)
	prior := work.operationRecipes[parent.producer]
	source := &sourceStagedWriterProjectionSource{request: request, parent: parent, generation: q.owner.generation, callable: true, reads: []sourceStagedWriterRead{read}, projections: []*sourceStagedWriterProjection{nil}}
	if existing, found := work.operationRecipes[request.producer]; found {
		if existing.writer == nil || !existing.writer.callable || !sameOperationRequest(existing.writer.request, request) {
			return false
		}
	} else if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, writer: source, delta: writerSourceDelta(source)}) {
		return false
	}
	found := false
	for _, required := range prior.writerRequired {
		found = found || sameOperationRequest(required, request)
	}
	if !found {
		prior.writerRequired = append(append([]sourceStagedOperationRequest(nil), prior.writerRequired...), request)
		prior.delta = cloneOperationDelta(prior.delta)
		prior.delta.required = append(prior.delta.required, request)
		if !work.attachOperationSource(facts, prior) {
			return false
		}
	}
	if _, adopted := work.operationIDs[parent.producer]; adopted {
		_, ok := work.requireOperation(facts, request)
		return ok
	}
	return true
}

// acceptWriterCallableProjection consumes only the exact live original source
// producer's contribution. A caller-supplied equal record grants no publication.
func (work *callableEffectWork) acceptWriterCallableProjection(facts []callableFacts, q *sourceValueQuery, parent sourceStagedOperationRequest, owner *executableBodyOwner) bool {
	borrow := q.stagedWriter
	if borrow == nil || borrow.current == nil || borrow.currentProjection == nil || !borrow.publishing || !q.liveStagedWriterSource(borrow, borrow.read) {
		return false
	}
	read := cloneStagedWriterRead(*borrow.current)
	request := stagedWriterSourceRequest(parent, read.write, true)
	prior, found := work.operationRecipes[request.producer]
	if !found || prior.writer == nil || !prior.writer.callable || prior.writer.generation != work.operationGeneration {
		return false
	}
	source := *prior.writer
	source.reads = append([]sourceStagedWriterRead(nil), source.reads...)
	source.projections = append([]*sourceStagedWriterProjection(nil), source.projections...)
	projection := &sourceStagedWriterProjection{delta: cloneOperationDelta(borrow.currentProjection.delta), pending: cloneSourceRelativeEndpoints(borrow.currentProjection.pending), resultContext: borrow.currentProjection.resultContext}
	work.registerWriterResultReads(facts, q, projection)
	slot := -1
	for i, old := range source.reads {
		if old.call == read.call && old.write == read.write && old.observation == read.observation {
			slot = i
			break
		}
	}
	if slot < 0 {
		source.reads = append(source.reads, read)
		source.projections = append(source.projections, projection)
	} else {
		source.projections[slot] = projection
	}
	recipe := prior
	recipe.writer = &source
	recipe.delta = writerSourceDelta(&source)
	if !work.attachPendingWriterProjection(facts, recipe) {
		return false
	}
	if work.writerSourceInputs == nil {
		work.writerSourceInputs = make(map[sourceStagedOperationKey]*sourceStagedWriterSourceInputs)
	}
	if packet := work.writerSourceInputs[request.producer]; packet == nil || packet.generation != source.generation {
		work.writerSourceInputs[request.producer] = &sourceStagedWriterSourceInputs{generation: source.generation}
	}
	for _, alternative := range projection.delta.exposures {
		work.recordWriterMethodInputs(facts, &source, q, alternative, owner)
	}
	if _, adopted := work.operationIDs[parent.producer]; adopted {
		_, ok := work.requireOperation(facts, request)
		return ok
	}
	return true
}

// Original writer packets admit DATA transport independently of completion.
// Every unfinished endpoint must retain an actual typed DATA reading. A pending
// binding/capture with no producer is not covered by source membership alone.
func (work *callableEffectWork) passiveStagedWriterSourceSupported(recipe sourceStagedOperationRecipe) bool {
	source := recipe.writer
	if source == nil || !validStagedWriterRecipe(recipe) || source.generation != work.operationGeneration {
		return false
	}
	packet := work.writerSourceInputs[recipe.key]
	parent := work.operationRecipes[source.parent.producer]
	if packet == nil || packet.generation != source.generation || parent.constructed == nil || !work.passiveConstructedSourceSupported(parent) {
		return false
	}
	required := false
	for _, child := range parent.writerRequired {
		required = required || sameOperationRequest(child, source.request)
	}
	if !required || len(source.projections) != len(source.reads) {
		return false
	}
	for index, projection := range source.projections {
		if projection == nil || !projection.delta.extracted && !projection.resultContext {
			return false
		}
		for _, endpoint := range projection.pending {
			supplied := false
			for _, reading := range projection.delta.required {
				child := work.operationRecipes[reading.producer].callResult
				if child != nil && child.generation == work.operationGeneration && unwrapSourceCallableReference(endpoint.expression) == reading.producer.operation {
					for i, issued := range child.readings {
						if i < len(child.readCuts) && child.readCuts[i] == source.reads[index].observation && sameOperationRequest(issued, reading) {
							supplied = true
						}
					}
				}
			}
			if !supplied {
				return false
			}
		}
	}
	return true
}
