package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourcePendingCallee names unavailable output while one original Call acquires
// its callee and receiver. Syntax inputs and creator endpoints are snapshots,
// not activation identities or completed results. Normal inputs and richer source
// carriers cannot use this negative availability relation.
type sourcePendingCallee struct {
	owner    *sourceValueQuery
	call     *ast.Node
	prior    *sourcePendingCallee
	cuts     [4]*ast.Node
	bindings []sourceCalleeBinding
	creators []sourceCalleeCreator
}

type sourceCalleeBinding struct {
	symbol ast.SymbolId
	values []sourceCalleeTerm
}

type sourceCalleeTerm struct {
	node      *ast.Node
	path      []string
	undefined bool
}

type sourceCalleeCreator struct {
	body     *ast.Node
	creation sourceValueCreation
}

// calleeSyntaxTerm deliberately declines captured, adapted, normal and container
// terms. Their absence is not a proof about their values. A new supported source
// carrier needs its own exact comparison before it can withhold pending output.
func calleeSyntaxTerm(value sourceValue) bool {
	return value.capture == nil && value.instance == nil && value.number == (numberPayload{}) &&
		value.ownedGetRow == nil && value.initializerUse == nil && value.adapter == nil &&
		value.acquired == nil && value.entrySlot == nil && value.bound == nil && value.normal == nil &&
		len(value.forwarded) == 0 && value.awaited == nil && value.native == nil && value.rest == nil && value.copied == nil
}

func (query *sourceValueQuery) calleeAcquisitionCuts() [4]*ast.Node {
	return [4]*ast.Node{query.reading, query.initializing, query.returning, query.invoking}
}

// beginCalleeAcquisition ends before invocation input/default/body dispatch.
// The complete selection interval includes the final receiver-origin lookup,
// which can demand the same still-unavailable Call through a descriptor writer.
// No scope/map allocation identity participates in the source-content match.
// Snapshot and comparison scans update advisory cost without limiting analysis.
func (query *sourceValueQuery) beginCalleeAcquisition(call *ast.Node, bindings sourceValueBindings) func() {
	if !query.dependenciesOnly || query.inputs != nil {
		return nil
	}
	query.recordEstimatedCost(1)
	for _, values := range bindings {
		query.recordEstimatedCost(1)
		for _, value := range values {
			query.recordEstimatedCost(1)
			if !calleeSyntaxTerm(value) {
				return nil
			}
		}
	}
	pending := sourcePendingCallee{owner: query, call: call, prior: query.pendingCallee, cuts: query.calleeAcquisitionCuts()}
	for symbol, values := range bindings {
		query.recordEstimatedCost(1)
		binding := sourceCalleeBinding{symbol: symbol, values: make([]sourceCalleeTerm, len(values))}
		for i, value := range values {
			query.recordEstimatedCost(1 + len(value.path))
			binding.values[i] = sourceCalleeTerm{node: value.node, path: append([]string(nil), value.path...), undefined: value.undefined}
		}
		pending.bindings = append(pending.bindings, binding)
	}
	for body, creation := range query.creators {
		query.recordEstimatedCost(1)
		pending.creators = append(pending.creators, sourceCalleeCreator{body: body, creation: creation})
	}
	query.pendingCallee = &pending
	return func() {
		query.pendingCallee = pending.prior
		pending = sourcePendingCallee{}
	}
}

// pendingCalleeOutput withholds only this pending selection's own source return.
// Changed source inputs, creator routes or read cuts retain the existing route.
// Query copies and expired borrows cannot inherit the issuing query's interval.
// Refusal publishes neither normal output nor Call/Get/NoWrites authority.
func (query *sourceValueQuery) pendingCalleeOutput(call *ast.Node, bindings sourceValueBindings) bool {
	if !query.dependenciesOnly || query.inputs != nil {
		return false
	}
	query.recordEstimatedCost(1)
	for pending := query.pendingCallee; pending != nil; pending = pending.prior {
		query.recordEstimatedCost(1)
		if pending.owner != query || pending.call != call || pending.cuts != query.calleeAcquisitionCuts() ||
			len(pending.bindings) != len(bindings) || len(pending.creators) != len(query.creators) {
			continue
		}
		same := true
		for _, creator := range pending.creators {
			query.recordEstimatedCost(1)
			current, present := query.creators[creator.body]
			same = same && present && current == creator.creation
		}
		for _, binding := range pending.bindings {
			query.recordEstimatedCost(1)
			values, present := bindings[binding.symbol]
			if !present || len(values) != len(binding.values) {
				same = false
				break
			}
			for i, previous := range binding.values {
				query.recordEstimatedCost(1)
				value := values[i]
				if !calleeSyntaxTerm(value) || previous.node != value.node || previous.undefined != value.undefined || len(previous.path) != len(value.path) {
					same = false
					break
				}
				for j, key := range previous.path {
					query.recordEstimatedCost(1)
					same = same && key == value.path[j]
				}
			}
		}
		if same {
			return true
		}
	}
	return false
}
