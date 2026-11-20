package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// coreOpaqueAllocation identifies the intrinsic issuer's dispatch allocation.
// Core has already acquired the key and domain. This Call reads only its own
// lexical values and creates a data record, so it cannot invoke authored input
// hooks. The allocator retains the executor for later dispatch and writes only
// to private caches and newly allocated objects.
func (owner *executableBodyOwner) coreOpaqueAllocation(call *ast.Node) bool {
	if owner == nil || call == nil || !ast.IsCallExpression(call) ||
		!ast.IsIdentifier(call.Expression()) || call.Expression().Text() != "createOpaqueOperation" {
		return false
	}
	issuer := ast.GetSourceFileOfNode(call)
	if writer := enclosingCallableNode(call); writer == nil || !ast.IsFunctionDeclaration(writer) ||
		writer.Name() == nil || writer.Name().Text() != "issueIntrinsicReceipt" {
		return false
	}
	if accepted, checked := owner.coreOpaqueAllocations[call]; checked {
		return accepted
	}
	body, selected := owner.body(call.Expression())
	if owner.selection == nil {
		symbol := resolvedCallableSymbol(owner.checker.GetSymbolAtLocation(call.Expression()), owner.checker)
		body, selected = owner.uniqueSymbolDefinition(symbol)
	}
	accepted := selected && body != nil && ast.IsFunctionDeclaration(body) &&
		body.Name() != nil && body.Name().Text() == "createOpaqueOperation" &&
		owner.selectedIntrinsicReceiptModules(issuer, ast.GetSourceFileOfNode(body))
	if owner.coreOpaqueAllocations == nil {
		owner.coreOpaqueAllocations = make(map[*ast.Node]bool)
	}
	owner.coreOpaqueAllocations[call] = accepted
	return accepted
}
