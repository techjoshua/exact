package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceThenReference retains an authored operation under its original inputs.
// A module reference is a may-operation from a selected eager dependency. A body
// reference is conditional on this normal body analysis, never index membership.
type sourceThenReference struct {
	operation  *ast.Node
	descriptor *ast.Node
	scope      acquiredCallableScope
	uncertain  bool
}

// settlementThenReferences reads an already prepared construction. It never
// enters module operations from a value observer or a descriptor field Get.
func (query *sourceValueQuery) settlementThenReferences(declaration *ast.Node, result *accessorCandidates) ([]sourceThenReference, bool) {
	view := query.propertyView()
	if view == nil || (view.state != sourcePropertyComplete && view.state != sourcePropertyRefused) || !view.produced {
		return nil, true
	}
	return view.references, view.incomplete
}

// consumePropertyModules is the former eager producer, run once after MAY
// discovery. Every module retains its original normal effect owner and inputs.
func (query *sourceValueQuery) consumePropertyModules(view *sourcePropertyReferenceView, result *accessorCandidates, before *sourceNormalOccurrence) {
	var references []sourceThenReference
	incomplete := false
	visited := make(map[*ast.SourceFile]bool)
	var module func(*ast.SourceFile)
	module = func(source *ast.SourceFile) {
		if source == nil || visited[source] {
			return
		}
		if !query.charge(result, source.AsNode()) {
			incomplete = true
			return
		}
		visited[source] = true
		index := query.owner.index(source)
		if index.incomplete {
			incomplete = true
			return
		}
		for _, edge := range index.runtimeImports {
			var dependency *ast.SourceFile
			state := sourceDependencyExecutableUnavailable
			found := false
			for _, selected := range view.edges {
				if !query.charge(result, edge) {
					incomplete = true
					return
				}
				if selected.edge == edge {
					dependency, state, found = selected.source, selected.state, true
					break
				}
			}
			if !found {
				incomplete = true
				view.incomplete = true
			}
			switch state {
			case sourceDependencyAvailable:
				module(dependency)
			case sourceDependencyErased:
				continue
			default:
				incomplete = true
			}
		}
		region := index.operationRegions[nil]
		if region == nil {
			return
		}
		// One source-file frame consumes the cached plan. E remains the
		// containing evaluation statement, independently of the frame's root R.
		sourceIdentity := view.normalSources[source]
		if sourceIdentity == nil || sourceIdentity.population == nil {
			incomplete = true
			return
		}
		if sourceIdentity.cyclic {
			incomplete = true
		}
		// This frame owns module-local pattern bindings across every cached demand.
		// Never borrow the caller map or discard bindings into a temporary map.
		moduleInputs := &sourceValueInputs{declaration: source.AsNode(), bindings: make(sourceValueBindings), defaults: make(map[*ast.Node]sourceDefaultInput), properties: view, population: sourceIdentity.population}
		beginNormalOperations(moduleInputs)
		defer releaseNormalOperations(moduleInputs)
		eager := &sourceValueQuery{owner: query.owner, executable: query.executable, remaining: query.remaining, active: query.active, facts: query.facts, inputs: moduleInputs}
		defer func() { query.remaining, query.facts = eager.remaining, eager.facts }()
		alreadyOwned := make(map[*sourceNormalOccurrence]bool)
		for _, entry := range view.entries {
			if !eager.charge(result, entry.operation) {
				incomplete = true
				return
			}
			if entry.normalOnly && entry.normalFrame == view.frame && entry.normalOwner == view.root {
				alreadyOwned[sourceIdentity.population.entries[entry.operation]] = true
			}
		}
		for _, operation := range view.operations {
			if !eager.charge(result, operation.operation) {
				incomplete = true
				return
			}
			if operation.frame == view.frame && operation.owner == query.effectOwner && !operation.finalized {
				alreadyOwned[sourceIdentity.population.entries[operation.operation]] = true
			}
		}
		covered := make(map[*ast.Node]bool)
		for _, demand := range query.owner.summary(source.AsNode()).normal {
			if demand.visitOnly {
				continue
			}
			operation := demand.node
			if propertyOperationAfterRoot(view, operation) {
				covered[operation] = true
				continue
			}
			entry := sourceIdentity.population.entries[operation]
			if entry == nil || entry.region != nil {
				continue
			}
			if before != nil && source == view.source && entry.ordinal >= before.ordinal {
				// The authenticated original statement frame consumes these events.
				// Auxiliary construction stops before that Call and its continuation.
				covered[operation] = true
				continue
			}
			skip := false
			for current := entry; current != nil; current = current.callOwner {
				if !eager.charge(result, operation) {
					incomplete = true
					return
				}
				if alreadyOwned[current] {
					skip = true
					break
				}
			}
			if skip {
				covered[operation] = true
				continue
			}
			effectOwner := entry.statement
			if effectOwner == nil {
				effectOwner = source.AsNode()
			}
			eager.effectOwner, eager.reading = effectOwner, operation
			eager.operation = &sourceOperationContext{node: operation, owner: effectOwner, inputs: moduleInputs}
			acquired := accessorCandidates{}
			if !eager.charge(&acquired, operation) {
				incomplete = true
				retainSourceOwnedObligations(effectOwner, operation, acquired, result)
				break
			}
			// Conditional/repeated entries retain MAY effects and residuals. Their
			// source recipe never creates a singleton actual operation disposition.
			if !entry.once || sourceIdentity.cyclic {
				eager.operation = nil
				incomplete = true
			}
			switch {
			case demand.fold != nil:
				eager.consumeNormalFold(*demand.fold, &acquired)
				if eager.normalSourceFoldResidual(entry, *demand.fold, moduleInputs, &acquired) {
					incomplete = true
				}
			case demand.phase != nil:
				eager.consumeNormalPhase(*demand.phase, moduleInputs.bindings, &acquired)
			case demand.operand != nil:
				eager.consumeNormalOperand(*demand.operand, source.AsNode(), moduleInputs.bindings, &acquired, moduleInputs)
			default:
				covered[operation] = true
				historical := eager.consumePriorPropertyCall(view, source, operation, &acquired)
				if !historical {
					eager.executeDemand(operation, source.AsNode(), moduleInputs.bindings, &acquired, nil, moduleInputs)
				}
				if ast.IsNewExpression(operation) || ast.IsTaggedTemplateExpression(operation) {
					incomplete = true
				}
				if ast.IsCallExpression(operation) {
					complete := historical
					if slot := moduleInputs.operations[operation]; !historical && slot != nil {
						complete = slot.selectionComplete
					}
					eager.publishModuleInitializer(view, source, operation, acquired, result)
					eager.finishPropertyEntry(view, operation, &acquired, complete)
					incomplete = incomplete || acquired.thenIncomplete || !complete
				}
			}
			references = append(references, acquired.thenReferences...)
			view.incomplete = view.incomplete || incomplete
			retainSourceOwnedObligations(effectOwner, operation, acquired, result)
		}
		// Indexes remain MAY inventory. They never supply another producer pass.
		for _, operation := range append(append([]*ast.Node{}, region.calls...), region.openCalls...) {
			if !eager.charge(result, operation) || !covered[operation] {
				incomplete = true
			}
		}
		for _, target := range region.thenOperations {
			if !eager.charge(result, target) {
				incomplete = true
				break
			}
			if ast.IsCallExpression(target) {
				if !covered[target] {
					incomplete = true
				}
				continue
			}
			owner := target.Parent
			if owner == nil || !covered[owner] {
				incomplete = true
			}
		}
	}
	module(view.source)
	view.references = append(view.references, references...)
	view.incomplete = view.incomplete || incomplete
}

