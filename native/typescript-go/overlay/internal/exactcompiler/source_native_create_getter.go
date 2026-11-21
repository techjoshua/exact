package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceCreatedGetter describes an original named Get on a fresh receiver
// returned by a native Call. Callee discovery is still pending.
type sourceCreatedGetter struct {
	creation, read, receiver, body *ast.Node
	name                           string
}

func (q *sourceValueQuery) sourceCreatedGetter(call *ast.Node, projection []string, name string, result *accessorCandidates) *sourceCreatedGetter {
	if q.reflectiveCopy != nil || q.protectedMember == nil || !ast.IsAccessExpression(q.protectedMember) {
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
	if sourceCopyMember(call) != "create" {
		return q.sourceReturnedDescriptorGetter(call, args, name, result)
	}
	if len(args) != 1 || ast.IsSpreadElement(args[0]) {
		return nil
	}
	input := q.sourceCreatedReadInput(call, q.protectedMember, args[0], true, result)
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
	return &sourceCreatedGetter{creation: call, read: q.protectedMember, receiver: call, body: getter, name: name}
}

// sourceCreatedGetterRead follows the getter on the selected returned receiver.
// Creation arguments and alternative callees retain their independent effects.
func (q *sourceValueQuery) sourceCreatedGetterRead(getter *sourceCreatedGetter, bindings sourceValueBindings, result *accessorCandidates) {
	prior := q.reflectiveCopy
	q.reflectiveCopy = nil
	defer func() { q.reflectiveCopy = prior }()
	get := sourceGetInputs{operation: getter.read, receiver: sourceValue{node: getter.receiver}}
	q.reflectiveSourceGet(getter.body, getter.creation, getter.name, &get, bindings, result)
}

// sourceCreatedReadInput admits a direct read after allocation. A single-return
// helper may supply the prototype from its exact literal argument. Additional
// statements or arguments can mutate or escape the prototype before the Get.
func (q *sourceValueQuery) sourceCreatedReadInput(call, read, argument *ast.Node, allowFreeze bool, result *accessorCandidates) *ast.Node {
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
		if allowFreeze && ast.IsCallExpression(parent) {
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

// sourceReturnedDescriptorGetter describes the exact named read of a selected
// DefineProperty target. Source syntax supplies no callee or write authority.
func (q *sourceValueQuery) sourceReturnedDescriptorGetter(call *ast.Node, args []*ast.Node, name string, result *accessorCandidates) *sourceCreatedGetter {
	if len(args) != 3 || !standardDescriptorMember(call.Expression(), q.owner.checker) ||
		sourceLiteralMemberName(args[1]) != name {
		return nil
	}
	target := unwrapSourceCallableReference(args[0])
	descriptor := unwrapSourceCallableReference(args[2])
	if !ast.IsObjectLiteralExpression(target) || !ast.IsObjectLiteralExpression(descriptor) {
		return nil
	}
	properties := descriptor.AsObjectLiteralExpression().Properties.Nodes
	if len(properties) != 1 || !ast.IsPropertyAssignment(properties[0]) ||
		ast.IsComputedPropertyName(properties[0].Name()) || callableNameText(properties[0].Name()) != "get" {
		return nil
	}
	if q.sourceCreatedReadInput(call, q.protectedMember, args[0], false, result) != target {
		return nil
	}
	return &sourceCreatedGetter{creation: call, read: q.protectedMember, receiver: target, body: properties[0].Initializer(), name: name}
}
