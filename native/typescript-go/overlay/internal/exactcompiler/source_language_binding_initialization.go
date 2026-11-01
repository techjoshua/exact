package exactcompiler

// bindingInitializationMetadata allows an expression result while keeping H/F
// completion metadata distinct. This pure shape check is never issuance authority.
func bindingInitializationMetadata(a languageAlternative) bool {
	return a.branch.owner != nil && a.completion == languageNormal && a.remaining == "" && a.pending == languageNormal && a.pendingValue == (languageValue{}) && a.pendingReturnBoundary == (languageID{}) && a.returnBoundary == (languageID{}) && a.storage == nil && a.callInputs == nil
}

// bindingInitializationStep inspects the installed Normal Next producer and
// original selection receipts without renewing a live Call after disposal.
func bindingInitializationStep(c *languageBindingContext, a languageAlternative) bool {
	if !bindingInitializationMetadata(a) || c == nil || c.plan == nil || c.elementNode() == nil || !c.plan.valid(c.plan.recipe) || c.first == nil || c.nextReceipt == nil || c.step == nil || c.step.entry == nil || c.step.entry.inputs == nil || c.step.entry.proof == nil || c.step.entry.proof.entry == nil || c.step.entry.proof.source == nil || c.step.entry.proof.namespace != a.branch.owner || c.step.entry.proof.generation != a.branch.generation || c.step.entry.proof.source.AsNode() != c.plan.recipe.body || c.step.raw == nil || len(c.step.raw.alternatives) != 1 || c.step.entry.acquisition == nil || len(c.step.entry.acquisition.alternatives) != 1 || !c.step.converted || c.step.completion != languageNormal || c.step.value != c.result || c.result.object == nil || !bindingElementReadHistory(c, a) || !c.doneKnown || c.doneReceipt == nil || len(c.doneReceipt.alternatives) != 1 || c.selected == nil || len(c.selected.alternatives) != 1 {
		return false
	}
	h, e := c.step, c.step.entry
	in, raw, parent := e.inputs, h.raw.alternatives[0], e.acquisition.alternatives[0]
	prior := parent.binding
	if h.raw.occurrence.owner != a.branch.owner || h.raw.occurrence.serial == 0 || h.raw.occurrence.serial > a.branch.owner.next || e.acquisition.occurrence.owner != a.branch.owner || e.acquisition.occurrence.serial == 0 || e.acquisition.occurrence.serial > a.branch.owner.next || e.boundary.owner != a.branch.owner || e.boundary.serial == 0 || e.boundary.serial > a.branch.owner.next || h.id.owner != a.branch.owner || h.id.serial == 0 || h.id.serial > a.branch.owner.next || in.bindingSite != c.elementStep() || in.call != c.plan.declaration || in.receiver != c.iterator || in.callee != c.next || in.reference != c.nextReference || len(in.arguments) != 0 || e.caller != a.branch.env || prior == nil || prior.plan != c.plan || prior.first != c.first || prior.nextReceipt != c.nextReceipt || prior.step != nil || prior.origin != nil || prior.initialization != nil || prior.parent != c.parent || prior.elementIndex != c.elementIndex || prior.completed != c.completed || h.raw.input != e.activation || raw.completion != languageReturn || raw.value != c.result || raw.returnBoundary != e.boundary || raw.branch.env != e.activation.env || !callBodySnapshot(e, raw) || !sameLanguageFinallyContext(a.finally, parent.finally) {
		return false
	}
	if h.outward.owner != a.branch.owner || h.outward.guard != a.branch.guard || h.outward.generation != a.branch.generation || h.outward.env != a.branch.env || a.branch.cursor < h.outward.cursor {
		return false
	}
	selected := c.selected.alternatives[0]
	selectedContext := selected.binding
	if selectedContext == nil || !bindingElementSelectionPhase(c, c.completed) || selected.completion != languageNormal || selected.branch.state == nil || selected.branch.owner != a.branch.owner || selected.branch.guard != a.branch.guard || selected.branch.generation != a.branch.generation || selected.branch.env != a.branch.env || c.selected.input != selected.branch || c.selected.occurrence.owner != a.branch.owner || c.selected.occurrence.serial == 0 || c.selected.occurrence.serial > a.branch.owner.next || c.doneReceipt.occurrence.owner != a.branch.owner || c.doneReceipt.occurrence.serial == 0 || c.doneReceipt.occurrence.serial >= c.selected.occurrence.serial || c.doneReceipt.alternatives[0].completion != languageNormal {
		return false
	}
	state := selected.branch.state
	for state != nil && state != h.outward.state {
		if state.previous != nil && (state.previous.id.owner != a.branch.owner || state.previous.id.serial >= state.id.serial) {
			return false
		}
		state = state.previous
	}
	if state != h.outward.state {
		return false
	}
	if c.done {
		return c.valueReceipt == nil && selected.value.undefined && bindingAbsentValue(c.plan, selected.value)
	}
	return c.valueReceipt == c.selected
}

