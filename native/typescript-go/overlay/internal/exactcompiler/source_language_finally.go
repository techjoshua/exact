package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// storageFinallyRecipe names two abrupt-aware positions in the common loop.
// Source admission has one terminal family. Parent links support immutable
// constructor composition, not nested source grammar or a universal handler.
type storageFinallyRecipe struct {
	node        *ast.Node
	park, route int
}

func (f *storageFinallyRecipe) valid(r *storageRecipe) bool {
	return f != nil && r != nil && r.callBody && !r.prefix && f.park > 0 && f.route > f.park && f.route == len(r.events)-1 && f.park < len(r.events) && r.events[f.park].kind == "FinallyPark" && r.events[f.route].kind == "FinallyRoute" && (r.events[f.park-1].kind == "Return" || r.events[f.park-1].kind == "Throw")
}

// languageFinallyContext selects a correlated immutable receipt row. Parent is
// an existing enclosing association, never an origin state to roll back to.
// No globally issued pending identity or recursive defensive clone is needed.
type languageFinallyContext struct {
	origin            *languageReceipt
	selected          int
	parent            *languageFinallyContext
	finalizer         *languageReceipt
	finalizerSelected int
	routed            bool
}

// Pending identity is the selected immutable receipt row and parent association.
// Struct copies are equivalent. Equal values from other rows are not equivalent.
func sameFinallyPending(a, b *languageFinallyContext) bool {
	return a != nil && b != nil && a.origin == b.origin && a.selected == b.selected && a.parent == b.parent
}
func sameLanguageFinallyContext(a, b *languageFinallyContext) bool {
	return a == nil && b == nil || a != nil && b != nil && *a == *b
}
func finallyChildOf(child, parent *languageFinallyContext) bool {
	return child != nil && (!child.routed && sameFinallyPending(child, parent) || child.routed && sameFinallyPending(child.parent, parent))
}
func finallyCompletionValid(a languageAlternative, e *languageCallEntryInput, normal bool) bool {
	if e == nil || a.remaining != "" || a.pending != languageNormal || a.pendingValue != (languageValue{}) || a.pendingReturnBoundary != (languageID{}) {
		return false
	}
	if a.completion == languageReturn {
		return a.returnBoundary == e.boundary && a.returnBoundary.serial != 0
	}
	return (a.completion == languageThrow || normal && a.completion == languageNormal) && a.returnBoundary == (languageID{})
}
func (f *languageFinallyContext) pendingRow(o *languageOwner, b languageBranch, e *languageCallEntryInput) (languageAlternative, bool) {
	if f == nil || o == nil || e == nil || !e.valid(o, e.activation) || f.origin == nil || f.origin.occurrence.owner != o || f.origin.occurrence.serial == 0 || f.origin.occurrence.serial > o.next || f.origin.input != e.activation || !o.live(f.origin.input) || !o.live(b) || f.selected < 0 || f.selected >= len(f.origin.alternatives) {
		return languageAlternative{}, false
	}
	row := f.origin.alternatives[f.selected]
	if !o.live(row.branch) || row.branch.env != b.env || row.branch.guard != b.guard || row.branch.generation != b.generation || row.storage == nil || row.storage.entry == nil || *row.storage.entry != *e || row.storage.childBranch != row.branch || row.storage.recipe != e.callable.proof.entry || row.finally != f.parent || row.storage.finally != f.parent || !finallyCompletionValid(row, e, false) {
		return languageAlternative{}, false
	}
	if row.completion == languageReturn {
		return row, row.returnBoundary == e.boundary && row.returnBoundary.serial != 0
	}
	return row, row.completion == languageThrow && row.returnBoundary == (languageID{})
}

