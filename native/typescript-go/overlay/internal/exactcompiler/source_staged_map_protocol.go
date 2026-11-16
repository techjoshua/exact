package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMapEntry is a conditional original source relationship, never a
// descriptor value or completed write. Group identifies the selected source
// alternative. Ordinal is lexical source order, not a runtime OwnKeys proof.
// Key endpoints name original key syntax. A static identifier key does not
// authorize a lexical read of that identifier.
// An unmapped entry preserves its source occurrence while keeping protocol work
// required. A nil member denotes only observation of a source group, not absence.
type sourceStagedMapEntry struct {
	cut                       sourceRelativeCut // Original live observation cut, independent of request/receiver graph cuts.
	request                   sourceStagedOperationRequest
	receiver, key, descriptor sourceRelativeEndpoint
	member, getter, group     *ast.Node
	name                      string
	ordinal                   int
	unmapped                  bool
}

// sourceStagedMapUnrepresentedInput retains an unresolved original input branch.
// It is source provenance under the borrowed live cut, not a runtime unknown
// value or authority to omit that branch from map conversion.
type sourceStagedMapUnrepresentedInput struct {
	expression, declaration *ast.Node
	cut                     sourceRelativeCut
}

// sourceStagedMapBorrow is one synchronous original map observation. Its query,
// callback and Get pointer must be revoked on exit and never enter graph facts.
// Observing a source group does not establish OwnKeys completeness or normal
// inputs. Pending source relationships remain independent required work.
type sourceStagedMapBorrow struct {
	entryCoverageRead *sourceStagedMapEntryRead              // Only the synchronous mandatory DATA C-service interval.
	entryCoverage     func(*sourceGetInputs, *ast.Node) bool // Original accepted DATA entry source service, before publication.
	memberRequest     *sourceStagedMemberRequest
	argumentOrder     *sourceStagedNativeArgumentOrder
	argumentEpoch     *sourceStagedOperationEpoch
	source            *sourceStagedNativeGetSource // immutable original key associations, never acquired key values
	writerCoverage    func() bool
	writerPublication *sourceStagedMapWriterDisposition
	issuer            *sourceValueQuery
	owner             *sourceValueOwner
	generation        *projectGeneration
	request           sourceStagedOperationRequest
	operation         *ast.Node
	receiver          sourceRelativeEndpoint
	cut               sourceRelativeCut
	get               *sourceGetInputs
	publish           func(sourceStagedMapEntry) bool
	observed, pending bool
	accepted          map[*ast.Node]sourceStagedMapEntry // Query-local original source membership, never graph state.
	currentRead       *sourceStagedMapEntryRead          // exact synchronous original entry publication
	reading           bool
	entries           []sourceStagedMapEntry // Accepted publication order, not certified runtime OwnKeys order.
	converting        bool
	refused           bool
	unrepresented     []sourceStagedMapUnrepresentedInput
	noUserEntry       func(*sourceGetInputs, *ast.Node) bool
	noUserPublication *sourceStagedMapEntryLawEvent
}

// The original ordinary-map enumeration owner lends this local-law event.
// It carries no keys, descriptor values, normal identity or writer disposition.
type sourceStagedMapEntryLawEvent struct {
	law   sourceStagedMapEntryLaw
	get   *sourceGetInputs
	group *ast.Node
}