func (query *sourceValueQuery) thenMutationSyntax(node *ast.Node) bool {
	if !ast.IsCallExpression(node) {
		return false
	}
	return resolvedReflectiveMutation(node.AsCallExpression().Expression, query.owner.checker, make(map[ast.SymbolId]bool))
}

func (query *sourceValueQuery) authoredThenDescriptor(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) (descriptor *ast.Node, possible, uncertain bool) {
	if !query.thenMutationSyntax(node) {
		return
	}
	call := node.AsCallExpression()
	_, method := restrictedInvocationMember(call.Expression, query.owner.checker)
	if call.Arguments == nil || len(call.Arguments.Nodes) < 2 {
		return nil, true, true
	}
	args := call.Arguments.Nodes
	if method == "defineProperty" {
		key := sourceLiteralMemberName(args[1])
		if key != "" && key != "then" {
			return
		}
	}
	prototype, other := query.thenPrototypeReceiver(args[0], bindings, result)
	if other {
		return
	}
	if method != "defineProperty" || len(args) != 3 {
		return nil, true, true
	}
	return unwrapSourceCallableReference(args[2]), true, !prototype || sourceLiteralMemberName(args[1]) != "then"
}

// thenPrototypeReceiver distinguishes the actual intrinsic Object prototype from
// Function.prototype and ordinary fresh literals. Unknown mutation receivers stay
// conservative after a relevant authored then/prototype operation has been found.
func (query *sourceValueQuery) thenPrototypeReceiver(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) (prototype, other bool) {
	terms := query.originsAt(node, node, bindings, result)
	prototype, other = len(terms) > 0, len(terms) > 0
	for _, term := range terms {
		standard := sourceFunctionPrototype(term, query.owner.checker)
		prototype = prototype && standard && term.node.Text() == "Object"
		unrelated := standard && term.node.Text() == "Function" || term.node != nil && len(term.path) == 0 && (ast.IsObjectLiteralExpression(term.node) || ast.IsArrayLiteralExpression(term.node))
		other = other && unrelated
	}
	return
}

