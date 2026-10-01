package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// privateAccessorBody checks the original accessor brand without invoking its committed body.
// A getter that reads no fields still rejects a borrowed receiver lacking the private declaration.
func (lowering *jsxLowering) privateAccessorBody(name, body *ast.Node) *ast.Node {
	brand := lowering.binary(name, ast.KindInKeyword, lowering.factory.NewKeywordExpression(ast.KindThisKeyword))
	invalid := lowering.factory.NewPrefixUnaryExpression(ast.KindExclamationToken, lowering.factory.NewParenthesizedExpression(brand))
	failure := lowering.factory.NewThrowStatement(lowering.factory.NewNewExpression(lowering.factory.NewIdentifier("TypeError"), nil, lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewStringLiteral("Cannot access private member on this receiver", ast.TokenFlagsNone)})))
	guard := lowering.factory.NewIfStatement(invalid, failure, nil)
	statements := append([]*ast.Node{guard}, body.AsBlock().Statements.Nodes...)
	return lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true)
}

// privateAccessorPlan separates executable accessors from private storage before reparenting.
type privateAccessorPlan struct {
	get, set *ast.Node
}

func (lowering *jsxLowering) capturePrivateAccessorPlans() {
	if lowering.checker == nil {
		return
	}
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsPropertyAccessExpression(node) || node.AsPropertyAccessExpression().Name().Kind != ast.KindPrivateIdentifier {
			return true
		}
		if symbol := lowering.checker.GetSymbolAtLocation(node); symbol != nil {
			plan := privateAccessorPlan{}
			for _, declaration := range symbol.Declarations {
				if ast.IsGetAccessorDeclaration(declaration) {
					plan.get = lowering.helperCompanionNames[nodeSpanKey(declaration)]
				} else if ast.IsSetAccessorDeclaration(declaration) {
					plan.set = lowering.helperCompanionNames[nodeSpanKey(declaration)]
				}
			}
			lowering.helperPrivateAccessors[nodeSpanKey(node)] = plan
		}
		return true
	})
}

// privateAccessorCompanion reads captured syntax without consulting the authored checker.
func (lowering *jsxLowering) privateAccessorCompanion(target *ast.Node, setter bool) *ast.Node {
	plan := lowering.helperPrivateAccessors[nodeSpanKey(target)]
	if setter {
		return plan.set
	}
	return plan.get
}

// privateAccessorInvocation uses the existing helper registry to retain branded receiver policy.
func (lowering *jsxLowering) privateAccessorInvocation(context, receiver, symbol *ast.Node, arguments []*ast.Node) *ast.Node {
	selected := lowering.factory.NewElementAccessExpression(receiver, nil, symbol, ast.NodeFlagsNone)
	helper := lowering.helperContextCall(context, "helper", []*ast.Node{selected, receiver})
	return lowering.factory.NewCallExpression(helper, nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
}

// privateAccessorAssignment returns the authored value even when the setter returns early.
func (lowering *jsxLowering) privateAccessorAssignment(context, receiver, symbol, value, target *ast.Node) *ast.Node {
	owner := lowering.mutationTemporary(target.AsPropertyAccessExpression().Expression)
	input := lowering.mutationTemporary(target)
	steps := []*ast.Node{
		lowering.binary(owner, ast.KindEqualsToken, receiver),
		lowering.binary(input, ast.KindEqualsToken, value),
		lowering.privateAccessorInvocation(context, owner, symbol, []*ast.Node{input}),
		input,
	}
	return lowering.mutationSequence(steps)
}

// privateHelperCall selects the receiver and original callable once, before arguments. Optional
// calls retain native nullish short-circuiting without putting a facade in a private-brand access.
func (lowering *jsxLowering) privateHelperCall(node, context *ast.Node, visitor *ast.NodeVisitor, read func(*ast.Node) *ast.Node) *ast.Node {
	call := node.AsCallExpression()
	member := call.Expression.AsPropertyAccessExpression()
	owner := lowering.mutationTemporary(member.Expression)
	selected := lowering.mutationTemporary(call.Expression)
	arguments := []*ast.Node{}
	for _, argument := range callArguments(node) {
		arguments = append(arguments, lowering.pendingHelperArgument(argument, visitor))
	}
	helper := lowering.helperContextCall(context, "helper", []*ast.Node{selected, owner})
	result := lowering.factory.NewCallExpression(helper, nil, nil, lowering.factory.NewNodeList(arguments), ast.NodeFlagsNone)
	if call.QuestionDotToken != nil {
		result = lowering.conditional(lowering.binary(selected, ast.KindEqualsEqualsToken, lowering.factory.NewKeywordExpression(ast.KindNullKeyword)), lowering.factory.NewVoidExpression(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone)), result)
	}
	result = lowering.mutationSequence([]*ast.Node{lowering.binary(selected, ast.KindEqualsToken, read(owner)), result})
	if member.QuestionDotToken != nil {
		result = lowering.conditional(lowering.binary(owner, ast.KindEqualsEqualsToken, lowering.factory.NewKeywordExpression(ast.KindNullKeyword)), lowering.factory.NewVoidExpression(lowering.factory.NewNumericLiteral("0", ast.TokenFlagsNone)), result)
	}
	result = lowering.mutationSequence([]*ast.Node{lowering.binary(owner, ast.KindEqualsToken, visitor.VisitNode(member.Expression)), result})
	if typeNode := lowering.mutationFacts.at(nodeSpanKey(node)).pending; typeNode != nil {
		result = lowering.factory.NewAsExpression(result, typeNode)
	}
	return result
}

// mutationSequence retains expression-level evaluation and the final authored result.
func (lowering *jsxLowering) mutationSequence(steps []*ast.Node) *ast.Node {
	result := steps[0]
	for _, step := range steps[1:] {
		result = lowering.binary(result, ast.KindCommaToken, step)
	}
	return lowering.factory.NewParenthesizedExpression(result)
}
