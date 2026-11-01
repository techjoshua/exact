package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceMemberOperationProof describes effects and call eligibility at one operation.
// It never certifies returned values, replacement identity or selected native methods.
type sourceMemberOperationProof struct {
	closed  bool
	cause   *ast.Node
	calls   map[*ast.Node]bool
	regions map[*ast.Node]bool
	sources []*ast.SourceFile
}

// sourceMemberOperationRegion belongs to one existing source callable or the eager module.
// Indexing groups syntax once. A query visits only regions reached before its operation.
type sourceMemberOperationRegion struct {
	// declaration is the existing deferred region key, not activation authority.
	declaration                                           *ast.Node
	hazards, members, writes, references, lexicalChildren []*ast.Node
	// Raw operation references only. The installed/eager consumer owns admission.
	thenOperations, calls, receivers, openCalls []*ast.Node
}

// sourceMemberOperationOwnsChild follows the same eager-name/deferred-body boundary
// as walkCallable and moduleDefinitionNodeIsDeferred. A computed name executes in
// the surrounding owner, including names nested inside reached source callables.
func sourceMemberOperationOwnsChild(parent, child *ast.Node) bool {
	// Reuse the module-definition category rule on this exact parent/child edge.
	// Constructors and nonstatic initializer bodies are deferred. A computed
	// name and static initialization remain owned by the enclosing eager region.
	if !ast.IsFunctionLike(parent) && !ast.IsPropertyDeclaration(parent) {
		return false
	}
	return moduleDefinitionNodeIsDeferred(child, parent.Parent)
}

func (owner *sourceValueOwner) memberOperationRegion(index *sourceValueIndex, node *ast.Node) *sourceMemberOperationRegion {
	var callable *ast.Node
	for child, p := node, node.Parent; p != nil; child, p = p, p.Parent {
		owner.indexWork++
		if sourceMemberOperationOwnsChild(p, child) {
			callable = p
			break
		}
	}
	region := index.operationRegions[callable]
	if region == nil {
		region = &sourceMemberOperationRegion{declaration: callable}
		index.operationRegions[callable] = region
	}
	return region
}

// initialFunctionMember uses the compiler's standard-entry Function/Object descriptor
// shapes, prototype links and absent keys. Unknown startup work and relevant analyzed
// mutation still invalidate local closure. This accounts for Get/Set effects only,
// never selected native method identity or immutable methods.
func initialFunctionMember(key string) bool {
	switch key {
	case "", "*", "arguments", "caller", "__proto__":
		return false
	}
	return true
}

// memberOperationDescriptor requires interference fencing after allocation. Literal own
// data evidence is independent of the conditional function prototype premise. Neither
// alternative asserts complete acquired values or ordinary native invocation identity.
func (query *sourceValueQuery) memberOperationDescriptor(origin *ast.Node, key string, result *accessorCandidates) bool {
	if origin == nil || key == "" || key == "*" {
		return false
	}
	if ast.IsFunctionLike(origin) && origin.Body() != nil {
		return initialFunctionMember(key)
	}
	if !ast.IsObjectLiteralExpression(origin) {
		return false
	}
	found := false
	for _, member := range origin.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, member) {
			return false
		}
		if ast.IsSpreadAssignment(member) || member.Name() == nil || ast.IsComputedPropertyName(member.Name()) || callableNameText(member.Name()) == "__proto__" {
			return false
		}
		if callableNameText(member.Name()) == key {
			found = ast.IsPropertyAssignment(member) || ast.IsShorthandPropertyAssignment(member)
		}
	}
	return found
}

// localOperationReference excludes host/global accessor reads, imported bindings and
// ambient declarations. A bare identifier is not an execution-neutrality certificate.
func (query *sourceValueQuery) localOperationReference(node *ast.Node, source *ast.SourceFile, result *accessorCandidates) bool {
	if !query.charge(result, node) || !ast.IsIdentifier(node) || !ast.IsExternalModule(source) {
		return false
	}
	symbol := query.owner.checker.GetSymbolAtLocation(node)
	if node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) {
		symbol = query.owner.checker.GetShorthandAssignmentValueSymbol(node.Parent)
	}
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || len(symbol.Declarations) == 0 {
		return false
	}
	for _, decl := range symbol.Declarations {
		if !query.charge(result, decl) || ast.GetSourceFileOfNode(decl) != source || ast.GetCombinedModifierFlags(decl)&ast.ModifierFlagsAmbient != 0 {
			return false
		}
		if !(ast.IsVariableDeclaration(decl) || ast.IsParameterDeclaration(decl) || ast.IsBindingElement(decl) || ast.IsFunctionLike(decl) && decl.Body() != nil) {
			return false
		}
	}
	return true
}

