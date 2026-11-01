package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// bindingDefaultCall names the single explicit tail Call. It is discovery shape,
// not permission to enter a callable or evaluate an initializer.
func bindingDefaultCall(element *ast.Node) *ast.Node {
	if element == nil || !ast.IsBindingElement(element) || element.Initializer() == nil {
		return nil
	}
	n := element.Initializer()
	for {
		if n == nil {
			return nil
		}
		if ast.IsParenthesizedExpression(n) {
			n = n.Expression()
			continue
		}
		if ast.IsBinaryExpression(n) && n.AsBinaryExpression().OperatorToken.Kind == ast.KindCommaToken {
			n = n.AsBinaryExpression().Right
			continue
		}
		break
	}
	if !ast.IsCallExpression(n) || ast.IsOptionalChain(n) || !ast.IsIdentifier(n.Expression()) || n.AsCallExpression().Arguments != nil && len(n.AsCallExpression().Arguments.Nodes) != 0 {
		return nil
	}
	return n
}

func bindingInitializeInput(d *bindingElementRecipe) int {
	if d == nil {
		return -1
	}
	if d.node.Initializer() != nil {
		if d.selectValue < 0 || d.selectValue == int(^uint(0)>>1) {
			return -1
		}
		return d.selectValue + 1
	}
	return d.selectValue
}

// bindingDefaultLayout authenticates all labels before indexing. It never calls
// plan.valid, allowing the existing plan validator to consume this subrelation.
func bindingDefaultLayout(r *storageRecipe, p *storageBindingRecipe) (storageEvent, int, bool) {
	if r == nil ||
		p == nil ||
		len(p.elements) != 1 ||
		p.recipe != r ||
		r.binding != p ||
		p.elementNode(0) == nil ||
		!ast.IsBindingElement(p.elementNode(0)) ||
		p.elementLabels(0).selectValue < 0 ||
		p.elementLabels(0).selectValue >= len(r.events)-1 ||
		p.elementLabels(0).initialize < 0 ||
		p.elementLabels(0).initialize >= len(r.events) {
		return storageEvent{}, -1, false
	}
	dpc := p.elementLabels(0).selectValue + 1
	d, i, ok := defaultChoiceLayout(r, dpc)
	if !ok || d.node != p.elementNode(0).Initializer() || d.a != p.elementLabels(0).selectValue || d.end != p.elementLabels(0).initialize {
		return storageEvent{}, -1, false
	}

	// Exact transparent AST producer origin is checked by defaultInterval in the
	// same completed population owner before this recipe can execute.
	return d, i, true
}

// bindingDefaultCallLayout retains the stronger acquired tail-Call suffix for
// abrupt default parking. Ordinary scalar results do not borrow Call authority.
func bindingDefaultCallLayout(r *storageRecipe, p *storageBindingRecipe) (storageEvent, int, bool) {
	d, i, ok := bindingDefaultLayout(r, p)
	if !ok {
		return storageEvent{}, -1, false
	}
	invoke := r.events[i]
	call := invoke.node
	if call == nil ||
		!ast.IsCallExpression(call) ||
		!ast.IsIdentifier(call.Expression()) ||
		ast.IsOptionalChain(call) ||
		call.AsCallExpression().Arguments != nil && len(call.AsCallExpression().Arguments.Nodes) != 0 {
		return storageEvent{}, -1, false
	}
	if invoke.kind != "InvokeAcquiredCall" || invoke.node != call || invoke.out != i || invoke.a < d.entry || invoke.a >= i || i < 2 {
		return storageEvent{}, -1, false
	}
	finalize, acquire := r.events[i-1], r.events[i-2]
	if finalize.kind != "FinalizeCallInputs" ||
		finalize.node != call ||
		finalize.a != invoke.a ||
		finalize.cell != 0 ||
		acquire.kind != "AcquireCallCallee" ||
		acquire.node != call ||
		acquire.a != invoke.a ||
		acquire.b < d.entry ||
		acquire.b >= i-2 ||
		invoke.a != i-3 {
		return storageEvent{}, -1, false
	}
	get, ref := r.events[invoke.a], r.events[acquire.b]
	if get.kind != "GetValue" ||
		get.node != call.Expression() ||
		get.a != acquire.b ||
		ref.kind != "ResolveLexicalReference" ||
		ref.node != call.Expression() ||
		ref.out != acquire.b ||
		get.out != invoke.a {
		return storageEvent{}, -1, false
	}
	return d, i, true
}

