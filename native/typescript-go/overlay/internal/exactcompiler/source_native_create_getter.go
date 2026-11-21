package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceCreatedGetter describes an original named Get on the fresh receiver
// returned by a Create alternative. Callee discovery is still pending.
type sourceCreatedGetter struct {
	creation, read, body *ast.Node
	name                 string
}

func (q *sourceValueQuery) sourceCreatedGetter(call *ast.Node, projection []string, name string, result *accessorCandidates) *sourceCreatedGetter {
	if q.reflectiveCopy != nil || sourceCopyMember(call) != "create" || q.protectedMember == nil {
		return nil
	}
	switch {
	case len(projection) == 1 && name == "":
		name = projection[0]
	case len(projection) != 0:
		return nil
	}
	_, key := accessorReceiver(q.protectedMember)
	if name == "" || key != name {
		return nil
	}
	args := restrictedInvocationArguments(call.AsCallExpression())
	if len(args) != 1 || ast.IsSpreadElement(args[0]) {
		return nil
	}
	input := q.sourceCreatedReadInput(call, q.protectedMember, args[0], result)
	if input == nil || !ast.IsObjectLiteralExpression(input) {
		return nil
	}
	var getter *ast.Node
	for _, member := range input.AsObjectLiteralExpression().Properties.Nodes {
		if member.Name() == nil || ast.IsComputedPropertyName(member.Name()) || ast.IsSpreadAssignment(member) {
			return nil
		}
		if callableNameText(member.Name()) != name {
			continue
		}
		if getter != nil || !ast.IsGetAccessorDeclaration(member) {
			return nil
		}
		getter = member
	}
	if getter == nil {
		return nil
	}
	return &sourceCreatedGetter{creation: call, read: q.protectedMember, body: getter, name: name}
}

// sourceCreatedGetterRead uses the actual selected Create branch. The inherited
// accessor retains the newly created receiver, while the original creation
// arguments and alternate callees retain their independent effects.
func (q *sourceValueQuery) sourceCreatedGetterRead(getter *sourceCreatedGetter, bindings sourceValueBindings, result *accessorCandidates) {
	prior := q.reflectiveCopy
	q.reflectiveCopy = nil
	defer func() { q.reflectiveCopy = prior }()
	get := sourceGetInputs{operation: getter.read, receiver: sourceValue{node: getter.creation}}
	q.reflectiveSourceGet(getter.body, getter.creation, getter.name, &get, bindings, result)
}

// sourceCreatedReadInput admits a direct read after allocation. A single-return
// helper may supply the prototype from its exact literal argument. Additional
// statements or arguments can mutate or escape the prototype before the Get.
func (q *sourceValueQuery) sourceCreatedReadInput(call, read, argument *ast.Node, result *accessorCandidates) *ast.Node {
	if !ast.IsAccessExpression(read) {
		return nil
	}
	expr := unwrapSourceCallableReference(read.Expression())
	for current, parent := call, call.Parent; parent != nil; current, parent = parent, parent.Parent {
		if unwrapSourceCallableReference(current) == expr {
			return unwrapSourceCallableReference(argument)
		}
		if unwrapSourceCallableReference(parent) == unwrapSourceCallableReference(current) {
			continue
		}
		if ast.IsCallExpression(parent) {
			callee := parent.Expression()
			if !ast.IsPropertyAccessExpression(callee) || callee.Name().Text() != "freeze" || !standardLibraryCallRoot(callee, q.owner.checker) || !q.pendingWriterInputExcluded(parent, result) {
				return nil
			}
			args := restrictedInvocationArguments(parent.AsCallExpression())
			if len(args) != 1 || unwrapSourceCallableReference(args[0]) != unwrapSourceCallableReference(current) {
				return nil
			}
			continue
		}
		if !ast.IsReturnStatement(parent) || unwrapSourceCallableReference(parent.Expression()) != unwrapSourceCallableReference(current) {
			return nil
		}
		owner := enclosingCallableNode(call)
		scope := q.creators[owner]
		if owner == nil || scope.invocation != expr || unwrapSourceCallableReference(scope.returning) != unwrapSourceCallableReference(current) || !ast.IsBlock(owner.Body()) || len(owner.Body().AsBlock().Statements.Nodes) != 1 || owner.Body().AsBlock().Statements.Nodes[0] != parent {
			return nil
		}
		direct := unwrapSourceCallableReference(argument)
		if ast.IsObjectLiteralExpression(direct) {
			return direct
		}
		if !ast.IsCallExpression(expr) || !ast.IsIdentifier(direct) || len(owner.Parameters()) != 1 {
			return nil
		}
		param := owner.Parameters()[0]
		if !ast.IsIdentifier(param.Name()) || param.Initializer() != nil || param.AsParameterDeclaration().DotDotDotToken != nil {
			return nil
		}
		symbol := q.owner.checker.GetSymbolAtLocation(direct)
		if symbol == nil || symbol.ValueDeclaration != param {
			return nil
		}
		supplied := restrictedInvocationArguments(expr.AsCallExpression())
		if len(supplied) == 1 && !ast.IsSpreadElement(supplied[0]) {
			return unwrapSourceCallableReference(supplied[0])
		}
		return nil
	}
	return nil
}
