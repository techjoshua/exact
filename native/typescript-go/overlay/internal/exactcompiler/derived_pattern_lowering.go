package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// lowerDerivedPatternStatement gives destructured derived locals one shared native pattern
// evaluation and independently observable selected values. The native pattern keeps aliases,
// defaults, rest, and nested destructuring semantics together.
func (lowering *jsxLowering) lowerDerivedPatternStatement(node *ast.Node) *ast.Node {
	if lowering.directServerFrameComponent(node) {
		return nil
	}
	statement := node.AsVariableStatement()
	list := statement.DeclarationList.AsVariableDeclarationList()
	changed := false
	for _, declaration := range list.Declarations.Nodes {
		if lowering.hasDerivedPattern(declaration) {
			changed = true
			break
		}
	}
	if !changed {
		return nil
	}
	var declarations []*ast.Node
	for _, declaration := range list.Declarations.Nodes {
		if lowering.hasDerivedPattern(declaration) {
			declarations = append(declarations, lowering.lowerDerivedPattern(declaration)...)
		} else {
			declarations = append(declarations, lowering.visitor.VisitNode(declaration))
		}
	}
	return lowering.factory.UpdateVariableStatement(statement, statement.Modifiers(), lowering.factory.UpdateVariableDeclarationList(list, lowering.factory.NewNodeList(declarations), list.Flags))
}

func (lowering *jsxLowering) hasDerivedPattern(node *ast.Node) bool {
	declaration := node.AsVariableDeclaration()
	if declaration.Initializer == nil || ast.IsIdentifier(declaration.Name()) {
		return false
	}
	for _, name := range bindingIdentifiers(declaration.Name()) {
		if _, found := lowering.derived[name.Pos()]; found {
			return true
		}
	}
	return false
}

// lowerDerivedPattern suspends cell reads within the native pattern's local scope. A default
// may refer to an earlier selected name, which is a plain value inside this evaluation.
func (lowering *jsxLowering) lowerDerivedPattern(node *ast.Node) []*ast.Node {
	declaration := node.AsVariableDeclaration()
	names := bindingIdentifiers(declaration.Name())
	bindings := make(map[int]ReactiveBinding)
	for _, name := range names {
		if binding, found := lowering.derived[name.Pos()]; found {
			bindings[name.Pos()] = binding
			delete(lowering.derived, name.Pos())
		}
	}
	pattern := lowering.visitor.VisitNode(declaration.Name())
	initializer := lowering.visitor.VisitNode(declaration.Initializer)
	for start, binding := range bindings {
		lowering.derived[start] = binding
	}
	properties := make([]*ast.Node, 0, len(names))
	for _, name := range names {
		properties = append(properties, lowering.factory.NewShorthandPropertyAssignment(nil, lowering.factory.NewIdentifier(name.Text()), nil, nil, nil, nil))
	}
	inner := lowering.factory.UpdateVariableDeclaration(declaration, pattern, declaration.ExclamationToken, declaration.Type, initializer)
	body := lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{
		lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(lowering.factory.NewNodeList([]*ast.Node{inner}), ast.NodeFlagsConst)),
		lowering.factory.NewReturnStatement(lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(properties), false)),
	}), true)
	group := lowering.materializedName("destructured", node.Pos())
	declarations := []*ast.Node{lowering.factory.NewVariableDeclaration(lowering.factory.NewIdentifier(group), nil, nil, lowering.call(lowering.names.derived, []*ast.Node{lowering.arrow(body)}))}
	for _, name := range names {
		selected := lowering.factory.NewElementAccessExpression(lowering.derivedGet(lowering.factory.NewIdentifier(group)), nil, lowering.factory.NewStringLiteral(name.Text(), ast.TokenFlagsNone), ast.NodeFlagsNone)
		var value *ast.Node = selected
		if _, found := bindings[name.Pos()]; found {
			value = lowering.call(lowering.names.derived, []*ast.Node{lowering.arrow(selected)})
		}
		declarations = append(declarations, lowering.factory.NewVariableDeclaration(name, nil, nil, value))
	}
	return declarations
}
