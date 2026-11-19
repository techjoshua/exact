package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// bodyObjectGetPC identifies the sole possible output observation from the
// finalized narrow ordinary body. It examines recipes, never re-proves ASTs.
func bodyObjectGetPC(r *storageRecipe) int {
	if r == nil || !r.callBody || r.prefix || r.finally != nil || r.body == nil || !ast.IsFunctionExpression(r.body) || len(r.events) < 4 {
		return -1
	}
	ret := len(r.events) - 1
	g := r.events[ret].a
	if r.events[ret].kind != "Return" || g != ret-1 || g < 2 || r.events[g].kind != "GetValue" {
		return -1
	}
	m := r.events[g].a
	if m != g-1 || r.events[m].kind != "Member" || r.events[m].node != r.events[g].node || r.events[m].key.kind != languageStringKeyKind {
		return -1
	}
	t := r.events[m].a
	if t != m-1 || r.events[t].kind != "ReadThisValue" {
		return -1
	}
	return g
}

// validBodyGetObjectReturn consumes one actually issued readonly Get. Receipt
// occurrence is the adoption key. The Reference ID is immutable payload, not a
// second identity/key and not permission to re-read a descriptor.
func validBodyGetObjectReturn(e *languageCallEntryInput, row languageAlternative, w *languageCopyWork) bool {
	if w == nil || e == nil || e.proof == nil || row.branch.owner == nil || !row.branch.owner.live(row.branch) || row.value.object == nil || row.value.callable != nil || row.completion != languageReturn || row.returnBoundary != e.boundary || row.storage == nil || row.storage.entry == nil || *row.storage.entry != *e || row.storage.recipe != e.proof.entry || row.storage.childBranch != row.branch {
		return false
	}
	r := e.proof.entry
	g := bodyObjectGetPC(r)
	if g < 0 || row.storage.pc != len(r.events) || len(row.storage.ready) != r.registers || len(row.storage.values) != r.registers || len(row.storage.references) != r.registers {
		return false
	}
	m := r.events[g].a
	t := r.events[m].a
	if !row.storage.ready[g] || !row.storage.ready[m] || !row.storage.ready[t] || row.storage.values[g] != row.value || row.storage.values[t] != e.inputs.receiver {
		return false
	}
	ref := row.storage.references[m]
	if ref.id.owner != row.branch.owner || ref.id.serial == 0 || ref.cell != (languageCell{}) || ref.receiver != e.inputs.receiver || ref.receiver.object == nil || ref.key != r.events[m].key {
		return false
	}
	for i := range row.objects {
		if !w.spend(1) {
			return false
		}
		h := row.objects[i]
		if h.recipe != r || h.pc != g || h.node != r.events[g].node || h.reference != ref.id || h.receipt == nil || h.receipt.occurrence.owner != row.branch.owner || h.receipt.occurrence.serial == 0 || h.receipt.input != row.branch || len(h.receipt.alternatives) != 1 {
			continue
		}
		a := h.receipt.alternatives[0]
		if a.completion != languageNormal || a.value != row.value || a.branch != row.branch || a.returnBoundary != (languageID{}) || a.storage != nil || len(a.objects) != 0 || a.callHistory != nil {
			return false
		}
		return scanOwnedObjectCompletion(e.proof.source, a.branch, row, w)
	}
	return false
}
