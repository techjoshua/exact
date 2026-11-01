package exactcompiler

// parameterDefaultGetLayout names only the finite actual null-member default
// recipe. Source classification cannot issue a Get or a Call completion.
func parameterDefaultGetLayout(e *languageCallEntryInput) (storageEvent, int, bool) {
	if e == nil || e.proof == nil || e.proof.mapping == nil || e.proof.mapping.nullDefaultMember() == nil || e.proof.mapping.scalarDefaultParameter(0) == nil || !e.proof.empty || e.inputs == nil || e.inputs.bindingSite != nil {
		return storageEvent{}, -1, false
	}
	r := e.proof.entry
	if r == nil || !r.callBody || r.prefix || r.finally != nil || r.locals != 1 || len(r.events) < 2 {
		return storageEvent{}, -1, false
	}
	d, get, ok := defaultChoiceLayout(r, 1)
	if !ok || d.node != e.proof.mapping.nullDefaultMember() || d.a != 0 || get != d.entry+2 || d.end+2 != len(r.events)-1 {
		return storageEvent{}, -1, false
	}
	arg, literal, member, read, init, body, terminal := r.events[0], r.events[d.entry], r.events[get-1], r.events[get], r.events[d.end], r.events[d.end+1], r.events[d.end+2]
	formal := e.proof.mapping.declarations[0]
	if arg.kind != "ReadAcquiredArgument" || arg.cell != 0 || arg.node != formal || literal.kind != "Literal" || literal.value.node == nil || literal.value.node.Kind != storageNullKind || literal.node != unwrapSourceCallableReference(d.node.Expression()) || literal.value != (languageValue{node: literal.node}) || member.kind != "Member" || member.node != d.node || member.a != d.entry || member.key != languageStringKey(d.node.Name().Text()) || member.keyProducerPC != -1 || read.kind != "GetValue" || read.node != d.node || read.a != get-1 || init.kind != "InitializeCell" || init.node != formal || init.cell != 0 || init.a != d.out || body.kind != "ReadCell" || body.cell != 0 || terminal.kind != "Return" || terminal.a != d.end+1 {
		return storageEvent{}, -1, false
	}
	return d, get, true
}

// parameterDefaultGetSnapshot is detached structure under one genuine entry.
// Live issuance and completion validation retain their own owner/source guards.
func parameterDefaultGetSnapshot(e *languageCallEntryInput, row languageAlternative) (storageEvent, int, bool) {
	d, get, ok := parameterDefaultGetLayout(e)
	if !ok || !callBodySnapshot(e, row) || row.completion != languageThrow || row.value != (languageValue{text: "TypeError"}) || row.returnBoundary != (languageID{}) || row.binding != nil || row.finally != nil || row.branch.state != e.activation.state {
		return storageEvent{}, -1, false
	}
	s := row.storage
	r := e.proof.entry
	if s.pc != get || s.copy != nil || len(s.values) != r.registers || len(s.references) != r.registers || len(s.ready) != r.registers || len(s.choices) != 1 || s.choices[0] != (storageChoice{destination: d.out, merge: d.merge, end: d.end}) || !sameLanguageCallInputs(s.callInputs, e.inputs) || !sameLanguageCallInputs(row.callInputs, e.inputs) {
		return storageEvent{}, -1, false
	}
	expected := languageValue{undefined: true}
	if len(e.inputs.arguments) > 0 {
		expected = e.inputs.arguments[0].value
	}
	if !expected.undefined || s.values[d.a] != expected {
		return storageEvent{}, -1, false
	}
	if !s.ready[d.a] || !s.ready[d.entry] || !s.ready[get-1] || s.ready[d.out] {
		return storageEvent{}, -1, false
	}
	for pc := get; pc < len(s.ready); pc++ {
		if s.ready[pc] {
			return storageEvent{}, -1, false
		}
	}
	ref := s.references[get-1]
	if ref.id.owner != e.activation.owner || ref.id.serial == 0 || ref.cell != (languageCell{}) || ref.key != r.events[get-1].key || !ref.strict || ref.receiver != s.values[d.entry] || ref.receiver != (languageValue{node: r.events[d.entry].node}) {
		return storageEvent{}, -1, false
	}
	// Literal/Reference/Get perform no storage write in this finite role. Exact
	// activation state retains the paid prefix and the fresh formal's TDZ.

	return d, get, true
}

