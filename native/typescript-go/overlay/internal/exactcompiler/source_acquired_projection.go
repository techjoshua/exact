package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// withAcquiredObservation installs one actually produced alternative as a unit.
// Nil original inputs delimit outer ownership. Siblings restore the exact prior
// input, return, bindings, creators and traversal-local observation association.
func (query *sourceValueQuery) withAcquiredObservation(observed sourceObservedValue, arguments *sourceValueBindings, parent **sourceObservedValue, result *accessorCandidates, consume func(), inspection ...*sourceReceiverInspection) {
	if !query.charge(result, observed.value.node) {
		return
	}
	priorInspection := query.receiverInspection
	query.receiverInspection = nil
	if len(inspection) == 1 {
		query.receiverInspection = inspection[0]
	}
	defer func() { query.receiverInspection = priorInspection }()
	priorArguments, priorCreators := *arguments, query.creators
	defer func() {
		*arguments, query.creators = priorArguments, priorCreators
	}()
	*arguments, query.creators = observed.scope.bindings, observed.scope.creators
	query.withAcquiredOutput(parent, &observed, consume)
}

// withAcquiredOutput delimits one output's construction and return occurrence.
// A nil observation explicitly withholds output ownership for legacy syntax
// traversal. It grants neither completion nor a borrowed outer input plan.
func (query *sourceValueQuery) withAcquiredOutput(parent **sourceObservedValue, observed *sourceObservedValue, consume func()) {
	priorInputs, priorReturn, priorParent := query.inputs, query.returning, *parent
	priorOperation, priorCaller := query.operation, query.callerInputs
	priorInspection := query.receiverInspection
	priorDeferredRead := query.deferredRead
	defer func() {
		query.inputs, query.returning, *parent = priorInputs, priorReturn, priorParent
		query.operation, query.callerInputs = priorOperation, priorCaller
		query.receiverInspection = priorInspection
		query.deferredRead = priorDeferredRead
	}()
	query.inputs, query.returning, *parent = nil, nil, observed
	if observed == nil {
		query.deferredRead = nil
		query.receiverInspection = nil
		query.operation = nil
		query.callerInputs = nil
	}
	if observed != nil {
		query.inputs, query.returning = observed.inputs, observed.returned
		if observed.returned != nil && ast.IsReturnStatement(observed.returned) {
			query.returning = observed.returned.AsReturnStatement().Expression
		}
	}
	consume()
}
