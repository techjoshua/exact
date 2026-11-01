package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// lowerHelperNativeReference leaves iteration, default selection and the result with JavaScript.
// Arrow parameters capture the immediate receiver and raw key at native reference evaluation.
// Each accessor put passes its actual selected value through the existing generation fence.
func (lowering *jsxLowering) lowerHelperNativeReference(target, signal *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	facts := lowering.mutationFacts.at(nodeSourceSpan(target))
	if facts.destination == nil || facts.nativeParent == nil || facts.nativeKey == nil {
		panic("native helper reference missing sealed types")
	}
	f := lowering.factory
	identifier := func(suffix string) *ast.Node {
		return f.NewIdentifier(lowering.uniqueMutationName(fmt.Sprintf("__exactNative_%d_%s", target.Pos(), suffix)))
	}
	parent, key, next := identifier("parent"), identifier("key"), identifier("next")
	parameter := func(name, typeNode *ast.Node) *ast.Node {
		return f.NewParameterDeclaration(nil, nil, name, nil, typeNode, nil)
	}
	commit := lowering.fenceTaskMutation(lowering.selectedMutationWrite(target, parent, key, next), signal)
	setter := f.NewSetAccessorDeclaration(nil, f.NewIdentifier("value"), nil, f.NewNodeList([]*ast.Node{parameter(next, facts.destination)}), nil, nil, f.NewBlock(f.NewNodeList([]*ast.Node{f.NewExpressionStatement(commit)}), true))
	object := f.NewObjectLiteralExpression(f.NewNodeList([]*ast.Node{setter}), true)
	capture := f.NewArrowFunction(nil, nil, f.NewNodeList([]*ast.Node{parameter(parent, facts.nativeParent), parameter(key, facts.nativeKey)}), nil, nil, f.NewToken(ast.KindEqualsGreaterThanToken), f.NewParenthesizedExpression(object))
	receiver, rawKey, computed := (mutationOperationPlan{target: target}).reference()
	rawKey = lowering.mutationReferenceKey(rawKey, computed)
	visit := func(node *ast.Node) *ast.Node { return lowering.visitor.VisitNode(visitor.VisitNode(node)) }
	call := f.NewCallExpression(f.NewParenthesizedExpression(capture), nil, nil, f.NewNodeList([]*ast.Node{visit(receiver), visit(rawKey)}), ast.NodeFlagsNone)
	return f.NewPropertyAccessExpression(call, nil, f.NewIdentifier("value"), ast.NodeFlagsNone)
}
