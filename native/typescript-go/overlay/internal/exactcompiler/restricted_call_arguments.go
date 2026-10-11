package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// restrictedCallArguments resolves native invocation adapters without executing them. Bound
// arguments precede invocation arguments, so ownership follows the actual formal parameter.
// Unknown apply vectors remain unproven rather than being mistaken for a positional argument.
func restrictedCallArguments(expression *ast.Node, arguments []*ast.Node, typeChecker *checker.Checker, seen map[ast.SymbolId]bool) (*ast.Node, []*ast.Node, *ast.Node) {
	expression = unwrapSourceCallableReference(expression)
	if expression == nil {
		return expression, arguments, nil
	}
	if ast.IsParenthesizedExpression(expression) {
		return restrictedCallArguments(expression.AsParenthesizedExpression().Expression, arguments, typeChecker, seen)
	}
	if receiver, name := restrictedInvocationMember(expression, typeChecker); receiver != nil && (name == "call" || name == "apply") && nativeFunctionInvocation(receiver, name, typeChecker) {
		if len(arguments) == 0 {
			return receiver, nil, nil
		}
		values := arguments[1:]
		if name == "apply" {
			values = nil
			if len(arguments) > 1 && ast.IsArrayLiteralExpression(arguments[1]) {
				values = arguments[1].AsArrayLiteralExpression().Elements.Nodes
			}
		}
		target, values, boundReceiver := restrictedCallArguments(receiver, values, typeChecker, seen)
		if boundReceiver == nil {
			boundReceiver = arguments[0]
		}
		return target, values, boundReceiver
	}
	if ast.IsCallExpression(expression) {
		bound := expression.AsCallExpression()
		if receiver, name := restrictedInvocationMember(bound.Expression, typeChecker); receiver != nil && name == "bind" && nativeFunctionInvocation(receiver, name, typeChecker) {
			values := append([]*ast.Node(nil), callArguments(expression)...)
			if len(values) > 0 {
				values = values[1:]
			}
			values = append(values, arguments...)
			target, values, boundReceiver := restrictedCallArguments(receiver, values, typeChecker, seen)
			if boundReceiver == nil && bound.Arguments != nil && len(bound.Arguments.Nodes) > 0 {
				boundReceiver = bound.Arguments.Nodes[0]
			}
			return target, values, boundReceiver
		}
	}
	if ast.IsIdentifier(expression) {
		symbol := resolvedCallableSymbol(typeChecker.GetSymbolAtLocation(expression), typeChecker)
		if symbol != nil && !seen[ast.GetSymbolId(symbol)] {
			seen[ast.GetSymbolId(symbol)] = true
			for _, declaration := range symbol.Declarations {
				if ast.IsVariableDeclaration(declaration) && declaration.Parent != nil && ast.IsVariableDeclarationList(declaration.Parent) && declaration.Parent.Flags&ast.NodeFlagsConst != 0 {
					value := declaration.AsVariableDeclaration().Initializer
					if value != nil && (ast.IsIdentifier(value) || ast.IsPropertyAccessExpression(value) || ast.IsElementAccessExpression(value) || ast.IsCallExpression(value) || ast.IsParenthesizedExpression(value)) {
						return restrictedCallArguments(value, arguments, typeChecker, seen)
					}
				}
			}
		}
	}
	return expression, arguments, nil
}

// nativeFunctionInvocation excludes authored methods named call, apply or bind.
func nativeFunctionInvocation(receiver *ast.Node, method string, typeChecker *checker.Checker) bool {
	value := typeChecker.GetTypeAtLocation(receiver)
	for _, name := range []string{"Function", "CallableFunction", "NewableFunction"} {
		if nativeCollectionMethod(value, method, name, typeChecker) {
			return true
		}
	}
	return false
}

// restrictedInvocationMember resolves literal computed names without relying on source text.
func restrictedInvocationMember(expression *ast.Node, typeChecker *checker.Checker) (*ast.Node, string) {
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		return member.Expression, member.Name().Text()
	}
	if ast.IsElementAccessExpression(expression) {
		member := expression.AsElementAccessExpression()
		if member.ArgumentExpression != nil {
			value := typeChecker.GetTypeAtLocation(member.ArgumentExpression)
			if value != nil && value.Flags()&checker.TypeFlagsStringLiteral != 0 {
				if name, ok := value.AsLiteralType().Value().(string); ok {
					return member.Expression, name
				}
			}
		}
	}
	return nil, ""
}
