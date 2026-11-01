package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
	"unsafe"
)

// bindingElements is the single source-shape owner. The initial additional
// population is two plain identifiers. Existing single defaults remain distinct.
func bindingElements(n *ast.Node) ([]*ast.Node, bool) {
	if n == nil || !ast.IsVariableDeclaration(n) || !ast.IsArrayBindingPattern(n.Name()) || n.Initializer() == nil {
		return nil, false
	}
	nodes := n.Name().AsBindingPattern().Elements.Nodes
	if len(nodes) > 2 {
		return nil, false
	}
	for _, e := range nodes {
		if e == nil || !ast.IsBindingElement(e) || e.Name() == nil || !ast.IsIdentifier(e.Name()) || e.AsBindingElement().DotDotDotToken != nil || e.AsBindingElement().PropertyName != nil || len(nodes) > 1 && e.Initializer() != nil {
			return nil, false
		}
	}
	return nodes, true
}

// bindingElementSource queries the canonical ordered source shape. It grants no
// source role or initialization authority.
func bindingElementSource(n *ast.Node, index int) *ast.Node {
	nodes, ok := bindingElements(n)
	if !ok || index < 0 || index >= len(nodes) {
		return nil
	}
	return nodes[index]
}
func (p *storageBindingRecipe) elementAt(index int) *bindingElementRecipe {
	if p == nil || index < 0 || index >= len(p.elements) {
		return nil
	}
	return &p.elements[index]
}
func (p *storageBindingRecipe) elementNode(index int) *ast.Node {
	if e := p.elementAt(index); e != nil {
		return e.node
	}
	return nil
}
func (p *storageBindingRecipe) elementLabels(index int) bindingElementRecipe {
	if e := p.elementAt(index); e != nil {
		return *e
	}
	return bindingElementRecipe{}
}
func (p *storageBindingRecipe) elementStep(index int) *bindingCallSite {
	if e := p.elementAt(index); e != nil {
		return &e.step
	}
	return nil
}
func (c *languageBindingContext) currentElement() *bindingElementRecipe {
	if c == nil {
		return nil
	}
	return c.plan.elementAt(c.elementIndex)
}
func (c *languageBindingContext) elementNode() *ast.Node {
	if e := c.currentElement(); e != nil {
		return e.node
	}
	return nil
}
func (c *languageBindingContext) elementLabels() bindingElementRecipe {
	if e := c.currentElement(); e != nil {
		return *e
	}
	return bindingElementRecipe{}
}
func (c *languageBindingContext) elementStep() *bindingCallSite {
	if e := c.currentElement(); e != nil {
		return &e.step
	}
	return nil
}
func bindingStepDescriptor(p *storageBindingRecipe, s *bindingCallSite) *bindingElementRecipe {
	if p == nil || s == nil || s.plan != p {
		return nil
	}
	for i := range p.elements {
		if &p.elements[i].step == s {
			return &p.elements[i]
		}
	}
	return nil
}
func (p *storageBindingRecipe) elementAtPC(pc int) *bindingElementRecipe {
	if p == nil {
		return nil
	}
	for i := range p.elements {
		d := &p.elements[i]
		if pc >= d.step.acquire && pc <= d.initialize {
			return d
		}
	}
	return nil
}

// A completion owns exactly one source Initialize and its original selected
// result. Generic receipts retain rows/occurrences, not renewed execution leases.
type bindingElementCompletion struct {
	previous                            *bindingElementCompletion
	descriptor                          *bindingElementRecipe
	step                                *languageCallHistory
	doneReceipt, valueReceipt, selected *languageReceipt
	sticky                              *bindingElementCompletion
	target                              languageCell
	record                              *languageStorage
	initialized                         *languageReceipt
}