// finishParameterDefaultGet observes the operation already selected by the
// ordinary Get owner. It never reruns it or fabricates failure from the receiver.
func (o *languageOwner) finishParameterDefaultGet(e *languageCallEntryInput, row, selected languageAlternative, r *storageRecipe, pc int) (languageAlternative, bool) {
	_, get, ok := parameterDefaultGetSnapshot(e, row)
	if !ok || get != pc || r != e.proof.entry || !e.valid(o, e.activation) || !o.live(row.branch) || selected.branch != row.branch || selected.completion != row.completion || selected.value != row.value {
		return row, false
	}
	undefined, known := acquiredUndefined(row.branch, row.storage.values[0])
	nullish, canonical := acquiredNullish(row.branch, row.storage.references[get-1].receiver)
	if !known || !undefined || !canonical || !nullish {
		return row, false
	}
	for _, observation := range row.objects {
		if observation.reference == row.storage.references[get-1].id {
			return row, false
		}
	}
	bare := languageAlternative{branch: selected.branch, completion: selected.completion, value: selected.value}
	return o.appendCompletedGet(row, selected.branch, bare, r, pc, row.storage.references[get-1])
}

// parameterDefaultGetThrowProducer binds a raw Call failure to its actual bare
// Get occurrence. The native TypeError value stays unchanged. This grants no
// heap Error identity, Normal result, F completion or H routing permission.
func (h *languageCallHistory) parameterDefaultGetThrowProducer() bool {
	if h == nil || h.entry == nil || h.raw == nil || len(h.raw.alternatives) != 1 {
		return false
	}
	e := h.entry
	raw := h.raw.alternatives[0]
	_, get, ok := parameterDefaultGetSnapshot(e, raw)
	if !ok {
		return false
	}
	count := 0
	for _, observation := range raw.objects {
		if observation.recipe != e.proof.entry || observation.pc != get {
			continue
		}
		count++
		r := observation.receipt
		if r == nil || r.occurrence.owner != e.activation.owner || r.occurrence.serial == 0 || r.occurrence.serial >= h.raw.occurrence.serial || r.input != raw.branch || observation.node != e.proof.entry.events[get].node || observation.reference != raw.storage.references[get-1].id || len(r.alternatives) != 1 {
			return false
		}
		bare := r.alternatives[0]
		if bare.branch != raw.branch || bare.completion != languageThrow || bare.value != raw.value || bare.callHistory != nil || bare.storage != nil || bare.callInputs != nil || bare.returnBoundary != (languageID{}) || bare.pendingReturnBoundary != (languageID{}) || bare.pending != languageNormal || bare.binding != nil || bare.finally != nil || len(bare.objects) != 0 || len(bare.effects) != 0 || len(bare.obligations) != 0 {
			return false
		}
	}
	return count == 1
}

// parameterDefaultGetTerminal is one original prefix consumer, never a generic
// Throw publisher. Its live Call proof precedes disposal and covers no siblings.
func (h *closedPrefixHistory) parameterDefaultGetTerminal(row languageAlternative) bool {
	if h == nil || h.authority.owner == nil || h.receipt == nil || len(h.receipt.alternatives) != 1 || row.callHistory == nil || !row.callHistory.validCompletion(row) || !row.callHistory.parameterDefaultGetThrowProducer() {
		return false
	}
	// Initializer destination adoption is its own Normal-only terminal contract.
	if _, _, initializer := sourceInitializerCallLayout(h.recipe); initializer {
		return false
	}

	o := h.authority.owner
	c := o.closedPrefixCandidate
	e := row.callHistory.entry
	return c != nil && c.history == h && c.slot != nil && c.slot.closedPrefix == h && c.call == h.call && c.enteredCallable(o.language, e.proof) && e.inputs.call == h.call && e.proof.source == h.source && h.authority.checker == o.checker && h.authority.program == o.program && h.authority.generation == o.generation
}