// memberOperationOccurrence admits only operations whose receiver/key/Set-RHS prefix
// cannot execute user code. Call arguments remain later than callee Get. A comma key,
// receiver call or Set RHS call is refused rather than ordered by source position.
func (query *sourceValueQuery) memberOperationOccurrence(at *ast.Node, key string, mode accessorTraversal, result *accessorCandidates) *ast.Node {
	if at == nil || !query.charge(result, at) {
		return nil
	}
	if ast.IsVariableDeclaration(at) {
		at = unwrapSourceCallableReferenceWithBudget(at.Initializer(), func(node *ast.Node) bool { return query.charge(result, node) })
	}
	if at != nil && ast.IsCallExpression(at) {
		if mode != accessorAcquire || !query.active[at] {
			return nil
		}
		at = unwrapSourceCallableReferenceWithBudget(at.AsCallExpression().Expression, func(node *ast.Node) bool { return query.charge(result, node) })
	}
	if at != nil && ast.IsIdentifier(at) && at.Parent != nil && (ast.IsPropertyAccessExpression(at.Parent) || ast.IsElementAccessExpression(at.Parent)) {
		at = at.Parent
	}
	if at == nil || !ast.IsPropertyAccessExpression(at) && !ast.IsElementAccessExpression(at) {
		return nil
	}
	receiver, name := accessorReceiver(at)
	source := ast.GetSourceFileOfNode(at)
	receiver = unwrapSourceCallableReferenceWithBudget(receiver, func(node *ast.Node) bool { return query.charge(result, node) })
	if name != key || receiver == nil || !query.localOperationReference(receiver, source, result) {
		return nil
	}
	if ast.IsElementAccessExpression(at) {
		keyExpr := unwrapSourceCallableReferenceWithBudget(at.AsElementAccessExpression().ArgumentExpression, func(node *ast.Node) bool { return query.charge(result, node) })
		if keyExpr == nil || !ast.IsStringLiteral(keyExpr) && !ast.IsNumericLiteral(keyExpr) {
			return nil
		}
	}
	if mode&accessorSet != 0 {
		parent := at.Parent
		if mode&accessorNoGet == 0 || parent == nil || !ast.IsBinaryExpression(parent) || parent.AsBinaryExpression().Left != at || parent.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
			return nil
		}
		rhs := unwrapSourceCallableReferenceWithBudget(parent.AsBinaryExpression().Right, func(node *ast.Node) bool { return query.charge(result, node) })
		if rhs == nil {
			return nil
		}
		if ast.IsIdentifier(rhs) {
			if !query.localOperationReference(rhs, source, result) {
				return nil
			}
		} else {
			switch rhs.Kind {
			case ast.KindArrowFunction, ast.KindFunctionExpression, ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindBigIntLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
			default:
				return nil
			}
		}
	}
	return at
}

