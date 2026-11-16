package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"sort"
)

// sourceStagedConstructedOccurrence is an original result-to-receiver demand.
// Its source inventory is passive. Only the existing collector reaching call
// issues it. Sites are possible constructor sources, never instance identities.
// Dependencies retain original result Calls through local aliases/assignments.
type sourceStagedConstructedOccurrence struct {
	request         sourceStagedOperationRequest
	receiver        *ast.Node
	sites, upstream []*ast.Node
}

// sourceStagedConstructedInventory contains immutable source templates only.
// Reached membership and delivery progress belong to the work graph.
type sourceStagedConstructedInventory struct {
	candidates []sourceStagedConstructedOccurrence
}

type sourceStagedReceiverRelations struct{ sites, results []*ast.Node }

// stagedReceiverRelations follows indexed source assignments only. It does not
// choose a current write, execute an initializer, compare keys or query values.
// The finite seen set coalesces syntax backedges. Every candidate remains MAY.
func stagedReceiverRelations(expression *ast.Node, owner *sourceValueOwner, index sourceValueIndex) sourceStagedReceiverRelations {
	result := sourceStagedReceiverRelations{}
	seen := make(map[*ast.Node]bool)
	var visit func(*ast.Node)
	visit = func(node *ast.Node) {
		node = unwrapSourceCallableReference(node)
		if node == nil || seen[node] {
			return
		}
		seen[node] = true
		if ast.IsNewExpression(node) {
			result.sites = append(result.sites, node)
			return
		}
		if ast.IsCallExpression(node) {
			result.results = append(result.results, node)
			return
		}
		if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
			visit(node.AsBinaryExpression().Right)
			return
		}
		if !ast.IsIdentifier(node) {
			return
		}
		symbol := owner.checker.GetSymbolAtLocation(node)
		if symbol == nil || symbol.ValueDeclaration == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 {
			return
		}
		declaration := symbol.ValueDeclaration
		if ast.IsVariableDeclaration(declaration) {
			visit(declaration.Initializer())
		}
		for _, write := range index.bindings[ast.GetSymbolId(symbol)] {
			visit(write.right)
		}
	}
	visit(expression)
	return result
}

// stageConstructedResultOccurrence enrolls the member-result capability, rather
// than a whole-body source profile. Every reached member occurrence with a
// constructor source relationship can issue it, including results passed through
// returns or actual arguments. Inventory alone never activates an occurrence.
// Source syntax supplies relationships only. A genuine reached constructor and
// original member owner must subsequently deliver every conditional alternative.
func (work *callableEffectWork) stageConstructedResultOccurrence(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) bool {
	if caller < 0 || caller >= len(facts) {
		return false
	}
	fact := &facts[caller]
	occurrence := stagedConstructedOccurrenceAt(fact, call, owner)
	if occurrence == nil {
		return false
	}
	request := occurrence.request
	for _, prior := range fact.staged.constructedOccurrences {
		if prior.request.producer == request.producer {
			return true
		}
	}
	fact.staged.constructedOccurrences = append(fact.staged.constructedOccurrences, *occurrence)
	registerPendingMemberSource(fact, call, owner, work)
	fact.staged.operationSkipped = append(fact.staged.operationSkipped, call.Expression())
	fact.staged.operationsPending = true
	return true
}

// stagedConstructedOccurrenceAt selects only an original current-source inventory
// relationship. Neither inventory membership nor this lookup activates the Call.
func stagedConstructedOccurrenceAt(fact *callableFacts, call *ast.Node, owner *executableBodyOwner) *sourceStagedConstructedOccurrence {
	if fact == nil || fact.sourceFile == nil || !ast.IsExternalModule(fact.sourceFile) || fact.normalInputs != nil || fact.initializerPlan != nil || owner == nil || owner.values == nil || owner.values.program == nil || owner.values.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || !ast.IsPropertyAccessExpression(call.Expression()) || !sourceStagedOccurrenceOwned(call, fact.node) {
		return nil
	}
	if fact.staged.constructedInventory == nil {
		fact.staged.constructedInventory = describeConstructedOccurrenceInventory(fact, owner)
	}
	for i := range fact.staged.constructedInventory.candidates {
		candidate := &fact.staged.constructedInventory.candidates[i]
		if candidate.request.producer.operation == call {
			return candidate
		}
	}
	return nil
}

