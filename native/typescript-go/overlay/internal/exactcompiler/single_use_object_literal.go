package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// singleUseObjectLiteral returns an inline object literal or the initializer of
// a private constant whose only authored reference is this operand. The operand
// may execute repeatedly. A consumer must still account for mutation through
// this use, including a getter or coercion hook that exposes its receiver.
func singleUseObjectLiteral(expression *ast.Node, owner *executableBodyOwner) *ast.Node {
	value := unwrapSourceCallableReference(expression)
	if value != nil && ast.IsIdentifier(value) {
		symbol := owner.checker.GetSymbolAtLocation(value)
		if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			return nil
		}
		decl := symbol.ValueDeclaration
		source := ast.GetSourceFileOfNode(value)
		if decl.Parent.Flags&ast.NodeFlagsConst == 0 || ast.GetSourceFileOfNode(decl) != source {
			return nil
		}
		index := owner.values.index(source)
		pop := index.privateUses
		if index.incomplete || index.normalDynamicScope || pop == nil || !pop.complete || len(pop.unresolved[value.Text()]) != 0 {
			return nil
		}
		id := ast.GetSymbolId(symbol)
		if enclosingCallableNode(decl) == nil && (!ast.IsExternalModule(source) ||
			decl.Parent.Parent == nil || decl.Parent.Parent.Parent != source.AsNode() ||
			index.normalExportUnknown || index.normalExported[id] || ast.GetCombinedModifierFlags(decl)&ast.ModifierFlagsExport != 0) {
			return nil
		}
		uses := pop.uses[id]
		if len(uses) != 1 || uses[0].node != value {
			return nil
		}
		value = unwrapSourceCallableReference(decl.Initializer())
	}
	if value != nil && ast.IsObjectLiteralExpression(value) {
		return value
	}
	return nil
}
