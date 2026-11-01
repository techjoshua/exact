package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// detachedPrimitive admits only acquired literal payloads without live identity,
// substitutions, captures or container/native metadata. No syntax is
// evaluated. A mixed population stays entirely on its existing projection owner.
func detachedPrimitive(v sourceValue) (languageValue, bool) {
	if v.number != (numberPayload{}) || v.ownedGetRow != nil || v.initializerUse != nil || v.adapter != nil || v.entrySlot != nil || v.bound != nil || v.normal != nil || v.awaited != nil || v.native != nil || v.path != nil || v.rest != nil || v.copied != nil {
		return languageValue{}, false
	}
	if v.undefined {
		return languagePrimitiveTrace(languageValue{undefined: true, node: v.node}, v.forwarded), true
	}
	if v.node == nil || v.undefined {
		return languageValue{}, false
	}
	switch v.node.Kind {
	case ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		value, known := acquireLiteralValue(languageValue{node: v.node})
		return languagePrimitiveTrace(value, v.forwarded), known
	}
	return languageValue{}, false
}

// languagePrimitiveTrace copies immutable source provenance without retaining the
// acquired wrapper or any activation. Primitive values have no capture semantics.
func languagePrimitiveTrace(v languageValue, nodes []*ast.Node) languageValue {
	for i := len(nodes) - 1; i >= 0; i-- {
		v.trace = &languageSourceTrace{node: nodes[i], previous: v.trace}
	}
	return v
}
func languagePrimitiveForwarding(v languageValue) []*ast.Node {
	var nodes []*ast.Node
	for t := v.trace; t != nil; t = t.previous {
		nodes = append(nodes, t.node)
	}
	return nodes
}

// detachReturnedPrimitive plans the complete projection before publishing any
// replacement value. Legacy retains all Get execution and effect ownership.
// Empty-capture primitives need no activation frame or mutable binding map.
// Already-owned populations keep their exact row/state association through the
// existing returned-result channel. They must never be resealed on a fresh root.
func (q *sourceValueQuery) detachReturnedPrimitive(get *sourceGetReturn, candidates *accessorCandidates) {
	if len(get.ownedGets) != 0 || get.incomplete || candidates.opaque || len(get.values) == 0 || q.owner == nil || q.owner.language == nil {
		return
	}
	var values []languageValue
	for _, old := range get.values {
		v, ok := detachedPrimitive(old.value)
		if !ok {
			return
		}
		values = append(values, v)
	}
	o := q.owner.language
	b := o.root()
	var alternatives []languageAlternative
	for _, v := range values {
		alternatives = append(alternatives, languageAlternative{branch: b, value: v})
	}
	get.paid = o.receipt(b, alternatives)
	// The replacement is the only successful value publisher for this population.
	// Known Get effects already belong to candidates and are neither moved nor paid.
	get.values = nil
}

// projectReturnedPrimitive is a closed paid-output recipe. Refusal does not call
// Get or any legacy evaluator. An admitted receipt never falls back to syntax.
func projectReturnedPrimitive(get sourceGetReturn, owner *languageOwner) ([]sourceObservedValue, bool) {
	if get.paid == nil {
		return nil, false
	}
	if get.paid.input.owner != owner {
		return nil, true
	}
	alternatives, ok := get.paid.project()
	if !ok {
		return nil, true
	}
	out := make([]sourceObservedValue, 0, len(alternatives))
	for _, a := range alternatives {
		if a.completion == languageNormal {
			out = append(out, sourceObservedValue{value: sourceValue{number: a.value.number, node: a.value.node, undefined: a.value.undefined, forwarded: languagePrimitiveForwarding(a.value)}, returned: get.site})
		}
	}
	return out, true
}