// finallyCopyReserve is added once to Call's pre-activation fixed reservation.
// Two extra receipt snapshots copy 3R+N operand/cell vectors and two acquired
// headers each. Eight passes plus fixed headers conservatively cover parking,
// finalizer sealing, routed/cut snapshots and parent-reference transport. Parent
// chains and immutable histories are shared, never traversed or cloned here.
func finallyCopyReserve(r *storageRecipe, a languageAlternative, inputs *languageCallInputs, limit int) (int, bool) {
	if r == nil {
		return 0, false
	}
	if r.finally == nil {
		return 0, true
	}
	if inputs == nil {
		return 0, false
	}
	regs, ok := budgetProduct(limit, 3, r.registers)
	if !ok {
		return 0, false
	}
	headers, ok := budgetSum(limit, len(inputs.arguments), len(inputs.lexicals))
	if !ok {
		return 0, false
	}
	headers, ok = budgetProduct(limit, 2, headers)
	if !ok {
		return 0, false
	}
	size, ok := budgetSum(limit, regs, r.locals, headers, len(a.objects), len(a.effects), len(a.obligations), 4)
	if !ok {
		return 0, false
	}
	return budgetProduct(limit, 8, size)
}
func finallyDispatchable(r *storageRecipe, pc int, a languageAlternative) bool {
	if r == nil || r.finally == nil || pc < 0 || pc >= len(r.events) || a.completion == languageResidual {
		return false
	}
	return (pc == r.finally.park || pc == r.finally.route) && (a.completion == languageReturn || a.completion == languageThrow)
}

// parkFinally is called only behind the paid Call entry reservation. It freezes
// the exact selected row without normalizing Return or rereading its operand.
func (o *languageOwner) parkFinally(a languageAlternative, e *languageCallEntryInput, parent *languageFinallyContext) (*languageFinallyContext, bool) {
	if o == nil || e == nil || !e.valid(o, e.activation) || !finallyCompletionValid(a, e, false) || !o.live(a.branch) || a.storage == nil || len(a.storage.choices) != 0 || a.storage.entry == nil || *a.storage.entry != *e || a.storage.childBranch != a.branch || a.storage.recipe != e.callable.proof.entry || a.finally != parent || a.storage.finally != parent || a.completion != languageReturn && a.completion != languageThrow || a.completion == languageReturn && a.returnBoundary != e.boundary || a.completion == languageThrow && a.returnBoundary != (languageID{}) {
		return nil, false
	}
	if parent != nil {
		if _, ok := parent.pendingRow(o, a.branch, e); !ok || parent.finalizer != nil {
			return nil, false
		}
	}
	origin := o.receipt(e.activation, []languageAlternative{a})
	return &languageFinallyContext{origin: origin, parent: parent}, true
}

// finalizerCompletedNormally erases only this family's unobserved Normal
// finalizer payload. The selected pending completion is restored atomically on
// the latest child's branch. Origin branch is never restored.
func finalizerCompletedNormally(current, pending languageAlternative) languageAlternative {
	current.completion, current.value, current.returnBoundary = pending.completion, pending.value, pending.returnBoundary
	return current
}

// completedFinalizerReceipt seals the actual selected completed child row.
// It is called only at routing or a route-PC cut, behind the existing prepaid
// two-receipt bound. Repeated use reuses that immutable association. No payload
// or producer tag is reconstructed from registers, PC or expected boundary.
func (o *languageOwner) completedFinalizerReceipt(a languageAlternative, f *languageFinallyContext, e *languageCallEntryInput) (*languageReceipt, int, bool) {
	pending, ok := f.pendingRow(o, a.branch, e)
	if !ok || f.routed || !finallyChildOf(a.finally, f) || !finallyCompletionValid(a, e, true) || a.storage == nil || len(a.storage.choices) != 0 || a.storage.entry == nil || *a.storage.entry != *e || a.storage.childBranch != a.branch || a.storage.recipe != e.callable.proof.entry || a.completion != languageNormal && a.completion != languageReturn && a.completion != languageThrow || a.completion == languageReturn && a.returnBoundary != e.boundary || a.completion != languageReturn && a.returnBoundary != (languageID{}) {
		return nil, 0, false
	}
	if f.finalizer != nil {
		if f.finalizerSelected < 0 || f.finalizerSelected >= len(f.finalizer.alternatives) {
			return nil, 0, false
		}
		row := f.finalizer.alternatives[f.finalizerSelected]
		if row.branch != a.branch || row.completion != a.completion || row.value != a.value || row.returnBoundary != a.returnBoundary || !finallyChildOf(row.finally, f) {
			return nil, 0, false
		}
		return f.finalizer, f.finalizerSelected, true
	}
	return o.receipt(pending.branch, []languageAlternative{a}), 0, true
}

