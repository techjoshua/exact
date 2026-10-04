package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// taskCallableSignature separates caller defaults from the resolved runtime work parameters.
// Initializers are captured exactly once by the activation owner, not by this type-only signature.
func (lowering *jsxLowering) taskCallableSignature(task Task, callable *ast.Node) *ast.Node {
	arguments, resolved := lowering.taskCallableTypes(task)
	if arguments == nil {
		return callable
	}
	bound := lowering.factory.NewImportTypeNode(false,
		lowering.factory.NewLiteralTypeNode(lowering.factory.NewStringLiteral("@exactjs/core", ast.TokenFlagsNone)), nil,
		lowering.factory.NewIdentifier("BoundTaskFunction"), lowering.factory.NewNodeList([]*ast.Node{arguments, resolved}))
	return lowering.factory.NewAsExpression(callable, bound)
}

// taskCallableTypes retains authored argument constraints and the settled result for generated routing.
func (lowering *jsxLowering) taskCallableTypes(task Task) (arguments, resolved *ast.Node) {
	declaration := nodeAtSpan(lowering.sourceFile.AsNode(), task.WorkStart, task.WorkLength)
	if declaration == nil {
		return nil, nil
	}
	parameters := []*ast.Node{}
	for index, node := range declaration.Parameters()[:min(task.ArgumentCount, len(declaration.Parameters()))] {
		parameter := node.AsParameterDeclaration()
		typeNode := parameter.Type
		if typeNode == nil {
			typeNode = lowering.taskDependencyType(node)
		}
		optional := parameter.QuestionToken
		if parameter.Initializer != nil {
			requiredAfter := false
			for _, later := range declaration.Parameters()[index+1 : min(task.ArgumentCount, len(declaration.Parameters()))] {
				candidate := later.AsParameterDeclaration()
				if candidate.Initializer == nil && candidate.QuestionToken == nil && candidate.DotDotDotToken == nil {
					requiredAfter = true
				}
			}
			if requiredAfter {
				typeNode = lowering.factory.NewUnionTypeNode(lowering.factory.NewNodeList([]*ast.Node{typeNode, lowering.factory.NewKeywordTypeNode(ast.KindUndefinedKeyword)}))
			} else {
				optional = lowering.factory.NewToken(ast.KindQuestionToken)
			}
		}
		parameters = append(parameters, lowering.factory.NewParameterDeclaration(nil, parameter.DotDotDotToken, lowering.factory.NewIdentifier(fmt.Sprintf("argument%d", index)), optional, typeNode, nil))
	}
	signatures := lowering.checker.GetSignaturesOfType(lowering.checker.GetTypeAtLocation(declaration), checker.SignatureKindCall)
	if len(signatures) == 0 {
		return nil, nil
	}
	result := lowering.checker.TypeToTypeNode(lowering.checker.GetReturnTypeOfSignature(signatures[0]), declaration, nodebuilder.FlagsNoTruncation, nil)
	if result == nil {
		return nil, nil
	}
	signature := lowering.factory.NewFunctionTypeNode(nil, lowering.factory.NewNodeList(parameters), result)
	arguments = lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier("Parameters"), lowering.factory.NewNodeList([]*ast.Node{signature}))
	resolved = lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier("Awaited"), lowering.factory.NewNodeList([]*ast.Node{result}))
	return arguments, resolved
}

// checkingSetupTaskResultAssignment retains the authored destination and call argument checks.
// Setup publishes the settled result, whereas a shared task binding returns an invocation facade.
// Only the checking projection adapts that value to its inferred settled type.
func (lowering *jsxLowering) checkingSetupTaskResultAssignment(node, call *ast.Node) *ast.Node {
	typeNode := lowering.checker.TypeToTypeNode(lowering.checker.GetTypeAtLocation(call), call, nodebuilder.FlagsNoTruncation, nil)
	if typeNode == nil {
		return lowering.visitor.VisitEachChild(node)
	}
	resolved := lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier("Awaited"), lowering.factory.NewNodeList([]*ast.Node{typeNode}))
	value := lowering.visitor.VisitEachChild(call)
	value = lowering.factory.NewAsExpression(value, lowering.factory.NewKeywordTypeNode(ast.KindUnknownKeyword))
	value = lowering.factory.NewAsExpression(value, resolved)
	expression := node.AsBinaryExpression()
	return lowering.factory.NewBinaryExpression(nil, lowering.visitor.VisitNode(expression.Left), nil, expression.OperatorToken, value)
}

// synchronousPrimitiveTaskResult avoids introducing an asynchronous boundary for proven scalar work.
// Objects, thenables and uncertain signatures retain awaited publication and cancellation fencing.
func (lowering *jsxLowering) synchronousPrimitiveTaskResult(task Task) bool {
	if task.Async || task.Readiness == "blocking" || lowering.checker == nil {
		return false
	}
	work := nodeAtSpan(lowering.sourceFile.AsNode(), task.WorkStart, task.WorkLength)
	if work == nil {
		return false
	}
	signatures := lowering.checker.GetSignaturesOfType(lowering.checker.GetTypeAtLocation(work), checker.SignatureKindCall)
	if len(signatures) != 1 {
		return false
	}
	result := lowering.checker.GetReturnTypeOfSignature(signatures[0])
	for _, member := range result.Distributed() {
		if member.Flags()&(checker.TypeFlagsStringLike|checker.TypeFlagsNumberLike|checker.TypeFlagsBooleanLike|checker.TypeFlagsBigIntLike|checker.TypeFlagsESSymbolLike|checker.TypeFlagsNull|checker.TypeFlagsUndefined|checker.TypeFlagsVoid|checker.TypeFlagsNever) == 0 {
			return false
		}
	}
	return true
}
