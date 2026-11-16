package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// observeStagedFieldEntryLaw lends one original semantic event to the graph
// owner. The event is valid only during this callback, in its original Has/Get
// trace. It grants neither aggregate source coverage nor field selection.
func (query *sourceValueQuery) observeStagedFieldEntryLaw(get *sourceGetInputs, law sourceStagedFieldEntryLaw) bool {
	if !query.liveStagedFieldGet(get) || !query.traceModeKnown {
		return false
	}
	borrow := get.stagedEffects
	observation := borrow.observation
	if observation == nil || borrow.noUserEntry == nil || borrow.noUserPublication != nil {
		return false
	}
	phase, mode := observation.phase, query.traceMode
	owner, generation, cut := borrow.owner, borrow.generation, borrow.cut
	operation, receiver, field := borrow.operation, borrow.receiver, borrow.field
	switch law {
	case stagedFieldOrdinaryHasNoUserEntry:
		if phase != stagedFieldObservationHas || !get.hasOnly || mode != accessorNoGet {
			return false
		}
	case stagedFieldOwnDataNoUserEntry, stagedFieldIntrinsicGetNoUserEntry:
		if phase != stagedFieldObservationGet || get.hasOnly || mode != accessorAcquire {
			return false
		}
	default:
		return false
	}
	event := &sourceStagedFieldEntryEvent{get: get, law: law}
	borrow.noUserPublication = event
	defer func() { borrow.noUserPublication = nil }()
	accepted := borrow.noUserEntry(get, law)
	return accepted && query.liveStagedFieldGet(get) && get.stagedEffects == borrow && borrow.observation == observation && observation.phase == phase && query.traceModeKnown && query.traceMode == mode && get.hasOnly == (phase == stagedFieldObservationHas) && borrow.noUserPublication == event && event.get == get && event.law == law && borrow.owner == owner && borrow.generation == generation && borrow.cut == cut && borrow.operation == operation && borrow.receiver == receiver && borrow.field == field
}

// observeStagedFieldOwnDataEntry is called at the original selected own DATA
// terminal, before output projection. Computed MAY matches and accessor bodies
// cannot supply this event. Other source alternatives remain separate debts.
func (query *sourceValueQuery) observeStagedFieldOwnDataEntry(get *sourceGetInputs, member *ast.Node, projection []string, name string, mode accessorTraversal) bool {
	if get == nil || member == nil || mode != accessorAcquire || name != "" || len(projection) != 1 || projection[0] != get.propertyKey || member.Parent != get.receiver.node || !ast.IsObjectLiteralExpression(get.receiver.node) || member.Name() == nil || ast.IsComputedPropertyName(member.Name()) || callableNameText(member.Name()) != get.propertyKey {
		return false
	}
	if !ast.IsPropertyAssignment(member) && !ast.IsMethodDeclaration(member) && !(ast.IsShorthandPropertyAssignment(member) && member.AsShorthandPropertyAssignment().ObjectAssignmentInitializer == nil) {
		return false
	}
	query.publishOriginalGetMutationSource(get, nil, mode, get.receiver.node, projection, name, nil, member)
	return query.observeStagedFieldEntryLaw(get, stagedFieldOwnDataNoUserEntry)
}

// observeStagedFieldIntrinsicEntry names the conditional default intrinsic Get
// branch of an ordinary descriptor literal. The graph owner separately requires
// its genuine standard premise, all source alternatives and preceding work.
// An explicit prototype link has no such local event.
func (query *sourceValueQuery) observeStagedFieldIntrinsicEntry(get *sourceGetInputs, key string) bool {
	if get == nil || key != get.propertyKey || stagedDescriptorFieldIndex(key) < 0 || get.receiver.node == nil || !ast.IsObjectLiteralExpression(get.receiver.node) {
		return false
	}
	for _, member := range get.receiver.node.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsPropertyAssignment(member) && member.Name() != nil && !ast.IsComputedPropertyName(member.Name()) && callableNameText(member.Name()) == "__proto__" {
			return false
		}
	}
	return query.observeStagedFieldEntryLaw(get, stagedFieldIntrinsicGetNoUserEntry)
}