// beginStagedMapProtocolSource installs one lazy source-only observation. The
// caller registers protocol debt before invoking the existing enumeration owner.
// Installation neither enumerates entries nor executes stored getter bodies.
func beginStagedMapProtocolSource(query *sourceValueQuery, source *sourceStagedNativeGetSource, publish func(sourceStagedMapEntry) bool) (func(), bool) {
	if query == nil || query.owner == nil || query.owner.program == nil || query.owner.checker == nil || query.owner.generation == nil || !query.dependenciesOnly || query.inputs != nil || query.operation != nil || source == nil || source.descriptorMap == nil || publish == nil || !validNativeDescriptorMapRecipe(sourceStagedOperationRecipe{key: source.descriptorMap.protocol.producer, nativeGet: source}) {
		return func() {}, false
	}
	plan := source.descriptorMap
	operation := source.request.producer.operation
	file := ast.GetSourceFileOfNode(operation)
	if query.effectOwner != source.request.consumer || !sourceStagedOccurrenceOwned(operation, source.request.producer.declaration) || file == nil || query.owner.program.GetSourceFile(file.FileName()) != file {
		return func() {}, false
	}
	borrow := &sourceStagedMapBorrow{source: source, issuer: query, owner: query.owner, generation: query.owner.generation, request: plan.protocol, operation: operation, receiver: cloneSourceRelativeEndpoint(plan.descriptors), cut: query.relativeInputCut(operation), publish: publish, pending: true}
	borrow.publish = func(entry sourceStagedMapEntry) bool {
		if !query.liveStagedMapObservation(borrow.get, accessorEnumerate|accessorNoGet) || query.stagedMap != borrow || !query.traceModeKnown || query.traceMode != accessorEnumerate|accessorNoGet || !sameOperationRequest(entry.request, borrow.request) || !sameOperationEndpoint(entry.receiver, borrow.receiver) || entry.cut != borrow.cut {
			return false
		}
		return publish(cloneStagedMapEntry(entry))
	}
	borrow.get = &sourceGetInputs{operation: operation, receiver: sourceValue{node: borrow.receiver.expression}}
	prior := query.stagedMap
	query.stagedMap = borrow
	live := true
	return func() {
		if !live {
			return
		}
		live = false
		if query.stagedMap == borrow {
			query.stagedMap = prior
		}
		borrow.issuer = nil
		borrow.source = nil
		borrow.publish = nil
		borrow.get = nil
		borrow.accepted = nil
		borrow.entries = nil
		borrow.currentRead = nil
		borrow.writerCoverage, borrow.writerPublication = nil, nil
		borrow.unrepresented = nil
		borrow.noUserEntry, borrow.noUserPublication = nil, nil
		borrow.entryCoverage = nil
		borrow.entryCoverageRead = nil
		borrow.argumentOrder, borrow.argumentEpoch = nil, nil
	}, true
}

// liveStagedMapObservation checks the exact original Get pointer and synchronous
// issuer, including after user publication callbacks. Equal/copied metadata
// cannot borrow this source traversal or survive revocation/generation changes.
func (query *sourceValueQuery) liveStagedMapObservation(get *sourceGetInputs, mode accessorTraversal) bool {
	if query == nil || query.owner == nil || !query.dependenciesOnly || query.inputs != nil || query.operation != nil || mode != accessorEnumerate|accessorNoGet {
		return false
	}
	borrow := query.stagedMap
	return borrow != nil && borrow.issuer == query && borrow.owner == query.owner && borrow.generation == query.owner.generation && borrow.publish != nil && get != nil && borrow.get == get && get.operation == borrow.operation && get.receiver.node == borrow.receiver.expression && len(get.receiver.path) == 0 && !get.hasOnly && get.propertyKey == "" && get.lookupOwner == nil && query.effectOwner == borrow.request.consumer && query.relativeInputCut(borrow.operation) == borrow.cut
}