// prepareConstructedResultSource prepares a demanded original member result
// through the same construction/member publishers as ordinary extraction. Its
// return authenticates a represented source association only. Every semantic
// role remains required, with no ordinary use, root ID or reached occurrence.
func (work *callableEffectWork) prepareConstructedResultSource(facts []callableFacts, caller int, call *ast.Node, owner *executableBodyOwner) (sourceStagedOperationRequest, bool) {
	if caller < 0 || caller >= len(facts) || owner == nil || owner.values == nil || owner.values.generation == nil || work.operationGeneration != nil && work.operationGeneration != owner.values.generation {
		return sourceStagedOperationRequest{}, false
	}
	occurrence := stagedConstructedOccurrenceAt(&facts[caller], call, owner)
	if occurrence == nil {
		return sourceStagedOperationRequest{}, false
	}
	work.indexOperationSources(facts)
	work.operationGeneration = owner.values.generation
	for _, site := range occurrence.sites {
		if _, published := owner.standardConstructions[site]; !published {
			work.prepareStagedConstructionSource(facts, site, owner)
		}
	}
	if !work.prepareConstructedOccurrenceWithResultCoverage(facts, caller, *occurrence, owner, false, true) {
		return sourceStagedOperationRequest{}, false
	}
	return occurrence.request, true
}

// prepareConstructedOccurrences consumes reached original source contributions
// after direct collection has yielded. The only source Get here is the newly
// issued constructor/member producer. No saved query or original input selection
// is replayed. Data delivery is handled on the same operation queue separately.
func (work *callableEffectWork) prepareConstructedOccurrences(facts []callableFacts, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil {
		return
	}
	for caller := range facts {
		for _, occurrence := range facts[caller].staged.constructedOccurrences {
			work.prepareConstructedOccurrence(facts, caller, occurrence, owner, true)
		}
	}
	// A native Set is only a conditional writer in its original declaration.
	// Cross-declaration activation/substitution is not inferred from source index
	// membership. Keep those missing relationships required rather than invoke it.
	for caller := range facts {
		for _, readOccurrence := range facts[caller].staged.constructedOccurrences {
			readRecipe := work.operationRecipes[readOccurrence.request.producer]
			for i := range readRecipe.constructedGroup {
				reader := &readRecipe.constructedGroup[i]
				if reader.kind != sourceNativeWeakMapGetEffect {
					continue
				}
				for _, writeOccurrence := range facts[caller].staged.constructedOccurrences {
					writeRecipe := work.operationRecipes[writeOccurrence.request.producer]
					for j := range writeRecipe.constructedGroup {
						writer := &writeRecipe.constructedGroup[j]
						if writer.kind == sourceNativeWeakMapSetEffect && writer.construction.site == reader.construction.site {
							work.registerConstructedPayloadUse(facts, reader, writer)
						}
					}
				}
			}
		}
	}
}

// prepareConstructedOccurrence shares the original constructed member and writer
// sinks between a demanded result and a reached occurrence. Only the reached
// path enrolls ordinary use. Source discovery alone cannot activate another Set.
func (work *callableEffectWork) prepareConstructedOccurrence(facts []callableFacts, caller int, occurrence sourceStagedConstructedOccurrence, owner *executableBodyOwner, reached bool, standard ...func(*sourceValueQuery, sourceStagedConstructedMember) bool) bool {
	return work.prepareConstructedOccurrenceWithResultCoverage(facts, caller, occurrence, owner, reached, false, standard...)
}

// prepareConstructedOccurrenceWithResultCoverage keeps result coverage on the
// original source Get; standalone transport and optional method laws are separate.
func (work *callableEffectWork) prepareConstructedOccurrenceWithResultCoverage(facts []callableFacts, caller int, occurrence sourceStagedConstructedOccurrence, owner *executableBodyOwner, reached, resultCoverage bool, standard ...func(*sourceValueQuery, sourceStagedConstructedMember) bool) bool {
	return work.prepareConstructedOccurrenceSource(facts, caller, occurrence, owner, reached, resultCoverage, false, standard...)
}

