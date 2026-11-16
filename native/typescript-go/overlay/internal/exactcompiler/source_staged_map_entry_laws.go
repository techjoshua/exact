package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// These laws describe separate original ordinary-object protocol steps. Neither
// law accounts key evaluation, entry population, user getters or later writes.
type sourceStagedMapEntryLaw uint8

const (
	stagedMapOrdinaryOwnKeysNoUserEntry sourceStagedMapEntryLaw = iota + 1
	stagedMapOwnDataGetNoUserEntry
)

// observeStagedMapEntryLaw lends a single local semantic event synchronously.
// The exact initial enumeration or accepted DATA terminal must still be live
// after publication. Its event cannot escape, reenter or authorize other reads.
func (query *sourceValueQuery) observeStagedMapEntryLaw(get *sourceGetInputs, group *ast.Node, law sourceStagedMapEntryLaw) bool {
	if !query.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) || group == nil || !ast.IsObjectLiteralExpression(group) {
		return false
	}
	borrow := query.stagedMap
	if borrow.noUserEntry == nil || borrow.noUserPublication != nil || group != borrow.receiver.expression {
		return false
	}
	file := ast.GetSourceFileOfNode(group)
	if file == nil || query.owner.program.GetSourceFile(file.FileName()) != file {
		return false
	}
	validPhase := func() bool {
		switch law {
		case stagedMapOrdinaryOwnKeysNoUserEntry:
			return query.traceModeKnown && query.traceMode == accessorEnumerate|accessorNoGet && !borrow.reading && borrow.currentRead == nil
		case stagedMapOwnDataGetNoUserEntry:
			read := borrow.currentRead
			if query.traceModeKnown || !borrow.reading || read == nil || read.entry.group != group || read.getter != nil || read.entry.getter != nil || read.descriptor.expression == nil {
				return false
			}
			entry, accepted := borrow.accepted[read.entry.member]
			request, valid := stagedMapEntryRequest(borrow.source, entry)
			return accepted && valid && sameOperationRequest(request, read.request) && sameStagedMapEntry(entry, read.entry) && sameOperationEndpoint(read.descriptor, entry.descriptor) && entry.cut == borrow.cut && (ast.IsPropertyAssignment(entry.member) || ast.IsMethodDeclaration(entry.member) || ast.IsShorthandPropertyAssignment(entry.member) && entry.member.AsShorthandPropertyAssignment().ObjectAssignmentInitializer == nil)
		}
		return false
	}
	if !validPhase() {
		return false
	}
	owner, generation, cut, operation := borrow.owner, borrow.generation, borrow.cut, borrow.operation
	read := borrow.currentRead
	event := &sourceStagedMapEntryLawEvent{get: get, group: group, law: law}
	borrow.noUserPublication = event
	defer func() { borrow.noUserPublication = nil }()
	accepted := borrow.noUserEntry(get, group)
	return accepted && query.stagedMap == borrow && query.liveStagedMapObservation(get, accessorEnumerate|accessorNoGet) && borrow.noUserPublication == event && event.get == get && event.group == group && event.law == law && borrow.owner == owner && borrow.generation == generation && borrow.cut == cut && borrow.operation == operation && borrow.receiver.expression == group && borrow.currentRead == read && validPhase()
}
