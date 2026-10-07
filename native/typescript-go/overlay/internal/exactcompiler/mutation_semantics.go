package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// typedMutationResult retains the authored result after runtime helper type erasure.
// The checking projection retains the original operation to validate its obligations.
func (lowering *jsxLowering) typedMutationResult(source, result *ast.Node) *ast.Node {
	if typeNode := lowering.mutationFacts.at(nodeSourceSpan(source)).result; typeNode != nil {
		return lowering.factory.NewAsExpression(result, typeNode)
	}
	return result
}

// mutationArgument preserves contextual callback parameters before lowering drops the call signature.
func (lowering *jsxLowering) mutationArgument(source *ast.Node) *ast.Node {
	result := lowering.visitor.VisitNode(source)
	if typeNode := lowering.mutationFacts.at(nodeSourceSpan(source)).argument; typeNode != nil {
		return lowering.factory.NewSatisfiesExpression(lowering.factory.NewParenthesizedExpression(result), typeNode)
	}
	return result
}

// pendingHelperArgument restores authored callback context after invocation routing erases the
// selected callable's signature. Visiting still uses the invocation's own mutation operations.
func (lowering *jsxLowering) pendingHelperArgument(source *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	result := visitor.VisitNode(source)
	if typeNode := lowering.mutationFacts.at(nodeSourceSpan(source)).argument; typeNode != nil {
		return lowering.factory.NewSatisfiesExpression(lowering.factory.NewParenthesizedExpression(result), typeNode)
	}
	return result
}

// captureMutationArgumentType runs against authored parent links. Island extraction can replace
// those links with generated helper calls that the TypeScript checker must never inspect.
func (lowering *jsxLowering) captureMutationArgumentType(source *ast.Node) {
	callback := false
	walkNode(source, func(node *ast.Node) bool {
		if ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) || ast.IsMethodDeclaration(node) {
			callback = true
			return false
		}
		return !callback
	})
	if !callback {
		return
	}
	context := lowering.checker.GetContextualType(source, checker.ContextFlagsNone)
	if context != nil {
		lowering.mutationFacts.capture(nodeSourceSpan(source), mutationTypeArgument, lowering.checker.TypeToTypeNode(context, source, nodebuilder.FlagsNoTruncation, nil))
	}
}

// nativeCollectionMethod recognizes library-declared methods rather than structurally similar objects.
func nativeCollectionMethod(receiver *checker.Type, method, name string, typeChecker *checker.Checker) bool {
	symbol := typeChecker.GetGlobalSymbol(name, ast.SymbolFlagsType, nil)
	if symbol == nil {
		return false
	}
	member := typeChecker.GetPropertyOfType(receiver, method)
	native := typeChecker.GetPropertyOfType(typeChecker.GetDeclaredTypeOfSymbol(symbol), method)
	return member != nil && native != nil && member.ValueDeclaration != nil && member.ValueDeclaration == native.ValueDeclaration
}

// mutationSource indexes authored spans once for the lowering plan, including equal-span children.
func (lowering *jsxLowering) mutationSource(start, length int) *ast.Node {
	lowering.ensureMutationSources()
	return lowering.mutationSources[SourceSpan{Start: start, Length: length}].last
}

// captureMutationResultTypes retains checker facts before island extraction changes lexical parents.
func (lowering *jsxLowering) captureMutationResultTypes() {
	if lowering.checker == nil {
		return
	}
	for _, write := range lowering.writes {
		key := SourceSpan{Start: write.Start, Length: write.Length}
		source := lowering.mutationSource(write.Start, write.Length)
		if source == nil || ast.NodeIsSynthesized(source) || source.Parent == nil {
			continue
		}
		var target *ast.Node
		if ast.IsBinaryExpression(source) {
			target = source.AsBinaryExpression().Left
			lowering.captureMutationArgumentType(source.AsBinaryExpression().Right)
		} else if ast.IsPrefixUnaryExpression(source) {
			target = source.AsPrefixUnaryExpression().Operand
		} else if ast.IsPostfixUnaryExpression(source) {
			target = source.AsPostfixUnaryExpression().Operand
		}
		if ast.IsCallExpression(source) {
			for _, argument := range callArguments(source) {
				lowering.captureMutationArgumentType(argument)
			}
		}
		if target != nil {
			lowering.mutationFacts.capture(key, mutationTypeDestination, lowering.authoredMutationType(target))
		}
		value := lowering.checker.GetTypeAtLocation(source)
		if value.Flags()&(checker.TypeFlagsAnyOrUnknown|checker.TypeFlagsNever) != 0 {
			continue
		}
		lowering.mutationFacts.capture(key, mutationTypeResult, lowering.authoredMutationType(source))
	}
}

// contextualAssignmentValue retains callback context even when no subsequent read requires a
// staged temporary. The satisfies expression is erased at runtime and still checks the value.
func (lowering *jsxLowering) contextualAssignmentValue(value *ast.Node, write StateWrite) *ast.Node {
	typeNode := lowering.mutationFacts.at(SourceSpan{Start: write.Start, Length: write.Length}).destination
	if typeNode == nil {
		return value
	}
	callback := false
	walkNode(value, func(node *ast.Node) bool {
		if ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) || ast.IsMethodDeclaration(node) {
			source := lowering.mutationSource(node.Pos(), node.End()-node.Pos())
			callback = source != nil && (ast.IsArrowFunction(source) || ast.IsFunctionExpression(source) || ast.IsMethodDeclaration(source))
			return false
		}
		return !callback
	})
	if !callback {
		return value
	}
	return lowering.factory.NewSatisfiesExpression(lowering.factory.NewParenthesizedExpression(value), typeNode)
}
