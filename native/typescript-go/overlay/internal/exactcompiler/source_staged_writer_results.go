package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// registerWriterResultReads runs only under the original writer publication.
// It retains the existing member DATA reading and physical cut. No endpoint is
// converted to an acquired value, receiver identity or creating binder packet.
func (work *callableEffectWork) registerWriterResultReads(facts []callableFacts, q *sourceValueQuery, projection *sourceStagedWriterProjection) {
	if q == nil || q.stagedMember == nil || q.stagedWriter == nil || q.stagedWriter.current == nil || !q.stagedWriter.publishing || !q.liveStagedWriterSource(q.stagedWriter, q.stagedWriter.read) {
		return
	}
	b := q.stagedMember
	for _, endpoint := range projection.pending {
		expression := unwrapSourceCallableReference(endpoint.expression)
		if len(endpoint.projection) != 0 || !stagedDataSourceExpression(expression) || !q.deferStagedCallReturn(expression, sourceCallResultInterest{purpose: resultWriterValue}) {
			continue
		}
		caller := enclosingCallableNode(expression)
		if caller == nil {
			caller = sourceStagedModuleOwner(expression)
		}
		source := work.operationRecipes[stagedResultSourceRequest(expression, caller, nil).producer].callResult
		if source == nil {
			continue
		}
		for index, reading := range source.readings {
			if index < len(source.readCuts) && source.readCuts[index] == b.observation && validStagedCallResultReading(reading, b.request, b.observation) {
				projection.delta.required = appendEntryLawRequirement(projection.delta.required, reading)
			}
		}
	}
}

// refineWriterResultProjection consumes only previously issued child readings.
// An original creating input supplies DATA-role substitution, not an invocation.
// Missing associations and non-result holes remain pending independently.
func (work *callableEffectWork) refineWriterResultProjection(read sourceStagedWriterRead, projection sourceStagedWriterProjection) sourceStagedWriterProjection {
	out := sourceStagedWriterProjection{delta: cloneOperationDelta(projection.delta), resultContext: projection.resultContext}
	complete := projection.resultContext
	for _, endpoint := range projection.pending {
		resolved := false
		for _, reading := range projection.delta.required {
			if reading.producer.operation != unwrapSourceCallableReference(endpoint.expression) {
				continue
			}
			source := work.operationRecipes[reading.producer].callResult
			if source == nil || source.generation != work.operationGeneration {
				continue
			}
			data, available := work.stagedCallResultData(reading)
			if !available {
				continue
			}
			represented := data.delta.extracted
			for _, alternative := range data.delta.exposures {
				value := alternative.endpoint
				if value.kind == relativeEndpointRole && value.role.declaration == read.region {
					found := false
					for _, binding := range read.bound.bindings {
						if binding.target != value.role {
							continue
						}
						found = true
						for _, actual := range binding.sources {
							own := actual.kind == relativeEndpointRole || actual.kind == relativeEndpointUndefined || actual.kind == relativeEndpointExpression && stagedSourceDataValue(actual.expression)
							if !own {
								represented = false
								continue
							}
							out.delta.exposures = appendWriterResultAlternative(out.delta.exposures, sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(actual)})
						}
						represented = represented && !binding.unknown && len(binding.pending) == 0 && len(binding.sources) != 0
					}
					represented = represented && found
				} else {
					out.delta.exposures = appendWriterResultAlternative(out.delta.exposures, alternative)
				}
			}
			resolved = represented
		}
		if !resolved {
			out.pending = append(out.pending, cloneSourceRelativeEndpoint(endpoint))
			complete = false
		}
	}
	if len(projection.pending) != 0 {
		out.delta.extracted = complete
	}
	return out
}

func appendWriterResultAlternative(values []sourceStagedOperationAlternative, value sourceStagedOperationAlternative) []sourceStagedOperationAlternative {
	for _, prior := range values {
		if sameOperationAlternative(prior, value) {
			return values
		}
	}
	value.endpoint = cloneSourceRelativeEndpoint(value.endpoint)
	return append(values, value)
}

