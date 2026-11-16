package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedConstructedDisposition is Effects/source-transport coverage at one
// original member demand. It contains no allocation identity, key/table state,
// normal result, query or frame. Generation and original source ownership remain
// necessary when rebuilding the graph. Unknown sources are not empty coverage.
type sourceStagedConstructedDisposition struct {
	request        sourceStagedOperationRequest
	site           *ast.Node
	generation     *projectGeneration
	role           string
	container      *sourceStagedConstructedMember // original native Set source, not a runtime table identity
	lookupComplete bool
	lookupEffects  []EnvironmentEffectSource
	// Result snapshots describe conditional native Get alternatives. Pending
	// source relationships never become runtime unknown or completed captures.
	resultSources     []sourceStagedConstructedMember
	resultAssignments []sourceStagedConstructedAssignmentResult
	resultValues      []sourceStagedOperationAlternative
	resultGetComplete bool
	resultComplete    bool
}

func validConstructedSourceDisposition(proof *sourceStagedConstructedDisposition, source *sourceStagedConstructedMember, key sourceStagedOperationKey) bool {
	if proof == nil || source == nil || proof.generation == nil || proof.site != source.construction.site || !sameOperationRequest(proof.request, source.request) {
		return false
	}
	if key == constructedMemberRequest(source, "method-lookup").producer {
		if proof.role != "method-lookup" || proof.container != nil || len(proof.resultSources)+len(proof.resultValues)+len(proof.resultAssignments) != 0 || proof.resultGetComplete || proof.resultComplete {
			return false
		}
		for _, effect := range proof.lookupEffects {
			if !validOperationEnvironmentEffect(effect) || effect.relativeCoercion != nil {
				return false
			}
		}
		return true
	}
	if proof.lookupComplete || len(proof.lookupEffects) != 0 {
		return false
	}
	if key == constructedMemberRequest(source, "member-result").producer {
		return proof.role == "member-result" && source.kind == sourceNativeWeakMapGetEffect && proof.container == nil
	}
	if len(proof.resultSources)+len(proof.resultValues)+len(proof.resultAssignments) != 0 || proof.resultGetComplete || proof.resultComplete {
		return false
	}
	if key == source.request.producer {
		return proof.role == "receiver"
	}
	for _, role := range []string{"own-writers", "eager-inputs", "callee", "stored-payload"} {
		if key == constructedMemberRequest(source, role).producer {
			return proof.role == role
		}
	}
	return false
}

// completeConstructedSources consumes the original collector's completed local
// input contributions and the index owner's complete receiver-use population.
// Each role retains its separate required graph. In particular local extraction
// does not discharge callable summaries or stored-source dependencies.
func (work *callableEffectWork) completeConstructedSources(facts []callableFacts, owner *executableBodyOwner) {
	if owner == nil || owner.values == nil {
		return
	}
	for caller := range facts {
		for _, occurrence := range facts[caller].staged.constructedOccurrences {
			root := work.operationRecipes[occurrence.request.producer]
			for _, member := range root.constructedGroup {
				source := member
				work.completeConstructedSourceRoles(facts, caller, source, owner)
			}
			work.completeConstructedSourceRoot(facts, caller, occurrence.request, occurrence.receiver, owner)
		}
	}
}