func (p *shortCircuitPopulationProof) defaultInterval(pc int) bool {
	r := p.recipe
	if r == nil || !p.spend() {
		return false
	}
	var d storageEvent
	var ok bool
	if r.binding != nil {
		d, _, ok = bindingDefaultLayout(r, r.binding)
	} else if p.body != nil && r.callBody && p.body.plan != nil {
		d, _, ok = defaultChoiceLayout(r, pc)
		if ok {
			input := r.events[d.a]
			formal := p.body.plan.parameters.defaultParameter(input.cell)
			ok = formal != nil && d.node == formal.Initializer() && input.kind == "ReadAcquiredArgument" && input.node == formal
		}
	}
	if !ok || pc != d.out || !p.runtime[d.node] || !p.ends(r.events[d.merge].a, d.merge, d.node) {
		return false
	}
	if p.body != nil && !p.bodyExpressionRegion(d.entry, d.merge, d.node) {
		return false
	}
	for i, event := range r.events {
		if !p.spend() {
			return false
		}
		inside := i >= d.entry && i < d.merge
		if event.node == d.node && (i == pc || i == d.merge) {
			continue
		}
		if inside != p.within(event.node, d.node) {
			return false
		}
	}
	return true
}

// bindingDefaultSelected is shared source-Get/Next metadata. It grants neither
// entry nor parking. The actual acquired entry and current source cell follow.
func bindingDefaultSelected(c *languageBindingContext, a languageAlternative) bool {
	if c == nil ||
		c.plan == nil ||
		c.elementNode() == nil ||
		c.initialization != nil ||
		c.plan.recipe == nil ||
		!c.plan.valid(c.plan.recipe) ||
		c.first == nil ||
		c.step == nil ||
		!c.step.converted ||
		c.step.completion != languageNormal ||
		c.result.object == nil ||
		c.step.value != c.result ||
		c.nextReceipt == nil ||
		!c.doneKnown ||
		c.done ||
		c.doneReceipt == nil ||
		c.valueReceipt == nil ||
		c.selected != c.valueReceipt ||
		len(c.selected.alternatives) != 1 ||
		c.origin != nil ||
		c.close != nil ||
		c.returnGet != nil ||
		c.interrupted != nil ||
		c.routed ||
		c.target != (languageCell{}) {
		return false
	}
	selected := c.selected.alternatives[0]
	if selected.completion != languageNormal ||
		!selected.value.undefined ||
		selected.value.number != (numberPayload{}) ||
		selected.value.object != nil ||
		selected.value.callable != nil ||
		selected.value.text != "" ||
		selected.branch.state == nil ||
		selected.branch.owner != a.branch.owner ||
		selected.branch.guard != a.branch.guard ||
		selected.branch.generation != a.branch.generation ||
		selected.branch.env != a.branch.env ||
		a.binding != c {
		return false
	}
	return true
}

