package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

func subscriptionDisposal(node *ast.Node, typeChecker *checker.Checker) string {
	result := typeChecker.GetTypeAtLocation(node)
	if result == nil {
		return ""
	}
	if len(typeChecker.GetSignaturesOfType(result, checker.SignatureKindCall)) != 0 {
		return "call"
	}
	for _, method := range []string{"unsubscribe", "dispose"} {
		if property := typeChecker.GetPropertyOfType(result, method); property != nil &&
			len(typeChecker.GetSignaturesOfType(typeChecker.GetTypeOfSymbolAtLocation(property, node), checker.SignatureKindCall)) != 0 {
			return method
		}
	}
	return ""
}

func disposableResult(
	node *ast.Node,
	typeChecker *checker.Checker,
) (string, string) {
	result := typeChecker.GetTypeAtLocation(node)
	if result == nil {
		return "", ""
	}
	display := typeChecker.TypeToString(result)
	for _, method := range []string{"dispose", "asyncDispose"} {
		if property := typeChecker.GetPropertyOfType(result, method); property != nil &&
			len(typeChecker.GetSignaturesOfType(typeChecker.GetTypeOfSymbolAtLocation(property, node), checker.SignatureKindCall)) != 0 {
			return method, display
		}
	}
	for _, method := range []string{"asyncDispose", "dispose"} {
		key := taskResourceDisposalSymbolKey(typeChecker, method)
		if key == "" {
			continue
		}
		property := typeChecker.GetPropertyOfType(result, key)
		if property != nil && len(typeChecker.GetSignaturesOfType(typeChecker.GetTypeOfSymbolAtLocation(property, node), checker.SignatureKindCall)) != 0 {
			return "", display
		}
	}
	return "", ""
}

// taskResourceDisposalSymbolKey resolves native symbolic disposal identity rather
// than inferring it from display names or same-spelled user-created symbols.
func taskResourceDisposalSymbolKey(typeChecker *checker.Checker, method string) string {
	constructor := typeChecker.GetGlobalSymbol("Symbol", ast.SymbolFlagsValue, nil)
	if constructor == nil {
		return ""
	}
	property := typeChecker.GetPropertyOfType(typeChecker.GetTypeOfSymbol(constructor), method)
	if property == nil {
		return ""
	}
	key := typeChecker.GetTypeOfSymbol(property)
	if key == nil || key.Flags()&checker.TypeFlagsUniqueESSymbol == 0 {
		return ""
	}
	return checker.GetPropertyNameFromType(key)
}

func explicitResourceCleanup(reference *ast.Node, disposal string, typeChecker *checker.Checker) bool {
	parent := reference.Parent
	if parent == nil {
		return false
	}
	if disposal == "call" && ast.IsCallExpression(parent) &&
		parent.AsCallExpression().Expression == reference {
		return true
	}
	method := ""
	if ast.IsPropertyAccessExpression(parent) && parent.AsPropertyAccessExpression().Expression == reference {
		method = parent.AsPropertyAccessExpression().Name().Text()
	} else if ast.IsElementAccessExpression(parent) && parent.AsElementAccessExpression().Expression == reference {
		argument := unwrapRenderExpression(parent.AsElementAccessExpression().ArgumentExpression)
		if ast.IsStringLiteral(argument) || ast.IsNoSubstitutionTemplateLiteral(argument) {
			method = argument.Text()
		} else {
			key := typeChecker.GetTypeAtLocation(argument)
			if key != nil && key.Flags()&checker.TypeFlagsUniqueESSymbol != 0 {
				identity := checker.GetPropertyNameFromType(key)
				for _, symbolic := range []string{"dispose", "asyncDispose"} {
					if identity == taskResourceDisposalSymbolKey(typeChecker, symbolic) {
						method = symbolic
						break
					}
				}
			}
		}
	} else {
		return false
	}
	if method == "" {
		return false
	}
	if method != disposal && method != "close" && method != "terminate" &&
		method != "unsubscribe" && method != "dispose" && method != "asyncDispose" && method != "cancel" {
		return false
	}
	return parent.Parent != nil && ast.IsCallExpression(parent.Parent) &&
		parent.Parent.AsCallExpression().Expression == parent
}
