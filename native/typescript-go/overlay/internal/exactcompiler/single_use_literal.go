package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// singleUseLiteral returns an inline literal of the requested kind or the initializer of
// a private constant whose only authored reference is this operand. The operand
// may execute repeatedly. A consumer must still account for mutation through
// this use, including a getter or coercion hook that exposes its receiver.
func singleUseLiteral(expression *ast.Node, owner *sourceValueOwner, kind ast.Kind) *ast.Node {
	value := unwrapSourceCallableReference(expression)
	if value != nil && ast.IsIdentifier(value) {
		symbol := owner.checker.GetSymbolAtLocation(value)
		if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			return nil
		}
		decl := symbol.ValueDeclaration
		initializer := unwrapSourceCallableReference(decl.Initializer())
		if initializer == nil || initializer.Kind != kind {
			return nil
		}
		if decl.Parent.Flags&ast.NodeFlagsConst == 0 || !privateSingleUse(value, symbol, decl.Parent.Parent, owner) {
			return nil
		}
		value = initializer
	}
	if value != nil && value.Kind == kind {
		return value
	}
	return nil
}

// privateSingleUse checks the program's complete reference inventory for a
// local binding or private module declaration. Its use still owns its effects.
func privateSingleUse(value *ast.Node, symbol *ast.Symbol, statement *ast.Node, owner *sourceValueOwner) bool {
	decl := symbol.ValueDeclaration
	source := ast.GetSourceFileOfNode(value)
	if statement == nil || ast.GetSourceFileOfNode(decl) != source {
		return false
	}
	index := owner.index(source)
	pop := index.privateUses
	if index.incomplete || index.normalDynamicScope || pop == nil || !pop.complete || len(pop.unresolved[value.Text()]) != 0 {
		return false
	}
	id := ast.GetSymbolId(symbol)
	if enclosingCallableNode(decl) == nil && (!ast.IsExternalModule(source) || statement.Parent != source.AsNode() ||
		index.normalExportUnknown || index.normalExported[id] || ast.GetCombinedModifierFlags(decl)&ast.ModifierFlagsExport != 0) {
		return false
	}
	uses := pop.uses[id]
	return len(uses) == 1 && uses[0].node == value
}

// finalNamedObjectProperty selects a final explicit property with a nonnumeric
// name. A later spread or dynamic key may have replaced that property.
func finalNamedObjectProperty(expression *ast.Node, requested string) (*ast.Node, bool) {
	properties := expression.AsObjectLiteralExpression().Properties.Nodes
	for index := len(properties) - 1; index >= 0; index-- {
		property := properties[index]
		if ast.IsSpreadAssignment(property) {
			return nil, false
		}
		name := property.Name()
		if ast.IsComputedPropertyName(name) {
			name = unwrapRenderExpression(name.AsComputedPropertyName().Expression)
			if !ast.IsStringLiteral(name) && !ast.IsNoSubstitutionTemplateLiteral(name) && !ast.IsNumericLiteral(name) {
				return nil, false
			}
		}
		// These named properties cannot be numeric keys. Avoid applying
		// text access to syntax nodes that do not carry a literal name.
		if ast.IsNumericLiteral(name) {
			continue
		}
		if name == nil || (!ast.IsIdentifier(name) && !ast.IsStringLiteral(name) && !ast.IsNoSubstitutionTemplateLiteral(name)) {
			return nil, false
		}
		if name.Text() != requested {
			continue
		}
		return property, true
	}
	return nil, true
}