// explicitObjectPrototype finds only source-visible prototype flow in arguments.
// Passive unknown values never acquire authority over builtin prototype state.
func (query *sourceValueQuery) explicitObjectPrototype(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	return query.explicitObjectPrototypePath(node, bindings, result, make(map[*ast.Node]bool))
}

// Alias cycles leave the prototype obligation unresolved. The path is local to
// this source walk, so a shared acyclic input is still inspected in each branch.
func (query *sourceValueQuery) explicitObjectPrototypePath(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates, active map[*ast.Node]bool) bool {
	if active[node] {
		result.thenIncomplete = true
		return false
	}
	active[node] = true
	defer delete(active, node)
	root, path := effectArgumentRoot(node)
	if root == nil || !query.charge(result, root) {
		return false
	}
	if ast.IsIdentifier(root) {
		if sourceFunctionPrototype(sourceValue{node: root, path: path}, query.owner.checker) {
			return root.Text() == "Object"
		}
		symbol := query.owner.checker.GetSymbolAtLocation(root)
		if root.Parent != nil && ast.IsShorthandPropertyAssignment(root.Parent) {
			symbol = query.owner.checker.GetShorthandAssignmentValueSymbol(root.Parent)
		}
		if symbol != nil {
			if terms, ok := bindings[ast.GetSymbolId(symbol)]; ok {
				for _, term := range terms {
					if sourceFunctionPrototype(term, query.owner.checker) && term.node.Text() == "Object" {
						return true
					}
				}
			}
			if !query.owner.bindingWritten(symbol) {
				for _, declaration := range symbol.Declarations {
					if ast.IsVariableDeclaration(declaration) && declaration.Initializer() != nil && declaration.Initializer() != node {
						return query.explicitObjectPrototypePath(declaration.Initializer(), bindings, result, active)
					}
				}
			}
		}
	}
	if ast.IsArrayLiteralExpression(root) {
		for _, element := range root.AsArrayLiteralExpression().Elements.Nodes {
			if ast.IsSpreadElement(element) {
				element = element.AsSpreadElement().Expression
			}
			if query.explicitObjectPrototypePath(element, bindings, result, active) {
				return true
			}
		}
	}
	if ast.IsObjectLiteralExpression(root) {
		for _, field := range root.AsObjectLiteralExpression().Properties.Nodes {
			var value *ast.Node
			switch {
			case ast.IsPropertyAssignment(field):
				value = field.Initializer()
			case ast.IsShorthandPropertyAssignment(field):
				value = field.Name()
			case ast.IsSpreadAssignment(field):
				value = field.AsSpreadAssignment().Expression
			}
			if value != nil && query.explicitObjectPrototypePath(value, bindings, result, active) {
				return true
			}
		}
	}
	return false
}