func bindingDescendant(older, newer languageBranch) bool {
	if older.owner == nil || older.owner != newer.owner || older.guard != newer.guard || older.generation != newer.generation || older.env != newer.env || older.cursor > newer.cursor {
		return false
	}
	for s := newer.state; s != nil; s = s.previous {
		if s == older.state {
			return true
		}
		if s.previous != nil && (s.id.owner != older.owner || s.previous.id.owner != older.owner || s.previous.id.serial >= s.id.serial) {
			return false
		}
	}
	return false
}

// bindingElementSelectionPhase relates the issued pre-install Get/selection
// row to the installed H context. The receipt remains unchanged. This comparison
// projection is metadata only, never an input to an issuer or live validator.
// Result-initialization and prefix seals have their own surrounding proofs.
func bindingElementSelectionPhase(post *languageBindingContext, previous *bindingElementCompletion) bool {
	if post == nil || post.plan == nil || post.currentElement() == nil || post.selected == nil || len(post.selected.alternatives) != 1 || !post.doneKnown {
		return false
	}
	selected := post.selected.alternatives[0]
	pre := selected.binding
	if pre == nil || pre.valueReceipt != nil || pre.selected != nil || pre.initialization != nil || pre.completed != previous || pre.origin != nil || pre.close != nil || pre.returnGet != nil || pre.routed || pre.interrupted != nil || pre.target != (languageCell{}) || selected.completion != languageNormal || post.selected.input != selected.branch {
		return false
	}
	if post.done {
		if post.valueReceipt != nil || selected.value != (languageValue{undefined: true}) {
			return false
		}
	} else if post.valueReceipt != post.selected {
		return false
	}
	// SelectBindingValue installs only these two receipt links. The later result
	// receipt and completed-node link are separately authenticated owner handoffs.
	projected := *post
	projected.valueReceipt = nil
	projected.selected = nil
	projected.initialization = nil
	projected.completed = previous
	return projected == *pre
}