// completeConstructedSourceRoles is shared by reached occurrences and demanded
// conditional source groups. Each unchanged role has its original producer and
// requirements; local extraction grants neither runtime entry nor DATA closure.
func (work *callableEffectWork) completeConstructedSourceRoles(facts []callableFacts, caller int, source sourceStagedConstructedMember, owner *executableBodyOwner) {
	for _, role := range []string{"own-writers", "eager-inputs", "callee", "stored-payload"} {
		key := constructedMemberRequest(&source, role).producer
		recipe, exists := work.operationRecipes[key]
		if !exists || recipe.constructedDisposition != nil {
			continue
		}
		represented := false
		switch role {
		case "own-writers":
			represented = work.constructedUsesCovered(facts, &source, owner)
		case "eager-inputs":
			represented = facts[caller].staged.ready && source.actualsKnown
		case "callee":
			represented = source.construction.selectionComplete
		case "stored-payload":
			represented = source.actualsKnown && len(source.actuals) == 2
		}
		if !represented {
			continue
		}
		recipe.constructedDisposition = &sourceStagedConstructedDisposition{request: source.request, site: source.construction.site, generation: owner.values.generation, role: role}
		if role == "own-writers" {
			recipe.constructedDisposition.container = work.constructedSourceContainer(&source, owner)
			if container := recipe.constructedDisposition.container; container != nil {
				recipe.delta = cloneOperationDelta(recipe.delta)
				for _, debt := range []string{"own-writers", "callee", "eager-inputs"} {
					recipe.delta.required = append(recipe.delta.required, constructedMemberRequest(container, debt))
				}
			}
		}
		recipe.delta = cloneOperationDelta(recipe.delta)
		recipe.delta.extracted = true
		work.attachOperationSource(facts, recipe)
	}
}

// completeConstructedSourceRoot retains the original all-alternative receiver
// relationship, independently of role extraction and ordinary execution/use.
func (work *callableEffectWork) completeConstructedSourceRoot(facts []callableFacts, caller int, request sourceStagedOperationRequest, receiver *ast.Node, owner *executableBodyOwner) {
	root := work.operationRecipes[request.producer]
	if root.constructed == nil || root.constructedDisposition != nil {
		return
	}
	if !work.constructedReceiverCovered(receiver, caller, facts, owner, make(map[*ast.Node]bool)) {
		return
	}
	root.constructedDisposition = &sourceStagedConstructedDisposition{request: root.constructed.request, site: root.constructed.construction.site, generation: owner.values.generation, role: "receiver"}
	root.delta = cloneOperationDelta(root.delta)
	root.delta.extracted = true
	work.attachOperationSource(facts, root)
}

// constructedStandardMethodCovered uses the complete private-use owner with
// only the authenticated assignment-result container transport. Receiver source coverage is a separate premise:
// one known allocation cannot hide an unrelated binding or result alternative.
// This answers only whether get/set can invoke an input, never a Get result.
func (work *callableEffectWork) constructedStandardMethodCovered(facts []callableFacts, caller int, source *sourceStagedConstructedMember, owner *executableBodyOwner) bool {
	_, covered := work.constructedStandardMethodStorage(facts, caller, source, owner)
	return covered
}

