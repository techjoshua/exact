package exactcompiler

// shortCircuitHeader is an unadopted successor. Sequence alone adds inherited
// contributions once. All existing immutable owner context survives by copy.
func shortCircuitHeader(prior languageAlternative) languageAlternative {
	prior.objects, prior.effects, prior.obligations = nil, nil, nil
	return prior
}
func shortCircuitCanonical(a languageAlternative) bool {
	return a.branch.owner != nil && a.branch.owner.live(a.branch) && a.completion == languageNormal && a.remaining == "" && a.pending == languageNormal && a.pendingValue == (languageValue{}) && a.returnBoundary == (languageID{}) && a.pendingReturnBoundary == (languageID{})
}
func shortCircuitCut(prior languageAlternative, reason string, operand languageValue) languageAlternative {
	out := storageScheduleCut(prior, reason)
	if shortCircuitCanonical(prior) {
		out.pendingValue = operand
	}
	return out
}

// shortCircuitCarry covers the complete ordinary RHS path. Operation result
// branch/completion/value win, while sparse primitives cannot drop owner history.
// Saved finally context remains independent of expression pending fields.
// This adapter transports it without normalizing or executing its completion.
func shortCircuitCarry(prior, out languageAlternative) languageAlternative {
	if out.binding == nil {
		out.binding = prior.binding
	}
	if out.finally == nil {
		out.finally = prior.finally
	}
	if out.callHistory == nil {
		out.callHistory = prior.callHistory
	}
	if out.callInputs == nil {
		out.callInputs = prior.callInputs
	}
	if out.storage == nil {
		out.storage = prior.storage
	}
	return out
}

// shortCircuitSelect mutates only prepaid register/stack buffers after all shape
// and readiness checks. It has no source evaluator and never copies a Reference.
func shortCircuitSelect(prior languageAlternative, e storageEvent, pc, eventCount int, values []languageValue, ready []bool, choices *[]storageChoice, capacity int, disposition ...*expressionSelectionDisposition) (languageAlternative, int) {
	if prior.completion != languageNormal {
		return prior, pc
	}
	out := shortCircuitHeader(prior)
	if !shortCircuitCanonical(prior) {
		return shortCircuitCut(prior, "ShortCircuit invalid Normal pending metadata", languageValue{}), pc
	}
	if e.a < 0 || e.a >= len(values) || e.a >= len(ready) || !ready[e.a] || e.out < 0 || e.out >= len(values) || e.out >= len(ready) || e.entry != pc+1 || e.entry >= e.merge || e.end != e.merge+1 || e.end > eventCount || e.entry < 0 || e.merge < 0 || e.end < 0 {
		return shortCircuitCut(prior, "ShortCircuit select association/readiness", languageValue{}), pc
	}
	operand := values[e.a]
	take, known := shortCircuitTakesRight(prior.branch, operand, shortCircuitOperator(e.kind))
	if !known {
		if len(disposition) > 0 && disposition[0] != nil {
			*disposition[0] = expressionPredicateUnavailable
		}
		return shortCircuitCut(prior, "ShortCircuit predicate unavailable", operand), pc
	}
	if take {
		if capacity < 0 || len(*choices) >= capacity || cap(*choices) < capacity {
			return shortCircuitCut(prior, "ShortCircuit choice capacity", operand), pc
		}
		*choices = append(*choices, storageChoice{destination: e.out, merge: e.merge, end: e.end})
		out.value = operand
		return out, e.entry
	}
	out.value = operand
	values[e.out] = operand
	ready[e.out] = true
	return out, e.end
}

// shortCircuitMerge refuses before any destination write/pop on mismatch.
func shortCircuitMerge(prior languageAlternative, e storageEvent, pc int, values []languageValue, ready []bool, choices *[]storageChoice) languageAlternative {
	if prior.completion != languageNormal {
		return prior
	}
	if !shortCircuitCanonical(prior) {
		return shortCircuitCut(prior, "ShortCircuit invalid Normal pending metadata", languageValue{})
	}
	if e.a < 0 || e.a >= len(values) || e.a >= len(ready) || !ready[e.a] || e.b < 0 || e.b >= len(values) || e.b >= len(ready) || len(*choices) == 0 {
		return shortCircuitCut(prior, "ShortCircuit merge unavailable", languageValue{})
	}
	top := (*choices)[len(*choices)-1]
	if top.destination != e.b || top.merge != pc || top.end != pc+1 {
		return shortCircuitCut(prior, "ShortCircuit merge association", languageValue{})
	}
	out := shortCircuitHeader(prior)
	out.value = values[e.a]
	values[e.b] = out.value
	ready[e.b] = true
	(*choices)[len(*choices)-1] = storageChoice{}
	*choices = (*choices)[:len(*choices)-1]
	return out
}

// This transient dispatch tag identifies a predicate refusal, not completion authority.
type expressionSelectionDisposition uint8

const (
	expressionSelectionOrdinary expressionSelectionDisposition = iota
	expressionPredicateUnavailable
)
