package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// prefixChoiceSelector names only the four emitted owned expression selectors.
// It is not a runtime evaluator or extension registry.
func prefixChoiceSelector(kind string) bool {
	return kind == "SelectDefault" || kind == "SelectConditional" || shortCircuitOperator(kind) != ast.KindUnknown
}

// conditionalProducerEnd checks a frozen producer's completion boundary without
// treating the last discovered child or any arbitrary ready register as a result.
// Exact AST ancestry/source binding is supplied by the preentry population proof.
func conditionalProducerEnd(r *storageRecipe, reg, end int) bool {
	if r == nil || end <= 0 || end > len(r.events) || reg < 0 || reg >= len(r.events) || r.events[reg].out != reg {
		return false
	}
	if prefixChoiceSelector(r.events[reg].kind) {
		return r.events[reg].end == end
	}
	return reg == end-1
}

// conditionalLayout authenticates the two terminators in this admitted recipe.
// D locates S only under the existing out==PC proof and current prefix context.
// It performs no source lookup, checker query or expression evaluation.
func conditionalLayout(r *storageRecipe, s int) (storageEvent, bool) {
	if r == nil || r.prefix == r.callBody || r.choiceSlots <= 0 || r.registers != len(r.events) || s < 0 || s >= len(r.events) {
		return storageEvent{}, false
	}
	e := r.events[s]
	// Bound labels before addition/subtraction or indexing. Internal malformed
	// recipes must refuse even when their scalars wrap machine integers.
	if e.merge < 0 || e.merge >= len(r.events) || e.end <= 0 || e.end > len(r.events) {
		return storageEvent{}, false
	}
	if e.kind != "SelectConditional" || e.out != s || e.node == nil || !ast.IsConditionalExpression(e.node) || e.entry != s+1 || e.entry >= e.merge || e.merge+1 >= e.end-1 {
		return storageEvent{}, false
	}
	t, f := r.events[e.merge], r.events[e.end-1]
	if t.kind != "MergeConditional" || f.kind != "MergeConditional" || t.out != e.merge || f.out != e.end-1 || t.node != e.node || f.node != e.node || t.b != s || f.b != s || !conditionalProducerEnd(r, e.a, s) || !conditionalProducerEnd(r, t.a, e.merge) || !conditionalProducerEnd(r, f.a, e.end-1) {
		return storageEvent{}, false
	}
	return e, true
}

// conditionalSelect consumes only the ready condition in the actual recipe.
// A known branch pushes one prepaid frame. Neither result D nor Reference is
// initialized until a validated arm terminates. Unknown executes neither arm.
func conditionalSelect(prior languageAlternative, r *storageRecipe, pc int, values []languageValue, ready []bool, choices *[]storageChoice, disposition ...*expressionSelectionDisposition) (languageAlternative, int) {
	if prior.completion != languageNormal {
		return prior, pc
	}
	if !shortCircuitCanonical(prior) {
		return shortCircuitCut(prior, "Conditional invalid Normal pending metadata", languageValue{}), pc
	}
	e, ok := conditionalLayout(r, pc)
	if !ok || e.a < 0 || e.a >= len(values) || e.a >= len(ready) || e.out >= len(values) || e.out >= len(ready) || !ready[e.a] {
		return shortCircuitCut(prior, "Conditional select association/readiness", languageValue{}), pc
	}
	operand := values[e.a]
	truth, known := acquiredBoolean(prior.branch, operand)
	if !known {
		if len(disposition) > 0 && disposition[0] != nil {
			*disposition[0] = expressionPredicateUnavailable
		}
		return shortCircuitCut(prior, "Conditional predicate unavailable", operand), pc
	}
	if len(*choices) >= r.choiceSlots || cap(*choices) < r.choiceSlots {
		return shortCircuitCut(prior, "Conditional choice capacity", operand), pc
	}
	merge, next := e.merge, e.entry
	if !truth {
		merge = e.end - 1
		next = e.merge + 1
	}
	*choices = append(*choices, storageChoice{destination: e.out, merge: merge, end: e.end})
	out := shortCircuitHeader(prior)
	out.value = operand
	return out, next
}

// conditionalMerge forwards only this selected frozen arm producer. The true
// terminator jumps to E, not into the false arm. Logical merge guards are intact.
func conditionalMerge(prior languageAlternative, r *storageRecipe, pc int, values []languageValue, ready []bool, choices *[]storageChoice) (languageAlternative, int) {
	if prior.completion != languageNormal {
		return prior, pc
	}
	if !shortCircuitCanonical(prior) {
		return shortCircuitCut(prior, "Conditional invalid Normal pending metadata", languageValue{}), pc
	}
	if r == nil || pc < 0 || pc >= len(r.events) {
		return shortCircuitCut(prior, "Conditional merge unavailable", languageValue{}), pc
	}
	event := r.events[pc]
	owner, ok := conditionalLayout(r, event.b)
	if !ok || event.kind != "MergeConditional" || event.node != owner.node || (pc != owner.merge && pc != owner.end-1) || event.a < 0 || event.a >= len(values) || event.a >= len(ready) || event.b < 0 || event.b >= len(values) || event.b >= len(ready) || !ready[event.a] || len(*choices) == 0 {
		return shortCircuitCut(prior, "Conditional merge association/readiness", languageValue{}), pc
	}
	top := (*choices)[len(*choices)-1]
	if top.destination != event.b || top.merge != pc || top.end != owner.end {
		return shortCircuitCut(prior, "Conditional selected terminator", languageValue{}), pc
	}
	out := shortCircuitHeader(prior)
	out.value = values[event.a]
	values[event.b] = out.value
	ready[event.b] = true
	(*choices)[len(*choices)-1] = storageChoice{}
	*choices = (*choices)[:len(*choices)-1]
	return out, owner.end
}

// prefixChoiceOwnsEdge explains a false-once parent ONLY through an exact emitted
// selector already validated by this same proof. No index field is rewritten.
func prefixChoiceOwnsEdge(e storageEvent, parent, child *ast.Node) bool {
	if e.node != parent {
		return false
	}
	if e.kind == "SelectConditional" && ast.IsConditionalExpression(parent) {
		c := parent.AsConditionalExpression()
		return child == c.Condition || child == c.WhenTrue || child == c.WhenFalse
	}
	if ast.IsBinaryExpression(parent) {
		b := parent.AsBinaryExpression()
		return shortCircuitOperator(e.kind) != ast.KindUnknown && shortCircuitOperator(e.kind) == b.OperatorToken.Kind && (child == b.Left || child == b.Right)
	}
	return false
}