// bindingDefaultInputs consumes the existing one-use source input loan. The
// explicit Call does not masquerade as one of the iterator's protocol sites.
func bindingDefaultInputs(p *closedPrefixCandidate, in *languageCallInputs, a languageAlternative) bool {
	if p == nil ||
		p.history == nil ||
		p.history.recipe == nil ||
		in == nil ||
		p.entryInputs != in ||
		p.bodyClaimed ||
		p.bindingSite != nil ||
		in.bindingSite != nil ||
		in.call == nil ||
		in.receiver != (languageValue{undefined: true}) ||
		len(in.arguments) != 0 ||
		!in.complete ||
		!in.calleeReady ||
		a.callInputs != in ||
		!bindingDefaultSelected(a.binding, a) {
		return false
	}
	r := p.history.recipe
	d, invoke, ok := bindingDefaultCallLayout(r, r.binding)
	if !ok ||
		a.storage == nil ||
		a.storage.recipe != r ||
		a.storage.pc != invoke ||
		a.storage.childBranch != a.branch ||
		len(a.storage.choices) != 1 ||
		a.storage.choices[0] != (storageChoice{destination: d.out, merge: d.merge, end: d.end}) ||
		p.bindingPhase != r.binding.siteOrdinal(&r.binding.close) ||
		in.call != r.events[invoke].node ||
		in.targetOrigin == nil ||
		in.targetOrigin.recipe != r ||
		in.targetOrigin.getPC != invoke-3 ||
		in.targetOrigin.acquirePC != invoke-2 ||
		in.targetOrigin.referencePC != r.events[invoke-2].b ||
		in.targetOrigin.getPC < d.entry ||
		!validCallTarget(a.branch.owner, in) {
		return false
	}
	ref := r.events[in.targetOrigin.referencePC]
	if ref.cell < 0 ||
		ref.cell >= len(in.lexicals) ||
		ref.cell >= len(r.declarations) ||
		ref.cell >= len(r.constants) ||
		!r.constants[ref.cell] ||
		in.lexicals[ref.cell].declaration != r.declarations[ref.cell] ||
		in.reference.cell != in.lexicals[ref.cell].cell ||
		!in.reference.cell.immutable {
		return false
	}
	if _, ok := bindingUninitializedTarget(r.binding.elementAt(0), a.branch, in.lexicals); !ok {
		return false
	}
	if len(a.binding.doneReceipt.alternatives) != 1 {
		return false
	}
	done, doneKnown := acquiredBoolean(a.branch, a.binding.doneReceipt.alternatives[0].value)
	undefined, undefinedKnown := acquiredUndefined(a.branch, a.binding.selected.alternatives[0].value)
	if !doneKnown || done || !undefinedKnown || !undefined {
		return false
	}
	f := in.callee.callable
	return f != nil && f.proof != nil && f.proof.entry != nil && f.proof.parameters == 0 && f.proof.entry.finally != nil && bindingDefaultThrowShape(f.proof.arrow) && f.proof.entry.finally.valid(f.proof.entry)
}

