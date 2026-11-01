package exactcompiler

// storageEventCopyCharge reserves eight conservative vector-copy passes and four
// conservative history-merge passes before sequence allocates. Immutable receipt
// and Call-history links are shared, not recursively cloned. Continuations own
// detached vectors, so their actual populations participate in the bound.
func storageEventCopyCharge(a languageAlternative, inputs *languageCallInputs, limit int, objectHorizon ...int) (int, bool) {
	h := len(a.objects)
	if len(objectHorizon) == 1 {
		if objectHorizon[0] < h {
			return 0, false
		}
		h = objectHorizon[0]
	}
	wide, ok := historyObservationVectorUnits(h, limit)
	if !ok {
		return 0, false
	}
	n, ok := budgetSum(limit, h, len(a.effects), len(a.obligations))
	if !ok {
		return 0, false
	}
	// The eight-pass header allowance covers both the current header snapshot
	// and sequence's predecessor/successor header copies. Use the larger actual
	// population, not two eight-pass charges. Equal or aliased headers therefore
	// incur one allowance. Lengths are read before any defensive allocation.
	headerSize, priorSize := 0, 0
	if inputs != nil {
		headerSize, ok = budgetSum(limit, len(inputs.lexicals), len(inputs.arguments))
		if !ok {
			return 0, false
		}
	}
	if a.callInputs != nil {
		priorSize, ok = budgetSum(limit, len(a.callInputs.lexicals), len(a.callInputs.arguments))
		if !ok {
			return 0, false
		}
	}
	vectors, ok := budgetSum(limit, wide, len(a.effects), len(a.obligations), max(headerSize, priorSize))
	if !ok {
		return 0, false
	}
	if c := a.storage; c != nil {
		vectors, ok = budgetSum(limit, vectors, len(c.cells), len(c.values), len(c.references), len(c.ready), len(c.choices), 4)
		if !ok {
			return 0, false
		}
		if c.copy != nil {
			vectors, ok = budgetSum(limit, vectors, len(c.copy.keys), len(c.copy.excluded), 1)
			if !ok {
				return 0, false
			}
		}
		if c.callInputs != nil {
			vectors, ok = budgetSum(limit, vectors, len(c.callInputs.lexicals), len(c.callInputs.arguments))
			if !ok {
				return 0, false
			}
		}
	}
	copies, ok := budgetProduct(limit, 8, vectors)
	if !ok {
		return 0, false
	}
	merge, ok := budgetProduct(limit, n, n)
	if !ok {
		return 0, false
	}
	merge, ok = budgetProduct(limit, 4, merge)
	if !ok {
		return 0, false
	}
	headers := 4
	if inputs != nil || a.callInputs != nil {
		headers += 16
	}
	return budgetSum(limit, copies, merge, headers)
}

// storageScheduleCut retains paid completion metadata and contributes only the new
// cut obligation. Sequence adopts predecessor contributions exactly once.
func storageScheduleCut(prior languageAlternative, reason string) languageAlternative {
	prior.objects, prior.effects, prior.obligations = nil, nil, []string{reason}
	prior.completion = languageResidual
	prior.value = languageValue{}
	prior.remaining = reason
	return prior
}