// thenReferenceScope retains the original actual invocation, not an indexed
// caller or the Get consumer. Mutable captured bindings still use liveValues.
func (query *sourceValueQuery) thenReferenceScope(bindings sourceValueBindings, result *accessorCandidates) acquiredCallableScope {
	scope := query.acquireCallableScope(bindings, result)
	if query.inputs != nil && query.inputs.invocation != nil {
		scope.creators[query.inputs.declaration] = sourceValueCreation{invocation: query.inputs.invocation}
	}
	return scope
}

// retainThenOperation is fed only by the existing normal demand owner. Generic
// interference suspends that context. Unknown passive arguments are not prototype
// inputs. Actual relevant mutations and explicit prototype escapes remain unknown.
func (query *sourceValueQuery) retainThenOperation(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	descriptor, possible, uncertain := query.authoredThenDescriptor(node, bindings, result)
	if possible {
		query.retainThenReference(sourceThenReference{operation: node, descriptor: descriptor, scope: query.thenReferenceScope(bindings, result), uncertain: uncertain}, result)
		return
	}
	mutation := planMutationOperation(node)
	if mutation.target != nil && (ast.IsPropertyAccessExpression(mutation.target) || ast.IsElementAccessExpression(mutation.target)) {
		receiver, key := accessorReceiver(mutation.target)
		if key == "then" || key == "" {
			if _, other := query.thenPrototypeReceiver(receiver, bindings, result); !other {
				query.retainThenReference(sourceThenReference{operation: node, scope: query.thenReferenceScope(bindings, result), uncertain: true}, result)
			}
		}
	}
	if !ast.IsCallExpression(node) || node.AsCallExpression().Arguments == nil {
		return
	}
	for _, argument := range node.AsCallExpression().Arguments.Nodes {
		if query.explicitObjectPrototype(argument, bindings, result) {
			query.retainThenReference(sourceThenReference{operation: node, scope: query.thenReferenceScope(bindings, result), uncertain: true}, result)
		}
	}
}

// retainOpaqueThenReceiver consumes only the actual ordinary invocation's input
// provenance. It does not execute a second Get or inspect passive unknown values.
// Standard library declarations keep their existing trusted native contract.
// Authored/opaque alternatives receiving the intrinsic prototype remain relevant
// even without an explicit then argument. Unknown then alternatives are not neutral.
func (query *sourceValueQuery) retainOpaqueThenReceiver(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	plan := planOrdinaryInvocation(node.AsCallExpression().Expression, restrictedInvocationArguments(node.AsCallExpression()), query.owner.checker, func(value *ast.Node) bool { return query.charge(result, value) })
	if !plan.adapted && !result.invocationOwned && !result.opaque && !result.valueIncomplete && !result.receiverIncomplete && nativeReceiverMemberDeclarations(node.AsCallExpression().Expression, query.owner.checker) {
		return
	}
	receiver := plan.receiver
	if receiver == nil && plan.target != nil {
		receiver, _ = restrictedInvocationMember(plan.target, query.owner.checker)
	}
	if receiver == nil {
		return
	}
	terms := query.originsAt(receiver, query.boundInputAcquisition(receiver, node), bindings, result)
	for _, term := range terms {
		if !query.charge(result, term.node) {
			result.thenIncomplete = true
			return
		}
		if sourceFunctionPrototype(term, query.owner.checker) && term.node.Text() == "Object" {
			query.retainThenReference(sourceThenReference{operation: node, scope: query.thenReferenceScope(bindings, result), uncertain: true}, result)
			return
		}
	}
}

