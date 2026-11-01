package exactcompiler

// closedPrefixSlotView lends owned callee and positional views to the actual
// normal callbacks. It is frame-local and is dropped at release. SourceNormal
// actuals are never populated with synthetic ASTs or interpreted source values.
type closedPrefixSlotView struct {
	occurrence       languageID
	result           *languageReceipt
	acquisition      languageID
	callee, receiver languageValue
	calleeReady      bool
	arguments        []languageCallArgument
	reason           string
}

// projectClosedPrefixPhase only copies authenticated live history. Missing
// inputs stay residual. Neither a later phase nor a released frame can acquire
// another callee, evaluate an argument or reopen semantic execution.
func (q *sourceValueQuery) projectClosedPrefixPhase(phase sourceNormalPhase, slot *sourceNormalOperation, h *closedPrefixHistory) {
	if slot == nil || slot.closedPrefix != h || q.inputs == nil || q.inputs.operationLifetime == nil || q.inputs.operations[phase.node] != slot || !slot.authority.valid(q) {
		return
	}
	receipt := h.receipt
	if _, _, array := sourceArrayInitializerCallLayout(h.recipe); array {
		// Array completion/Cell initialization is not this nested Call's Return.
		// The live original slot borrows only its immutable pre-container receipt.
		receipt = nil
		if phase.node == h.call && len(h.callReceipts) == 1 {
			receipt = h.callReceipts[0]
		}
	}
	if len(h.recipe.callSites) == 2 {
		receipt = nil
		for i, site := range h.recipe.callSites {
			if site.call == phase.node && i < len(h.callReceipts) {
				receipt = h.callReceipts[i]
			}
		}
	}
	if receipt == nil {
		slot.closedView = &closedPrefixSlotView{reason: h.reason}
		return
	}
	// The receipt association is immutable. Borrow its scalar/header fields
	// after lifetime checks instead of deep-copying formal snapshots at every
	// argument phase. Positional views alone are copied into the live frame.
	owner := receipt.input.owner
	if owner == nil || !owner.live(receipt.input) || len(receipt.alternatives) != 1 || !owner.live(receipt.alternatives[0].branch) || receipt.alternatives[0].callInputs == nil {
		slot.closedView = &closedPrefixSlotView{reason: "closed prefix history unavailable"}
		return
	}
	row := receipt.alternatives[0]
	inputs := row.callInputs
	if slot.closedView == nil {
		slot.closedView = &closedPrefixSlotView{occurrence: receipt.occurrence, reason: h.reason}
	}
	view := slot.closedView
	view.result = receipt
	if row.callHistory != nil && row.callHistory.entry != nil {
		view.acquisition = row.callHistory.entry.acquisition.occurrence
	}
	if view.occurrence != receipt.occurrence {
		return
	}
	if phase.role == sourceNormalSelect {
		view.callee, view.receiver, view.calleeReady = inputs.callee, inputs.receiver, inputs.calleeReady
	}
	if phase.role == sourceNormalArgumentEnd && phase.ordinal >= 0 && phase.ordinal < len(inputs.arguments) {
		if phase.ordinal == len(view.arguments) {
			view.arguments = append(view.arguments, inputs.arguments[phase.ordinal])
		}
	}
}