// prepareConstructedOccurrenceSource separates a live coverage demand's conditional
// description from final upstream DATA delivery. Other callers retain admission.
func (work *callableEffectWork) prepareConstructedOccurrenceSource(facts []callableFacts, caller int, occurrence sourceStagedConstructedOccurrence, owner *executableBodyOwner, reached, resultCoverage, coverageDemand bool, standard ...func(*sourceValueQuery, sourceStagedConstructedMember) bool) bool {
	if owner == nil || owner.values == nil {
		return false
	}
	if work.constructedIssued == nil {
		work.constructedIssued = make(map[[2]*ast.Node]bool)
	}
	sites := occurrence.sites
	prerequisites := make(map[*ast.Node][]sourceStagedOperationRequest)
	if len(occurrence.upstream) != 0 {
		if !coverageDemand {
			sites = nil
		}
		for _, upstream := range occurrence.upstream {
			for _, use := range facts[caller].staged.operationUses {
				request := use.request
				if request.reading.operation != upstream {
					continue
				}
				id, known := work.operationIDs[request.producer]
				if !known {
					continue
				}
				subscriber := work.operations[id.index].subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
				if subscriber == nil || subscriber.blocked || subscriber.applied != work.operations[id.index].revision {
					continue
				}
				for _, alternative := range subscriber.constructed {
					expression := unwrapSourceCallableReference(alternative.endpoint.expression)
					if expression != nil && ast.IsBinaryExpression(expression) && expression.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
						expression = unwrapSourceCallableReference(expression.AsBinaryExpression().Right)
					}
					if expression == nil || !ast.IsNewExpression(expression) {
						continue
					}
					if _, seen := prerequisites[expression]; !seen {
						sites = append(sites, expression)
					}
					prerequisites[expression] = append(prerequisites[expression], request)
				}
			}
		}
	}
	for _, site := range sites {
		identity := [2]*ast.Node{occurrence.request.producer.operation, site}
		construction, available := owner.standardConstructions[site]
		if !available || construction.site != site {
			continue
		}
		coverageObserved := false
		if resultCoverage {
			for _, source := range work.operationRecipes[occurrence.request.producer].constructedGroup {
				if source.construction == construction && sameOperationRequest(source.request, occurrence.request) {
					key := stagedMemberCoverageRequest(source.request, source.construction.site, source.cut).producer
					coverageObserved = work.memberCoverageObserved[key] == work.operationGeneration
				}
			}
		}
		canonicalCurrent := false
		for _, member := range work.operationRecipes[occurrence.request.producer].constructedGroup {
			canonicalCurrent = canonicalCurrent || member.construction == construction && sameOperationRequest(member.request, occurrence.request)
		}
		if work.constructedIssued[identity] && canonicalCurrent && len(standard) == 0 && (!resultCoverage || coverageObserved) {
			if reached {
				recipe := work.operationRecipes[occurrence.request.producer]
				for _, source := range recipe.constructedGroup {
					if source.construction == construction && sameOperationRequest(source.request, occurrence.request) && !work.registerConstructedMemberSource(facts, source) {
						return false
					}
				}
			}
			for _, input := range prerequisites[site] {
				work.requireConstructedReceiverData(facts, occurrence.request, input)
			}
			continue
		}
		query := newSourceDependencyQuery(occurrence.request.producer.operation, owner.checker, owner, occurrence.request.consumer)
		query.initializing, query.protectedMember = occurrence.request.producer.operation, occurrence.request.producer.operation.Expression()
		writerRevoke, writerInstalled := query.beginStagedWriterSource(func(sourceStagedWriterRead) bool {
			recipe := work.operationRecipes[occurrence.request.producer]
			for i := range recipe.constructedGroup {
				if recipe.constructedGroup[i].construction.site == site {
					return work.publishStagedWriterRead(facts, query, constructedMemberRequest(&recipe.constructedGroup[i], "own-writers"))
				}
			}
			return false
		})
		if writerInstalled {
			query.stagedWriter.consumeProjection = func(sourceStagedWriterProjection) bool {
				root := work.operationRecipes[occurrence.request.producer]
				for i := range root.constructedGroup {
					if root.constructedGroup[i].construction.site == site {
						return work.acceptWriterCallableProjection(facts, query, constructedMemberRequest(&root.constructedGroup[i], "own-writers"), owner)
					}
				}
				return false
			}
		}
		revoke, installed := query.beginStagedConstructedMemberSource(occurrence.request, site, func(source sourceStagedConstructedMember, _ []*ast.SourceFile, complete bool) bool {
			if !work.promoteConstructedSourceDescription(facts, query, source) {
				return false
			}
			accepted := false
			if reached {
				accepted = work.registerConstructedMemberSource(facts, source)
			} else {
				accepted = work.registerConstructedMemberSourcePrefix(facts, source)
			}
			return accepted && work.observeConstructedResultGetSource(facts, query, source, complete)
		}, standard...)
		if !installed {
			writerRevoke()
			continue
		}
		if coverageDemand {
			query.stagedConstructedMember.receiverSource = func(q *sourceValueQuery, result *accessorCandidates) bool {
				return work.acquireConstructedCoverageReceiver(facts, q, occurrence, result)
			}
		}
		if resultCoverage {
			query.stagedConstructedMember.resultCoverage = func(q *sourceValueQuery, source sourceStagedConstructedMember, result *accessorCandidates) bool {
				if !q.stagedConstructedMember.finishing {
					return work.registerConstructedCoveragePrefix(facts, q, source)
				}
				work.recordConstructedMethodGet(facts, q, source, result)
				root := work.operationRecipes[source.request.producer]
				if !work.issuedConstructedProtocolSource(root) {
					return false
				}
				// The actual C tail makes this original conditional source eligible.
				// Reindex it here, after observation, without another Get traversal.
				work.indexStagedMemberProtocolSource(root, q.executable)
				return true
			}
		}
		memberRevoke, _ := work.beginStagedMemberWork(query, facts, occurrence.request)
		_, name := accessorReceiver(query.protectedMember)
		result := accessorCandidates{}
		query.standardConstructionMember(sourceConstructedMemberDemand{source: site, projection: []string{name}, mode: accessorAcquire}, nil, &result, func(*ast.Node, []string, bool) {}, func([]sourceValue, []string, bool) {})
		memberRevoke()
		revoke()
		if writerInstalled {
			writerRevoke()
		}
		query.publishDependencyStatistics()
		if recipe, found := work.operationRecipes[occurrence.request.producer]; found {
			for _, member := range recipe.constructedGroup {
				if member.construction.site == site {
					work.constructedIssued[identity] = true
					work.indexStagedMemberProtocolSource(recipe)
					for _, input := range prerequisites[site] {
						work.requireConstructedReceiverData(facts, occurrence.request, input)
					}
				}
			}
		}
	}
	if len(sites) == 0 {
		return false
	}
	for _, site := range sites {
		if !work.constructedIssued[[2]*ast.Node{occurrence.request.producer.operation, site}] {
			return false
		}
		construction, available := owner.standardConstructions[site]
		matched := false
		for _, source := range work.operationRecipes[occurrence.request.producer].constructedGroup {
			matched = matched || available && source.construction == construction && sameOperationRequest(source.request, occurrence.request)
		}
		if !matched {
			return false
		}
	}
	return true
}

