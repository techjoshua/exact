package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourcePendingCallee names unavailable output while one original Call acquires
// its callee and receiver. Syntax inputs and creator endpoints are snapshots,
// not activation identities or completed results. Normal/runtime carriers and
// source captures cannot use this negative availability relation. Source
// rest/copied containers retain their exact contents.
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
	rest      [][]sourceCalleeTerm
	copied    map[string][]sourceCalleeTerm
}

type sourceCalleeCreator struct {
	body     *ast.Node
	creation sourceValueCreation
}

// calleeSyntaxCarrier declines captured, adapted and normal terms. Rest/copied
// contents need their own finite source-description snapshot before comparison.
func calleeSyntaxCarrier(value sourceValue) bool {
	return value.capture == nil && value.instance == nil && value.number == (numberPayload{}) &&
		value.ownedGetRow == nil && value.initializerUse == nil && value.adapter == nil &&
		value.acquired == nil && value.entrySlot == nil && value.bound == nil && value.normal == nil &&
		len(value.forwarded) == 0 && value.awaited == nil && value.native == nil
}

// sourceCalleeAncestor refuses repeated container-origin shapes conservatively,
// including some finite descriptions. It proves no graph equivalence. Pointer
// allocation identities, finite body-entry joins and depth limits are not keys.
type sourceCalleeAncestor struct {
	node         *ast.Node
	rest, copied bool
	prior        *sourceCalleeAncestor
}

// snapshotCalleeTerms copies source containers, preserving absent versus present
// empty vectors/maps and every ordered alternative. No live container survives
// in a pending record. Unsupported or cyclic descriptions publish no snapshot.
func (query *sourceValueQuery) snapshotCalleeTerms(values []sourceValue, ancestors *sourceCalleeAncestor) ([]sourceCalleeTerm, bool) {
	if values == nil {
		return nil, true
	}
	terms := make([]sourceCalleeTerm, len(values))
	for i, value := range values {
		query.recordEstimatedCost(1 + len(value.path))
		if !calleeSyntaxCarrier(value) {
			return nil, false
		}
		parent := ancestors
		if len(value.rest) > 0 || len(value.copied) > 0 {
			for ancestor := ancestors; ancestor != nil; ancestor = ancestor.prior {
				query.recordEstimatedCost(1)
				if ancestor.node == value.node && ancestor.rest == (value.rest != nil) && ancestor.copied == (value.copied != nil) {
					return nil, false
				}
			}
			parent = &sourceCalleeAncestor{node: value.node, rest: value.rest != nil, copied: value.copied != nil, prior: ancestors}
		}
		term := sourceCalleeTerm{node: value.node, path: append([]string(nil), value.path...), undefined: value.undefined}
		if value.rest != nil {
			term.rest = make([][]sourceCalleeTerm, len(value.rest))
			for slot, alternatives := range value.rest {
				query.recordEstimatedCost(1)
				copied, ok := query.snapshotCalleeTerms(alternatives, parent)
				if !ok {
					return nil, false
				}
				term.rest[slot] = copied
			}
		}
		if value.copied != nil {
			term.copied = make(map[string][]sourceCalleeTerm, len(value.copied))
			for key, alternatives := range value.copied {
				query.recordEstimatedCost(1)
				copied, ok := query.snapshotCalleeTerms(alternatives, parent)
				if !ok {
					return nil, false
				}
				term.copied[key] = copied
			}
		}
		terms[i] = term
	}
	return terms, true
}

// matchCalleeTerms follows only a previously finite immutable description. A
// cyclic current carrier cannot match a finite leaf. Keys, slots and alternatives
// must all match by contents, never by container allocation identity.
func (query *sourceValueQuery) matchCalleeTerms(previous []sourceCalleeTerm, values []sourceValue) bool {
	if (previous == nil) != (values == nil) || len(previous) != len(values) {
		return false
	}
	for i, term := range previous {
		query.recordEstimatedCost(1)
		value := values[i]
		if !calleeSyntaxCarrier(value) || term.node != value.node || term.undefined != value.undefined || len(term.path) != len(value.path) ||
			(term.rest == nil) != (value.rest == nil) || (term.copied == nil) != (value.copied == nil) || len(term.rest) != len(value.rest) || len(term.copied) != len(value.copied) {
			return false
		}
		for j, key := range term.path {
			query.recordEstimatedCost(1)
			if key != value.path[j] {
				return false
			}
		}
		// Validate this node's entire container boundary before descending into
		// any child. Current extra keys/slots/alternatives cannot hide a cycle.
		for slot, alternatives := range term.rest {
			query.recordEstimatedCost(1)
			current := value.rest[slot]
			if (alternatives == nil) != (current == nil) || len(alternatives) != len(current) {
				return false
			}
		}
		for key, alternatives := range term.copied {
			query.recordEstimatedCost(1)
			current, present := value.copied[key]
			if !present || (alternatives == nil) != (current == nil) || len(alternatives) != len(current) {
				return false
			}
		}
		for slot, alternatives := range term.rest {
			query.recordEstimatedCost(1)
			if !query.matchCalleeTerms(alternatives, value.rest[slot]) {
				return false
			}
		}
		for key, alternatives := range term.copied {
			query.recordEstimatedCost(1)
			current, present := value.copied[key]
			if !present || !query.matchCalleeTerms(alternatives, current) {
				return false
			}
		}
	}
	return true
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
	pending := sourcePendingCallee{owner: query, call: call, prior: query.pendingCallee, cuts: query.calleeAcquisitionCuts()}
	for symbol, values := range bindings {
		query.recordEstimatedCost(1)
		terms, ok := query.snapshotCalleeTerms(values, nil)
		if !ok {
			return nil
		}
		pending.bindings = append(pending.bindings, sourceCalleeBinding{symbol: symbol, values: terms})
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
			if !present || !query.matchCalleeTerms(binding.values, values) {
				same = false
				break
			}
		}
		if same {
			return true
		}
	}
	return false
}
