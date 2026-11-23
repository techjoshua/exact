package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// closedLocalMapSetWriter excludes only direct invocation discovery for an
// original discarded Set on a fresh and lexically confined Map. Arguments and
// storage remain with the original Call's effect and data owners.
func (q *sourceValueQuery) closedLocalMapSetWriter(call *ast.Node, bindings sourceValueBindings) bool {
	if !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || !ast.IsExpressionStatement(call.Parent) {
		return false
	}
	get := call.Expression()
	if !ast.IsPropertyAccessExpression(get) || get.Name().Text() != "set" ||
		get.AsPropertyAccessExpression().QuestionDotToken != nil || call.AsCallExpression().QuestionDotToken != nil ||
		!ast.IsIdentifier(get.Expression()) {
		return false
	}
	source := ast.GetSourceFileOfNode(call)
	index := q.owner.indexes[source]
	uses := index.privateUses
	if uses == nil || !uses.complete || index.incomplete || index.normalDynamicScope {
		return false
	}
	id, known := uses.closedMapSetCalls[call]
	if !known {
		symbol := q.owner.checker.GetSymbolAtLocation(get.Expression())
		if symbol != nil && symbol.ValueDeclaration != nil && len(symbol.Declarations) == 1 && q.closedLocalMapSetSource(call, symbol, index) {
			id = ast.GetSymbolId(symbol)
		}
		if uses.closedMapSetCalls == nil {
			uses.closedMapSetCalls = make(map[*ast.Node]ast.SymbolId)
		}
		uses.closedMapSetCalls[call] = id
	}
	if id == 0 {
		return false
	}
	if _, replaced := bindings[id]; replaced {
		return false
	}
	if q.inputs != nil {
		if _, replaced := q.inputs.bindings[id]; replaced {
			return false
		}
	}
	return true
}

// closedLocalMapSetSource proves the allocation and nonescaping call sites once
// from this generation's index. Live input substitutions are checked separately.
func (q *sourceValueQuery) closedLocalMapSetSource(call *ast.Node, symbol *ast.Symbol, index sourceValueIndex) bool {
	get, declaration := call.Expression(), symbol.ValueDeclaration
	id := ast.GetSymbolId(symbol)
	if !ast.IsVariableDeclaration(declaration) || !ast.IsIdentifier(declaration.Name()) ||
		declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 ||
		len(index.bindings[id]) != 0 || len(index.privateUses.unresolved[symbol.Name]) != 0 || len(index.privateUses.unresolved[""]) != 0 {
		return false
	}
	owner := enclosingCallableNode(declaration)
	if !envelopeSynchronousFunction(owner) || declaration.Parent.Parent == nil || declaration.Parent.Parent.Parent != owner.Body() {
		return false
	}
	site := declaration.Initializer()
	if site == nil || !ast.IsNewExpression(site) || !ast.IsIdentifier(site.Expression()) || site.Expression().Text() != "Map" ||
		site.AsNewExpression().Arguments != nil && len(site.AsNewExpression().Arguments.Nodes) != 0 {
		return false
	}
	constructor := q.owner.checker.GetSymbolAtLocation(site.Expression())
	if constructor == nil || constructor.Flags&ast.SymbolFlagsAlias != 0 || constructor.ValueDeclaration == nil ||
		!standardLibrarySource(ast.GetSourceFileOfNode(constructor.ValueDeclaration)) ||
		len(index.bindings[ast.GetSymbolId(constructor)]) != 0 {
		return false
	}
	args := call.AsCallExpression().Arguments
	if args == nil || len(args.Nodes) != 2 || ast.IsSpreadElement(args.Nodes[0]) || ast.IsSpreadElement(args.Nodes[1]) {
		return false
	}
	method := nativeReceiverMemberSymbol(get, q.owner.checker)
	if method == nil || len(method.Declarations) != 1 {
		return false
	}
	member := method.Declarations[0]
	if !standardLibrarySource(ast.GetSourceFileOfNode(member)) || member.Kind != ast.KindMethodSignature || member.Parent == nil || !ast.IsInterfaceDeclaration(member.Parent) || member.Parent.Name().Text() != "Map" {
		return false
	}
	statements := owner.Body().AsBlock().Statements.Nodes
	last := statements[len(statements)-1]
	uses := index.privateUses.uses[id]
	if !ast.IsReturnStatement(last) || len(uses) != 2 {
		return false
	}
	for _, use := range uses {
		if use.node != get.Expression() && use.node != last.AsReturnStatement().Expression {
			return false
		}
	}
	region := enclosingCallableNode(call)
	if region == owner {
		return declaration.End() <= call.Pos() && call.End() <= last.Pos()
	}
	// A nested arrow may recurse, but the allocation cannot escape to any
	// invocation of the arrow after its owner's final return.
	if region == nil || !ast.IsArrowFunction(region) || ast.HasSyntacticModifier(region, ast.ModifierFlagsAsync) ||
		region.Parent == nil || !ast.IsVariableDeclaration(region.Parent) || region.Parent.Initializer() != region ||
		region.Parent.Parent == nil || region.Parent.Parent.Flags&ast.NodeFlagsConst == 0 ||
		region.Parent.Parent.Parent == nil || region.Parent.Parent.Parent.Parent != owner.Body() ||
		!ast.IsIdentifier(region.Parent.Name()) {
		return false
	}
	arrow := q.owner.checker.GetSymbolAtLocation(region.Parent.Name())
	if arrow == nil || arrow.ValueDeclaration != region.Parent || len(arrow.Declarations) != 1 || len(index.privateUses.unresolved[arrow.Name]) != 0 {
		return false
	}
	arrowID := ast.GetSymbolId(arrow)
	if len(index.bindings[arrowID]) != 0 {
		return false
	}
	for _, use := range index.privateUses.uses[arrowID] {
		parent := use.node.Parent
		if parent == nil || !ast.IsCallExpression(parent) || parent.Expression() != use.node ||
			use.region != region && (use.region != owner || parent.Pos() < declaration.End() || parent.End() > last.Pos()) {
			return false
		}
	}
	return true
}