// completedElements authenticates the ordered prefix under the actual current
// storage head. Same-value replacement records are not the retained records.
func completedElements(c *languageBindingContext, a languageAlternative, count int) bool {
	if c == nil || c.plan == nil || count < 0 || count > len(c.plan.elements) || a.branch.owner == nil {
		return false
	}
	node := c.completed
	for index := count - 1; index >= 0; index-- {
		if node == nil || node.descriptor != c.plan.elementAt(index) || node.initialized == nil || len(node.initialized.alternatives) != 1 || node.selected == nil || len(node.selected.alternatives) != 1 || node.initialized.occurrence.owner != a.branch.owner || node.initialized.occurrence.serial == 0 || node.initialized.occurrence.serial > a.branch.owner.next {
			return false
		}
		row := node.initialized.alternatives[0]
		before := node.selected.alternatives[0]
		selectedContext := before.binding
		if selectedContext == nil || node.selected.input != before.branch || node.selected.occurrence.owner != a.branch.owner || node.selected.occurrence.serial == 0 || node.selected.occurrence.serial >= node.initialized.occurrence.serial {
			return false
		}
		if !bindingElementSelectionPhase(row.binding, node.previous) || row.binding == nil || row.binding.plan != c.plan || row.binding.first != c.first || row.binding.nextReceipt != c.nextReceipt || row.binding.iterator != c.iterator || row.binding.next != c.next || row.binding.nextReference != c.nextReference || row.binding.nextBranch != c.nextBranch || row.binding.elementIndex != index || row.binding.completed != node || row.binding.selected != node.selected || row.binding.step != node.step || row.binding.doneReceipt != node.doneReceipt || row.binding.valueReceipt != node.valueReceipt || row.binding.parent != c.parent || row.completion != languageNormal || row.callHistory != before.callHistory || row.value != bindingCompletionValue(node) || row.branch.state == nil || row.branch.state.storage != node.record || row.branch.state.previous == nil || row.branch.owner != a.branch.owner || node.initialized.input != row.branch || node.initialized.occurrence.serial <= row.branch.state.id.serial || !bindingDescendant(row.branch, a.branch) || bindingInitializedRecord(a.branch, node.target, bindingCompletionValue(node)) != node.record {
			return false
		}
		if node.record == nil || !node.record.initialized || node.record.cell != node.target || node.record.previous != row.branch.state.previous.storage || node.record.value != bindingCompletionValue(node) || node.record.object != nil || node.record.deleted {
			return false
		}
		if node.descriptor.node.Initializer() == nil {
			if before.branch.cursor == ^uint64(0) || row.branch.cursor != before.branch.cursor+1 || row.branch.state.previous != before.branch.state || row.branch.env != before.branch.env {
				return false
			}
		}
		// The actual source lexical mapping belongs to the genuine producer Call.
		h := node.step
		if node.sticky != nil {
			if !selectedContext.done || node.step != nil || node.valueReceipt != nil || !before.value.undefined || before.value != (languageValue{undefined: true}) || node.sticky == node || node.sticky.descriptor == nil || node.sticky.descriptor.index >= index {
				return false
			}
			h = node.sticky.step
		}
		if h == nil || h.entry == nil || h.entry.inputs == nil || h.raw == nil || len(h.raw.alternatives) != 1 || !h.converted || h.completion != languageNormal || h.value.object == nil || h.entry.inputs.bindingSite != &node.descriptor.step && node.sticky == nil || h.entry.inputs.receiver != c.iterator || h.entry.inputs.callee != c.next || len(h.entry.inputs.arguments) != 0 || h.entry.caller != a.branch.env || node.doneReceipt == nil || len(node.doneReceipt.alternatives) != 1 {
			return false
		}
		if _, ok := bindingSourceTarget(node.descriptor, a.branch, h.entry.inputs.lexicals, node.target); !ok {
			return false
		}
		if node.sticky == nil {
			view := row
			context := *row.binding
			context.completed = node.previous
			view.binding = &context
			if !bindingInitializationStep(&context, view) {
				return false
			}
			if row.binding.initialization != nil {
				if _, ok := bindingInitializationRecord(row.binding, row, node.target); !ok {
					return false
				}
			}
			if row.binding.done {
				if node.valueReceipt != nil || before.value != (languageValue{undefined: true}) {
					return false
				}
			} else if node.valueReceipt != node.selected {
				return false
			}
		} else {
			found := false
			previous := node.previous
			for steps := 0; steps < index && previous != nil; steps++ {
				if previous == node.sticky {
					found = true
					break
				}
				previous = previous.previous
			}
			if !found || node.sticky.initialized == nil || len(node.sticky.initialized.alternatives) != 1 || node.sticky.doneReceipt != node.doneReceipt || !node.sticky.initialized.alternatives[0].binding.done {
				return false
			}
		}
		if !sameLanguageFinallyContext(row.finally, a.finally) {
			return false
		}
		node = node.previous
	}
	if node != nil {
		return false
	}
	if count > 0 && c.completed.descriptor == c.currentElement() {
		last := c.completed.initialized.alternatives[0].binding
		if c.step != last.step || c.result != last.result || c.doneKnown != last.doneKnown || c.done != last.done || c.doneReceipt != last.doneReceipt || c.valueReceipt != last.valueReceipt || c.selected != last.selected || c.initialization != last.initialization || c.target != (languageCell{}) && c.target != c.completed.target || c.origin != nil && c.target != c.completed.target {
			return false
		}
	}
	return true
}

