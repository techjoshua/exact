package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMethodStorage retains only original Get/Set source factories.
// Actual payload delivery and private-use coverage are checked anew before the
// original method Get publishes. This is not table identity or normal output.
type sourceStagedMethodStorage struct{ reader, writer sourceStagedConstructedMember }

func methodStorageAllocation(writer *sourceStagedConstructedMember) *ast.Node {
	if writer == nil || !validConstructedMemberSource(writer) || writer.kind != sourceNativeWeakMapSetEffect || !writer.actualsKnown || len(writer.actuals) != 2 {
		return nil
	}
	actuals := restrictedInvocationArguments(writer.request.producer.operation.AsCallExpression())
	if len(actuals) != 2 || writer.actuals[1].ordinal != 1 || writer.actuals[1].expression != actuals[1] || writer.actuals[1].endpoint.expression != unwrapSourceCallableReference(actuals[1]) || writer.actuals[1].endpoint.kind != relativeEndpointExpression || writer.actuals[1].endpoint.producer != writer.request.producer.operation || writer.actuals[1].endpoint.cut != (sourceRelativeCut{operation: writer.request.producer.operation, use: writer.request.producer.operation, reading: actuals[1]}) {
		return nil
	}
	assignment := unwrapSourceCallableReference(actuals[1])
	if assignment == nil || !ast.IsBinaryExpression(assignment) || assignment.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
		return nil
	}
	site := unwrapSourceCallableReference(assignment.AsBinaryExpression().Right)
	if site == nil || !ast.IsNewExpression(site) || enclosingCallableNode(site) != writer.request.consumer {
		return nil
	}
	return site
}

func methodStorageRequirements(storage sourceStagedMethodStorage) []sourceStagedOperationRequest {
	required := []sourceStagedOperationRequest{storage.reader.request, storage.writer.request, constructedMemberRequest(&storage.reader, "member-result"), constructedPayloadRequest(&storage.reader, &storage.writer)}
	for _, source := range []*sourceStagedConstructedMember{&storage.reader, &storage.writer} {
		for _, request := range standardMemberCallRequirements(source) {
			required = appendEntryLawRequirement(required, request)
		}
	}
	return required
}

func validMethodStorage(storage sourceStagedMethodStorage, branches []sourceStagedConstructedMember) bool {
	read, write := &storage.reader, &storage.writer
	if !validConstructedMemberSource(read) || read.kind != sourceNativeWeakMapGetEffect || !read.construction.selectionComplete || read.construction != write.construction || read.request.consumer != write.request.consumer {
		return false
	}
	site := methodStorageAllocation(write)
	if site == nil {
		return false
	}
	for _, branch := range branches {
		if branch.construction.site == site && branch.request.consumer == write.request.consumer {
			return true
		}
	}
	return false
}

// sourceConstructedMethodCheck is ephemeral traversal state. The existing
// receiver owner invokes it for each allocation/container/payload alternative;
// no callback, query or delivered subscriber is retained by a method recipe.
type sourceConstructedMethodCheck struct {
	allocation func(sourceStandardConstructionContribution) bool
	container  func(sourceStagedConstructedMember) bool
	payload    func(sourceStagedConstructedMember, sourceStagedConstructedMember) bool
}

func (work *callableEffectWork) currentStandardMethodSource(source *sourceStagedConstructedMember, owner *executableBodyOwner) bool {
	if !validConstructedMemberSource(source) || owner.standardConstructions[source.construction.site] != source.construction || !source.construction.selectionComplete {
		return false
	}
	request := source.request
	request.producer.selector = sourceStagedOperationSelector{occurrence: source.get, field: "callee-alternatives"}
	request.edge += ":callee-alternatives"
	recipe := work.operationRecipes[request.producer]
	if !work.nativeObserverProducerCurrent(recipe) || recipe.memberSource == nil || len(recipe.memberSource.call.standard) != 1 || !sameOperationRequest(recipe.memberSource.request, request) {
		return false
	}
	for _, branch := range recipe.memberSource.call.standard {
		if sameConstructedMemberSource(&branch, source) {
			return true
		}
	}
	return false
}

