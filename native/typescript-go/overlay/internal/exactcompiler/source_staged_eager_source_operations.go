package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedEagerSourceOperation delegates to the exact eager Call summary. Its
// directly returned callable remains deferred during this creation operation.
// This establishes neither result identity nor permission to invoke that body.
func stagedEagerSourceOperation(calls []sourceStagedNativeEagerCall, operation, region *ast.Node, owner *executableBodyOwner) bool {
	for _, call := range calls {
		if operation == call.invocation.operation && region == enclosingCallableNode(operation) {
			return true
		}
		if region == call.invocation.declaration {
			if sourceOpaqueDeclarationCall(operation, owner) {
				return true
			}
			if ast.IsPropertyAccessExpression(operation) || ast.IsElementAccessExpression(operation) {
				receiver, key := accessorReceiver(operation)
				if ast.IsElementAccessExpression(operation) && key == "" {
					return false
				}
				if !ast.IsIdentifier(receiver) {
					return false
				}
				symbol := owner.checker.GetSymbolAtLocation(receiver)
				return symbol != nil && symbol.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration))
			}
			return false
		}
		if region != nil && (ast.IsArrowFunction(region) || ast.IsFunctionExpression(region)) {
			// Creation effects need only the existing return-site association.
			// Capture/value extraction belongs to the separate exposure request.
			for _, site := range owner.values.summary(call.invocation.declaration).returnSites {
				if ast.IsReturnStatement(site) && unwrapSourceCallableReference(site.Expression()) == region {
					return true
				}
			}
		}
	}
	return false
}