// retainThenReference shares normal operation metadata with the installed plan's
// settlement consumer. The list belongs to this actual input occurrence only.
func (query *sourceValueQuery) retainThenReference(reference sourceThenReference, result *accessorCandidates) {
	result.thenReferences = append(result.thenReferences, reference)
	if query.inputs != nil && query.inputs.thenReferences != nil {
		query.inputs.thenReferences = append(query.inputs.thenReferences, reference)
	}
}

// unaccountedConstruction reuses the module-definition New target and indexed
// deferred regions, without invoking a constructor or inventing its captures.
// Only actually eager syntax or an admitted normal body's New reaches this owner.
// Source work with no installed constructor inputs remains explicitly incomplete.
// Foreign constructors do not become a speculative global-prototype fence.
func (query *sourceValueQuery) unaccountedConstruction(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	if !ast.IsNewExpression(node) {
		return false
	}
	call := node.AsNewExpression()
	if call.Arguments != nil {
		for _, argument := range call.Arguments.Nodes {
			if query.explicitObjectPrototype(argument, bindings, result) {
				return true
			}
		}
	}
	signature := query.owner.checker.GetResolvedSignature(node)
	if signature == nil {
		return false
	}
	target := signature.Declaration()
	if target == nil {
		// Default constructors have no signature declaration. Reuse the existing
		// callee origin domain, not a structural constructor type or a fake call.
		for _, origin := range query.originsAt(call.Expression, node, bindings, result) {
			if origin.node != nil && len(origin.path) == 0 && (ast.IsClassDeclaration(origin.node) || ast.IsClassExpression(origin.node)) {
				target = origin.node
				break
			}
		}
	}
	if target != nil && ast.IsConstructorDeclaration(target) {
		target = target.Parent
	}
	if target == nil {
		if symbol := sourceCallableReferenceSymbol(call.Expression, query.owner.checker); symbol != nil && symbol.ValueDeclaration != nil && ast.IsClassDeclaration(symbol.ValueDeclaration) {
			target = symbol.ValueDeclaration
		}
	}
	if target == nil || !ast.IsClassDeclaration(target) && !ast.IsClassExpression(target) || ast.GetSourceFileOfNode(target).IsDeclarationFile {
		return false
	}
	var class *ast.ClassLikeBase
	if ast.IsClassDeclaration(target) {
		class = &target.AsClassDeclaration().ClassLikeBase
	} else {
		class = &target.AsClassExpression().ClassLikeBase
	}
	if class.HeritageClauses != nil {
		return true
	}
	index := query.owner.index(ast.GetSourceFileOfNode(target))
	for _, member := range class.Members.Nodes {
		if !query.charge(result, member) {
			return true
		}
		if !ast.IsConstructorDeclaration(member) && (!ast.IsPropertyDeclaration(member) || ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic)) {
			continue
		}
		region := index.operationRegions[member]
		if region != nil && (len(region.calls) != 0 || len(region.members) != 0 || len(region.writes) != 0 || len(region.hazards) != 0 || len(region.openCalls) != 0) {
			return true
		}
	}
	return false
}

// normalSourceFoldResidual retains unclassified eager work at its source owner.
// A receiver identifier is discharged by its one actual parent Get, so Promise
// is never acquired a second time to close the nested descriptor recipe.
func (query *sourceValueQuery) normalSourceFoldResidual(entry *sourceNormalOccurrence, fold sourceNormalFold, inputs *sourceValueInputs, result *accessorCandidates) bool {
	if fold.kind == sourceNormalEnter {
		return false
	}
	if fold.kind == sourceNormalResidual {
		return true
	}
	if inputs.writeComponents[fold.node] == sourceWriteNoWrites {
		return false
	}
	if ast.IsPropertyAccessExpression(fold.node) || ast.IsElementAccessExpression(fold.node) {
		return true
	}
	if ast.IsIdentifier(fold.node) && !sourceNormalStructural(fold.node) {
		parent := entry.parent
		if parent != nil && (ast.IsPropertyAccessExpression(parent.node) || ast.IsElementAccessExpression(parent.node)) && parent.node.Expression() == fold.node {
			return false
		}
		// Existing local binding acquisition has no property accessor. This keeps
		// source effect coverage, without minting initialization or body purity.
		if query.localOperationReference(fold.node, ast.GetSourceFileOfNode(fold.node), result) {
			return false
		}
		return true
	}
	return false
}