// sourceMemberOperation shares the bounded index and query budget with acquisition.
// Only an eager same-source occurrence with admitted evaluation prefixes can close.
// Region reachability supplies call eligibility, not a source-time rule across arbitrary
// callables. Runtime edges, unknown effects, reentry and exhaustion retain uncertainty.
func (query *sourceValueQuery) sourceMemberOperation(origin *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates) (proof sourceMemberOperationProof) {
	proof.cause = origin
	key := name
	if len(projection) > 0 {
		key = projection[0]
	}
	if query.provingFunctionOperation || len(projection) > 1 || len(projection) == 1 && name != "" || mode&accessorReachable != 0 || mode&accessorEnumerate != 0 {
		return
	}
	if !query.memberOperationDescriptor(origin, key, result) {
		return
	}
	at := query.initializing
	if at == nil {
		at = query.reading
	}
	at = query.memberOperationOccurrence(at, key, mode, result)
	if at == nil || query.functionOperationOwner(origin, result) != nil {
		return
	}
	if query.functionOperationOwner(at, result) != nil {
		return
	}
	source := ast.GetSourceFileOfNode(origin)
	if source == nil || ast.GetSourceFileOfNode(at) != source {
		return
	}
	if ast.HasSyntacticModifier(origin, ast.ModifierFlagsAsync) || ast.IsFunctionExpression(origin) && origin.AsFunctionExpression().AsteriskToken != nil || ast.IsFunctionDeclaration(origin) && origin.AsFunctionDeclaration().AsteriskToken != nil {
		return
	}
	query.provingFunctionOperation = true
	defer func() { query.provingFunctionOperation = false }()
	index := query.owner.index(source)
	// Function-member prefix admission shares numeric startup's syntactic
	// dependency premise, independently of standard emit elision.
	if index.incomplete || len(index.runtimeImports) != 0 {
		proof.cause = source.AsNode()
		return
	}
	proof.calls = make(map[*ast.Node]bool)
	queue := []*ast.Node{nil}
	reached := map[*ast.Node]bool{nil: true}
	fail := func(node *ast.Node) { proof.cause = node }
	before := func(node, region *ast.Node) bool {
		if !query.charge(result, node) {
			return false
		}
		if region == nil && node.Pos() >= at.Pos() {
			return false
		}
		// At an active invocation, only argument/body descendants follow callee Get.
		for p := node; p != nil && p.Parent != nil; p = p.Parent {
			if !query.charge(result, p) {
				return false
			}
			parent := p.Parent
			if query.active[parent] && ast.IsCallExpression(parent) && p != parent.AsCallExpression().Expression {
				return false
			}
			if p == region {
				break
			}
		}
		return true
	}
	for len(queue) > 0 {
		callable := queue[0]
		queue = queue[1:]
		if !query.charge(result, callable) {
			return
		}
		region := index.operationRegions[callable]
		if region == nil {
			continue
		}
		for _, node := range region.hazards {
			if before(node, callable) {
				fail(node)
				return
			}
		}
		for _, node := range region.references {
			if before(node, callable) && !query.localOperationReference(node, source, result) {
				fail(node)
				return
			}
		}
		for _, node := range region.members {
			if !before(node, callable) {
				continue
			}
			if ast.IsNewExpression(node) || ast.IsTaggedTemplateExpression(node) {
				fail(node)
				return
			}
			if ast.IsCallExpression(node) {
				proof.calls[node] = true
				call := node.AsCallExpression()
				expr := unwrapSourceCallableReferenceWithBudget(call.Expression, func(node *ast.Node) bool { return query.charge(result, node) })
				if !query.numberCallClosed(node, source, index.bindings) {
					fail(node)
					return
				}
				temporary := accessorCandidates{}
				declarations := query.callDeclarations(expr, &temporary)
				if temporary.opaque {
					fail(node)
					return
				}
				if ast.IsFunctionExpression(expr) || ast.IsArrowFunction(expr) {
					declarations = append(declarations, expr)
				}
				for _, decl := range declarations {
					if !query.charge(result, decl) {
						return
					}
					if ast.IsVariableDeclaration(decl) {
						decl = unwrapSourceCallableReferenceWithBudget(decl.Initializer(), func(node *ast.Node) bool { return query.charge(result, node) })
					}
					if decl != nil && ast.IsFunctionLike(decl) && decl.Body() != nil && ast.GetSourceFileOfNode(decl) == source && !reached[decl] {
						reached[decl] = true
						queue = append(queue, decl)
					}
				}
				continue
			}
			receiver, member := accessorReceiver(node)
			read, write := accessorEvaluationMode(node)
			if member == "" || member == "*" || !read && !write || read && write {
				fail(node)
				return
			}
			temporary := accessorCandidates{}
			values := query.originsAt(receiver, node, bindings, &temporary)
			if temporary.opaque || len(values) == 0 {
				fail(node)
				return
			}
			for _, value := range values {
				if !query.charge(result, value.node) {
					return
				}
				if value.node == nil || len(value.path) != 0 || !query.memberOperationDescriptor(value.node, member, result) {
					fail(node)
					return
				}
			}
		}
		for _, left := range region.writes {
			if !before(left, callable) {
				continue
			}
			if ast.IsIdentifier(left) {
				if !query.localOperationReference(left, source, result) {
					fail(left)
					return
				}
				continue
			}
			if !ast.IsPropertyAccessExpression(left) && !ast.IsElementAccessExpression(left) {
				fail(left)
				return
			}
			receiver, _ := accessorReceiver(left)
			temporary := accessorCandidates{}
			values := query.originsAt(receiver, left, bindings, &temporary)
			if temporary.opaque || len(values) != 1 || values[0].node == nil || len(values[0].path) != 0 {
				fail(left)
				return
			}
		}

	}

	proof.closed = true
	proof.cause = nil
	proof.regions = reached
	return
}

