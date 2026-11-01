package exactcompiler

// choiceInheritedCutReserve covers only already-owned input populations. The
// emitted recipe's own buffers/choice capacity retain their existing setup
// owner. Immutable Call/finally receipts and parent links are shared, not cloned.
// The reserve is held out of event fuel before allocation, and charged only if
// an unpaid early-cut route actually copies that inherited input. An event that
// already paid its normal defensive copies does not also spend this credit.
func choiceInheritedCutReserve(r *storageRecipe, a languageAlternative, limit int) (int, bool) {
	if r == nil {
		return 0, false
	}
	if r.choiceSlots == 0 {
		return 0, true
	}
	if a.storage == nil && a.callInputs == nil && len(a.objects) == 0 && len(a.effects) == 0 && len(a.obligations) == 0 {
		return 0, true
	}
	return storageEventCopyCharge(a, a.callInputs, limit)
}