// constructedReceiverCovered follows source bindings and delivered result
// relationships. A native Get may also produce undefined, whose member access
// is abrupt without invoking a callback. This Effects premise never supplies
// undefined output or normal success. Unknown payload producers remain pending.
func (work *callableEffectWork) constructedReceiverCovered(expression *ast.Node, caller int, facts []callableFacts, owner *executableBodyOwner, seen map[*ast.Node]bool, privateMethod ...*sourceConstructedMethodCheck) bool {
	expression = unwrapSourceCallableReference(expression)
	if expression == nil {
		return false
	}
	if seen[expression] {
		return true
	}
	seen[expression] = true
	index := owner.values.index(ast.GetSourceFileOfNode(expression))
	if index.incomplete || index.normalDynamicScope {
		return false
	}
	if ast.IsNewExpression(expression) {
		source, known := owner.standardConstructions[expression]
		args := expression.AsNewExpression().Arguments
		if !known || !source.selectionComplete || args != nil && len(args.Nodes) != 0 {
			return false
		}
		if len(privateMethod) == 1 {
			return privateMethod[0].allocation(source)
		}
		return true
	}
	if ast.IsBinaryExpression(expression) && expression.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		return work.constructedReceiverCovered(expression.AsBinaryExpression().Right, caller, facts, owner, seen, privateMethod...)
	}
	if ast.IsIdentifier(expression) {
		symbol := owner.checker.GetSymbolAtLocation(expression)
		if symbol == nil || symbol.ValueDeclaration == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			return false
		}
		declaration := symbol.ValueDeclaration
		if declaration.Initializer() != nil && !work.constructedReceiverCovered(declaration.Initializer(), caller, facts, owner, seen, privateMethod...) {
			return false
		}
		writes := index.bindings[ast.GetSymbolId(symbol)]
		if declaration.Initializer() == nil && len(writes) == 0 {
			return false
		}
		for _, write := range writes {
			if !work.constructedReceiverCovered(write.right, caller, facts, owner, seen, privateMethod...) {
				return false
			}
		}
		return true
	}
	if ast.IsCallExpression(expression) {
		key := sourceStagedOperationKey{declaration: enclosingCallableNode(expression), operation: expression, kind: relativeDemandEffects}
		recipe := work.operationRecipes[key]
		if len(recipe.constructedGroup) == 0 {
			return false
		}
		for _, source := range recipe.constructedGroup {
			if len(privateMethod) == 0 && len(work.operationRecipes[constructedMemberRequest(&source, "own-writers").producer].writerRequired) != 0 {
				return false // Authored/unknown method results need their separate value producer.
			}
			if source.kind != sourceNativeWeakMapGetEffect || !source.construction.selectionComplete || len(privateMethod) == 0 && !work.constructedUsesCovered(facts, &source, owner) {
				return false
			}
			if len(privateMethod) == 1 && !privateMethod[0].container(source) {
				return false
			}

			// Source coverage includes every possible writer, not only the
			// known payload prefix. A private never-referenced declaration is
			// dormant. Other unrepresented activations remain producer work.
			var methodWriters []sourceStagedConstructedMember
			sourceIndex := owner.values.index(ast.GetSourceFileOfNode(source.construction.site))
			for _, candidate := range sourceIndex.calls {
				if !ast.IsPropertyAccessExpression(candidate.Expression()) {
					continue
				}
				receiver, name := accessorReceiver(candidate.Expression())
				if name != "set" {
					continue
				}
				matches := false
				for _, site := range stagedReceiverRelations(receiver, owner.values, sourceIndex).sites {
					matches = matches || site == source.construction.site
				}
				if !matches {
					continue
				}
				region := enclosingCallableNode(candidate)
				if region != nil && ast.IsFunctionDeclaration(region) && region.Name() != nil && ast.GetCombinedModifierFlags(region)&ast.ModifierFlagsExport == 0 {
					symbol := owner.checker.GetSymbolAtLocation(region.Name())
					if symbol != nil && sourceIndex.privateUses != nil && sourceIndex.privateUses.complete && len(sourceIndex.privateUses.uses[ast.GetSymbolId(symbol)]) == 0 {
						continue
					}
				}
				if region != facts[caller].node {
					return false
				}
				writerKey := sourceStagedOperationKey{declaration: region, operation: candidate, kind: relativeDemandEffects}
				writerRecipe := work.operationRecipes[writerKey]
				represented := false
				for _, writer := range writerRecipe.constructedGroup {
					represented = represented || writer.construction.site == source.construction.site && writer.kind == sourceNativeWeakMapSetEffect
					if len(privateMethod) == 1 && writer.construction.site == source.construction.site && writer.kind == sourceNativeWeakMapSetEffect {
						methodWriters = append(methodWriters, writer)
					}
				}
				if !represented {
					return false
				}
			}
			// The method proof requires every represented possible writer, including
			// passive source writers, to deliver its payload. Normal callers retain
			// their reached-writer contract. No key equality or exact current-write choice is reconstructed.
			writers := methodWriters
			if len(privateMethod) == 0 {
				writers = nil
				for _, occurrence := range facts[caller].staged.constructedOccurrences {
					writers = append(writers, work.operationRecipes[occurrence.request.producer].constructedGroup...)
				}
			}
			for _, writer := range writers {
				if writer.construction.site != source.construction.site || writer.kind != sourceNativeWeakMapSetEffect {
					continue
				}
				if len(privateMethod) == 1 && !privateMethod[0].payload(source, writer) {
					return false
				}
				request := constructedPayloadRequest(&source, &writer)
				id, exists := work.operationIDs[request.producer]
				if !exists {
					return false
				}
				state := &work.operations[id.index]
				subscriber := state.subscribers[sourceStagedOperationConsumer{request.consumer, request.edge}]
				if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || len(subscriber.constructed) == 0 {
					return false
				}
				for _, alternative := range subscriber.constructed {
					if !work.constructedReceiverCovered(alternative.endpoint.expression, caller, facts, owner, seen, privateMethod...) {
						return false
					}
				}
			}
		}
		return true
	}
	return false
}