func (o *languageOwner) routeFinally(a languageAlternative, f *languageFinallyContext, e *languageCallEntryInput) languageAlternative {
	receipt, selected, ok := o.completedFinalizerReceipt(a, f, e)
	if !ok {
		return o.finallyCut(a, f, e, "Finally route association")
	}
	pending, _ := f.pendingRow(o, a.branch, e)
	done := *f
	done.finalizer, done.finalizerSelected, done.routed = receipt, selected, true
	if a.completion == languageNormal {
		a = finalizerCompletedNormally(a, pending)
	}
	a.finally = &done
	return a
}

// completeFor authenticates the selected routed result, not just a context
// pointer. It does not normalize Return. The enclosing Call still owns that.
func (f *languageFinallyContext) completeFor(e *languageCallEntryInput, a languageAlternative) bool {
	if e == nil || f == nil || !f.routed || f.finalizer == nil || f.finalizerSelected < 0 || f.finalizerSelected >= len(f.finalizer.alternatives) {
		return false
	}
	pending, ok := f.pendingRow(e.boundary.owner, a.branch, e)
	if !ok {
		return false
	}
	final := f.finalizer.alternatives[f.finalizerSelected]
	if f.finalizer.occurrence.owner != e.boundary.owner || f.finalizer.occurrence.serial == 0 || !e.boundary.owner.live(f.finalizer.input) || f.finalizer.input != pending.branch || final.branch != a.branch || !finallyChildOf(final.finally, f) {
		return false
	}
	selected := final
	if final.completion == languageNormal {
		selected = finalizerCompletedNormally(final, pending)
	}
	return (selected.completion == languageReturn || selected.completion == languageThrow) && a.completion == selected.completion && a.value == selected.value && a.returnBoundary == selected.returnBoundary
}

// retainFinallyPending transports an already reported child refusal at the
// common post-step call site. It introduces no reason or contribution. The
// selected pending association is retained independently of obligation text.
func (o *languageOwner) retainFinallyPending(a languageAlternative, f *languageFinallyContext, e *languageCallEntryInput) languageAlternative {
	if f == nil && (a.completion == languageReturn || a.completion == languageThrow) {
		f, _ = o.parkFinally(a, e, nil)
	}
	if row, ok := f.pendingRow(o, a.branch, e); ok {
		a.pending, a.pendingValue, a.pendingReturnBoundary = row.completion, row.value, row.returnBoundary
	}
	a.finally = f
	return a
}

// finallyCut introduces a new precision cut. Coincident obligation text stays
// distinct. The post-step child-refusal path calls retainFinallyPending instead
// because sequence has already adopted that child's reported obligation.
func (o *languageOwner) finallyCut(a languageAlternative, f *languageFinallyContext, e *languageCallEntryInput, reason string) languageAlternative {
	if f != nil && !f.routed && a.completion != languageResidual && a.storage != nil && a.storage.recipe != nil && a.storage.recipe.finally != nil && a.storage.pc == a.storage.recipe.finally.route {
		if receipt, selected, ok := o.completedFinalizerReceipt(a, f, e); ok && f.finalizer == nil {
			sealed := *f
			sealed.finalizer, sealed.finalizerSelected = receipt, selected
			f = &sealed
		}
	}
	a = o.retainFinallyPending(a, f, e)
	a.completion = languageResidual
	a.returnBoundary = languageID{}
	a.value = languageValue{}
	a.remaining = reason
	a.obligations = append(a.obligations, reason)
	return a
}
