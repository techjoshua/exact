package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Visit eagerly evaluated source and statically selected helper bodies. Deferred callbacks
// and snapshot reads do not contribute live inputs to their enclosing computation.
func visitReactiveInitializer(node *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker, visit func(*ast.Node) bool) {
	seen := make(map[ast.SymbolId]bool)
	var scan func(*ast.Node)
	scan = func(root *ast.Node) {
		walkNode(root, func(current *ast.Node) bool {
			if current != root && (isCallableNode(current) || ast.IsMethodDeclaration(current) || ast.IsGetAccessorDeclaration(current) || ast.IsSetAccessorDeclaration(current)) {
				return false
			}
			if _, logging := canonicalComponentLogLevel(current); logging {
				return false
			}
			if !visit(current) {
				return false
			}
			if ast.IsCallExpression(current) {
				call := current.AsCallExpression()
				if reactivePeekOperation(call.Expression, source, typeChecker) {
					return false
				}
				symbol := sourceCallableSymbol(sourceCallableReferenceSymbol(call.Expression, typeChecker), typeChecker)
				if symbol != nil && !seen[ast.GetSymbolId(symbol)] {
					seen[ast.GetSymbolId(symbol)] = true
					if body := localCallableBody(symbol, typeChecker); body != nil {
						scan(body)
					}
				}
			}
			return true
		})
	}
	if node != nil && typeChecker != nil {
		scan(node)
	}
}

// Captured instance inputs are live even when the call site contains only a helper alias.
func reactiveInitializerHasLiveInput(node *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker, reads []StateRead, component string) bool {
	live := false
	spans := make(map[SourceSpan]bool)
	for _, read := range reads {
		if read.Component == component {
			spans[SourceSpan{Start: read.Start, Length: read.Length}] = true
		}
	}
	visitReactiveInitializer(node, source, typeChecker, func(current *ast.Node) bool {
		if ast.IsCallExpression(current) && reactivePeekOperation(current.AsCallExpression().Expression, source, typeChecker) {
			return false
		}
		if ast.IsPropertyAccessExpression(current) {
			access := current.AsPropertyAccessExpression()
			if access.Expression.Kind == ast.KindThisKeyword && access.Name() != nil && access.Name().Text() == "props" {
				live = true
			}
		}
		live = live || spans[SourceSpan{Start: current.Pos(), Length: current.End() - current.Pos()}]
		return !live
	})
	return live
}

// Snapshot-containing calculations cannot share a wider consumer's invalidation boundary.
func reactiveInitializerHasSnapshot(node *ast.Node, source *ast.SourceFile, typeChecker *checker.Checker) bool {
	found := false
	visitReactiveInitializer(node, source, typeChecker, func(current *ast.Node) bool {
		if ast.IsCallExpression(current) && reactivePeekOperation(current.AsCallExpression().Expression, source, typeChecker) {
			found = true
		}
		return !found
	})
	return found
}