// finishBindingElement seals only a successful actual Initialize. It does not
// Park or route. Rotation occurs only after this completed-prefix proof succeeds.
func (o *languageOwner) finishBindingElement(a languageAlternative, r *storageRecipe, pc int, values []languageValue, ready []bool, cells []languageCell) (languageAlternative, int, bool) {
	c := a.binding
	if c == nil || c.plan != r.binding || c.currentElement() == nil || !o.live(a.branch) || a.completion != languageNormal || a.storage != nil || c.origin != nil || c.close != nil || c.returnGet != nil || c.routed {
		return a, 0, false
	}
	d := c.currentElement()
	if pc != d.initialize || pc < 0 || pc >= len(ready) || !ready[pc] || c.selected == nil || len(c.selected.alternatives) != 1 || !c.doneKnown || c.doneReceipt == nil || !completedElements(c, a, c.elementIndex) {
		return a, 0, false
	}
	slot := r.events[pc].cell
	if slot < 0 || slot >= len(cells) {
		return a, 0, false
	}
	var h *languageCallHistory
	var sticky *bindingElementCompletion
	if c.step != nil {
		h = c.step
	} else {
		for n := c.completed; n != nil; n = n.previous {
			if n.step != nil && n.initialized.alternatives[0].binding.done {
				sticky = n
				h = n.step
				break
			}
		}
	}
	if h == nil || h.entry == nil || h.entry.inputs == nil {
		return a, 0, false
	}
	target, ok := bindingSourceTarget(d, a.branch, h.entry.inputs.lexicals, cells[slot])
	if !ok {
		return a, 0, false
	}
	selected := c.selected.alternatives[0]
	if a.value != values[pc] || c.initialization == nil && a.value != selected.value || a.branch.state == nil || a.branch.state.previous == nil {
		return a, 0, false
	}
	// A default keeps the original selection receipt immutable. Its separate
	// pre-Initialize receipt authenticates the actual merged value/paid state.
	var record *languageStorage
	if c.initialization != nil {
		var valid bool
		record, valid = bindingInitializationRecord(c, a, target)
		if !valid {
			return a, 0, false
		}
	} else {
		record = bindingInitializedRecord(a.branch, target, selected.value)
	}
	if record == nil || a.branch.state.storage != record || record.previous != a.branch.state.previous.storage || record.object != nil || record.deleted {
		return a, 0, false
	}
	before := a.branch
	before.state = a.branch.state.previous
	if before.cursor == 0 {
		return a, 0, false
	}
	before.cursor--
	if _, ok := bindingUninitializedTarget(d, before, h.entry.inputs.lexicals, target); !ok {
		return a, 0, false
	}
	if !bindingDescendant(selected.branch, before) || d.node.Initializer() == nil && before != selected.branch {
		return a, 0, false
	}
	if c.step == nil && (sticky == nil || !c.done || c.valueReceipt != nil || selected.value != (languageValue{undefined: true}) || ready[d.step.invoke] || ready[d.doneGet] || ready[d.valueGet]) {
		return a, 0, false
	}
	fee, ok := bindingReceiptCopyCharge(a)
	if !ok || !o.canIssue(1) {
		return a, 0, false
	}
	extraContext := 0
	if c.elementIndex+1 < len(c.plan.elements) {
		extraContext = int(unsafe.Sizeof(languageBindingContext{}))
	}
	bytes, ok := budgetSum(0, int(unsafe.Sizeof(bindingElementCompletion{})), extraContext, 31)
	if !ok {
		return a, 0, false
	}
	fee = estimatedCostSum(fee, bytes/32)
	node := &bindingElementCompletion{previous: c.completed, descriptor: d, step: c.step, doneReceipt: c.doneReceipt, valueReceipt: c.valueReceipt, selected: c.selected, sticky: sticky, target: target, record: record}
	context := *c
	context.completed = node
	a.binding = &context
	receipt := o.receipt(a.branch, []languageAlternative{a})
	if receipt == nil {
		return a, 0, false
	}
	node.initialized = receipt
	if !completedElements(&context, a, c.elementIndex+1) {
		return a, fee, false
	}
	if c.elementIndex+1 < len(c.plan.elements) {
		rotated := context
		rotated.elementIndex++
		rotated.step = nil
		rotated.result = languageValue{}
		rotated.valueReceipt = nil
		rotated.selected = nil
		rotated.initialization = nil
		rotated.target = languageCell{}
		// The sealed row's context is immutable. Only a new current row rotates.
		if !rotated.done {
			rotated.doneKnown = false
			rotated.doneReceipt = nil
		}
		a.binding = &rotated
	}
	return a, fee, true
}

