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
	declaration := nodeAtSpan(lowering.sourceFile.AsNode(), task.WorkStart, task.WorkLength)
	if declaration == nil {
		return callable
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
		return callable
	}
	result := lowering.checker.TypeToTypeNode(lowering.checker.GetReturnTypeOfSignature(signatures[0]), declaration, nodebuilder.FlagsNoTruncation, nil)
	if result == nil {
		return callable
	}
	signature := lowering.factory.NewFunctionTypeNode(nil, lowering.factory.NewNodeList(parameters), result)
	arguments := lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier("Parameters"), lowering.factory.NewNodeList([]*ast.Node{signature}))
	resolved := lowering.factory.NewTypeReferenceNode(lowering.factory.NewIdentifier("Awaited"), lowering.factory.NewNodeList([]*ast.Node{result}))
	bound := lowering.factory.NewImportTypeNode(false,
		lowering.factory.NewLiteralTypeNode(lowering.factory.NewStringLiteral("@exactjs/core", ast.TokenFlagsNone)), nil,
		lowering.factory.NewIdentifier("BoundTaskFunction"), lowering.factory.NewNodeList([]*ast.Node{arguments, resolved}))
	return lowering.factory.NewAsExpression(callable, bound)
}