// prepareStagedWriterResults revisits DATA through the existing operation queue.
// The graph-local writer packet requires fresh original publication after clone.
// A known zero-input body needs no invented acquired capture scope or B.
func (work *callableEffectWork) prepareStagedWriterResults(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	source := recipe.writer
	packet := work.writerSourceInputs[recipe.key]
	if source == nil || owner == nil || source.generation != work.operationGeneration || packet == nil || packet.generation != source.generation {
		return
	}
	copy := *source
	copy.projections = append([]*sourceStagedWriterProjection(nil), source.projections...)
	changed := false
	for index, projection := range source.projections {
		if projection == nil || index >= len(source.reads) || len(projection.delta.required) == 0 {
			continue
		}
		next := work.refineWriterResultProjection(source.reads[index], *projection)
		if !operationDeltaPrefix(next.delta, projection.delta) || next.delta.extracted != projection.delta.extracted || len(next.pending) != len(projection.pending) {
			changed = true
			copy.projections[index] = &next
		}
	}
	if changed {
		recipe.writer = &copy
		recipe.delta = writerSourceDelta(&copy)
		if !work.attachPendingWriterProjection(facts, recipe) {
			return
		}
		source = &copy
	}
	if source.callable {
		for _, projection := range source.projections {
			if projection != nil {
				for _, alternative := range projection.delta.exposures {
					work.recordWriterResultMethod(facts, source, alternative, owner)
				}
			}
		}
		work.adoptWriterSourceInputs(facts, id)
	}
	recipe = work.operationRecipes[recipe.key]
	if operationDeltaSize(recipe.delta) == 0 && recipe.delta.extracted {
		work.publishSourceDisposition(id)
	} else {
		work.publishOperation(id, recipe.delta)
	}
}

func (work *callableEffectWork) recordWriterResultMethod(facts []callableFacts, source *sourceStagedWriterProjectionSource, alternative sourceStagedOperationAlternative, owner *executableBodyOwner) {
	packet := work.writerSourceInputs[source.request.producer]
	call := source.parent.producer.operation
	body := alternative.endpoint.expression
	if packet == nil || call == nil || !ast.IsCallExpression(call) || len(alternative.endpoint.projection) != 0 || body == nil || !isWriterInputCallable(body) {
		return
	}
	for _, prior := range packet.methods {
		if sameOperationAlternative(prior.alternative, alternative) {
			return
		}
	}
	target, known := work.memberNodes[body]
	if !known {
		return
	}
	consumer := work.memberNodes[source.request.consumer]
	edge := source.request.edge + ":result-body:" + facts[target].summary.ID
	work.requireStagedSummary(facts, consumer, target, edge, call, source.parent.cut)
	packet.methods = append(packet.methods, sourceStagedWriterInvocation{alternative: alternative, declaration: body, edge: edge, inputsMapped: work.writerResultBodyInputsMapped(facts, target, owner)})
	// Source admission can precede operation IDs. Wake only already-issued
	// original Get consumers when their actual method association arrives.
	if region := owner.values.index(ast.GetSourceFileOfNode(body)).operationRegions[body]; region != nil {
		for _, member := range region.members {
			if request, issued := work.memberProtocolSources[member]; issued {
				work.refreshStagedMemberSourceReceipts(facts, []sourceStagedOperationRequest{request}, owner)
			}
		}
	}
}

func (work *callableEffectWork) attachLiveWriterResultProjection(facts []callableFacts, q *sourceValueQuery, source *sourceStagedWriterProjectionSource, slot int) bool {
	projection := describeStagedWriterProjection(source.reads[slot])
	work.registerWriterResultReads(facts, q, &projection)
	if len(projection.delta.required) == 0 {
		return false
	}
	source.projections = append([]*sourceStagedWriterProjection(nil), source.projections...)
	for len(source.projections) < len(source.reads) {
		source.projections = append(source.projections, nil)
	}
	if source.projections[slot] == nil {
		source.projections[slot] = &projection
	}
	if work.writerSourceInputs == nil {
		work.writerSourceInputs = make(map[sourceStagedOperationKey]*sourceStagedWriterSourceInputs)
	}
	if packet := work.writerSourceInputs[source.request.producer]; packet == nil || packet.generation != source.generation {
		work.writerSourceInputs[source.request.producer] = &sourceStagedWriterSourceInputs{generation: source.generation}
	}
	return true
}

// The existing lexical exposure owner excludes input-dependent syntax. Extra
// actuals remain with their eager owner and need no values when this body cannot
// observe arguments, receiver, defaults or captured state.
func (work *callableEffectWork) writerResultBodyInputsMapped(facts []callableFacts, target int, owner *executableBodyOwner) bool {
	body := facts[target].node
	if !sourceProjectedCallableInputsMapped(body, owner) {
		return false
	}
	if facts[target].writerInputs == nil {
		facts[target].writerInputs = &sourceWriterInputGraph{consumer: body}
	}
	return facts[target].writerInputs.memberCaptureSyntaxOnly(&sourceValueQuery{owner: owner.values, executable: owner}, body)
}
