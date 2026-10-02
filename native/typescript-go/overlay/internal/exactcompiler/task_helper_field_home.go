package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// helperHasLexicalSuper distinguishes a field arrow's home from nested methods or class homes.
func helperHasLexicalSuper(work *ast.Node) bool {
	found := false
	walkNode(work, func(node *ast.Node) bool {
		if node != work && (ast.IsClassDeclaration(node) || ast.IsClassExpression(node) || ast.IsFunctionLike(node) && !ast.IsArrowFunction(node)) {
			return false
		}
		found = found || node.Kind == ast.KindSuperKeyword
		return !found
	})
	return found
}

func helperStaticMember(member *ast.Node) bool {
	if member.Modifiers() != nil {
		for _, modifier := range member.Modifiers().Nodes {
			if modifier.Kind == ast.KindStaticKeyword {
				return true
			}
		}
	}
	return false
}

// installHelperFieldHome captures the actual home once during class definition. Field arrows
// select it at initialization, retaining lexical super through subclassing and class-name writes.
// The generated method declares the symbol slot for checking. The prepended static block installs
// its closure before any authored static work can construct an instance.
func (lowering *jsxLowering) installHelperFieldHome(symbol *ast.Node, members, registrations *[]*ast.Node) {
	receiver := lowering.factory.NewKeywordExpression(ast.KindThisKeyword)
	prototype := lowering.factory.NewPropertyAccessExpression(receiver, nil, lowering.factory.NewIdentifier("prototype"), ast.NodeFlagsNone)
	fallback := lowering.factory.NewCallExpression(lowering.factory.NewPropertyAccessExpression(lowering.taskHelperIntrinsic("Object"), nil, lowering.factory.NewIdentifier("getPrototypeOf"), ast.NodeFlagsNone), nil, nil, lowering.factory.NewNodeList([]*ast.Node{receiver}), ast.NodeFlagsNone)
	body := lowering.factory.NewBlock(lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewReturnStatement(fallback)}), true)
	method := lowering.factory.NewMethodDeclaration(nil, nil, lowering.factory.NewComputedPropertyName(symbol), nil, nil, lowering.factory.NewNodeList(nil), lowering.factory.NewKeywordTypeNode(ast.KindObjectKeyword), nil, body)
	*members = append(*members, method)
	closure := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList(nil), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), prototype)
	target := lowering.factory.NewElementAccessExpression(prototype, nil, symbol, ast.NodeFlagsNone)
	*registrations = append(*registrations, lowering.factory.NewExpressionStatement(lowering.binary(target, ast.KindEqualsToken, closure)))
}
