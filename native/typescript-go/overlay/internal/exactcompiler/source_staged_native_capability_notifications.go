package exactcompiler

// sourceStagedNativeCapabilityNotifications is a derived THIS-work notification
// index. It stores registered full-request/backref identity only, never semantic
// evidence, current bits, work from a query, or a second scheduler.
type sourceStagedNativeCapabilityNotifications struct {
	entryLaws    map[sourceStagedDependencyKey]map[sourceStagedEntryLawModuleKey]sourceStagedEntryLawModuleWatch
	eager        map[sourceStagedOperationRequest][]sourceStagedNativeEagerWatch
	eagerModules map[sourceStagedDependencyKey][]sourceStagedNativeEagerWatch
	eagerOwners  map[sourceStagedOperationKey][]sourceStagedNativeEagerWatch
	operations   map[sourceStagedOperationKey]map[sourceStagedOperationKey][]sourceStagedOperationRequest
	modules      map[sourceStagedDependencyKey]map[sourceStagedOperationKey]struct{}
	notifying    map[sourceStagedOperationKey]bool
	seen         map[sourceStagedOperationKey]map[sourceStagedOperationRequest]bool
	expands      map[sourceStagedOperationKey]map[sourceStagedOperationKey]bool
}

// indexNativeWriterCapability walks only an installed capability's registered
// prerequisite cone. Strict prefix growth is monotone; seen full requests bound
// cycles and preserve distinct readers of one producer. Clone rebuilds the index.
func (work *callableEffectWork) indexNativeWriterCapability(key sourceStagedOperationKey) {
	recipe := work.operationRecipes[key]
	if recipe.memberSource == nil || recipe.memberSource.nativeWriter == nil || !validNativeWriterCapabilityRecipe(recipe) {
		return
	}
	work.ensureNativeCapabilityNotifications()
	n := work.nativeCapabilityNotifications
	if n.seen[key] != nil {
		return
	}
	n.seen[key] = make(map[sourceStagedOperationRequest]bool)
	work.extendNativeCapabilityIndex(key, append(append([]sourceStagedOperationRequest(nil), recipe.delta.required...), recipe.memberSource.nativeWriter.coverage))
}

// extendNativeCapabilityIndex adds each actual full request at most once per
// capability/work. Unchanged source publication does not rewalk its old cone.
func (work *callableEffectWork) extendNativeCapabilityIndex(key sourceStagedOperationKey, added []sourceStagedOperationRequest) {
	n := work.nativeCapabilityNotifications
	if n == nil || n.seen[key] == nil {
		return
	}
	seen := n.seen[key]
	owner := work.operationRecipes[key].memberSource
	implicit := owner != nil && owner.nativeWriter != nil && owner.nativeWriter.provenance == nativeWriterEmptyImplicitSources
	queue := append([]sourceStagedOperationRequest(nil), added...)
	for head := 0; head < len(queue); head++ {
		r := queue[head]
		if seen[r] {
			continue
		}
		seen[r] = true
		child, registered := work.operationRecipes[r.producer]
		if !registered {
			continue
		}
		if n.operations[r.producer] == nil {
			n.operations[r.producer] = make(map[sourceStagedOperationKey][]sourceStagedOperationRequest)
		}
		n.operations[r.producer][key] = appendEntryLawRequirement(n.operations[r.producer][key], r)

		// Match the current consumer's READSET, not transitive Effects closure.
		// The implicit consumer follows a protocol lookup's exact required Get;
		// retain its growth backref even when that typed link arrives later.
		// Laws inspect their declared cap/C sources; C inspects original candidates;
		// a callee Get reads its direct observation vector. A native full Effects
		// root is read for its own revision/metadata ONLY, never its body/debt cone.
		expand := child.entryLaw != nil || child.memberSource != nil && child.memberSource.coverage != nil || implicit && child.mapEntry != nil || implicit && child.memberSource != nil && child.memberSource.candidate.protocol
		if source := child.nativeGet; source != nil {
			if implicit {
				expand = expand || child.mapProtocol != nil || child.mapEntry != nil || source.descriptorEntry != nil || source.input != nil && source.input.bindingData.producer.operation != nil
				if child.key == nativeRootDebtRequest(source, "algorithm").producer && source.descriptorMap != nil {
					queue = append(queue, source.descriptorMap.protocol)
				}
			}
			expand = expand || child.key == nativeRootDebtRequest(source, "callee-get").producer
			queue = append(queue, nativeRootDebtRequest(source, "callee-get"), nativeRootDebtRequest(source, "eager-inputs"), nativeRootDebtRequest(source, "algorithm"))
			if child.key == nativeRootDebtRequest(source, "eager-inputs").producer {
				queue = append(queue, stagedKeyRequirements(source)...)
			}
			if child.key == nativeRootDebtRequest(source, "algorithm").producer {
				queue = append(queue, source.memberSources...)
				if source.callAlternatives.producer.operation != nil {
					queue = append(queue, source.callAlternatives)
				}
				if source.getContributions.producer.operation != nil {
					queue = append(queue, source.getContributions)
				}
			}
		}
		if expand {
			if n.expands[r.producer] == nil {
				n.expands[r.producer] = make(map[sourceStagedOperationKey]bool)
			}
			n.expands[r.producer][key] = true
			queue = append(queue, child.delta.required...)
		}
		if child.entryLaw != nil {
			queue = append(queue, child.entryLaw.base)
		}
		if source := child.memberSource; source != nil {
			if p := source.nativeWriter; p != nil {
				queue = append(queue, p.source, p.coverage)
				if p.provenance == nativeWriterEmptyImplicitSources {
					queue = append(queue, p.accounting)
				} else {
					queue = append(queue, p.law)
				}
			}
			if p := source.protocolSource; p != nil && p.required.producer.operation != nil {
				queue = append(queue, p.required)
			}
			if source.moduleExcluded != nil {
				queue = append(queue, stagedMemberCoverageRequest(source.parent, source.candidate.origin, source.candidate.cut))
			}
		}
		if id := work.operationIDs[r.producer]; id.epoch == work.operationEpoch && id.index != 0 && int(id.index) < len(work.operations) {
			for _, m := range work.operations[id.index].moduleInputs {
				if c, ok := work.memberNodes[r.consumer]; ok {
					work.indexNativeCapabilityModule(sourceStagedDependencyKey{c, m.edge}, key)
				}
			}
		}
	}
}
func (work *callableEffectWork) indexNativeCapabilityModule(m sourceStagedDependencyKey, key sourceStagedOperationKey) {
	n := work.nativeCapabilityNotifications
	if n == nil {
		return
	}
	if n.modules[m] == nil {
		n.modules[m] = make(map[sourceStagedOperationKey]struct{})
	}
	n.modules[m][key] = struct{}{}
}

