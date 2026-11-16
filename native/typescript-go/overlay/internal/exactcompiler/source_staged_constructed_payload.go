package exactcompiler

// constructedPayloadRequest associates a conditional native Set payload with a
// particular original Get result demand. No key equality or table contents are
// reconstructed. Its source remains the writer's original argument and cut.
// The required writer/eager obligations and reader result stay independently
// pending until their actual owners have represented activation and inputs.
func constructedPayloadRequest(reader, writer *sourceStagedConstructedMember) sourceStagedOperationRequest {
	request := constructedMemberRequest(writer, "stored-payload")
	request.consumer = reader.request.consumer
	request.reading = constructedMemberRequest(reader, "member-result").producer
	request.edge = reader.request.edge + ":payload:" + writer.request.edge
	return request
}

// registerConstructedPayloadUse consumes one source-owned MAY relationship. It
// does not execute a Set from inventory, invoke a stored callback or authorize a
// normal Get result. This request persists on the issuing fact so clone/expiry
// reconstructs subscribers and data prefixes on the existing extraction queue.
func (work *callableEffectWork) registerConstructedPayloadUse(facts []callableFacts, reader, writer *sourceStagedConstructedMember) bool {
	if reader == nil || writer == nil || reader.kind != sourceNativeWeakMapGetEffect || writer.kind != sourceNativeWeakMapSetEffect || reader.construction.site != writer.construction.site {
		return false
	}
	readRecipe, read := work.operationRecipes[constructedMemberRequest(reader, "member-result").producer]
	writeRecipe, written := work.operationRecipes[constructedMemberRequest(writer, "stored-payload").producer]
	if !read || !written || !sameConstructedMemberSource(readRecipe.constructed, reader) || !sameConstructedMemberSource(writeRecipe.constructed, writer) {
		return false
	}
	return work.registerOperationUse(facts, sourceStagedOperationUse{request: constructedPayloadRequest(reader, writer)})
}

// applyConstructedPayloadDelivery is a data-only consumer. Known endpoints are
// retained beside pending producers without passing through the generic callable
// exposure consumer. No normal value, result completeness or invocation follows.
func (work *callableEffectWork) applyConstructedPayloadDelivery(use sourceStagedOperationUse, delta sourceStagedOperationDelta) bool {
	recipe := work.operationRecipes[use.request.producer]
	if use.call != nil || use.installed != nil || !work.validConstructedMemberRequest(recipe, use.request) || len(delta.invoked) != 0 || len(delta.effects) != 0 || len(delta.relative) != 0 || len(delta.residuals) != 0 {
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
	work.constructedDataChanged = work.constructedDataChanged || delta.extracted
	for _, alternative := range delta.exposures {
		if alternative.creating != nil {
			return false
		}
		alternative.endpoint = cloneSourceRelativeEndpoint(alternative.endpoint)
		subscriber.constructed = append(subscriber.constructed, alternative)
		work.constructedDataChanged = true
	}
	return true
}