// bindingInitializationReady consumes actual loop buffers at the exact source
// Initialize boundary. Pure validation performs no receipt or identity mutation.
func bindingInitializationReady(a languageAlternative, r *storageRecipe, pc int, values []languageValue, ready []bool, cells []languageCell, choices []storageChoice) bool {
	c := a.binding
	if !shortCircuitCanonical(a) || !bindingInitializationStep(c, a) || c.plan.recipe != r || c.elementNode().Initializer() == nil || pc != c.elementLabels().initialize || c.initialization != nil || c.origin != nil || c.close != nil || c.returnGet != nil || c.target != (languageCell{}) || c.routed || c.interrupted != nil || len(choices) != 0 {
		return false
	}
	d, producer, ok := bindingDefaultLayout(r, c.plan)
	if !ok || pc < 0 || pc >= len(ready) || ready[pc] || d.out >= len(ready) || d.out >= len(values) || !ready[d.out] || values[d.out] != a.value || producer >= len(ready) || producer >= len(values) {
		return false
	}
	slot := r.events[pc].cell
	if slot < 0 || slot >= len(cells) {
		return false
	}
	lexicals := c.step.entry.inputs.lexicals
	target, targetOK := bindingUninitializedTarget(c.currentElement(), a.branch, lexicals, cells[slot])
	if !targetOK || target.summary || !target.immutable {
		return false
	}
	// Reuse the current pure acquired-value availability owner. Its truth
	// answer is ignored. Unknown/contradictory values are not successful inputs.
	_, selectedKnown := acquiredBoolean(a.branch, c.selected.alternatives[0].value)
	_, resultKnown := acquiredBoolean(a.branch, a.value)
	if !selectedKnown || !resultKnown {
		return false
	}
	undefined, known := acquiredUndefined(a.branch, c.selected.alternatives[0].value)
	if !known {
		return false
	}
	if !undefined {
		if a.branch != c.selected.alternatives[0].branch || a.value != c.selected.alternatives[0].value {
			return false
		}
		for event := d.entry; event <= d.merge; event++ {
			if event >= len(ready) || ready[event] {
				return false
			}
		}
		return true
	}
	if d.merge >= len(ready) || !ready[d.merge] || !ready[producer] || values[producer] != a.value {
		return false
	}
	frame := storageContinuation{recipe: r, values: values, ready: ready}
	return bindingDefaultWrites(c, a.branch, d.merge, &frame, lexicals)
}

// prepareBindingInitialization seals one actual result row before its single
// source write. Existing receipt/copy owners retain immutable payloads. The
// current row link and actual Initialize readiness reject replay. No query or
// checker lease survives in this receipt.
func (o *languageOwner) prepareBindingInitialization(a languageAlternative, r *storageRecipe, pc int, values []languageValue, ready []bool, cells []languageCell, choices []storageChoice) (languageAlternative, int, bool) {
	if o == nil || a.branch.owner != o || !bindingInitializationReady(a, r, pc, values, ready, cells, choices) || !o.canIssue(2) || !o.canAdvance(a.branch, 1) {
		return a, 0, false
	}
	// This is the existing H context/receipt/vector layout estimator. Estimates
	// remain advisory, while arithmetic/identity headroom is checked before make.
	estimate, ok := bindingReceiptCopyCharge(a)
	if !ok {
		return a, 0, false
	}
	receipt := o.receipt(a.branch, []languageAlternative{a})
	if receipt == nil {
		return a, 0, false
	}
	context := *a.binding
	context.initialization = receipt
	a.binding = &context
	return a, estimate, true
}