// extendNativeCapabilityDependents is called only for a genuine strict suffix.
// Snapshot dependent keys because traversing that suffix may add backrefs.
func (work *callableEffectWork) extendNativeCapabilityDependents(producer sourceStagedOperationKey, added []sourceStagedOperationRequest) {
	n := work.nativeCapabilityNotifications
	if n == nil || len(added) == 0 {
		return
	}
	keys := make([]sourceStagedOperationKey, 0, len(n.operations[producer])+1)
	for key := range n.operations[producer] {
		keys = append(keys, key)
	}
	if recipe := work.operationRecipes[producer]; recipe.memberSource != nil && recipe.memberSource.nativeWriter != nil {
		exists := false
		for _, key := range keys {
			exists = exists || key == producer
		}
		if !exists {
			keys = append(keys, producer)
		}
	}
	for _, key := range keys {
		if n.expands[producer][key] || key == producer {
			work.extendNativeCapabilityIndex(key, added)
		}
	}
}
func (work *callableEffectWork) wakeNativeWriterCapability(key sourceStagedOperationKey) {
	n := work.nativeCapabilityNotifications
	if n == nil || n.notifying[key] {
		return
	}
	id := work.operationIDs[key]
	if id.epoch != work.operationEpoch || id.index == 0 {
		return
	}
	n.notifying[key] = true
	defer delete(n.notifying, key)
	work.publishNativeWriterCapability(id)
}
func (work *callableEffectWork) afterNativeWriterCapabilityObservation(producer sourceStagedOperationKey) {
	n := work.nativeCapabilityNotifications
	if n == nil {
		return
	}
	for key := range n.operations[producer] {
		work.wakeNativeWriterCapability(key)
	}
}
func (work *callableEffectWork) afterNativeWriterCapabilityDelivery(reading sourceStagedOperationRequest) {
	work.afterPendingNativeEagerDelivery(reading)
	n := work.nativeCapabilityNotifications
	if n == nil {
		return
	}
	for key, requests := range n.operations[reading.producer] {
		for _, r := range requests {
			if sameOperationRequest(r, reading) {
				work.wakeNativeWriterCapability(key)
				break
			}
		}
	}
}
func (work *callableEffectWork) afterNativeWriterCapabilityModule(consumer, producer int, edge string) {
	n := work.nativeCapabilityNotifications
	if n == nil {
		return
	}
	m := sourceStagedDependencyKey{consumer, edge}
	d := work.stagedRequired[m]
	if d == nil || d.producer != producer || d.invalid || d.projectionPending {
		return
	}
	for _, watch := range n.eagerModules[m] {
		work.completePendingNativeEagerReceipt(watch)
	}
	for key := range n.modules[m] {
		work.wakeNativeWriterCapability(key)
	}
}

// notifyNativeEagerCurrency invalidates/renews existing subscriber consumers of
// a changed original witness without inventing an operation revision or ACK.
func (work *callableEffectWork) notifyNativeEagerCurrency(producer sourceStagedOperationKey) {
	work.notifyNativeEagerInputWaiters(work.operationIDs[producer])
	n := work.nativeCapabilityNotifications
	if n == nil {
		return
	}
	for key := range n.operations[producer] {
		id := work.operationIDs[key]
		if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			continue
		}
		state := &work.operations[id.index]
		if state.revision != 0 {
			work.notifyOperationSubscribers(state)
		}
	}
}