func bindingCompletionValue(n *bindingElementCompletion) languageValue {
	if n == nil || n.selected == nil || len(n.selected.alternatives) != 1 {
		return languageValue{}
	}
	if n.initialized != nil && len(n.initialized.alternatives) == 1 {
		return n.initialized.alternatives[0].value
	}
	return n.selected.alternatives[0].value
}

// The original successful Next Get is retained verbatim. The new acquisition
// seals the actual current row only after a complete source prefix proves it.
func bindingRetainedNextOrigin(a languageAlternative, s *bindingCallSite) *languageCallTargetOrigin {
	c := a.binding
	d := bindingStepDescriptor(s.plan, s)
	if c == nil || d == nil || d.index == 0 || c.plan != s.plan || c.currentElement() != d || c.done || c.step != nil || c.selected != nil || c.origin != nil || c.close != nil || c.returnGet != nil || !completedElements(c, a, d.index) || c.completed == nil || c.completed.step == nil {
		return nil
	}
	h := c.completed.step
	if h.entry == nil || h.entry.inputs == nil || h.entry.acquisition == nil || len(h.entry.acquisition.alternatives) != 1 {
		return nil
	}
	t := h.entry.inputs.targetOrigin
	first := c.plan.elementAt(0)
	if t == nil || t.getterInstall != nil || first == nil || t.recipe != c.plan.recipe || t.referencePC != first.step.member || t.getPC != c.plan.next || t.acquirePC != first.step.acquire || t.reference != c.nextReference || t.value != c.next || t.output != c.nextBranch || !bindingDescendant(t.output, a.branch) || !sameLanguageFinallyContext(h.entry.acquisition.alternatives[0].finally, a.finally) {
		return nil
	}
	return t
}

// This view substitutes only the actual saved parent F that adoption restores.
// Child raw/history and current paid branch remain unchanged.
func bindingCompletedParent(c languageBindingContext, a languageAlternative, parent *languageFinallyContext, count int) bool {
	a.finally = parent
	return completedElements(&c, a, count)
}

// bindingElementInitializeReady validates the actual source boundary before its
// write. Identity and byte-layout headroom cover both Initialize and its seal.
// No credit/token is retained and this predicate issues no identity.
func bindingElementInitializeReady(a languageAlternative, r *storageRecipe, pc int, values []languageValue, ready []bool, cells []languageCell) bool {
	if r == nil {
		return false
	}
	c := a.binding
	if c == nil || c.plan != r.binding || c.currentElement() == nil || !shortCircuitCanonical(a) || !a.branch.owner.live(a.branch) || c.origin != nil || c.close != nil || c.returnGet != nil || c.routed || c.target != (languageCell{}) || c.selected == nil || len(c.selected.alternatives) != 1 || !c.doneKnown || c.doneReceipt == nil || !completedElements(c, a, c.elementIndex) {
		return false
	}
	d := c.currentElement()
	input := bindingInitializeInput(d)
	if pc != d.initialize || pc < 0 || pc >= len(ready) || ready[pc] || input < 0 || input >= len(ready) || input >= len(values) || !ready[input] || values[input] != a.value || !a.branch.owner.canIssue(2) || !a.branch.owner.canAdvance(a.branch, 1) {
		return false
	}
	value := c.selected.alternatives[0].value
	if c.initialization != nil {
		if len(c.initialization.alternatives) != 1 {
			return false
		}
		value = c.initialization.alternatives[0].value
	}
	if value != a.value {
		return false
	}
	if _, known := acquiredBoolean(a.branch, a.value); !known {
		return false
	}
	var h *languageCallHistory
	if c.step != nil {
		if !bindingInitializationStep(c, a) {
			return false
		}
		h = c.step
	} else {
		if !c.done || c.valueReceipt != nil || value != (languageValue{undefined: true}) {
			return false
		}
		for n := c.completed; n != nil; n = n.previous {
			if n.step != nil && n.initialized.alternatives[0].binding.done {
				h = n.step
				break
			}
		}
		if h == nil || ready[d.step.acquire] || ready[d.step.finalize] || ready[d.step.invoke] || ready[d.doneGet] || ready[d.valueGet] {
			return false
		}
	}
	if h.entry == nil || h.entry.inputs == nil {
		return false
	}
	slot := r.events[pc].cell
	if slot < 0 || slot >= len(cells) {
		return false
	}
	if _, ok := bindingUninitializedTarget(d, a.branch, h.entry.inputs.lexicals, cells[slot]); !ok {
		return false
	}
	if _, ok := bindingReceiptCopyCharge(a); !ok {
		return false
	}
	extra := 0
	if d.index+1 < len(c.plan.elements) {
		extra = int(unsafe.Sizeof(languageBindingContext{}))
	}
	_, ok := budgetSum(0, int(unsafe.Sizeof(bindingElementCompletion{})), extra, 31)
	return ok
}