// describeConstructedOccurrenceInventory indexes demand relationships once. This
// is syntax/source ownership, not native selection or execution admission. The
// actual constructor/member publishers remain required after an occurrence runs.
func describeConstructedOccurrenceInventory(fact *callableFacts, owner *executableBodyOwner) *sourceStagedConstructedInventory {
	inventory := &sourceStagedConstructedInventory{}
	index := owner.values.index(fact.sourceFile)
	if index.incomplete || index.normalDynamicScope {
		return inventory
	}
	// This uses the canonical source index, not a second body evaluator. Future
	// source relationships are discovered here but acquire no execution membership.
	calls := make(map[*ast.Node]sourceStagedReceiverRelations)
	seeds := make(map[*ast.Node]bool)
	sites := make(map[*ast.Node]bool)
	for _, candidate := range index.calls {
		if !sourceStagedOccurrenceOwned(candidate, fact.node) || !ast.IsPropertyAccessExpression(candidate.Expression()) || candidate.AsCallExpression().QuestionDotToken != nil {
			continue
		}
		receiver, _ := accessorReceiver(candidate.Expression())
		calls[candidate] = stagedReceiverRelations(receiver, owner.values, index)
	}
	// Effects demand at an original get/set does not require its result to feed
	// another receiver. Result transport remains separately demanded below.
	returnedDemand := stagedConstructedReturnedDemand(fact, owner, index)
	for call, relations := range calls {
		_, method := accessorReceiver(call.Expression())
		if returnedDemand || method == "get" || method == "set" {
			for _, site := range relations.sites {
				if stagedWeakMapConstructionCandidate(site, owner, index) {
					seeds[call], sites[site] = true, true
				}
			}
		}
		for _, result := range relations.results {
			upstream, known := calls[result]
			if !known {
				continue
			}
			for _, site := range upstream.sites {
				if stagedWeakMapConstructionCandidate(site, owner, index) {
					seeds[result], sites[site] = true, true
				}
			}
		}
	}

	for call, relations := range calls {
		member := seeds[call]
		for _, site := range relations.sites {
			member = member || sites[site]
		}
		for _, result := range relations.results {
			member = member || seeds[result]
		}
		if !member {
			continue
		}
		request, valid := sourceStagedOccurrenceRequest(fact, call, relativeDemandEffects, fmt.Sprintf("%s:constructed:%d", fact.summary.ID, call.Pos()))
		if valid {
			inventory.candidates = append(inventory.candidates, sourceStagedConstructedOccurrence{request: request, receiver: call.Expression().Expression(), sites: relations.sites, upstream: relations.results})
		}
	}
	sort.Slice(inventory.candidates, func(i, j int) bool {
		return inventory.candidates[i].request.producer.operation.Pos() < inventory.candidates[j].request.producer.operation.Pos()
	})
	return inventory
}