// bindingInitializationRecord connects the installed result occurrence to the
// actual one-step source Initialize record. Its argument can be the live
// post-write row or the immutable Normal-unused Park origin.
func bindingInitializationRecord(c *languageBindingContext, installed languageAlternative, target languageCell) (*languageStorage, bool) {
	if c == nil || c.selected == nil || c.initialization == nil || len(c.initialization.alternatives) != 1 || installed.binding == nil || installed.binding.initialization != c.initialization || !bindingInitializationMetadata(installed) || installed.branch.state == nil {
		return nil, false
	}
	receipt := c.initialization
	before := receipt.alternatives[0]
	prior := before.binding
	if prior == nil || prior.initialization != nil || prior.origin != nil || prior.target != (languageCell{}) || prior.close != nil || prior.returnGet != nil || prior.routed || prior.interrupted != nil || !bindingInitializationStep(prior, before) || receipt.input != before.branch || receipt.occurrence.owner != installed.branch.owner || receipt.occurrence.serial == 0 || receipt.occurrence.serial > installed.branch.owner.next || receipt.occurrence.serial <= c.selected.occurrence.serial || before.branch.state == nil || before.branch.state.id.owner != installed.branch.owner || before.branch.state.id.serial == 0 || before.branch.state.id.serial >= receipt.occurrence.serial {
		return nil, false
	}
	context := *installed.binding
	context.initialization = nil
	context.completed = prior.completed
	if context != *prior {
		return nil, false
	}
	normalized := *c
	normalized.initialization = nil
	normalized.origin = nil
	normalized.target = languageCell{}
	normalized.close = nil
	normalized.returnGet = nil
	normalized.routed = false
	normalized.completed = prior.completed
	if normalized != *prior {
		return nil, false
	}
	if installed.branch.owner != before.branch.owner || installed.branch.guard != before.branch.guard || installed.branch.generation != before.branch.generation || installed.branch.env != before.branch.env || before.branch.cursor == ^uint64(0) || installed.branch.cursor != before.branch.cursor+1 || installed.branch.state.previous != before.branch.state || installed.branch.state.id.owner != installed.branch.owner || installed.branch.state.id.serial <= receipt.occurrence.serial || installed.branch.state.id.serial > installed.branch.owner.next || installed.callHistory != before.callHistory || !sameLanguageFinallyContext(installed.finally, before.finally) {
		return nil, false
	}
	lexicals := c.step.entry.inputs.lexicals
	if _, ok := bindingUninitializedTarget(c.currentElement(), before.branch, lexicals, target); !ok {
		return nil, false
	}
	record := bindingInitializedRecord(installed.branch, target, before.value)
	if record == nil || installed.branch.state.storage != record || record.previous != before.branch.state.storage || record.object != nil || record.deleted || record.key != (languagePropertyKey{}) || record.descriptor != (languageDescriptor{}) {
		return nil, false
	}
	return record, true
}

// normalDefaultInitialized is a detached source-target relation. It retains the
// actual Next lexicals even when Done=true prevents any Close child from existing.
// Origin is Normal-unused, separate from the pre-Initialize expression result.
func (c *languageBindingContext) normalDefaultInitialized(a languageAlternative) bool {
	if c != nil && c.plan != nil && c.completed != nil {
		return c.initialization != nil && c.completed.initialized != nil && c.completed.initialized.alternatives[0].binding.initialization == c.initialization && c.origin != nil && len(c.origin.alternatives) == 1 && c.origin.alternatives[0].binding.completed == c.completed && completedElements(c, a, len(c.plan.elements))
	}

	if c == nil || c.initialization == nil || c.origin == nil || len(c.origin.alternatives) != 1 || a.branch.owner == nil || a.binding != c || c.target == (languageCell{}) || c.origin.occurrence.owner != a.branch.owner || c.origin.occurrence.serial == 0 || c.origin.occurrence.serial > a.branch.owner.next {
		return false
	}
	pending := c.origin.alternatives[0]
	if !bindingNormalUnusedMetadata(pending) || c.origin.input != pending.branch || pending.branch.state == nil || c.origin.occurrence.serial <= pending.branch.state.id.serial || pending.branch.owner != a.branch.owner || pending.branch.guard != a.branch.guard || pending.branch.generation != a.branch.generation || pending.branch.env != a.branch.env || !sameLanguageFinallyContext(a.finally, pending.finally) {
		return false
	}
	record, ok := bindingInitializationRecord(c, pending, c.target)
	if !ok {
		return false
	}
	if a.branch.state == nil || a.branch.cursor < pending.branch.cursor {
		return false
	}
	state := a.branch.state
	for state != nil && state != pending.branch.state {
		if state.previous != nil && (state.previous.id.owner != a.branch.owner || state.previous.id.serial >= state.id.serial) {
			return false
		}
		state = state.previous
	}
	current := bindingInitializedRecord(a.branch, c.target, c.initialization.alternatives[0].value)
	return state == pending.branch.state && current == record
}