// sourceMemberOperationHazard audits executable statements/declarations separately from
// expression evaluation. Admitted containers add no implicit user execution themselves.
// Using declarations, unknown executable declarations and unsupported expressions refuse
// closure. Their implicit work is not interpreted by a second walker or disposal engine.
func sourceMemberOperationHazard(node *ast.Node) bool {
	if ast.IsVariableDeclaration(node) && (ast.IsVarUsing(node) || ast.IsVarAwaitUsing(node)) {
		return true
	}
	if ast.IsStatement(node) {
		switch node.Kind {
		case ast.KindBlock, ast.KindExpressionStatement, ast.KindEmptyStatement, ast.KindVariableStatement,
			ast.KindFunctionDeclaration, ast.KindIfStatement, ast.KindReturnStatement, ast.KindThrowStatement,
			ast.KindTryStatement, ast.KindBreakStatement, ast.KindContinueStatement, ast.KindDebuggerStatement,
			ast.KindLabeledStatement, ast.KindNotEmittedStatement, ast.KindInterfaceDeclaration,
			ast.KindTypeAliasDeclaration, ast.KindImportDeclaration, ast.KindImportEqualsDeclaration,
			ast.KindExportDeclaration, ast.KindExportAssignment, ast.KindNamespaceExportDeclaration:
		default:
			return true
		}
	}
	switch node.Kind {
	case ast.KindComputedPropertyName, ast.KindSpreadAssignment, ast.KindSpreadElement, ast.KindObjectBindingPattern, ast.KindArrayBindingPattern, ast.KindDecorator:
		return true
	}
	if !ast.IsExpression(node) {
		return false
	}
	switch node.Kind {
	case ast.KindIdentifier, ast.KindNumericLiteral, ast.KindBigIntLiteral, ast.KindStringLiteral,
		ast.KindRegularExpressionLiteral, ast.KindNoSubstitutionTemplateLiteral, ast.KindTrueKeyword,
		ast.KindFalseKeyword, ast.KindNullKeyword, ast.KindThisKeyword, ast.KindFunctionExpression,
		ast.KindArrowFunction, ast.KindObjectLiteralExpression, ast.KindArrayLiteralExpression,
		ast.KindPropertyAccessExpression, ast.KindElementAccessExpression, ast.KindCallExpression,
		ast.KindNewExpression, ast.KindTaggedTemplateExpression, ast.KindParenthesizedExpression,
		ast.KindAsExpression, ast.KindTypeAssertionExpression, ast.KindNonNullExpression,
		ast.KindSatisfiesExpression, ast.KindConditionalExpression, ast.KindTypeOfExpression, ast.KindVoidExpression:
		return false
	case ast.KindPrefixUnaryExpression:
		// ToBoolean does not invoke user coercion. The index still visits the operand.
		return node.AsPrefixUnaryExpression().Operator != ast.KindExclamationToken
	case ast.KindBinaryExpression:
		switch node.AsBinaryExpression().OperatorToken.Kind {
		case ast.KindEqualsToken, ast.KindCommaToken, ast.KindBarBarToken, ast.KindAmpersandAmpersandToken,
			ast.KindQuestionQuestionToken, ast.KindEqualsEqualsEqualsToken, ast.KindExclamationEqualsEqualsToken:
			return false
		}
	}
	return true
}

func (query *sourceValueQuery) functionOperationOwner(node *ast.Node, result *accessorCandidates) *ast.Node {
	for child, p := node, node.Parent; p != nil; child, p = p, p.Parent {
		if !query.charge(result, p) {
			return p
		}
		if sourceMemberOperationOwnsChild(p, child) {
			return p
		}
	}
	return nil
}