// observeStagedMapObject is called only by the existing selected ObjectLiteral
// owner after member inventory and before entry getter execution. It publishes source
// occurrences, not an object table or current descriptor values. All population,
// current-write, key-order and Get dispositions remain independently required.
func (query *sourceValueQuery) observeStagedMapObject(value *ast.Node, receiver sourceValue, get *sourceGetInputs, mode accessorTraversal) bool {
	if !query.liveStagedMapObservation(get, mode) || !query.traceModeKnown || query.traceMode != mode || value == nil || !ast.IsObjectLiteralExpression(value) || receiver.node != value || len(receiver.path) != 0 || receiver.native != nil || receiver.normal != nil || receiver.acquired != nil || ast.GetSourceFileOfNode(value) == nil || query.owner.program.GetSourceFile(ast.GetSourceFileOfNode(value).FileName()) != ast.GetSourceFileOfNode(value) {
		return false
	}
	borrow := query.stagedMap
	query.observeStagedMapEntryLaw(get, value, stagedMapOrdinaryOwnKeysNoUserEntry)
	borrow.observed = true
	publish := func(entry sourceStagedMapEntry) bool {
		if !query.liveStagedMapObservation(get, mode) || query.stagedMap != borrow {
			return false
		}
		entry.request = borrow.request
		entry.receiver = cloneSourceRelativeEndpoint(borrow.receiver)
		entry.cut = borrow.cut
		entry.group = value
		entry.key = cloneSourceRelativeEndpoint(entry.key)
		entry.descriptor = cloneSourceRelativeEndpoint(entry.descriptor)
		accepted := borrow.publish(entry)
		if !accepted {
			borrow.pending = true
			borrow.refused = true
		}
		if !accepted || !query.liveStagedMapObservation(get, mode) || query.stagedMap != borrow {
			return false
		}
		if entry.member != nil {
			if borrow.accepted == nil {
				borrow.accepted = make(map[*ast.Node]sourceStagedMapEntry)
			}
			borrow.accepted[entry.member] = cloneStagedMapEntry(entry)
			borrow.entries = append(borrow.entries, cloneStagedMapEntry(entry))
		}
		return true
	}
	// A group observation keeps even a selected empty literal pending. No member
	// inventory is an authenticated no-entry or no-contribution disposition.
	if !publish(sourceStagedMapEntry{ordinal: -1, unmapped: true}) {
		return true
	}
	for ordinal, member := range value.AsObjectLiteralExpression().Properties.Nodes {
		entry := sourceStagedMapEntry{member: member, ordinal: ordinal}
		key := member.Name()
		if key == nil || ast.IsSpreadAssignment(member) {
			entry.unmapped = true
		} else {
			entry.key = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: key, producer: borrow.operation, get: member, cut: borrow.cut}
			if ast.IsComputedPropertyName(key) {
				entry.key.expression = key.AsComputedPropertyName().Expression
				entry.unmapped = !stagedSymbolKeyAt(borrow.source, entry.key.expression)
			} else {
				entry.name = callableNameText(key)
				_, numeric := sourceArrayIndex(entry.name)
				entry.unmapped = numeric || ast.IsPropertyAssignment(member) && entry.name == "__proto__"
			}
		}
		// Unrepresented key order does not erase a known descriptor source.
		// The special prototype setter and spreads supply no own-entry Get here.
		if key != nil && !ast.IsSpreadAssignment(member) && (ast.IsComputedPropertyName(key) || entry.name != "__proto__" || !ast.IsPropertyAssignment(member)) {
			var descriptor *ast.Node
			switch {
			case ast.IsPropertyAssignment(member):
				descriptor = member.AsPropertyAssignment().Initializer
			case ast.IsShorthandPropertyAssignment(member):
				descriptor = member.Name()
				entry.unmapped = entry.unmapped || member.AsShorthandPropertyAssignment().ObjectAssignmentInitializer != nil
			case ast.IsGetAccessorDeclaration(member):
				entry.getter = member
			case ast.IsMethodDeclaration(member):
				descriptor = member
			default:
				entry.unmapped = true
			}
			if descriptor != nil {
				entry.descriptor = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: descriptor, producer: borrow.operation, get: member, cut: borrow.cut}
			}
		}
		if !publish(entry) {
			return true
		}
	}
	return true
}

// observeStagedMapUnrepresentedInput is called only by the original unresolved
// parameter/binding owner. This mode has no acquired input to enumerate. Record
// that precise alternative without using the literal hook's normal-output
// incompleteness flag or changing ordinary accessor results.
func (query *sourceValueQuery) observeStagedMapUnrepresentedInput(value, declaration *ast.Node, get *sourceGetInputs, mode accessorTraversal) {
	if !query.liveStagedMapObservation(get, mode) || !query.traceModeKnown || query.traceMode != mode || value == nil || declaration == nil || (!ast.IsParameterDeclaration(declaration) && !ast.IsBindingElement(declaration)) {
		return
	}
	file := ast.GetSourceFileOfNode(value)
	if file == nil || query.owner.program.GetSourceFile(file.FileName()) != file {
		return
	}
	borrow := query.stagedMap
	borrow.unrepresented = append(borrow.unrepresented, sourceStagedMapUnrepresentedInput{expression: value, declaration: declaration, cut: borrow.cut})
}
