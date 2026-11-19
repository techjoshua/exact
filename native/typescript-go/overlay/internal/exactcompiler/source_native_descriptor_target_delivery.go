package exactcompiler

// afterDescriptorTargetPrerequisite runs at the existing actual APPLIED
// notification. It queues local completion only; it never replays the source
// appender, target acquisition or native selection, nor changes an observation.
func (work *callableEffectWork) afterDescriptorTargetPrerequisite(id sourceStagedOperationID, request sourceStagedOperationRequest) {
	if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	state := &work.operations[id.index]
	subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
	if subscriber == nil || !sameOperationRequest(subscriber.request, request) || subscriber.blocked || subscriber.applied != state.revision || state.revision == 0 {
		return
	}
	for _, parent := range subscriber.writerSourceParents {
		if parent.epoch != work.operationEpoch || parent.index == 0 || int(parent.index) >= len(work.operations) {
			continue
		}
		work.queueDescriptorTargetTask(work.operations[parent.index].key)
	}
}

func (work *callableEffectWork) queueDescriptorTargetTask(key sourceStagedOperationKey) {
	id, adopted := work.operationIDs[key]
	if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
		return
	}
	recipe := work.operationRecipes[key]
	if recipe.memberSource != nil && recipe.memberSource.descriptorStrong != nil {
		work.queueDescriptorStrongReader(id)
		return
	}
	if recipe.descriptorTarget == nil {
		return
	}
	if work.operations[id.index].invalid {
		return
	}
	for _, task := range work.extractionQueue[work.extractionHead:] {
		if task.operation == id && !task.operationDone && !task.delivery {
			return
		}
	}
	work.extractionQueue = append(work.extractionQueue, callableExtractionTask{callable: work.memberNodes[key.declaration], operation: id})
}