// ordinaryFunctionMember recognizes the same declaration-owned routing convention
// as ordinary call/apply/bind input binding. It does not close the descriptor proof
// or renew startup assumptions. Actual source member values and effects stay separate.
func (query *sourceValueQuery) ordinaryFunctionMember(origin *ast.Node, projection []string, name string, mode accessorTraversal) (*ast.Symbol, *ast.Node) {
	if mode&accessorSet != 0 || mode&accessorReachable != 0 || mode&accessorEnumerate != 0 {
		return nil, nil
	}
	key := name
	if len(projection) == 1 && name == "" {
		key = projection[0]
	} else if len(projection) != 0 {
		return nil, nil
	}
	if key != "call" && key != "apply" && key != "bind" {
		return nil, nil
	}
	at := query.initializing
	// A nested normal member demand owns its call occurrence. The enclosing
	// callee acquisition must not lend its arguments to a getter's inner call.
	if query.operation != nil && query.operation.node != nil {
		at = query.operation.node
	}
	if at == nil {
		at = query.reading
	}
	if at != nil && ast.IsVariableDeclaration(at) {
		at = unwrapSourceCallableReference(at.Initializer())
	}
	for at != nil && !ast.IsCallExpression(at) {
		parent := at.Parent
		if parent == nil || !(ast.IsPropertyAccessExpression(parent) || ast.IsElementAccessExpression(parent) || unwrapSourceCallableReference(parent) == at || ast.IsCallExpression(parent) && parent.AsCallExpression().Expression == at) {
			return nil, nil
		}
		if !query.charge(&accessorCandidates{}, parent) {
			return nil, nil
		}
		at = parent
	}
	if at == nil {
		return nil, nil
	}
	_, method := restrictedInvocationMember(at.AsCallExpression().Expression, query.owner.checker)
	if method != key || !nativeFunctionInvocation(origin, key, query.owner.checker) {
		return nil, nil
	}
	return query.owner.checker.GetPropertyOfType(query.owner.checker.GetTypeAtLocation(origin), key), at
}

// ordinaryAdapterDataGet proves only this Get's mutation component. The routing
// header alone supplies no effect authority. Its live output must additionally
// preserve the standard data descriptor through the selected source prefix and
// contain no authored accessor, write or unresolved alternative.
func (query *sourceValueQuery) ordinaryAdapterDataGet(node *ast.Node, result *accessorCandidates) bool {
	if query.inputs == nil || query.operation == nil || query.operation.inputs != query.inputs || result.opaque || result.valueIncomplete || result.receiverIncomplete || result.ownOperation || len(result.values) == 0 || len(result.effects) != 0 || len(result.writes) != 0 || len(result.producers) != 0 || len(result.accessorMutations) != 0 {
		return false
	}
	slot := query.normalOperation(node, false)
	if slot == nil || slot.state != sourceOperationInProgress || !slot.authority.valid(query) {
		return false
	}
	for _, value := range result.values {
		if !query.charge(result, node) {
			return false
		}
		header := value.adapter
		if header == nil || header.operation != node || header.frame != query.inputs || normalCalleeGetOwner(node) != header.body.invocation || header.body.declaration == nil || !ast.IsFunctionLike(header.body.declaration) || header.body.declaration.Body() == nil {
			return false
		}
	}
	view := query.propertyView()
	return view != nil && query.normalDescriptorSources(view.sources, node, result)
}

// functionMemberWrite identifies a performed source method operation, not a chosen
// value or an intact descriptor. After that operation the inherited adapter cannot
// supply independent invocation authority. Conditional writes keep the original
// route, while lookup/Set uncertainty and actual replacement bodies remain separate.
func (query *sourceValueQuery) functionMemberWrite(origin *ast.Node, written []string, left, producer *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	if len(written) != 1 || written[0] != "call" && written[0] != "apply" && written[0] != "bind" {
		return false
	}
	return query.charge(result, left) && nativeFunctionInvocation(origin, written[0], query.owner.checker) && query.sourceCallableImplementation(origin, result) && query.sourceWritePrecedes(left, producer, bindings)
}
