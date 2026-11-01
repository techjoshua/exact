package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceArgumentPrefix is issued by admission, before dependencies execute. It
// excludes the future invocation row only, never a descendant or a write row.
// A borrowed query can read the relation but cannot push another interval.
type sourceArgumentPrefix struct {
	active     bool
	dispatcher *sourceNormalDispatcher
	operation  *sourceNormalOperation
	call       *ast.Node
	ordinal    int
	prior      *sourceArgumentPrefix
}

// sourceNormalDispatcher owns stack state for one synchronous normal driver.
// Its lifetime is the driver's try/finally region, never a property-view fact.
type sourceNormalDispatcher struct {
	prefix  *sourceArgumentPrefix
	pending []*sourceNormalOperation
}

func (query *sourceValueQuery) currentArgumentPrefix() *sourceArgumentPrefix {
	if query.inputs != nil && query.inputs.dispatcher != nil && query.inputs.dispatcher.prefix != nil {
		return query.inputs.dispatcher.prefix
	}
	return query.argumentPrefix
}

func (query *sourceValueQuery) pendingInvocationExcluded(node *ast.Node, result *accessorCandidates) bool {
	for prefix := query.currentArgumentPrefix(); prefix != nil; prefix = prefix.prior {
		if !query.charge(result, node) {
			return false
		}
		slot := prefix.operation
		if !prefix.active || prefix.dispatcher == nil || prefix.call != node || slot == nil || !slot.authority.valid(query) || slot.state != sourceOperationPending || slot.selected == nil || slot.entry == nil || slot.entry.node != node || prefix.ordinal != len(slot.actuals) {
			continue
		}
		// The new indexed exclusion is bounded to directly eager module
		// populations. Callable/creator MAY rows retain their existing treatment.
		if slot.entry.region != nil || slot.population == nil || slot.population.entries[node] != slot.entry || slot.population.moduleEntry(node, slot.entry.statement) == nil {
			continue
		}
		view, source := slot.prefixView, slot.prefixSource
		if view == nil || source == nil || view.state == sourcePropertyDisposed || view.owner != query.owner || view.program != query.owner.program || view.checker != query.owner.checker || view.generation != query.owner.generation || view.executable != query.executable || view.frame == nil || view.frame.properties != view || view.root != view.frame.declaration || source.cyclic || view.normalSources[source.source] != source || source.domains[slot.prefixRoot] != slot.population {
			continue
		}
		return true
	}
	return false
}

func releaseNormalDispatcher(inputs *sourceValueInputs) {
	if inputs == nil || inputs.dispatcher == nil {
		return
	}
	for prefix := inputs.dispatcher.prefix; prefix != nil; prefix = prefix.prior {
		if prefix.dispatcher == inputs.dispatcher {
			prefix.active = false
		}
	}
	inputs.dispatcher.prefix = nil
	inputs.dispatcher.pending = nil
	inputs.dispatcher = nil
}

// normalWork bounds fresh callback queries by every admitted enclosing operation.
// A nested wrapper pays only ledgers not already owned by an outer interval.
// Defers debit actual work on all exits, including refusal and panic unwinding.
func (query *sourceValueQuery) normalWork(result *accessorCandidates, node *ast.Node) func() {
	var candidates []*sourceNormalOperation
	if query.inputs != nil && query.inputs.dispatcher != nil {
		candidates = append(candidates, query.inputs.dispatcher.pending...)
	}
	for prefix := query.currentArgumentPrefix(); prefix != nil; prefix = prefix.prior {
		candidates = append(candidates, prefix.operation)
	}
	var ledgers []*sourceNormalOperation
	priorLedgers := query.workLedgers
	if query.workLedgers == nil {
		query.workLedgers = make(map[*sourceNormalOperation]bool)
	}
	for _, slot := range candidates {
		if slot == nil || query.workLedgers[slot] {
			continue
		}
		query.workLedgers[slot] = true
		ledgers = append(ledgers, slot)
		if slot.remaining < query.remaining {
			query.remaining = slot.remaining
		}
	}
	before := query.remaining
	for range ledgers {
		if !query.charge(result, node) {
			break
		}
	}
	return func() {
		spent := before - query.remaining
		if spent < 0 {
			spent = before
			recordCandidateLocalCause(result, node, "normal work negative spent")
			result.ownedLocalCauses = append(result.ownedLocalCauses, "normal work negative spent")
			result.opaque = true
		}
		for _, slot := range ledgers {
			delete(query.workLedgers, slot)
			slot.remaining -= spent

		}
		if priorLedgers == nil && len(query.workLedgers) == 0 {
			query.workLedgers = nil
		}
	}
}

// finishNormalPending releases the dispatcher's own ledger at the occurrence's
// terminal invocation event, including a bypass/refusal with no body entry.
func finishNormalPending(inputs *sourceValueInputs, slot *sourceNormalOperation) {
	if inputs == nil || inputs.dispatcher == nil || slot == nil {
		return
	}
	dispatcher := inputs.dispatcher
	if len(dispatcher.pending) > 0 && dispatcher.pending[len(dispatcher.pending)-1] == slot {
		dispatcher.pending = dispatcher.pending[:len(dispatcher.pending)-1]
	}
}