// bindingElementReadHistory keeps the predecessor Next distinct from a later
// completed done/value Getter. This authenticates an existing immutable Get
// observation, not a Call capability, new result, or live receipt projection.
func bindingElementReadHistory(c *languageBindingContext, a languageAlternative) bool {
	if c == nil || c.plan == nil || c.plan.recipe == nil || c.step == nil || c.selected == nil || len(c.selected.alternatives) != 1 {
		return false
	}
	selected := c.selected.alternatives[0]
	if a.callHistory != selected.callHistory {
		return false
	}
	if selected.callHistory == c.step {
		return true
	}
	h := selected.callHistory
	if h == nil || h.entry == nil || h.entry.inputs == nil || h.entry.inputs.targetOrigin == nil || h.entry.acquisition == nil || len(h.entry.acquisition.alternatives) != 1 || h.raw == nil || len(h.raw.alternatives) != 1 || !h.converted || h.completion != languageNormal || h.entry.proof == nil || h.entry.proof.entry == nil || h.entry.proof.source == nil || h.entry.proof.namespace != a.branch.owner || h.entry.proof.generation != a.branch.generation || h.entry.proof.source.AsNode() != c.plan.recipe.body {
		return false
	}
	e, in := h.entry, h.entry.inputs
	t := in.targetOrigin
	d := c.currentElement()
	if d == nil {
		return false
	}
	pc := t.getPC
	role := bindingGetterRole(c.plan.recipe, pc)
	if (role != 1 && role != 2) || c.plan.elementAtPC(pc) != d || t.recipe != c.plan.recipe || t.getterInstall == nil || t.referencePC != c.plan.recipe.events[pc].a || t.acquirePC != -1 || t.input != t.output || in.category != callReferenceTarget || in.valueOrigin != nil || !in.calleeReady || !in.complete || in.bindingSite != nil || in.call != c.plan.declaration || len(in.arguments) != 0 || in.receiver != c.result || in.reference != t.reference || in.reference.receiver != c.result || in.callee != t.getterInstall.descriptor.value || in.callee.callable != e.callable || t.getterInstall.object != c.result.object || t.getterInstall.key != in.reference.key || !getterDescriptorPayload(t.getterInstall.descriptor) || in.reference.id.owner != a.branch.owner || in.reference.id.serial == 0 || h.id.owner != a.branch.owner || h.id.serial == 0 || h.id.serial > a.branch.owner.next {
		return false
	}
	key := languageStringKey("done")
	if role == 2 {
		key = languageStringKey("value")
	}
	if in.reference.key != key {
		return false
	}
	parent := e.acquisition.alternatives[0]
	raw := h.raw.alternatives[0]
	if parent.branch != t.input || !bindingDescendant(parent.branch, selected.branch) || parent.callInputs != in || parent.binding == nil || parent.binding.plan != c.plan || parent.binding.step != c.step || parent.binding.elementIndex != c.elementIndex || parent.binding.completed != c.completed || h.raw.occurrence.owner != a.branch.owner || h.raw.occurrence.serial == 0 || h.raw.occurrence.serial > a.branch.owner.next || e.acquisition.occurrence.owner != a.branch.owner || e.acquisition.occurrence.serial == 0 || e.acquisition.occurrence.serial > a.branch.owner.next || e.boundary.owner != a.branch.owner || e.boundary.serial == 0 || e.boundary.serial > a.branch.owner.next || h.raw.input != e.activation || raw.completion != languageReturn || raw.value != h.value || raw.returnBoundary != e.boundary || !callBodySnapshot(e, raw) || raw.branch.state != h.outward.state || h.outward != selected.branch || raw.branch.env != e.activation.env || selected.branch.env != e.caller || e.caller != a.branch.env || !sameLanguageFinallyContext(parent.finally, selected.finally) {
		return false
	}
	found := false
	for _, observation := range selected.objects {
		if observation.recipe != c.plan.recipe || observation.pc != pc {
			continue
		}
		if found || observation.node != c.plan.declaration || observation.reference != in.reference.id || observation.receipt == nil || observation.receipt.input != t.input || observation.receipt.occurrence.owner != a.branch.owner || observation.receipt.occurrence.serial <= in.reference.id.serial || observation.receipt.occurrence.serial >= c.selected.occurrence.serial || len(observation.receipt.alternatives) != 1 {
			return false
		}
		bare := observation.receipt.alternatives[0]
		if bare.branch != selected.branch || bare.completion != languageNormal || bare.value != h.value || bare.callHistory != h || bare.binding != parent.binding || bare.callInputs != nil || bare.storage != nil || len(bare.objects) != 0 || len(bare.effects) != 0 || len(bare.obligations) != 0 || !sameLanguageFinallyContext(bare.finally, selected.finally) {
			return false
		}
		pre := selected.binding
		if pre == nil {
			return false
		}
		if role == 1 {
			if c.doneReceipt != observation.receipt || pre.doneReceipt != observation.receipt || !pre.doneKnown || parent.binding.doneKnown || parent.binding.doneReceipt != nil || parent.binding.done {
				return false
			}
			projected := *pre
			projected.doneKnown = false
			projected.done = false
			projected.doneReceipt = nil
			if projected != *parent.binding {
				return false
			}
		} else if pre != parent.binding || !pre.doneKnown || pre.done || pre.doneReceipt != c.doneReceipt || selected.value != bare.value {
			return false
		}
		found = true
	}
	return found
}

