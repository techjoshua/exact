package exactcompiler

import (
	"fmt"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/core"
	"github.com/microsoft/typescript-go/internal/scanner"
)

func (lowering *jsxLowering) componentReactive(expression *ast.Node) *ast.Node {
	return lowering.call(lowering.names.derived, []*ast.Node{lowering.arrow(expression)})
}

func (lowering *jsxLowering) stateValue(path []string) *ast.Node {
	result := lowering.stateRoot()
	for _, segment := range path {
		if scanner.IsIdentifierText(segment, core.LanguageVariantStandard) {
			result = lowering.factory.NewPropertyAccessExpression(
				result,
				nil,
				lowering.factory.NewIdentifier(segment),
				ast.NodeFlagsNone,
			)
		} else {
			result = lowering.factory.NewElementAccessExpression(
				result,
				nil,
				lowering.factory.NewStringLiteral(segment, ast.TokenFlagsNone),
				ast.NodeFlagsNone,
			)
		}
	}
	return result
}

func (lowering *jsxLowering) taskBinding(
	component string,
	name string,
) (ReactiveBinding, bool) {
	for _, binding := range lowering.bindings {
		if binding.Component == component && binding.Name == name {
			return binding, true
		}
	}
	return ReactiveBinding{}, false
}

func (lowering *jsxLowering) identifierMatchesBinding(
	identifier *ast.Node,
	start int,
) bool {
	if lowering.checker == nil {
		return false
	}
	symbol := lowering.checker.GetSymbolAtLocation(identifier)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if name := declaration.Name(); name != nil && name.Pos() == start {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) lowerStateWrite(
	node *ast.Node,
	write StateWrite,
) *ast.Node {
	switch write.Operation {
	case "assignment", "update":
		if !ast.IsBinaryExpression(node) {
			if write.Operation == "update" {
				return lowering.lowerStateUpdate(node, write)
			}
			return nil
		}
		expression := node.AsBinaryExpression()
		if expression.OperatorToken.Kind == ast.KindEqualsToken {
			if taskNode, task, exists := lowering.assignedTask(expression.Right); exists {
				return lowering.lowerTask(taskNode, task)
			}
		}
		value := lowering.visitor.VisitNode(expression.Right)
		if expression.OperatorToken.Kind == ast.KindEqualsToken {
			return lowering.call(
				lowering.names.write,
				[]*ast.Node{
					lowering.stateWriteRoot(write),
					lowering.stateWritePathNode(write),
					lowering.arrow(value),
				},
			)
		}
		operator, exists := compoundStateOperator(expression.OperatorToken.Kind)
		if !exists {
			return nil
		}
		previous := lowering.factory.NewIdentifier("previous")
		updated := lowering.factory.NewBinaryExpression(
			nil,
			previous,
			nil,
			lowering.factory.NewToken(operator),
			value,
		)
		return lowering.call(
			lowering.names.update,
			[]*ast.Node{
				lowering.stateWriteRoot(write),
				lowering.stateWritePathNode(write),
				lowering.arrowWithParameter(previous, updated),
			},
		)
	case "delete":
		return lowering.call(
			lowering.names.delete,
			[]*ast.Node{
				lowering.stateWriteRoot(write),
				lowering.stateWritePathNode(write),
			},
		)
	case "array-mutation":
		if !ast.IsCallExpression(node) ||
			!ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
			return nil
		}
		call := node.AsCallExpression()
		method := call.Expression.AsPropertyAccessExpression().Name().Text()
		arguments := []*ast.Node{}
		if call.Arguments != nil {
			for _, argument := range call.Arguments.Nodes {
				arguments = append(arguments, lowering.visitor.VisitNode(argument))
			}
		}
		return lowering.call(
			lowering.names.arrayMutation,
			[]*ast.Node{
				lowering.stateWriteRoot(write),
				lowering.stateWritePathNode(write),
				lowering.factory.NewStringLiteral(method, ast.TokenFlagsNone),
				lowering.arrow(
					lowering.factory.NewArrayLiteralExpression(
						lowering.factory.NewNodeList(arguments),
						false,
					),
				),
			},
		)
	case "map-mutation", "set-mutation":
		if !ast.IsCallExpression(node) ||
			!ast.IsPropertyAccessExpression(node.AsCallExpression().Expression) {
			return nil
		}
		call := node.AsCallExpression()
		method := call.Expression.AsPropertyAccessExpression().Name().Text()
		arguments := []*ast.Node{}
		if call.Arguments != nil {
			for _, argument := range call.Arguments.Nodes {
				arguments = append(arguments, lowering.visitor.VisitNode(argument))
			}
		}
		kind := "map"
		if write.Operation == "set-mutation" {
			kind = "set"
		}
		return lowering.call(
			lowering.names.collectionMutation,
			[]*ast.Node{
				lowering.stateWriteRoot(write),
				lowering.stateWritePathNode(write),
				lowering.factory.NewStringLiteral(kind, ast.TokenFlagsNone),
				lowering.factory.NewStringLiteral(method, ast.TokenFlagsNone),
				lowering.arrow(
					lowering.factory.NewArrayLiteralExpression(
						lowering.factory.NewNodeList(arguments),
						false,
					),
				),
			},
		)
	}
	return nil
}

