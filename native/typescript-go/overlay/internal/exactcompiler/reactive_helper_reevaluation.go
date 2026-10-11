package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

func safeLocalDerivedHelper(
	expression *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	resolving map[ast.SymbolId]struct{},
	reason *reevaluationFailure,
) bool {
	return safeReactiveCallableSymbol(sourceCallableReferenceSymbol(expression, typeChecker), sourceFile, typeChecker, resolving, reason)
}

// A helper body can be reevaluated only through a stable selected identity or an explicit pure contract.
func safeReactiveCallableSymbol(symbol *ast.Symbol, sourceFile *ast.SourceFile, typeChecker *checker.Checker, resolving map[ast.SymbolId]struct{}, reason *reevaluationFailure) bool {
	symbol = sourceCallableSymbol(symbol, typeChecker)
	if symbol == nil {
		return false
	}
	if !reactiveCallableMemberStable(symbol, typeChecker) {
		return false
	}
	id := ast.GetSymbolId(symbol)
	if _, recursive := resolving[id]; recursive {
		return true
	}
	next := make(map[ast.SymbolId]struct{}, len(resolving)+1)
	for key := range resolving {
		next[key] = struct{}{}
	}
	next[id] = struct{}{}
	for _, declaration := range symbol.Declarations {
		declarationSource := ast.GetSourceFileOfNode(declaration)
		if declarationSource != nil && policyNodeAnnotations(declaration, declarationSource).pure {
			return true
		}
		var work *ast.Node
		switch {
		case ast.IsFunctionDeclaration(declaration), ast.IsMethodDeclaration(declaration):
			work = declaration.Body()
		case ast.IsVariableDeclaration(declaration), ast.IsPropertyAssignment(declaration):
			initializer := unwrapSourceCallableReference(declaration.Initializer())
			if initializer != nil &&
				(ast.IsArrowFunction(initializer) ||
					ast.IsFunctionExpression(initializer)) {
				work = initializer.Body()
			} else if initializer != nil {
				return safeReactiveCallableSymbol(sourceCallableReferenceSymbol(initializer, typeChecker), declarationSource, typeChecker, next, reason)
			}
		case ast.IsShorthandPropertyAssignment(declaration):
			return safeReactiveCallableSymbol(typeChecker.GetShorthandAssignmentValueSymbol(declaration), declarationSource, typeChecker, next, reason)
		}
		if work != nil {
			declarationSource := ast.GetSourceFileOfNode(declaration)
			if declarationSource == nil {
				continue
			}
			return safeReactiveInitializerWithHelpers(
				work,
				declarationSource,
				typeChecker,
				next,
				reason,
			)
		}
	}
	return false
}
