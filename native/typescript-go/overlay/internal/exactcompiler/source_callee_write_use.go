package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceCalleeWriteBorrow associates a source use with an existing negative
// availability interval. It neither extends that interval nor supplies output,
// equality or a write verdict. Its scope remains owned by the original header.
type sourceCalleeWriteBorrow struct {
	owner  *sourceValueQuery
	header *sourcePendingCallee
	call   *ast.Node
	cuts   [4]*ast.Node
}

type sourceCalleeWriteUse struct {
	borrow sourceCalleeWriteBorrow
	prior  *sourceCalleeWriteUse
}

// calleeWriteBorrow issues before the existing receiver acquisition changes
// cuts. The canonical comparator is used only for negative availability scope
// admission. A nonmatching context acquires no borrowed association.
func (query *sourceValueQuery) calleeWriteBorrow(call *ast.Node, bindings sourceValueBindings) sourceCalleeWriteBorrow {
	if !query.definitionWriteInventoryContext() {
		return sourceCalleeWriteBorrow{}
	}
	for pending := query.pendingCallee; pending != nil; pending = pending.prior {
		query.recordEstimatedCost(1)
		if pending.owner != query || pending.call != call || pending.cuts != query.calleeAcquisitionCuts() {
			continue
		}
		if query.calleeScopeBoundary(pending.sourceCalleeScope, bindings, query.creators) && query.matchCalleeScopeBindings(pending.sourceCalleeScope, bindings) {
			return sourceCalleeWriteBorrow{owner: query, header: pending, call: call, cuts: pending.cuts}
		}
	}
	return sourceCalleeWriteBorrow{}
}

func (borrow sourceCalleeWriteBorrow) live(query *sourceValueQuery) bool {
	if query == nil || !query.dependenciesOnly {
		return false
	}
	query.recordEstimatedCost(1)
	if borrow.owner != query || borrow.header == nil || borrow.header.owner != query || borrow.header.call != borrow.call || borrow.header.cuts != borrow.cuts {
		return false
	}
	for pending := query.pendingCallee; pending != nil; pending = pending.prior {
		query.recordEstimatedCost(1)
		if pending == borrow.header {
			return true
		}
	}
	return false
}

// calleeWriteBorrows retains only associations issued in their original cuts.
// Missing or expired intervals refuse consumption. No header is reconstructed.
func (query *sourceValueQuery) calleeWriteBorrows() ([]sourceCalleeWriteBorrow, bool) {
	var borrows []sourceCalleeWriteBorrow
	for pending := query.pendingCallee; pending != nil; pending = pending.prior {
		query.recordEstimatedCost(1)
		found := false
		for use := query.calleeWriteUse; use != nil; use = use.prior {
			query.recordEstimatedCost(1)
			if use.borrow.header == pending && use.borrow.live(query) {
				borrows = append(borrows, use.borrow)
				found = true
				break
			}
		}
		if !found {
			return nil, false
		}
	}
	return borrows, true
}

// live checks capabilities at consumption, rather than treating the inventory's
// earlier support classification as a permission that survives interval release.
func (demand sourceMemberWriteDemand) live(query *sourceValueQuery) bool {
	if !demand.supported || demand.issuer != query || !query.definitionWriteInventoryContext() {
		return false
	}
	for _, borrow := range demand.borrows {
		query.recordEstimatedCost(1)
		if !borrow.live(query) {
			return false
		}
	}
	return true
}
