package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceCalleeWriteView is a synchronous source-only MAY inventory. Pending
// interference is not an unknown callee and neither state establishes NoWrites.
// The view and its borrowed source contexts must never enter generation caches.
type sourceCalleeWriteView struct {
	candidates   accessorCandidates
	dependencies []sourceMemberWriteDemand
	unknown      bool
}

// sourceMemberWriteDemand owns detached maps for one definition-relative use.
// Published source value carriers retain their existing immutable ownership.
// Excluded Calls are unresolved dependency endpoints, never completed writes or
// row identity. Unsupported query capabilities cannot be reconstructed here.
type sourceMemberWriteDemand struct {
	issuer                                                          *sourceValueQuery
	origin                                                          *ast.Node
	projection                                                      []string
	name                                                            string
	mode                                                            accessorTraversal
	scope                                                           acquiredCallableScope
	sources                                                         []*ast.SourceFile
	cut                                                             *sourceMemberWriterReadCut
	excludedCalls                                                   []*ast.Node
	supported                                                       bool
	borrows                                                         []sourceCalleeWriteBorrow
	effectOwner                                                     *ast.Node
	reading, initializing, returning, invoking, member, bindingCall *ast.Node
}

// receiverWriteCandidates separates canonical member discovery from its
// interference consumption. Only source dependency queries may issue a view.
// The effect consumer must settle every dependency before using a write verdict.
func (query *sourceValueQuery) receiverWriteCandidates(call *ast.Node, bindings sourceValueBindings) (view sourceCalleeWriteView) {
	if !query.dependenciesOnly {
		view.unknown = true
		return view
	}
	query.recordEstimatedCost(1)
	previous := query.calleeWriteInventory
	query.calleeWriteInventory = &view
	defer func() { query.calleeWriteInventory = previous }()
	view.candidates = query.receiverCandidates(call, bindings)
	view.unknown = view.unknown || view.candidates.opaque || view.candidates.valueIncomplete || view.candidates.receiverIncomplete
	return view
}

func (query *sourceValueQuery) inventoryMemberWrites(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, sources []*ast.SourceFile, cut *sourceMemberWriterReadCut) bool {
	view := query.calleeWriteInventory
	if view == nil || !query.dependenciesOnly {
		return false
	}
	query.recordEstimatedCost(1 + len(projection) + len(sources))
	demand := sourceMemberWriteDemand{
		issuer: query,
		origin: origin, projection: append([]string(nil), projection...), name: name, mode: mode,
		sources: append([]*ast.SourceFile(nil), sources...), supported: query.definitionWriteInventoryContext(),
		reading: query.reading, initializing: query.initializing, returning: query.returning,
		invoking: query.invoking, member: query.protectedMember, bindingCall: query.normalBindingCall, effectOwner: query.effectOwner,
	}
	if demand.supported {
		demand.borrows, demand.supported = query.calleeWriteBorrows()
	}
	for node, active := range query.active {
		query.recordEstimatedCost(1)
		if !active {
			continue
		}
		if node == nil || !ast.IsCallExpression(node) {
			demand.supported = false
		} else {
			demand.excludedCalls = append(demand.excludedCalls, node)
		}
	}
	if cut != nil && cut.afterArguments != nil {
		demand.supported = false
	}
	if demand.supported {
		for _, terms := range bindings {
			query.recordEstimatedCost(1)
			for _, term := range terms {
				query.recordEstimatedCost(1)
				if !inventorySourceValue(term) {
					// In particular, do not resolve a pending initializer while
					// taking a source-only inventory's detached map snapshot.
					demand.supported = false
				}
			}
		}
	}
	if demand.supported {
		demand.scope = query.acquireCallableScope(bindings, result)
		if cut != nil {
			original := *cut
			original.scope = query.copyCallableScope(cut.scope, result)
			demand.cut = &original
		}
	} else {
		// This is an incomplete consumer domain, not a language limitation.
		// The original synchronous owner retains all effects and capabilities.
		view.unknown = true
	}
	view.dependencies = append(view.dependencies, demand)
	return true
}

// definitionWriteInventoryContext admits source mappings without borrowing a
// normal frame, pending input interval or live recursion/normal capability.
func (query *sourceValueQuery) definitionWriteInventoryContext() bool {
	if !query.dependenciesOnly {
		return false
	}
	query.recordEstimatedCost(1)
	return query.inputs == nil && query.operation == nil && query.callerInputs == nil &&
		query.returnObservation == nil && query.argumentPrefix == nil && query.pendingWriterInput == nil &&
		query.deferredRead == nil && query.installedReceiverCall == nil && query.receiverInspection == nil &&
		query.constructionMay == nil && query.initializerSelection == nil &&
		!query.provingFunctionOperation && len(query.live) == 0 && len(query.workLedgers) == 0
}

// inventoryLookupUnknown declines getter discovery without retaining unused
// receiver/output transport. The unchanged synchronous fallback owns its Get,
// captured receiver, effects and returned alternatives.
func (query *sourceValueQuery) inventoryLookupUnknown() bool {
	view := query.calleeWriteInventory
	if view == nil || !query.dependenciesOnly {
		return false
	}
	query.recordEstimatedCost(1)
	view.unknown = true
	return true
}

// inventorySourceValue refuses unsupported carriers without removing their
// exclusion markers and reinterpreting their syntax as a source allocation.
func inventorySourceValue(value sourceValue) bool {
	return value.instance == nil && value.number == (numberPayload{}) && value.ownedGetRow == nil &&
		value.initializerUse == nil && value.adapter == nil && value.acquired == nil && value.entrySlot == nil &&
		value.bound == nil && value.normal == nil && value.awaited == nil && value.native == nil
}
