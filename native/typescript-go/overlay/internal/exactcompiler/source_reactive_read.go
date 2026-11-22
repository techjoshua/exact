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
	var result accessorCandidates
	producer := query.localReactiveReadProducer(call.Expression(), &result)
	if producer == nil {
		return result, result.opaque
	}
	result.opaque, result.valueIncomplete = true, true
	query.withActiveInvocation(call, func() {
		query.projectSelectedSourceReturns(producer, call, bindings, nil, &result, project, deferred)
	})
	return result, true
}

// localReactiveReadProducer identifies a private cell whose framework-owned Get
// cannot have been replaced by authored code. Its producer keeps its own effects.
func (query *sourceValueQuery) localReactiveReadProducer(member *ast.Node, result *accessorCandidates) *ast.Node {
	if !ast.IsPropertyAccessExpression(member) || member.Name().Text() != "get" || !ast.IsIdentifier(member.Expression()) {
		return nil
	}
	c := query.owner.checker
	read := nativeReceiverMemberSymbol(member, c)
	if read == nil || len(read.Declarations) != 1 || !exactReactiveValueMember(read.Declarations[0]) {
		return nil
	}
	symbol := c.GetSymbolAtLocation(member.Expression())
	if symbol == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return nil
	}
	cell := symbol.ValueDeclaration
	factory := unwrapSourceCallableReference(cell.Initializer())
	if cell.Parent.Flags&ast.NodeFlagsConst == 0 || !ast.IsCallExpression(factory) || !componentReactiveMember(factory.Expression(), c) {
		return nil
	}
	args := factory.AsCallExpression().Arguments.Nodes
	if len(args) != 1 || !invokedCallbackArgument(factory, 0, c) {
		return nil
	}
	callbacks := eagerCallbackReferences(args[0], c)
	if len(callbacks) != 1 || callbacks[0] != unwrapSourceCallableReference(args[0]) || !ast.IsArrowFunction(callbacks[0]) || len(callbacks[0].Parameters()) != 0 {
		return nil
	}
	index := query.owner.index(ast.GetSourceFileOfNode(cell))
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete || len(index.privateUses.unresolved[cell.Name().Text()]) != 0 {
		return nil
	}
	// Restrict the relation to a local cell used only by direct reads. An
	// escaped cell or an authored replacement keeps ordinary call analysis.
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		if !query.charge(result, use.node) {
			result.opaque, result.valueIncomplete = true, true
			return nil
		}
		get := use.node.Parent
		if !ast.IsPropertyAccessExpression(get) || get.Expression() != use.node || get.Name().Text() != "get" || !ast.IsCallExpression(get.Parent) || get.Parent.Expression() != get {
			return nil
		}
	}
	return callbacks[0]
}