func (lowering *jsxLowering) assignedTask(
	value *ast.Node,
) (*ast.Node, Task, bool) {
	for value != nil &&
		(ast.IsAwaitExpression(value) || ast.IsParenthesizedExpression(value)) {
		if ast.IsAwaitExpression(value) {
			value = value.AsAwaitExpression().Expression
		} else {
			value = value.AsParenthesizedExpression().Expression
		}
	}
	if value == nil || !ast.IsCallExpression(value) {
		return nil, Task{}, false
	}
	task, exists := lowering.tasks[nodeSpanKey(value)]
	if !exists || len(task.ResultWritePath) == 0 {
		return nil, Task{}, false
	}
	return value, task, true
}

func (lowering *jsxLowering) lowerStateUpdate(
	node *ast.Node,
	write StateWrite,
) *ast.Node {
	previous := lowering.factory.NewIdentifier("previous")
	var operation *ast.Node
	switch {
	case ast.IsPrefixUnaryExpression(node):
		expression := node.AsPrefixUnaryExpression()
		operation = lowering.factory.NewPrefixUnaryExpression(
			expression.Operator,
			previous,
		)
	case ast.IsPostfixUnaryExpression(node):
		expression := node.AsPostfixUnaryExpression()
		operation = lowering.factory.NewPostfixUnaryExpression(
			previous,
			expression.Operator,
		)
	default:
		return nil
	}
	result := lowering.factory.NewIdentifier("result")
	declaration := lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					result,
					nil,
					nil,
					operation,
				),
			}),
			ast.NodeFlagsConst,
		),
	)
	returnValue := lowering.factory.NewReturnStatement(
		lowering.factory.NewArrayLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{previous, result}),
			false,
		),
	)
	body := lowering.factory.NewBlock(
		lowering.factory.NewNodeList([]*ast.Node{declaration, returnValue}),
		true,
	)
	return lowering.call(
		lowering.names.updateResult,
		[]*ast.Node{
			lowering.stateWriteRoot(write),
			lowering.stateWritePathNode(write),
			lowering.arrowWithParameter(previous, body),
		},
	)
}

func (lowering *jsxLowering) arrowWithParameter(
	parameter *ast.Node,
	body *ast.Node,
) *ast.Node {
	declaration := lowering.factory.NewParameterDeclaration(
		nil,
		nil,
		parameter,
		nil,
		nil,
		nil,
	)
	return lowering.factory.NewArrowFunction(
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{declaration}),
		nil,
		nil,
		lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		body,
	)
}