// constructedUsesCovered is a complete source-use/escape check, not an empty
// writer-index test. Only the already selected intrinsic get/set protocol may
// observe these aliases. An alias passed to an arbitrary call, exported, returned
// or used by a property writer withholds coverage. Candidate writers elsewhere
// cannot reach this private receiver without one of these source relationships.
func (work *callableEffectWork) constructedUsesCovered(facts []callableFacts, source *sourceStagedConstructedMember, owner *executableBodyOwner) bool {
	_, covered := stagedConstructionUseAliases(source.construction, owner, func(node *ast.Node) bool {
		return work.constructedWriterUseCovered(source, node, owner, make(map[ast.SymbolId]bool))
	})
	if !covered {
		return false
	}
	file := ast.GetSourceFileOfNode(source.construction.site)
	// The allocation itself must initialize a private binding. Assignment-return
	// payloads require an independently owned container writer/escape relation.
	allocation := source.construction.site
	parent := allocation.Parent
	if parent == nil {
		return false
	}
	if ast.IsVariableDeclaration(parent) && parent.Initializer() == allocation {
		for node := parent; node != nil && node != file.AsNode(); node = node.Parent {
			if ast.IsFunctionLike(node) {
				break // Exporting a callable does not export its private allocation.
			}
			if ast.GetCombinedModifierFlags(node)&(ast.ModifierFlagsExport|ast.ModifierFlagsDefault) != 0 {
				return false
			}
		}
		return true
	}
	container := work.constructedSourceContainer(source, owner)
	return container != nil && work.constructedContainerReadsObserved(source, container, owner)
}

// stagedConstructionUseAliases exposes the existing complete private-use relation.
// The caller supplies only original delivered writer-use relationships. The
// aliases describe source closure, not runtime identity or mutation absence.
func stagedConstructionUseAliases(construction sourceStandardConstructionContribution, owner *executableBodyOwner, writerUseCovered func(*ast.Node) bool) (map[ast.SymbolId]bool, bool) {
	if !construction.selectionComplete {
		return nil, false
	}
	file := ast.GetSourceFileOfNode(construction.site)
	index := owner.values.index(file)
	pop := index.privateUses
	if index.incomplete || index.normalDynamicScope || pop == nil || !pop.complete {
		return nil, false
	}
	aliases := make(map[ast.SymbolId]bool)
	for id, uses := range pop.uses {
		if len(uses) == 0 {
			continue
		}
		reference := uses[0].node
		symbol := owner.checker.GetSymbolAtLocation(reference)
		if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			continue
		}
		for _, site := range stagedReceiverRelations(reference, owner.values, index).sites {
			if site == construction.site {
				aliases[id] = true
			}
		}
	}
	if len(aliases) == 0 {
		return nil, false
	}
	// This source-use proof differs from the stronger private-callable purity
	// proof. Unrelated syntax/imports do not erase complete indexed references.
	// Actual exported aliases and unresolved references to these bindings deny it.
	if file.Symbol == nil || len(pop.unresolved[""]) != 0 {
		return nil, false
	}
	for _, exported := range owner.checker.GetExportsOfModule(file.Symbol) {
		if owner.checker.GetTypeOnlyAliasDeclaration(exported) != nil {
			continue
		}
		resolved := owner.checker.SkipAlias(exported)
		if resolved != nil && aliases[ast.GetSymbolId(resolved)] {
			return nil, false
		}
	}
	for id := range aliases {
		if uses := pop.uses[id]; len(uses) != 0 && len(pop.unresolved[uses[0].node.Text()]) != 0 {
			return nil, false
		}
	}
	for id := range aliases {
		uses := pop.uses[id]
		for _, use := range uses {
			node := unwrapSourceCallableReference(use.node)
			for node.Parent != nil && unwrapSourceCallableReference(node.Parent) == use.node {
				node = node.Parent
			}
			parent := node.Parent
			if parent == nil {
				return nil, false
			}
			if ast.IsVariableDeclaration(parent) && parent.Initializer() == node {
				symbol := owner.checker.GetSymbolAtLocation(parent.Name())
				if symbol == nil || !aliases[ast.GetSymbolId(symbol)] {
					return nil, false
				}
				continue
			}
			if ast.IsBinaryExpression(parent) && parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken && (parent.AsBinaryExpression().Left == node || parent.AsBinaryExpression().Right == node) {
				if parent.AsBinaryExpression().Left == node {
					continue
				}
				symbol := owner.checker.GetSymbolAtLocation(parent.AsBinaryExpression().Left)
				if symbol == nil || !aliases[ast.GetSymbolId(symbol)] {
					return nil, false
				}
				continue
			}
			if ast.IsPrefixUnaryExpression(parent) && parent.AsPrefixUnaryExpression().Operator == ast.KindExclamationToken {
				continue
			}
			if ast.IsIfStatement(parent) && parent.AsIfStatement().Expression == node {
				continue
			}
			if ast.IsTypeOfExpression(parent) || ast.IsVoidExpression(parent) {
				continue
			}
			if writerUseCovered(node) {
				continue
			}
			if ast.IsPropertyAccessExpression(parent) && parent.Expression() == node && ast.IsCallExpression(parent.Parent) && parent.Parent.Expression() == parent {
				_, name := accessorReceiver(parent)
				if name != "get" && name != "set" {
					return nil, false
				}
				// get returns stored data, not the receiver. A set result can expose the
				// receiver, so only a discarded Set is covered by this source relation.
				if name == "set" && !ast.IsExpressionStatement(parent.Parent.Parent) {
					return nil, false
				}
				continue
			}
			return nil, false
		}
	}
	return aliases, true
}

