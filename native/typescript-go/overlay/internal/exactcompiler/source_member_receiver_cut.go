package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// memberReceiverCutsCorrespond relates two explicit domains of the same issued
// lexical Get. The parent/read cut is physical. A definition-relative function
// query has no invocation use; that nil never matches another operation or
// initializing/returning/invoking context. Neither cut is changed by this law.
// Live issuance/current DATA still belong to their original query/work owners.
func memberReceiverCutsCorrespond(parent sourceStagedOperationRequest, query, physical sourceRelativeCut) bool {
	p := parent.producer.operation
	if !validStagedMemberParent(parent) || parent.producer.selector != (sourceStagedOperationSelector{}) || p == nil || !ast.IsPropertyAccessExpression(p) || physical != parent.cut || query.operation != physical.operation || query.reading != physical.reading || query.initializing != physical.initializing || query.returning != physical.returning || query.invoking != physical.invoking {
		return false
	}
	if ast.IsFunctionLike(parent.consumer) {
		return query.use == nil && physical.use == p
	}
	return query == physical
}

// descriptorRecordReadingOwned preserves exact registered local readers before
// trying the new physical-reader bridge. The old branch can retain local source
// contributions even when no original Get continuation can complete. It neither
// registers another reader nor recertifies a semantic reader as a physical one.
// Both branches still need their caller's current native/input/APPLIED payload.
func (work *callableEffectWork) descriptorRecordReadingOwned(view sourceNativeDescriptorView, parent sourceStagedOperationRequest, query sourceRelativeCut) bool {
	if validStagedMemberParent(parent) && validStagedMemberObservation(parent, query) && work.stagedMemberResultReading(view.delivery, parent, query) {
		return true
	}
	return query != parent.cut && memberReceiverCutsCorrespond(parent, query, parent.cut) && work.stagedMemberResultReading(view.delivery, parent, parent.cut)
}