func (lowering *jsxLowering) stateRoot() *ast.Node {
	return lowering.factory.NewPropertyAccessExpression(
		lowering.factory.NewThisExpression(),
		nil,
		lowering.factory.NewIdentifier("state"),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) stateWriteRoot(write StateWrite) *ast.Node {
	if write.RootAlias == "" {
		return lowering.stateRoot()
	}
	alias := lowering.factory.NewIdentifier(write.RootAlias)
	for _, binding := range lowering.derived {
		if binding.Component == write.Component && binding.Name == write.RootAlias {
			return lowering.derivedGet(alias)
		}
	}
	return alias
}

func (lowering *jsxLowering) stateWritePath(write StateWrite) []string {
	if write.RootAlias == "" || write.RootDepth >= len(write.Path) {
		return write.Path
	}
	return write.Path[write.RootDepth:]
}

func (lowering *jsxLowering) stateWritePathNode(write StateWrite) *ast.Node {
	path := lowering.stateWritePath(write)
	offset := 0
	if write.RootAlias != "" && write.RootDepth < len(write.Path) {
		offset = write.RootDepth
	}
	segments := make([]*ast.Node, 0, len(path))
	for index, segment := range path {
		if dynamic := write.DynamicSegments[offset+index]; dynamic != nil {
			segments = append(segments, lowering.visitor.VisitNode(dynamic))
			continue
		}
		segments = append(
			segments,
			lowering.factory.NewStringLiteral(segment, ast.TokenFlagsNone),
		)
	}
	return lowering.factory.NewArrayLiteralExpression(
		lowering.factory.NewNodeList(segments),
		false,
	)
}

func (lowering *jsxLowering) statePath(path []string) *ast.Node {
	segments := make([]*ast.Node, 0, len(path))
	for _, segment := range path {
		segments = append(
			segments,
			lowering.factory.NewStringLiteral(segment, ast.TokenFlagsNone),
		)
	}
	return lowering.factory.NewArrayLiteralExpression(
		lowering.factory.NewNodeList(segments),
		false,
	)
}

func compoundStateOperator(operator ast.Kind) (ast.Kind, bool) {
	operators := map[ast.Kind]ast.Kind{
		ast.KindPlusEqualsToken:                              ast.KindPlusToken,
		ast.KindMinusEqualsToken:                             ast.KindMinusToken,
		ast.KindAsteriskEqualsToken:                          ast.KindAsteriskToken,
		ast.KindSlashEqualsToken:                             ast.KindSlashToken,
		ast.KindPercentEqualsToken:                           ast.KindPercentToken,
		ast.KindAsteriskAsteriskEqualsToken:                  ast.KindAsteriskAsteriskToken,
		ast.KindLessThanLessThanEqualsToken:                  ast.KindLessThanLessThanToken,
		ast.KindGreaterThanGreaterThanEqualsToken:            ast.KindGreaterThanGreaterThanToken,
		ast.KindGreaterThanGreaterThanGreaterThanEqualsToken: ast.KindGreaterThanGreaterThanGreaterThanToken,
		ast.KindAmpersandEqualsToken:                         ast.KindAmpersandToken,
		ast.KindBarEqualsToken:                               ast.KindBarToken,
		ast.KindCaretEqualsToken:                             ast.KindCaretToken,
		ast.KindAmpersandAmpersandEqualsToken:                ast.KindAmpersandAmpersandToken,
		ast.KindBarBarEqualsToken:                            ast.KindBarBarToken,
		ast.KindQuestionQuestionEqualsToken:                  ast.KindQuestionQuestionToken,
	}
	result, exists := operators[operator]
	return result, exists
}

func indexStateWrites(writes []StateWrite) map[string]StateWrite {
	result := make(map[string]StateWrite, len(writes))
	for _, write := range writes {
		result[fmt.Sprintf("%d:%d", write.Start, write.Length)] = write
	}
	return result
}