// bindingDefaultChild is the immutable counterpart of the live checked handoff.
// It is not a validator for renewed execution after the owner is released.
func bindingDefaultChild(c *languageBindingContext, a languageAlternative) bool {
	if !bindingDefaultSelected(c, a) ||
		a.completion != languageThrow ||
		a.returnBoundary != (languageID{}) ||
		a.remaining != "" ||
		a.pending != languageNormal ||
		a.pendingValue != (languageValue{}) ||
		a.pendingReturnBoundary != (languageID{}) ||
		a.storage != nil ||
		a.callInputs != nil ||
		a.callHistory == nil {
		return false
	}
	h := a.callHistory
	if h.entry == nil ||
		h.entry.proof == nil ||
		h.entry.proof.entry == nil ||
		h.entry.inputs == nil ||
		h.entry.acquisition == nil ||
		len(h.entry.acquisition.alternatives) != 1 ||
		h.raw == nil ||
		len(h.raw.alternatives) != 1 ||
		h.converted ||
		h.completion != languageThrow ||
		h.value != a.value ||
		h.outward != a.branch ||
		h.id.owner != a.branch.owner ||
		h.id.serial == 0 ||
		h.id.serial > a.branch.owner.next {
		return false
	}
	e, in, raw := h.entry, h.entry.inputs, h.raw.alternatives[0]
	d, invoke, ok := bindingDefaultCallLayout(c.plan.recipe, c.plan)
	parent := e.acquisition.alternatives[0]
	if !ok ||
		in.call != c.plan.recipe.events[invoke].node ||
		in.bindingSite != nil ||
		in.targetOrigin == nil ||
		in.targetOrigin.recipe != c.plan.recipe ||
		in.targetOrigin.getPC != invoke-3 ||
		in.targetOrigin.acquirePC != invoke-2 ||
		in.targetOrigin.referencePC != c.plan.recipe.events[invoke-2].b ||
		in.callee.callable == nil ||
		in.callee.callable != e.callable ||
		in.callee.callable.proof != e.proof ||
		!in.receiver.undefined ||
		len(in.arguments) != 0 ||
		parent.binding != c ||
		parent.callInputs != in ||
		parent.storage == nil ||
		parent.storage.recipe != c.plan.recipe ||
		parent.storage.pc != invoke ||
		parent.storage.childBranch != parent.branch ||
		parent.storage.id.owner != a.branch.owner ||
		parent.storage.id.serial == 0 ||
		parent.storage.id.serial > a.branch.owner.next ||
		len(parent.storage.choices) != 1 ||
		parent.storage.choices[0] != (storageChoice{destination: d.out, merge: d.merge, end: d.end}) ||
		invoke >= len(parent.storage.ready) ||
		!sameLanguageCallInputs(parent.storage.callInputs, in) ||
		parent.branch != in.calleeBranch ||
		e.caller != a.branch.env ||
		h.raw.input != e.activation ||
		raw.completion != languageThrow ||
		raw.value != h.value ||
		raw.returnBoundary != (languageID{}) ||
		raw.branch.state != a.branch.state ||
		raw.branch.env != e.activation.env ||
		raw.branch.cursor == ^uint64(0) ||
		raw.branch.cursor+1 != a.branch.cursor ||
		!callBodySnapshot(e, raw) {
		return false
	}
	r := e.proof.entry
	if e.proof.namespace != a.branch.owner ||
		e.proof.generation != a.branch.generation ||
		e.proof.source != ast.GetSourceFileOfNode(c.plan.declaration) ||
		e.proof.plan == nil ||
		e.proof.plan.recipe != r ||
		e.proof.mapping != e.proof.plan.parameters ||
		r.body != e.proof.arrow {
		return false
	}
	if r == nil ||
		r.finally == nil ||
		!r.finally.valid(r) ||
		raw.storage.pc != r.finally.route+1 ||
		len(raw.storage.choices) != 0 ||
		raw.finally == nil ||
		!raw.finally.routed ||
		raw.finally.origin == nil ||
		raw.finally.finalizer == nil ||
		!sameLanguageFinallyContext(raw.storage.finally, raw.finally) ||
		!sameLanguageFinallyContext(a.finally, parent.finally) {
		return false
	}
	if _, ok := bindingUninitializedTarget(c.currentElement(), a.branch, in.lexicals); !ok {
		return false
	}
	// The sealed parent snapshot binds the actual paid prefix registers to its
	// persistent lexical writes. It cannot be replaced by a same-value reread.
	return bindingDefaultWrites(c, parent.branch, invoke, parent.storage, in.lexicals) && parent.branch.state == raw.branch.state && !parent.storage.ready[invoke]

}

func bindingDefaultParkReady(r *storageRecipe, pc int, a languageAlternative) bool {
	return r != nil && r.binding != nil && pc == r.binding.park && a.branch.owner != nil && a.branch.owner.live(a.branch) && bindingDefaultChild(a.binding, a)
}

// bindingDefaultOrigin binds the installed H receipt to the actual uninitialized
// lexical cell. Child F history and H's incoming completion are separate owners.
func bindingDefaultOrigin(c *languageBindingContext, a languageAlternative) bool {
	if c == nil ||
		c.initialization != nil ||
		a.branch.owner == nil ||
		c.origin == nil ||
		len(c.origin.alternatives) != 1 ||
		c.origin.occurrence.owner != a.branch.owner ||
		c.origin.occurrence.serial == 0 ||
		c.origin.occurrence.serial > a.branch.owner.next ||
		a.binding != c {
		return false
	}
	pending := c.origin.alternatives[0]
	prior := pending.binding
	if prior == nil ||
		prior == c ||
		!bindingDefaultChild(prior, pending) ||
		c.origin.input != pending.branch ||
		c.plan != prior.plan ||
		c.first != prior.first ||
		c.step != prior.step ||
		c.result != prior.result ||
		c.iterator != prior.iterator ||
		c.next != prior.next ||
		c.nextReceipt != prior.nextReceipt ||
		c.nextReference != prior.nextReference ||
		c.nextBranch != prior.nextBranch ||
		c.doneKnown != prior.doneKnown ||
		c.done != prior.done ||
		c.doneReceipt != prior.doneReceipt ||
		c.valueReceipt != prior.valueReceipt ||
		c.selected != prior.selected ||
		c.parent != prior.parent ||
		c.interrupted != nil ||
		a.branch.owner != pending.branch.owner ||
		a.branch.guard != pending.branch.guard ||
		a.branch.generation != pending.branch.generation ||
		a.branch.env != pending.branch.env ||
		!sameLanguageFinallyContext(a.finally, pending.finally) {
		return false
	}
	_, ok := bindingUninitializedTarget(c.currentElement(), a.branch, pending.callHistory.entry.inputs.lexicals, c.target)
	return ok
}

