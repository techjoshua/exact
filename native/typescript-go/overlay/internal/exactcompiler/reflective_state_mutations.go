package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

func unsupportedReflectiveStateMutation(
	expression *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	return resolvedReflectiveMutation(expression, typeChecker, map[ast.SymbolId]bool{})
}

// resolvedReflectiveMutation follows immutable aliases and compares library declaration identity.
// A user-defined object with the same method names does not acquire reflective write semantics.
func resolvedReflectiveMutation(expression *ast.Node, typeChecker *checker.Checker, seen map[ast.SymbolId]bool) bool {
	expression = unwrapSourceCallableReference(expression)
	if expression == nil {
		return false
	}
	if ast.IsCallExpression(expression) {
		call := expression.AsCallExpression()
		if receiver, name := restrictedInvocationMember(call.Expression, typeChecker); receiver != nil && name == "bind" && nativeFunctionInvocation(receiver, name, typeChecker) {
			return resolvedReflectiveMutation(receiver, typeChecker, seen)
		}
	}
	if receiver, name := restrictedInvocationMember(expression, typeChecker); receiver != nil && (name == "call" || name == "apply" || name == "bind") && nativeFunctionInvocation(receiver, name, typeChecker) {
		return resolvedReflectiveMutation(receiver, typeChecker, seen)
	}
	var symbol *ast.Symbol
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		symbol = typeChecker.GetSymbolAtLocation(member.Name())
	} else if ast.IsElementAccessExpression(expression) {
		access := expression.AsElementAccessExpression()
		if access.ArgumentExpression != nil {
			value := typeChecker.GetTypeAtLocation(access.ArgumentExpression)
			if value != nil && value.Flags()&checker.TypeFlagsStringLiteral != 0 {
				if name, ok := value.AsLiteralType().Value().(string); ok {
					symbol = typeChecker.GetPropertyOfType(typeChecker.GetTypeAtLocation(access.Expression), name)
				}
			}
		}
	} else if ast.IsIdentifier(expression) {
		symbol = typeChecker.GetSymbolAtLocation(expression)
	}
	if symbol == nil || seen[ast.GetSymbolId(symbol)] {
		return false
	}
	seen[ast.GetSymbolId(symbol)] = true
	if reflectiveLibraryMember(symbol, typeChecker) {
		return true
	}
	for _, declaration := range symbol.Declarations {
		if immutableBindingElement(declaration) && resolvedReflectiveMutation(declaration.AsBindingElement().Initializer, typeChecker, seen) {
			return true
		}
		if member := immutableBindingMemberSymbol(declaration, typeChecker); member != nil && reflectiveLibraryMember(member, typeChecker) {
			return true
		}
		if ast.IsVariableDeclaration(declaration) && declaration.Parent != nil && ast.IsVariableDeclarationList(declaration.Parent) && declaration.Parent.Flags&ast.NodeFlagsConst != 0 {
			if resolvedReflectiveMutation(declaration.AsVariableDeclaration().Initializer, typeChecker, seen) {
				return true
			}
		}
	}
	return false
}

// reflectiveMutationArgument retains target ownership through native invocation adapters.
func reflectiveMutationArgument(call *ast.CallExpression, typeChecker *checker.Checker) *ast.Node {
	_, arguments, _ := restrictedCallArguments(call.Expression, restrictedInvocationArguments(call), typeChecker, map[ast.SymbolId]bool{})
	if len(arguments) == 0 {
		return nil
	}
	return arguments[0]
}

func restrictedInvocationArguments(call *ast.CallExpression) []*ast.Node {
	if call.Arguments == nil {
		return nil
	}
	return call.Arguments.Nodes
}

// reflectiveLibraryMember compares the selected member declaration with native mutation owners.
func reflectiveLibraryMember(symbol *ast.Symbol, typeChecker *checker.Checker) bool {
	for _, root := range []string{"Reflect", "Object"} {
		global := typeChecker.GetGlobalSymbol(root, ast.SymbolFlagsValue, nil)
		if global == nil {
			continue
		}
		methods := []string{"defineProperty", "defineProperties"}
		if root == "Reflect" {
			methods = []string{"set", "deleteProperty", "defineProperty"}
		}
		for _, name := range methods {
			member := typeChecker.GetPropertyOfType(typeChecker.GetTypeOfSymbol(global), name)
			if member != nil && member.ValueDeclaration != nil && member.ValueDeclaration == symbol.ValueDeclaration {
				return true
			}
		}
	}
	return false
}