// constructedStandardMethodStorage reuses the private-use and receiver owners.
// Its sole extension accepts an allocation stored by the exact original Set
// argument-1 assignment. Every possible payload must have a current ACK, and
// every resulting allocation must be covered by this original method Get event.
func (work *callableEffectWork) constructedStandardMethodStorage(facts []callableFacts, caller int, source *sourceStagedConstructedMember, owner *executableBodyOwner) ([]sourceStagedMethodStorage, bool) {
	if caller < 0 || caller >= len(facts) || owner == nil || owner.values == nil || owner.values.generation != work.operationGeneration || source == nil || !validConstructedMemberSource(source) || !source.construction.selectionComplete || !source.actualsKnown || owner.standardConstructions[source.construction.site] != source.construction {
		return nil, false
	}
	args := source.construction.site.AsNewExpression().Arguments
	if args != nil && len(args.Nodes) != 0 {
		return nil, false
	}
	var storage []sourceStagedMethodStorage
	var stored *sourceStagedConstructedMember
	allocation := func(construction sourceStandardConstructionContribution) bool {
		if construction != source.construction {
			return false
		} // A different endpoint needs its own original Get event.
		site := construction.site
		if parent := site.Parent; parent != nil && ast.IsVariableDeclaration(parent) && parent.Initializer() == site {
			return owner.privateStandardConstruction(construction)
		}
		container := work.constructedSourceContainer(source, owner)
		if container == nil || methodStorageAllocation(container) != site || !work.currentStandardMethodSource(container, owner) || !owner.privateStandardConstruction(container.construction) || !work.constructedContainerReadsObserved(source, container, owner) {
			return false
		}
		root := work.operationRecipes[container.request.producer]
		if len(root.constructedGroup) != 1 || !sameConstructedMemberSource(&root.constructedGroup[0], container) {
			return false
		} // Never select the first of mixed sources.
		_, covered := stagedConstructionUseAliases(construction, owner, func(node *ast.Node) bool {
			// Only the original assignment-result payload expression is additional.
			return unwrapSourceCallableReference(node) == unwrapSourceCallableReference(container.actuals[1].expression)
		})
		if covered {
			copy := *container
			stored = &copy
		}
		return covered
	}
	check := &sourceConstructedMethodCheck{allocation: allocation}
	check.container = func(read sourceStagedConstructedMember) bool {
		return owner.privateStandardConstruction(read.construction) && work.currentStandardMethodSource(&read, owner)
	}
	check.payload = func(read, write sourceStagedConstructedMember) bool {
		if methodStorageAllocation(&write) != source.construction.site || !work.currentStandardMethodSource(&write, owner) {
			return false
		}
		request := constructedPayloadRequest(&read, &write)
		id, adopted := work.operationIDs[request.producer]
		if !adopted || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
			return false
		}
		producer := work.operationRecipes[request.producer]
		if !validConstructedMemberRecipe(producer) || !sameConstructedMemberSource(producer.constructed, &write) || !work.validConstructedMemberRequest(producer, request) {
			return false
		}
		state := &work.operations[id.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
		if state.invalid || !state.delta.extracted || subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || !sameOperationRequest(subscriber.request, request) || len(subscriber.constructed) == 0 {
			return false
		}
		pair := sourceStagedMethodStorage{reader: cloneConstructedMemberSource(read), writer: cloneConstructedMemberSource(write)}
		for _, prior := range storage {
			if sameConstructedMemberSource(&prior.reader, &pair.reader) && sameConstructedMemberSource(&prior.writer, &pair.writer) {
				return true
			}
		}
		storage = append(storage, pair)
		return true
	}
	receiver, _ := accessorReceiver(source.get)
	relations := stagedReceiverRelations(receiver, owner.values, owner.values.index(ast.GetSourceFileOfNode(receiver)))
	if len(relations.sites) != 1 || relations.sites[0] != source.construction.site || !work.constructedReceiverCovered(receiver, caller, facts, owner, make(map[*ast.Node]bool), check) {
		return nil, false
	}
	if len(relations.results) != 0 && (stored == nil || len(storage) == 0) {
		return nil, false
	}
	for _, pair := range storage {
		if !validMethodStorage(pair, []sourceStagedConstructedMember{*source}) {
			return nil, false
		}
	}
	return storage, true
}

// privateStandardConstruction shares the closed source-use proof across
// method consumers. The Program owns the indexed uses. Recheck the original
// construction contribution before consulting the memoized classification.
func (owner *executableBodyOwner) privateStandardConstruction(construction sourceStandardConstructionContribution) bool {
	site := construction.site
	if site == nil || !construction.selectionComplete || owner.standardConstructions[site] != construction {
		return false
	}
	if covered, known := owner.privateConstructionUses[site]; known {
		return covered
	}
	parent := site.Parent
	if parent == nil || !ast.IsVariableDeclaration(parent) || parent.Initializer() != site {
		return false
	}
	_, covered := stagedConstructionUseAliases(construction, owner, func(*ast.Node) bool { return false })
	// Only a complete index can settle the source-use classification.
	index := owner.values.index(ast.GetSourceFileOfNode(site))
	if !index.incomplete && index.privateUses != nil && index.privateUses.complete {
		if owner.privateConstructionUses == nil {
			owner.privateConstructionUses = make(map[*ast.Node]bool)
		}
		owner.privateConstructionUses[site] = covered
	}
	return covered
}