func bindingDefaultWork(c *languageBindingContext, a languageAlternative) bool {
	return bindingDefaultOrigin(c, a) && !c.routed && c.close == nil && c.returnGet == nil && bindingNormalUnusedMetadata(a) && a.callHistory == c.origin.alternatives[0].callHistory
}

func bindingCloseTarget(c *languageBindingContext, a languageAlternative) bool {
	if bindingDefaultOrigin(c, a) {
		return c.close != nil &&
			c.close.entry != nil &&
			c.close.entry.inputs != nil &&
			c.close.entry.acquisition != nil &&
			len(c.close.entry.acquisition.alternatives) == 1 &&
			c.close.entry.acquisition.alternatives[0].binding != nil &&
			c.close.entry.acquisition.alternatives[0].binding.origin == c.origin &&
			c.close.entry.acquisition.alternatives[0].binding.target == c.target &&
			c.close.entry.acquisition.alternatives[0].binding.step == c.step &&
			c.close.entry.acquisition.alternatives[0].binding.selected == c.selected
	}
	return c.closeInitializedTarget(a)
}

func bindingDefaultGetterRoute(r *storageRecipe, pc int, a languageAlternative) bool {
	return r != nil &&
		r.binding != nil &&
		pc == r.binding.route &&
		a.binding != nil &&
		!a.binding.routed &&
		bindingDefaultOrigin(a.binding, a) &&
		a.branch.owner != nil &&
		a.branch.owner.live(a.branch) &&
		a.binding.closeGetterInnerOutput(a)
}

// defaultWinner inspects actual retained inner history independently of winner9.
// It never substitutes that value into a raw Call or Get receipt.
func (c *languageBindingContext) defaultWinner(a languageAlternative) bool {
	if !bindingDefaultOrigin(c, a) ||
		!c.routed ||
		a.completion != languageThrow ||
		a.value != c.origin.alternatives[0].value ||
		a.returnBoundary != (languageID{}) ||
		a.storage != nil ||
		a.callInputs != nil ||
		a.remaining != "" ||
		a.pending != c.origin.alternatives[0].pending ||
		a.pendingValue != c.origin.alternatives[0].pendingValue ||
		a.pendingReturnBoundary != c.origin.alternatives[0].pendingReturnBoundary {
		return false
	}
	if a.callHistory == nil ||
		a.callHistory.entry == nil ||
		a.callHistory.entry.proof == nil ||
		a.callHistory.entry.proof.namespace != a.branch.owner ||
		a.callHistory.entry.proof.generation != a.branch.generation ||
		a.callHistory.entry.proof.source != ast.GetSourceFileOfNode(c.plan.declaration) {
		return false
	}
	if c.returnGet != nil {
		return c.close == nil && c.returnGetAssociation(a)
	}
	if c.close == nil {
		for _, observation := range a.objects {
			if observation.recipe != c.plan.recipe || observation.pc != c.plan.close.get || observation.receipt == nil || len(observation.receipt.alternatives) != 1 {
				continue
			}
			inner := observation.receipt.alternatives[0]
			before := inner.binding
			if before == nil ||
				before.origin != c.origin ||
				before.target != c.target ||
				before.plan != c.plan ||
				before.first != c.first ||
				before.step != c.step ||
				before.selected != c.selected ||
				before.parent != c.parent ||
				before.routed ||
				inner.branch != a.branch ||
				inner.callHistory != a.callHistory {
				return false
			}
			// The receipt row is intentionally bare. Validate its exact inner
			// outcome against the actual outward observation vector, without
			// changing either row or inventing an enclosing receipt.
			view := a
			view.binding, view.completion, view.value = before, inner.completion, inner.value
			return before.closeGetterInnerOutput(view)
		}
		return false
	}
	h := c.close
	if !c.closeParentAssociation(a) ||
		a.callHistory != h ||
		h.entry == nil ||
		h.entry.inputs == nil ||
		h.entry.acquisition == nil ||
		len(h.entry.acquisition.alternatives) != 1 ||
		h.raw == nil ||
		len(h.raw.alternatives) != 1 ||
		h.outward != a.branch ||
		h.id.owner != a.branch.owner ||
		h.id.serial == 0 ||
		h.id.serial > a.branch.owner.next {
		return false
	}
	e, raw := h.entry, h.raw.alternatives[0]
	parent := e.acquisition.alternatives[0]
	if parent.binding == nil ||
		parent.binding.origin != c.origin ||
		parent.binding.target != c.target ||
		parent.binding.step != c.step ||
		!bindingCloseRole(c.plan, e.inputs.bindingSite) ||
		e.inputs.call != c.plan.declaration ||
		e.inputs.receiver != c.iterator ||
		h.raw.input != e.activation ||
		raw.value != h.value ||
		raw.branch.state != a.branch.state ||
		raw.branch.env != e.activation.env ||
		e.caller != a.branch.env ||
		raw.branch.cursor == ^uint64(0) ||
		raw.branch.cursor+1 != a.branch.cursor ||
		!sameLanguageFinallyContext(a.finally, parent.finally) {
		return false
	}
	if h.completion == languageNormal {
		return h.converted && raw.completion == languageReturn && raw.returnBoundary == e.boundary
	}
	return !h.converted &&
		h.completion == languageThrow &&
		raw.completion == languageThrow &&
		raw.returnBoundary == (languageID{}) &&
		callBodySnapshot(e, raw) &&
		e.proof.entry.finally != nil &&
		e.proof.entry.finally.valid(e.proof.entry) &&
		raw.finally != nil &&
		raw.finally.routed
}