// constructedSourceContainer preserves an original assignment-result/Set source
// relationship. This is conditional data transport without table/key identity.
func (work *callableEffectWork) constructedSourceContainer(source *sourceStagedConstructedMember, owner *executableBodyOwner) *sourceStagedConstructedMember {
	expression := source.construction.site
	for expression.Parent != nil {
		parent := expression.Parent
		if unwrapSourceCallableReference(parent) == expression {
			expression = parent
			continue
		}
		if ast.IsBinaryExpression(parent) && parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken && parent.AsBinaryExpression().Right == expression {
			expression = parent
			continue
		}
		break
	}
	call := expression.Parent
	if call == nil || !ast.IsCallExpression(call) {
		return nil
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 2 || actuals[1] != expression {
		return nil
	}
	key := sourceStagedOperationKey{declaration: enclosingCallableNode(call), operation: call, kind: relativeDemandEffects}
	for _, candidate := range work.operationRecipes[key].constructedGroup {
		if candidate.kind == sourceNativeWeakMapSetEffect && candidate.construction.selectionComplete {
			copied := candidate
			return &copied
		}
	}
	return nil
}

// Every container Get that can expose this source allocation must already have
// a typed source receiver consumer. Public/unknown escapes remain unsupported.
func (work *callableEffectWork) constructedContainerReadsObserved(source, container *sourceStagedConstructedMember, owner *executableBodyOwner) bool {
	index := owner.values.index(ast.GetSourceFileOfNode(source.construction.site))
	for _, call := range index.calls {
		if !ast.IsPropertyAccessExpression(call.Expression()) {
			continue
		}
		receiver, name := accessorReceiver(call.Expression())
		if name != "get" {
			continue
		}
		matches := false
		for _, site := range stagedReceiverRelations(receiver, owner.values, index).sites {
			matches = matches || site == container.construction.site
		}
		if !matches {
			continue
		}
		parent := call.Parent
		if parent != nil && ast.IsExpressionStatement(parent) {
			continue
		}
		if parent == nil || !ast.IsVariableDeclaration(parent) || parent.Initializer() != call || !ast.IsIdentifier(parent.Name()) {
			return false
		}
		references := stagedReceiverRelations(parent.Name(), owner.values, index)
		known := false
		for _, site := range references.sites {
			known = known || site == source.construction.site
		}
		if !known {
			return false
		}
	}
	return true
}