// stagedConstructedReturnedDemand recognizes an issuing data relationship, not
// execution or output authority. The original lexical input planner authenticates
// the receiving Call and its ordered actuals. Actual collection still decides
// whether that occurrence is reached. No source query or binding map is retained.
func stagedConstructedReturnedDemand(fact *callableFacts, owner *executableBodyOwner, index sourceValueIndex) bool {
	if !ast.IsFunctionDeclaration(fact.node) {
		return false
	}
	for _, call := range index.calls {
		consumer := enclosingCallableNode(call)
		if consumer == nil || consumer == fact.node {
			continue
		}
		source, supported := describeStagedInputSubstitution(call, consumer, owner)
		if !supported {
			continue
		}
		for _, actual := range source.invocation.actuals {
			for _, result := range stagedReceiverRelations(actual.expression, owner.values, index).results {
				if !ast.IsIdentifier(result.Expression()) {
					continue
				}
				symbol, implementation := stagedLexicalFunctionImplementation(result.Expression(), owner)
				if symbol != nil && implementation == fact.node {
					return true
				}
			}
		}
	}
	return false
}

// stagedWeakMapConstructionCandidate can issue a producer request before its
// original New runs. A genuine library-root relationship or a published native
// contribution is necessary. This is not the constructor selection/category ACK.
func stagedWeakMapConstructionCandidate(site *ast.Node, owner *executableBodyOwner, index sourceValueIndex) bool {
	if site == nil || !ast.IsNewExpression(site) {
		return false
	}
	if source, found := owner.standardConstructions[site]; found && source.constructor != nil {
		return true
	}
	node := unwrapSourceCallableReference(site.Expression())
	seen := make(map[ast.SymbolId]bool)
	for node != nil {
		symbol := owner.checker.GetSymbolAtLocation(node)
		if symbol == nil || symbol.ValueDeclaration == nil || seen[ast.GetSymbolId(symbol)] || len(index.bindings[ast.GetSymbolId(symbol)]) != 0 {
			return false
		}
		seen[ast.GetSymbolId(symbol)] = true
		query := sourceValueQuery{owner: owner.values, executable: owner, dependenciesOnly: true}
		if _, kind := query.nativeRootDeclaration(symbol.ValueDeclaration); kind == sourceNativeWeakMapConstructor {
			return true
		}
		if !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			return false
		}
		node = unwrapSourceCallableReference(symbol.ValueDeclaration.Initializer())
	}
	return false
}