// siteOrdinal is claim order, distinct from the semantic role shared by every
// Next invocation. The existing Call consumer advances its ordinal once per entry.
func (p *storageBindingRecipe) siteOrdinal(s *bindingCallSite) int {
	if p == nil || s == nil || s.plan != p {
		return -1
	}
	if s == &p.first {
		return 0
	}
	for i := range p.elements {
		if s == &p.elements[i].step {
			return i + 1
		}
	}
	if s == &p.close {
		return len(p.elements) + 1
	}
	return -1
}

// retainedBindingNextAcquisition authenticates a separate paid protocol prefix.
// It does not rebase the saved Get, add arguments, claim entry or issue IDs.
// The ordinary source consumer still owns the exact once-only site ordinal.
func retainedBindingNextAcquisition(o *languageOwner, a languageAlternative, in *languageCallInputs) (languageBranch, bool) {
	if o == nil || !o.live(a.branch) || a.callInputs != in || in == nil || !in.complete || !in.calleeReady || in.category != callReferenceTarget || in.valueOrigin != nil || in.targetOrigin == nil || in.bindingSite == nil || len(in.arguments) != 0 || a.completion != languageNormal || a.value != (languageValue{}) || a.remaining != "" || a.returnBoundary != (languageID{}) || a.pending != languageNormal || a.pendingValue != (languageValue{}) || a.pendingReturnBoundary != (languageID{}) || a.storage != nil {
		return languageBranch{}, false
	}
	c := a.binding
	s := in.bindingSite
	p := s.plan
	d := bindingStepDescriptor(p, s)
	if c == nil || p == nil || p.recipe == nil || !p.valid(p.recipe) || d == nil || d.index <= 0 || c.plan != p || c.currentElement() != d || p.site(s.invoke) != s || p.siteOrdinal(s) != d.index+1 || s.role != 1 || in.call != p.declaration || c.done || c.doneKnown || c.step != nil || c.result != (languageValue{}) || c.doneReceipt != nil || c.valueReceipt != nil || c.selected != nil || c.initialization != nil || c.target != (languageCell{}) || c.origin != nil || c.returnGet != nil || c.close != nil || c.interrupted != nil || c.routed || c.completed == nil || !completedElements(c, a, d.index) {
		return languageBranch{}, false
	}
	source := ast.GetSourceFileOfNode(p.declaration)
	if source == nil || p.recipe.body != source.AsNode() || p.recipe.events[s.finalize].cell != 0 || s.acquire != p.elements[d.index-1].initialize+1 || s.finalize != s.acquire+1 || s.invoke != s.finalize+1 {
		return languageBranch{}, false
	}
	node := c.completed
	if node.descriptor != p.elementAt(d.index-1) || node.initialized == nil || len(node.initialized.alternatives) != 1 || node.step == nil || node.step.entry == nil || node.step.entry.inputs == nil || node.selected == nil || len(node.selected.alternatives) != 1 {
		return languageBranch{}, false
	}
	sealed := node.initialized.alternatives[0]
	if node.initialized.input != sealed.branch || a.branch != sealed.branch || sealed.binding == nil || sealed.binding.completed != node || sealed.binding.elementIndex != d.index-1 || !sealed.binding.doneKnown || sealed.binding.done || a.callHistory != sealed.callHistory || !sameLanguageFinallyContext(a.finally, sealed.finally) || !sameStorageObjectHistory(a.objects, sealed.objects) || !slices.Equal(a.effects, sealed.effects) || !slices.Equal(a.obligations, sealed.obligations) {
		return languageBranch{}, false
	}
	// This comparison models only the already-issued rotation. It never changes
	// the sealed context or supplies a fabricated row to an execution owner.
	stage := *sealed.binding
	stage.elementIndex = d.index
	stage.step = nil
	stage.result = languageValue{}
	stage.doneKnown = false
	stage.doneReceipt = nil
	stage.valueReceipt = nil
	stage.selected = nil
	stage.initialization = nil
	stage.target = languageCell{}
	if *c != stage {
		return languageBranch{}, false
	}
	t := bindingRetainedNextOrigin(a, s)
	if t == nil || t != in.targetOrigin || t.value != in.callee || t.reference != in.reference || in.reference != c.nextReference || in.callee != c.next || in.receiver != c.iterator || in.calleeBranch != c.nextBranch || t.output != c.nextBranch || !o.live(t.input) || !o.live(t.output) || !validCallTarget(o, in) {
		return languageBranch{}, false
	}
	next := c.nextReceipt
	if next == nil || len(next.alternatives) != 1 || next.input != c.nextBranch || next.occurrence.owner != o || next.occurrence.serial <= in.reference.id.serial || next.occurrence.serial > o.next || next.alternatives[0].branch != c.nextBranch || next.alternatives[0].completion != languageNormal || next.alternatives[0].value != c.next {
		return languageBranch{}, false
	}
	oldMap := node.step.entry.inputs.lexicals
	if len(in.lexicals) != p.recipe.locals || len(oldMap) != len(in.lexicals) || len(p.recipe.declarations) != len(in.lexicals) {
		return languageBranch{}, false
	}
	for index, lexical := range in.lexicals {
		if lexical != oldMap[index] || lexical.declaration != p.recipe.declarations[index] || lexical.cell.id.owner != o || lexical.cell.environment != a.branch.env.id {
			return languageBranch{}, false
		}
	}
	for index := d.index; index < len(p.elements); index++ {
		if _, ok := bindingUninitializedTarget(&p.elements[index], a.branch, in.lexicals); !ok {
			return languageBranch{}, false
		}
	}
	return sealed.branch, true
}
