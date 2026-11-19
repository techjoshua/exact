package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourcePendingCallee names unavailable output while one original Call acquires
// its callee and receiver. Syntax inputs and creator endpoints are snapshots,
// not activation identities or completed results. Source descriptions retain
// exact rest/copied and acyclic capture contents.
// Normal/runtime carriers cannot use this negative availability relation.
type sourcePendingCallee struct {
	owner *sourceValueQuery
	call  *ast.Node
	prior *sourcePendingCallee
	cuts  [4]*ast.Node
	sourceCalleeScope
}

type sourceCalleeScope struct {
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
	capture   *sourceCalleeScope
}

type sourceCalleeCreator struct {
	body     *ast.Node
	creation sourceValueCreation
}

// calleeSyntaxCarrier declines adapted and normal terms. Source capture and
// container contents need a finite immutable description before comparison.
func calleeSyntaxCarrier(value sourceValue) bool {
	if value.freezeLexical != nil {
		return false
	}
	return (value.capture == nil || value.capture.constructionCapture == nil) && value.constructionBinding == nil && value.constructionCallable == nil && value.constructionView == nil && value.instance == nil && value.number == (numberPayload{}) &&
		value.ownedGetRow == nil && value.initializerUse == nil && value.adapter == nil &&
		value.acquired == nil && value.entrySlot == nil && value.bound == nil && value.normal == nil &&
		len(value.forwarded) == 0 && value.awaited == nil && value.native == nil
}

// sourceCalleeAncestor refuses repeated container-origin shapes conservatively,
// including some finite descriptions. It proves no graph equivalence. Pointer
// allocation identities, finite body-entry joins and depth limits are not keys.
type sourceCalleeAncestor struct {
	node                  *ast.Node
	rest, copied, capture bool
	prior                 *sourceCalleeAncestor
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
		if len(value.rest) > 0 || len(value.copied) > 0 || value.capture != nil && len(value.capture.bindings) > 0 {
			for ancestor := ancestors; ancestor != nil; ancestor = ancestor.prior {
				query.recordEstimatedCost(1)
				if ancestor.node == value.node && ancestor.rest == (value.rest != nil) && ancestor.copied == (value.copied != nil) && ancestor.capture == (value.capture != nil) {
					return nil, false
				}
			}
			parent = &sourceCalleeAncestor{node: value.node, rest: value.rest != nil, copied: value.copied != nil, capture: value.capture != nil, prior: ancestors}
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
		if value.capture != nil {
			scope, ok := query.snapshotCalleeScope(value.capture.bindings, value.capture.creators, parent)
			if !ok {
				return nil, false
			}
			term.capture = &scope
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
			(term.rest == nil) != (value.rest == nil) || (term.copied == nil) != (value.copied == nil) || len(term.rest) != len(value.rest) || len(term.copied) != len(value.copied) || (term.capture == nil) != (value.capture == nil) {
			return false
		}
		for j, key := range term.path {
			query.recordEstimatedCost(1)
			if key != value.path[j] {
				return false
			}
		}
		if term.capture != nil && !query.calleeScopeBoundary(*term.capture, value.capture.bindings, value.capture.creators) {
			return false
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
		if term.capture != nil && !query.matchCalleeScopeBindings(*term.capture, value.capture.bindings) {
			return false
		}
	}
	return true
}

// snapshotCalleeScope shares immutable source bindings and creator endpoints
// between the original selection context and nested source captures.
func (query *sourceValueQuery) snapshotCalleeScope(bindings sourceValueBindings, creators map[*ast.Node]sourceValueCreation, ancestors *sourceCalleeAncestor) (sourceCalleeScope, bool) {
	scope := sourceCalleeScope{}
	for symbol, values := range bindings {
		query.recordEstimatedCost(1)
		terms, ok := query.snapshotCalleeTerms(values, ancestors)
		if !ok {
			return sourceCalleeScope{}, false
		}
		scope.bindings = append(scope.bindings, sourceCalleeBinding{symbol: symbol, values: terms})
	}
	for body, creation := range creators {
		query.recordEstimatedCost(1)
		scope.creators = append(scope.creators, sourceCalleeCreator{body: body, creation: creation})
	}
	return scope, true
}

// calleeScopeBoundary checks all source keys, alternative cardinalities and
// creator endpoints before any nested input description is traversed.
func (query *sourceValueQuery) calleeScopeBoundary(previous sourceCalleeScope, bindings sourceValueBindings, creators map[*ast.Node]sourceValueCreation) bool {
	if len(previous.bindings) != len(bindings) || len(previous.creators) != len(creators) {
		return false
	}
	for _, creator := range previous.creators {
		query.recordEstimatedCost(1)
		current, present := creators[creator.body]
		if !present || current != creator.creation {
			return false
		}
	}
	for _, binding := range previous.bindings {
		query.recordEstimatedCost(1)
		current, present := bindings[binding.symbol]
		if !present || (binding.values == nil) != (current == nil) || len(binding.values) != len(current) {
			return false
		}
	}
	return true
}

// matchCalleeScopeBindings consumes an already checked scope boundary. Recursion
// follows only its finite immutable description, without scope identity or joins.
func (query *sourceValueQuery) matchCalleeScopeBindings(previous sourceCalleeScope, bindings sourceValueBindings) bool {
	for _, binding := range previous.bindings {
		query.recordEstimatedCost(1)
		if !query.matchCalleeTerms(binding.values, bindings[binding.symbol]) {
			return false
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
	scope, ok := query.snapshotCalleeScope(bindings, query.creators, nil)
	if !ok {
		return nil
	}
	pending.sourceCalleeScope = scope
	progressObserveScope(query, call, scope)
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
		if query.calleeScopeBoundary(pending.sourceCalleeScope, bindings, query.creators) && query.matchCalleeScopeBindings(pending.sourceCalleeScope, bindings) {
			return true
		}
	}
	return false
}
