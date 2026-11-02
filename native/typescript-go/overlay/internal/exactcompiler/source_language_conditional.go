package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// acquiredUndefined discriminates authenticated values, never spelling or type.
// Empty/unavailable or contradictory payloads supply no branch certificate.
func acquiredUndefined(b languageBranch, v languageValue) (bool, bool) {
	if b.owner == nil || !b.owner.live(b) {
		return false, false
	}
	if v.undefined {
		return true, v.object == nil && v.text == ""
	}
	if v.object != nil {
		return false, v.object.id.owner == b.owner && v.node == nil && v.text == ""
	}
	if v.node == nil || v.text != "" {
		return false, false
	}
	switch v.node.Kind {
	case ast.KindNumericLiteral, ast.KindStringLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return false, true
	}
	return false, false
}

// languageDefault sequences exactly the selected child using the acquired value
// and actual predecessor branch. The common sequence law conserves prefix effects,
// obligations, non-Normal alternatives and unavailable-successor residuals.
func languageDefault(in []languageAlternative, undefined, defined func(languageAlternative) []languageAlternative) []languageAlternative {
	return languageSequence(in, func(a languageAlternative) []languageAlternative {
		selected, known := acquiredUndefined(a.branch, a.value)
		if !known {
			return []languageAlternative{storageResidual(a.branch, "default acquired value unavailable")}
		}
		if selected {
			if undefined == nil {
				return nil
			}
			return undefined(a)
		}
		if defined == nil {
			return nil
		}
		return defined(a)
	})
}

// storageChoice records a selected child region until its Normal merge. Bypass
// never creates a frame or reads its fallback register. PCs refer to frozen recipes.
type storageChoice struct{ destination, merge, end int }

func copyStorageChoices(in []storageChoice) []storageChoice {
	return append([]storageChoice(nil), in...)
}

// defaultOperand prepares every child, including ones a runtime edge may bypass.
// Choice destination, label reservations and label patching spend sticky discovery.
func (p *storageBuilder) defaultOperand(node *ast.Node, input int, shared *expressionLowerer) (storageOperand, bool) {
	if !p.discover() {
		return storageOperand{}, false
	}
	choicePC := len(p.recipe.events)
	dest := p.event(storageEvent{kind: "SelectDefault", node: node, a: input})
	if !p.discover() {
		return storageOperand{}, false
	}
	entry := len(p.recipe.events)
	var fallback storageOperand
	var ok bool
	if shared != nil {
		formalDefault := false
		if m := shared.context.parameters; m != nil && p.recipe.callBody && m.arrow == p.recipe.body {
			for i := range m.declarations {
				if formal := m.defaultParameter(i); formal != nil && formal.Initializer() == node {
					formalDefault = true
				}
			}
		}
		if shared.storageBuilder != p || !formalDefault || !shared.mark(node) {
			return storageOperand{}, false
		}
		fallback.register, ok = shared.value(node)
	} else {
		fallback, ok = p.expression(node)
	}
	// Existing object-pattern domain policy is separate from prefix authority.
	if !ok || shared == nil && !p.isPrimitive(fallback.domain) {
		return storageOperand{}, false
	}
	mergePC := len(p.recipe.events)
	p.event(storageEvent{kind: "MergeDefault", node: node, a: fallback.register, b: dest})
	if !p.discover() || p.exhausted {
		return storageOperand{}, false
	}
	p.recipe.events[choicePC].entry = entry
	p.recipe.events[choicePC].merge = mergePC
	p.recipe.events[choicePC].end = len(p.recipe.events)
	if shared != nil {
		if p.recipe.choiceSlots == int(^uint(0)>>1) {
			return storageOperand{}, false
		}
		p.recipe.choiceSlots++
	}
	return storageOperand{register: dest, domain: p.primitiveDomain()}, true
}

