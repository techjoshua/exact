package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// taskSnapshotReadRanges preserves peek callback reads as execution inputs,
// rather than activation subscriptions. Callback selection still evaluates
// normally, so conditional selectors outside callback bodies remain live.
func taskSnapshotReadRanges(work *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker) []taskCaptureRange {
	var result []taskCaptureRange
	walkNode(work, func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) || !(reactivePeekOperation(node.AsCallExpression().Expression, source, typeChecker) || isTaskContextCapabilityCall(node, typeChecker, "peek")) {
			return true
		}
		for _, argument := range node.AsCallExpression().Arguments.Nodes {
			collectSnapshotCallbackReferences(argument, typeChecker, &result)
		}
		return true
	})
	return result
}

// Helper snapshots are captured afresh for each generation under the existing
// argument capture scope. A tracked dependency would subscribe to the helper's
// hidden read, while an eager setup value would freeze later generations.
func (lowering *jsxLowering) taskSnapshotArgumentResolver(resolver *ast.Node, dependencies []nativeTaskDependency, count int) *ast.Node {
	needed := false
	for _, dependency := range dependencies {
		needed = needed || dependency.snapshot
	}
	if !needed {
		return resolver
	}
	args := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactSnapshotArgs"))
	input := args
	var statements []*ast.Node
	if resolver != nil {
		input = lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactResolvedArgs"))
		call := lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(resolver), nil, nil, lowering.factory.NewNodeList([]*ast.Node{args}), ast.NodeFlagsNone)
		statements = append(statements, lowering.constStatement(input, call))
	}
	values := make([]*ast.Node, count)
	for index := range values {
		values[index] = lowering.taskCaptureArgument(input, index)
		if index < len(dependencies) && dependencies[index].snapshot {
			values[index] = lowering.visitor.VisitNode(dependencies[index].expression)
		}
	}
	statements = append(statements, lowering.factory.NewReturnStatement(lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList(values), false)))
	return lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList([]*ast.Node{
		lowering.factory.NewParameterDeclaration(nil, nil, args, nil, lowering.factory.NewArrayTypeNode(lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword)), nil),
	}), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), lowering.factory.NewBlock(lowering.factory.NewNodeList(statements), true))
}

// collectSnapshotCallbackReferences marks callback values without swallowing conditional selectors.
// Named callbacks transfer snapshot ownership to their captures when their helper is visited.
func collectSnapshotCallbackReferences(node *ast.Node, typeChecker *checker.Checker, result *[]taskCaptureRange) {
	node = unwrapSourceCallableReference(node)
	if node == nil {
		return
	}
	if isCallableNode(node) {
		*result = append(*result, taskCaptureRange{start: node.Pos(), end: node.End()})
		return
	}
	if ast.IsConditionalExpression(node) {
		c := node.AsConditionalExpression()
		collectSnapshotCallbackReferences(c.WhenTrue, typeChecker, result)
		collectSnapshotCallbackReferences(c.WhenFalse, typeChecker, result)
		return
	}
	if ast.IsBinaryExpression(node) {
		b := node.AsBinaryExpression()
		switch b.OperatorToken.Kind {
		case ast.KindCommaToken:
			collectSnapshotCallbackReferences(b.Right, typeChecker, result)
		case ast.KindAmpersandAmpersandToken, ast.KindBarBarToken, ast.KindQuestionQuestionToken:
			collectSnapshotCallbackReferences(b.Left, typeChecker, result)
			collectSnapshotCallbackReferences(b.Right, typeChecker, result)
		}
		return
	}
	if !ast.IsIdentifier(node) {
		return
	}
	symbol := typeChecker.GetSymbolAtLocation(node)
	if symbol != nil && taskHelperCallable(symbol.ValueDeclaration, typeChecker, map[*ast.Node]bool{}) != nil {
		*result = append(*result, taskCaptureRange{start: node.Pos(), end: node.End()})
	}
}

// taskHelperCallable follows stable local callable aliases while fencing recursive declarations.
func taskHelperCallable(declaration *ast.Node, typeChecker *checker.Checker, seen map[*ast.Node]bool) *ast.Node {
	if declaration == nil || seen[declaration] {
		return nil
	}
	seen[declaration] = true
	if isCallableNode(declaration) && declaration.Body() != nil {
		return declaration
	}
	if !ast.IsVariableDeclaration(declaration) {
		return nil
	}
	value := unwrapSourceCallableReference(declaration.Initializer())
	if value == nil {
		return nil
	}
	if isCallableNode(value) && value.Body() != nil {
		return value
	}
	if !ast.IsIdentifier(value) || declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(value)
	if symbol == nil {
		return nil
	}
	return taskHelperCallable(symbol.ValueDeclaration, typeChecker, seen)
}