// sourceSettlementPrototype relates one implicit source Get to a possible builtin
// prototype writer. It supplies no runtime identity, absence or completed value.
func (query *sourceValueQuery) sourceSettlementPrototype(value sourceValue, origin *ast.Node, get *sourceGetInputs) bool {
	if !query.dependenciesOnly || get == nil || get.propertyKey != "then" || get.receiver.node != origin || len(get.receiver.path) != 0 || origin == nil || !ast.IsObjectLiteralExpression(origin) || get.operation == nil || !ast.IsReturnStatement(get.operation) || unwrapSourceCallableReference(get.operation.AsReturnStatement().Expression) != origin {
		return false
	}
	async, ordinary := ordinaryResultCategory(enclosingCallableNode(get.operation))
	if !async || !ordinary || !sourceFunctionPrototype(value, query.owner.checker) || value.node == nil || value.node.Text() != "Object" {
		return false
	}
	symbol := query.owner.checker.GetSymbolAtLocation(value.node)
	if symbol == nil || query.owner.bindingWritten(symbol) || len(query.owner.index(ast.GetSourceFileOfNode(value.node)).bindings[ast.GetSymbolId(symbol)]) != 0 || len(query.owner.index(ast.GetSourceFileOfNode(get.operation)).bindings[ast.GetSymbolId(symbol)]) != 0 {
		return false
	}
	for _, field := range origin.AsObjectLiteralExpression().Properties.Nodes {
		if field.Name() == nil || ast.IsComputedPropertyName(field.Name()) || ast.IsSpreadAssignment(field) || callableNameText(field.Name()) == "__proto__" || callableNameText(field.Name()) == "then" {
			return false
		}
	}
	return true
}

// sourceSettlementObligations accounts only for source Get effects. In particular,
// an empty population contains no undefined value or normal fulfillment receipt.
// All state is request-local and selected imports retain the current owner lease.
type sourceSettlementObligations struct {
	effects    accessorCandidates
	incomplete bool
}

