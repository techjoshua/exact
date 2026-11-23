package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// confinedModuleReturnedObject admits the existing local writer row for a
// literal returned by the creating Call inside this eager module read.
// It gives no completed-write authority. That still needs the original
// writer's own-slot and precedence checks.
func (q *sourceValueQuery) confinedModuleReturnedObject(origin, owner *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	creation := q.creators[owner]
	if !envelopeSynchronousFunction(owner) || creation.invocation == nil || creation.returning == nil ||
		!q.moduleRead().Contains(creation.invocation) {
		return false
	}
	declaration := origin.Parent
	if declaration == nil || !ast.IsVariableDeclaration(declaration) || declaration.Initializer() != origin ||
		!ast.IsIdentifier(declaration.Name()) || declaration.Parent == nil ||
		declaration.Parent.Flags&ast.NodeFlagsConst == 0 || declaration.Parent.Parent == nil ||
		declaration.Parent.Parent.Parent != owner.Body() {
		return false
	}
	checker := q.owner.checker
	symbol := checker.GetSymbolAtLocation(declaration.Name())
	returned := unwrapSourceCallableReference(creation.returning)
	if symbol == nil || !ast.IsIdentifier(returned) || checker.GetSymbolAtLocation(returned) != symbol ||
		q.owner.bindingWritten(symbol) {
		return false
	}
	if _, found := bindings[ast.GetSymbolId(symbol)]; found {
		return false
	}
	uses, known := q.mapKeySourceUses(symbol, declaration)
	index := q.owner.index(ast.GetSourceFileOfNode(origin))
	if !known || index.privateUses.refused || len(index.privateUses.unresolved[""]) != 0 {
		return false
	}
	for _, use := range uses {
		if !q.charge(result, use.node) || use.region != owner {
			return false
		}
		parent := use.node.Parent
		if parent == nil {
			return false
		}
		if ast.IsReturnStatement(parent) && parent.AsReturnStatement().Expression == use.node {
			// An enclosing finally can mutate the return's object after the
			// lexical return read. Keep such cases with the ordinary owner.
			for region := parent.Parent; region != owner; region = region.Parent {
				if region == nil || !q.charge(result, region) || ast.IsTryStatement(region) {
					return false
				}
			}
			continue
		}
		if !ast.IsPropertyAccessExpression(parent) || parent.Expression() != use.node ||
			parent.AsPropertyAccessExpression().QuestionDotToken != nil ||
			!plainStagedAssignment(parent.Parent) || parent.Parent.AsBinaryExpression().Left != parent ||
			!directSourceDataSlot(origin, []string{parent.Name().Text()}, parent, checker) || parent.Name().Text() == "__proto__" {
			return false
		}
	}
	return true
}