// The old Normal-pending direct Getter terminal remains a separate wrapper.
func (c *languageBindingContext) closeGetterThrowOutput(a languageAlternative) bool {
	return !bindingDefaultOrigin(c, a) && c.closeGetterInnerOutput(a)
}

func bindingDefaultThrowShape(callable *ast.Node) bool {
	if callable == nil {
		return false
	}
	terminal, value := literalEmptyFinallyTerminal(callable.Body())
	return terminal != nil && ast.IsThrowStatement(terminal) && value != nil && value.Kind == ast.KindNumericLiteral
}

// bindingDefaultWrites ties the paid lexical Put registers to persistent writes.
// frame is the actual acquired snapshot or a read-only view of current buffers.
// It supplies no entry authority and never evaluates source text.
func bindingDefaultWrites(c *languageBindingContext, branch languageBranch, end int, frame *storageContinuation, lexicals []languageLexical) bool {
	if c == nil || c.plan == nil || c.selected == nil || len(c.selected.alternatives) != 1 || c.selected.alternatives[0].branch.state == nil || branch.state == nil || branch.env == nil || frame == nil || frame.recipe != c.plan.recipe {
		return false
	}
	d, _, ok := bindingDefaultLayout(c.plan.recipe, c.plan)
	if !ok || end < d.entry || end > d.merge {
		return false
	}
	state := branch.state.storage
	for pc := end - 1; pc >= d.entry; pc-- {
		pe := c.plan.recipe.events[pc]
		if pe.kind != "PutValue" {
			continue
		}
		if pe.a < 0 || pe.a >= pc || pe.b < 0 || pe.b >= pc {
			return false
		}
		ref := c.plan.recipe.events[pe.a]
		if ref.kind != "ResolveLexicalReference" ||
			ref.cell < 0 ||
			ref.cell >= len(lexicals) ||
			ref.cell >= len(c.plan.recipe.declarations) ||
			lexicals[ref.cell].declaration != c.plan.recipe.declarations[ref.cell] ||
			state == nil ||
			!state.initialized ||
			state.cell != lexicals[ref.cell].cell ||
			state.cell.environment != branch.env.id ||
			pe.b >= len(frame.ready) ||
			!frame.ready[pe.b] ||
			pe.b >= len(frame.values) ||
			frame.values[pe.b] != state.value ||
			pc >= len(frame.ready) ||
			!frame.ready[pc] {
			return false
		}
		state = state.previous
	}
	return state == c.selected.alternatives[0].branch.state.storage
}