// sourceSettlementThen visits only current source indexes and selected imports.
// Writer inputs retain original symbolic scopes, without entering a normal plan.
func (query *sourceValueQuery) sourceSettlementThen(get *sourceGetInputs, bindings sourceValueBindings) sourceSettlementObligations {
	obligations := sourceSettlementObligations{}
	// The literal prototype setter with null removes this inherited route. The
	// expression's ordinary effects were already collected by its source owner.
	for _, field := range get.receiver.node.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsPropertyAssignment(field) && callableNameText(field.Name()) == "__proto__" && unwrapSourceCallableReference(field.Initializer()).Kind == ast.KindNullKeyword {
			return obligations
		}
	}
	q := newSourceDependencyQuery(get.operation, query.owner.checker, query.executable, query.effectOwner)
	q.remaining, q.creators = query.remaining, query.creators
	defer q.publishDependencyStatistics()
	defer func() { query.remaining = q.remaining }()
	result := &obligations.effects
	seen := make(map[*ast.SourceFile]bool)
	var inspect func(*ast.SourceFile)
	inspect = func(source *ast.SourceFile) {
		if source == nil || seen[source] {
			return
		}
		seen[source] = true
		if !q.charge(result, source.AsNode()) {
			obligations.incomplete = true
			return
		}
		index := q.owner.index(source)
		obligations.incomplete = obligations.incomplete || index.incomplete
		for _, edge := range index.runtimeImports {
			dependency, state := q.operationDependencyState(edge, result)
			switch state {
			case sourceDependencyAvailable:
				inspect(dependency)
			case sourceDependencyErased:
			default:
				obligations.incomplete = true
			}
		}
		for owner, region := range index.operationRegions {
			// A dormant constructor or instance field cannot contribute merely
			// because its syntax was indexed. Actual New remains open below.
			if owner != nil && (ast.IsConstructorDeclaration(owner) || ast.IsPropertyDeclaration(owner) && !ast.HasSyntacticModifier(owner, ast.ModifierFlagsStatic)) {
				continue
			}
			for _, call := range region.calls {
				if q.afterRead(call) {
					continue
				}
				if possible, _ := q.reachable(call, bindings); !possible {
					continue
				}
				if !q.charge(result, call) {
					obligations.incomplete = true
					return
				}
				_, method := restrictedInvocationMember(call.AsCallExpression().Expression, q.owner.checker)
				args := call.AsCallExpression().Arguments
				// Apply the descriptor owner's literal key mismatch law before
				// acquiring writer inputs for a source-only candidate.
				key := ""
				if args != nil && len(args.Nodes) > 1 {
					key = sourceLiteralMemberName(args.Nodes[1])
				}
				if method == "defineProperty" && (key == "" || key == "then") {
					values, possible := q.reflectiveMemberValuesAtGet(get.receiver.node, []string{"then"}, "", call, accessorAcquire, bindings, result, get, nil)
					if possible {
						// MAY descriptors cannot close the resulting then value. Known
						// callable alternatives still retain their existing body donors.
						part := accessorCandidates{values: values}
						retainCallableThenEffects(&part, get.operation)
						mergeAccessorCandidates(result, part)
						obligations.incomplete = true
					}
				}

				for _, input := range q.memberWriterInputs(call, bindings, result, nil) {
					q.memberWriterScope(input, func() {
						if possible, _ := q.reachable(call, input.scope.bindings); !possible {
							return
						}
						part := accessorCandidates{}
						q.retainThenOperation(call, input.scope.bindings, &part)
						q.retainOpaqueThenReceiver(call, input.scope.bindings, &part)
						obligations.incomplete = obligations.incomplete || len(part.thenReferences) != 0 || part.thenIncomplete || part.opaque
					})
				}
			}
			for _, write := range region.writes {
				if q.afterRead(write) {
					continue
				}
				for _, input := range q.memberWriterInputs(write, bindings, result, nil) {
					q.memberWriterScope(input, func() {
						part := accessorCandidates{}
						if possible, _ := q.reachable(write, input.scope.bindings); !possible {
							return
						}
						q.retainThenOperation(write.Parent, input.scope.bindings, &part)
						if ast.IsPropertyAccessExpression(write) || ast.IsElementAccessExpression(write) {
							receiver, key := accessorReceiver(write)
							if key == "then" || key == "" {
								for _, prototype := range q.originsAt(receiver, write, input.scope.bindings, &part) {
									if !q.sourceSettlementPrototype(prototype, get.receiver.node, get) {
										continue
									}
									cut := q.memberWriterReadCut(nil, bindings, result)
									q.memberValuesAtGet(prototype.node, []string{"prototype", "then"}, "", accessorAcquire, input.scope.bindings, result, func(value sourceValue) {
										q.retainSourceThenValue(value, get.operation, input.scope.bindings, result)
									}, sourceMemberOperationProof{}, nil, cut)
								}
							}
							if key == "__proto__" {
								prototype, _ := q.thenPrototypeReceiver(receiver, input.scope.bindings, &part)
								obligations.incomplete = obligations.incomplete || prototype
							}
						}
						obligations.incomplete = obligations.incomplete || len(part.thenReferences) != 0 || part.thenIncomplete || part.opaque
					})
				}
			}
			for _, call := range region.openCalls {
				if q.afterRead(call) {
					continue
				}
				for _, input := range q.memberWriterInputs(call, bindings, result, nil) {
					q.memberWriterScope(input, func() {
						if possible, _ := q.reachable(call, input.scope.bindings); !possible {
							return
						}
						obligations.incomplete = obligations.incomplete || q.unaccountedConstruction(call, input.scope.bindings, result) || ast.IsTaggedTemplateExpression(call)
					})
				}
			}
		}
	}
	inspect(ast.GetSourceFileOfNode(get.operation))
	// Values were used only to retain callable then donors. They are not
	// observations of fulfillment or inputs to another acquisition.
	obligations.effects.values = nil
	obligations.effects.callableScopes = nil
	return obligations
}
