package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// unrepresentedIndexedWriterMapGuard leaves indexed writer reachability open
// when a declaration-only Map lookup has no represented result at this cut.
// The original evaluation keeps the Get and effects. Bound results and normal
// or staged owners stay with their ordinary completion consumer.
func (q *sourceValueQuery) unrepresentedIndexedWriterMapGuard(node *ast.Node, bindings sourceValueBindings) bool {
	if !ast.IsIfStatement(node) {
		return false
	}
	if !q.dependenciesOnly || q.executable == nil || q.operation != nil || q.returnObservation != nil ||
		q.callerInputs != nil || q.inputs != nil || q.stagedMember != nil || q.stagedWriter != nil ||
		q.stagedNativeGet != nil || q.stagedMap != nil || q.relativeInputRequest != nil ||
		q.installedMemberInput != nil || q.installedReceiverCall != nil || q.calleeWriteInventory != nil ||
		q.calleeWriteWork != nil || q.pendingMemberRequest != nil || q.reflectiveCopy != nil {
		return false
	}
	branch := node.AsIfStatement()
	if !ast.IsIdentifier(branch.Expression) || !ast.IsReturnStatement(branch.ThenStatement) || branch.ElseStatement != nil || node.Parent == nil || !ast.IsBlock(node.Parent) {
		return false
	}
	local := q.owner.checker.GetSymbolAtLocation(branch.Expression)
	if local == nil || local.ValueDeclaration == nil || !ast.IsVariableDeclaration(local.ValueDeclaration) {
		return false
	}
	binding := local.ValueDeclaration
	list := binding.Parent
	if list == nil || !ast.IsVariableDeclarationList(list) || len(list.AsVariableDeclarationList().Declarations.Nodes) != 1 || list.Parent == nil || !ast.IsVariableStatement(list.Parent) || list.Parent.Parent != node.Parent {
		return false
	}
	var previous *ast.Node
	for _, statement := range node.Parent.AsBlock().Statements.Nodes {
		if statement == node {
			break
		}
		previous = statement
	}
	if previous != list.Parent {
		return false
	}
	init := unwrapSourceCallableReference(binding.Initializer())
	if init == nil || !ast.IsCallExpression(init) || ast.IsOptionalChain(init) || !ast.IsPropertyAccessExpression(init.Expression()) || init.Expression().Name().Text() != "get" {
		return false
	}
	call := init
	if q.active[call] {
		return false
	}
	if _, substituted := bindings[ast.GetSymbolId(local)]; substituted {
		return false
	}
	member := call.Expression()
	if ast.IsOptionalChain(member) || !ast.IsIdentifier(member.Expression()) {
		return false
	}
	c := q.owner.checker
	symbol := c.GetSymbolAtLocation(member.Expression())
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return false
	}
	mapDecl := symbol.ValueDeclaration
	if mapDecl.Parent == nil || mapDecl.Parent.Flags&ast.NodeFlagsConst == 0 ||
		enclosingCallableNode(mapDecl) == nil || ast.GetSourceFileOfNode(mapDecl) != ast.GetSourceFileOfNode(binding) {
		return false
	}
	site := mapDecl.Initializer()
	if site == nil || !ast.IsNewExpression(site) || !ast.IsIdentifier(site.Expression()) ||
		!q.unrepresentedEmptyMapConstruction(site.Expression(), site, c.GetSymbolAtLocation(site.Expression()), bindings) {
		return false
	}
	id := ast.GetSymbolId(symbol)
	index := q.owner.index(ast.GetSourceFileOfNode(mapDecl))
	if _, substituted := bindings[id]; substituted || q.live[id] || len(index.bindings[id]) != 0 {
		return false
	}
	uses, complete := q.mapKeySourceUses(symbol, mapDecl)
	if !complete || len(uses) == 0 || len(uses) > 3 || len(index.privateUses.unresolved[""]) != 0 {
		return false
	}
	ownsRead := false
	for _, use := range uses {
		projection := use.node.Parent
		if projection == nil || !ast.IsPropertyAccessExpression(projection) || projection.Expression() != use.node ||
			ast.IsOptionalChain(projection) || projection.Parent == nil || !ast.IsCallExpression(projection.Parent) ||
			projection.Parent.Expression() != projection || ast.IsOptionalChain(projection.Parent) {
			return false
		}
		member := nativeReceiverMemberSymbol(projection, c)
		if member == nil || len(member.Declarations) != 1 {
			return false
		}
		declaration := member.Declarations[0]
		if declaration.Kind != ast.KindMethodSignature || declaration.Parent == nil || !ast.IsInterfaceDeclaration(declaration.Parent) ||
			declaration.Parent.Name().Text() != "Map" || !standardLibrarySource(ast.GetSourceFileOfNode(declaration)) {
			return false
		}
		actuals := restrictedInvocationArguments(projection.Parent.AsCallExpression())
		expected := 1
		switch projection.Name().Text() {
		case "get":
		case "set":
			expected = 2
		default:
			return false
		}
		if len(actuals) != expected {
			return false
		}
		for _, actual := range actuals {
			if ast.IsSpreadElement(actual) {
				return false
			}
		}
		ownsRead = ownsRead || projection == call.Expression()
	}
	if !ownsRead {
		return false
	}
	return true
}