// defaultChoiceLayout is common frozen event wiring, not a source role or entry
// permission. Binding and formal owners separately authenticate their donors.
func defaultChoiceLayout(r *storageRecipe, pc int) (storageEvent, int, bool) {
	if r == nil || pc < 0 || pc >= len(r.events)-1 {
		return storageEvent{}, -1, false
	}
	d := r.events[pc]
	if d.merge <= pc || d.merge >= len(r.events) || d.end <= 0 || d.end > len(r.events) || d.merge == int(^uint(0)>>1) || d.kind != "SelectDefault" || d.out != pc || d.a < 0 || d.a >= pc || d.entry != pc+1 || d.entry >= d.merge || d.end != d.merge+1 {
		return storageEvent{}, -1, false
	}
	m := r.events[d.merge]
	i := m.a
	if i < d.entry || i >= d.merge || m.kind != "MergeDefault" || m.out != d.merge || m.node != d.node || m.b != d.out || r.events[i].node == nil || !expressionValueProducer(r.events[i].kind) || !conditionalProducerEnd(r, i, d.merge) {
		return storageEvent{}, -1, false
	}
	if r.events[i].kind == "Literal" && (r.events[i].value.node != r.events[i].node || !expressionLiteralNode(r.events[i].node) && !r.events[i].value.undefined) {
		return storageEvent{}, -1, false
	}
	return d, i, true
}

// defaultSelect consumes the same acquired undefined test for binding and formal
// initialization. Unknown inputs enter neither child and supply no destination.
func defaultSelect(prior languageAlternative, r *storageRecipe, pc int, values []languageValue, ready []bool, choices *[]storageChoice, disposition *expressionSelectionDisposition) (languageAlternative, int) {
	if prior.completion != languageNormal {
		return prior, pc
	}
	if r == nil || pc < 0 || pc >= len(r.events) {
		return shortCircuitCut(prior, "Default selector unavailable", languageValue{}), pc
	}
	e := r.events[pc]
	if !shortCircuitCanonical(prior) || e.kind != "SelectDefault" || e.a < 0 || e.a >= len(values) || e.a >= len(ready) || !ready[e.a] || e.out < 0 || e.out >= len(values) || e.out >= len(ready) || e.entry != pc+1 || e.merge < e.entry || e.merge >= len(r.events) || e.end != e.merge+1 || e.end > len(r.events) {
		return shortCircuitCut(prior, "Default choice association", languageValue{}), pc
	}
	operand := values[e.a]
	canonical := true
	if r.prefix || r.callBody {
		_, canonical = acquiredBoolean(prior.branch, operand)
	}
	take, known := acquiredUndefined(prior.branch, operand)
	if !canonical || !known {
		if disposition != nil {
			*disposition = expressionPredicateUnavailable
		}
		return shortCircuitCut(prior, "Default operand unavailable", operand), pc
	}
	out := shortCircuitHeader(prior)
	out.value = operand
	if take {
		if (r.prefix || r.callBody) && (choices == nil || len(*choices) >= cap(*choices)) {
			return shortCircuitCut(prior, "Default choice capacity", operand), pc
		}
		*choices = append(*choices, storageChoice{destination: e.out, merge: e.merge, end: e.end})
		return out, e.entry
	}
	values[e.out], ready[e.out] = operand, true
	return out, e.end
}

// defaultMerge consumes only the selected initializer's own normal terminator.
// Its destination becomes ready before the formal's separate InitializeCell.
func defaultMerge(prior languageAlternative, r *storageRecipe, pc int, values []languageValue, ready []bool, choices *[]storageChoice) languageAlternative {
	if prior.completion != languageNormal {
		return prior
	}
	if !shortCircuitCanonical(prior) {
		return shortCircuitCut(prior, "Default merge pending metadata", languageValue{})
	}
	if r == nil || pc < 0 || pc >= len(r.events) || choices == nil || len(*choices) == 0 {
		return shortCircuitCut(prior, "Default merge unavailable", languageValue{})
	}
	e := r.events[pc]
	top := (*choices)[len(*choices)-1]
	if e.kind != "MergeDefault" || e.a < 0 || e.a >= len(values) || e.a >= len(ready) || !ready[e.a] || e.b < 0 || e.b >= len(values) || e.b >= len(ready) || top.merge != pc || top.destination != e.b || top.end != pc+1 {
		return shortCircuitCut(prior, "Default merge association", languageValue{})
	}
	out := shortCircuitHeader(prior)
	out.value = values[e.a]
	values[e.b] = out.value
	ready[e.b] = true
	*choices = (*choices)[:len(*choices)-1]
	return out
}
