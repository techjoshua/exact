package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// projectReactiveRead supplies the current possible producer returns of a
// component-owned derived read. The registration already owns callback effects
// and reactive tracking. A read supplies neither normal output nor authority to
// repeat the callback at runtime.
func (query *sourceValueQuery) projectReactiveRead(call *ast.Node, bindings sourceValueBindings, project func(sourceValue, sourceValueBindings), deferred func()) (accessorCandidates, bool) {
	if !query.dependenciesOnly || !ast.IsCallExpression(call) {
		return accessorCandidates{}, false
	}
	member := call.Expression()
	if !ast.IsPropertyAccessExpression(member) || member.Name().Text() != "get" || !ast.IsIdentifier(member.Expression()) {
		return accessorCandidates{}, false
	}
	c := query.owner.checker
	read := nativeReceiverMemberSymbol(member, c)
	if read == nil || len(read.Declarations) != 1 || !exactReactiveValueMember(read.Declarations[0]) {
		return accessorCandidates{}, false
	}
	symbol := c.GetSymbolAtLocation(member.Expression())
	if symbol == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return accessorCandidates{}, false
	}
	cell := symbol.ValueDeclaration
	factory := unwrapSourceCallableReference(cell.Initializer())
	if cell.Parent.Flags&ast.NodeFlagsConst == 0 || !ast.IsCallExpression(factory) || !componentReactiveMember(factory.Expression(), c) {
		return accessorCandidates{}, false
	}
	args := factory.AsCallExpression().Arguments.Nodes
	if len(args) != 1 || !invokedCallbackArgument(factory, 0, c) {
		return accessorCandidates{}, false
	}
	callbacks := eagerCallbackReferences(args[0], c)
	if len(callbacks) != 1 || callbacks[0] != unwrapSourceCallableReference(args[0]) || !ast.IsArrowFunction(callbacks[0]) || len(callbacks[0].Parameters()) != 0 {
		return accessorCandidates{}, false
	}
	result := accessorCandidates{opaque: true, valueIncomplete: true}
	index := query.owner.index(ast.GetSourceFileOfNode(cell))
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete || len(index.privateUses.unresolved[cell.Name().Text()]) != 0 {
		return accessorCandidates{}, false
	}
	// Restrict the relation to a local cell used only by direct reads. An
	// escaped cell or an authored replacement keeps ordinary call analysis.
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		if !query.charge(&result, use.node) {
			return result, true
		}
		get := use.node.Parent
		if !ast.IsPropertyAccessExpression(get) || get.Expression() != use.node || get.Name().Text() != "get" || !ast.IsCallExpression(get.Parent) || get.Parent.Expression() != get {
			return accessorCandidates{}, false
		}
	}
	query.withActiveInvocation(call, func() {
		query.projectSelectedSourceReturns(callbacks[0], call, bindings, nil, &result, project, deferred)
	})
	return result, true
}
