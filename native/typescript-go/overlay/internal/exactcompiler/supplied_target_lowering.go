package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

func (lowering *jsxLowering) suppliedTargetComponentNode(component Component) *ast.Node {
	var result *ast.Node
	walkNode(lowering.sourceFile.AsNode(), func(candidate *ast.Node) bool {
		if (ast.IsFunctionDeclaration(candidate) || ast.IsFunctionExpression(candidate) || ast.IsArrowFunction(candidate)) && candidate.Pos() == component.Start && candidate.End() == component.Start+component.Length {
			result = candidate
			return false
		}
		return result == nil
	})
	return result
}

// suppliedTargetOwner uses the lexical component, never a namespace or a descendant selector.
func (lowering *jsxLowering) suppliedTargetOwner(node *ast.Node) (Component, bool) {
	var owner Component
	found := false
	for _, component := range lowering.components {
		if node.Pos() >= component.Start && node.End() <= component.Start+component.Length && (!found || component.Length < owner.Length) {
			owner, found = component, true
		}
	}
	return owner, found
}

// implicitSuppliedTargetChild leaves observation in the component's ordinary reactive child range.
func (lowering *jsxLowering) implicitSuppliedTargetChild(node *ast.Node) *ast.Node {
	owner, found := lowering.suppliedTargetOwner(node)
	if !found {
		return lowering.factory.NewIdentifier("undefined")
	}
	component := lowering.suppliedTargetComponentNode(owner)
	name := componentPropsParameterName(component)
	if name == "" {
		name = lowering.names.suppliedProps
	}
	child := lowering.factory.NewPropertyAccessExpression(lowering.factory.NewParenthesizedExpression(lowering.factory.NewAsExpression(lowering.factory.NewAsExpression(lowering.factory.NewIdentifier(name), lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)), lowering.suppliedChildShape())), nil, lowering.factory.NewIdentifier("children"), ast.NodeFlagsNone)
	return child
}

// componentNeedsSuppliedProps requests a generated input only when source has no named input.
func (lowering *jsxLowering) componentNeedsSuppliedProps(name string) bool {
	component, exists := lowering.components[name]
	if !exists || !component.Targets {
		return false
	}
	node := lowering.suppliedTargetComponentNode(component)
	if node == nil || componentPropsParameterName(node) != "" {
		return false
	}
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if ast.IsJsxSelfClosingElement(candidate) && sourceText(lowering.sourceFile, openingTag(candidate)) == "_target" {
			owner, owned := lowering.suppliedTargetOwner(candidate)
			found = owned && owner.Start == component.Start && owner.Length == component.Length
		}
		return !found
	})
	return found
}

// suppliedChildShape keeps generated TypeScript independent of the author's public prop keys.
func (lowering *jsxLowering) suppliedChildShape() *ast.Node {
	return lowering.factory.NewTypeLiteralNode(lowering.factory.NewNodeList([]*ast.Node{
		lowering.factory.NewPropertySignatureDeclaration(nil, lowering.factory.NewIdentifier("children"), lowering.factory.NewToken(ast.KindQuestionToken), lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword), nil),
	}))
}

// suppliedComponentParameters retains one props object and exposes it before destructuring.
func (lowering *jsxLowering) suppliedComponentParameters(name string, parameters *ast.NodeList) *ast.NodeList {
	if !lowering.componentNeedsSuppliedProps(name) {
		return parameters
	}
	nodes := append([]*ast.Node(nil), parameters.Nodes...)
	for index, node := range nodes {
		parameter := node.AsParameterDeclaration()
		if ast.IsIdentifier(parameter.Name()) {
			if parameter.Name().Text() == "this" {
				continue
			}
			return parameters
		}
		shape := lowering.suppliedChildShape()
		if parameter.Type != nil {
			shape = lowering.factory.NewIntersectionTypeNode(lowering.factory.NewNodeList([]*ast.Node{parameter.Type, shape}))
		}
		nodes[index] = lowering.factory.UpdateParameterDeclaration(parameter, parameter.Modifiers(), parameter.DotDotDotToken,
			lowering.factory.NewIdentifier(lowering.names.suppliedProps), parameter.QuestionToken, shape, parameter.Initializer)
		return lowering.factory.NewNodeList(nodes)
	}
	nodes = append(nodes, lowering.factory.NewParameterDeclaration(nil, nil,
		lowering.factory.NewIdentifier(lowering.names.suppliedProps), nil, lowering.suppliedChildShape(), nil))
	return lowering.factory.NewNodeList(nodes)
}

// suppliedComponentBody preserves authored destructuring while the implicit target keeps the input.
func (lowering *jsxLowering) suppliedComponentBody(name string, parameters *ast.NodeList, body *ast.Node) *ast.Node {
	if !lowering.componentNeedsSuppliedProps(name) || body == nil || !ast.IsBlock(body) {
		return body
	}
	for _, node := range parameters.Nodes {
		parameter := node.AsParameterDeclaration()
		if ast.IsIdentifier(parameter.Name()) {
			continue
		}
		binding := lowering.factory.NewVariableStatement(nil, lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewVariableDeclaration(parameter.Name(), nil, nil, lowering.factory.NewIdentifier(lowering.names.suppliedProps))}), ast.NodeFlagsConst))
		statements := append([]*ast.Node{binding}, body.AsBlock().Statements.Nodes...)
		return lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true)
	}
	return body
}
