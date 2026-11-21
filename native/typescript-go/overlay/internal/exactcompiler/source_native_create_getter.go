package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceCreatedGetter describes an original named Get on a fresh receiver
// returned by a native Call. Callee discovery is still pending.
type sourceCreatedGetter struct {
	creation, read, receiver, body *ast.Node
	name                           string
	reflected                      *sourceGetInputs
}

func (q *sourceValueQuery) sourceCreatedGetter(call *ast.Node, projection []string, name string, actual *sourceGetInputs, result *accessorCandidates) *sourceCreatedGetter {
	if q.reflectiveCopy != nil {
		return nil
	}
	if actual != nil && actual.originalReflectRead && actual.receiver.node == call && len(actual.receiver.path) == 0 && len(projection) == 1 && name == "" && projection[0] == actual.propertyKey {
		return q.sourceReturnedDescriptorGetter(call, restrictedInvocationArguments(call.AsCallExpression()), actual.propertyKey, actual, result)
	}
	if q.protectedMember == nil || !ast.IsAccessExpression(q.protectedMember) {
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
		return q.sourceReturnedDescriptorGetter(call, args, name, nil, result)
	}
	if len(args) != 1 || ast.IsSpreadElement(args[0]) {
		return nil
	}
	input := q.sourceCreatedReadInput(call, q.protectedMember, args[0], true, result)
	return createdPrototypeGetter(call, q.protectedMember, input, name)
}

// createdPrototypeGetter describes the own getter on the received prototype
// literal. The selected native Create and actual named read still own its use.
func createdPrototypeGetter(call, read, input *ast.Node, name string) *sourceCreatedGetter {
	getter := namedPrototypeGetter(input, name)
	if getter == nil {
		return nil
	}
	return &sourceCreatedGetter{creation: call, read: read, receiver: call, body: getter, name: name}
}

func namedPrototypeGetter(input *ast.Node, name string) *ast.Node {
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
	return getter
}

// sourceCreatedGetterRead follows the getter on the selected returned receiver.
// Creation arguments and alternative callees retain their independent effects.
func (q *sourceValueQuery) sourceCreatedGetterRead(getter *sourceCreatedGetter, bindings sourceValueBindings, result *accessorCandidates) {
	prior := q.reflectiveCopy
	q.reflectiveCopy = nil
	defer func() { q.reflectiveCopy = prior }()
	get := sourceGetInputs{operation: getter.read, receiver: sourceValue{node: getter.receiver}}
	if getter.reflected != nil {
		get = *getter.reflected
		get.receiver.node = getter.receiver
	}
	q.reflectiveSourceGet(getter.body, getter.creation, getter.name, &get, bindings, result)
}

// sourceDefinedCreateTargetRead follows the original target only after the
// definition has selected that alternative. The child's own callee must still
// select native Create before the named Get can enter the getter's body.
func (q *sourceValueQuery) sourceDefinedCreateTargetRead(getter *sourceCreatedGetter, scope acquiredCallableScope, result *accessorCandidates) {
	child := *getter
	child.creation = child.receiver
	prior := q.reflectiveCopy
	q.reflectiveCopy = nil
	defer func() { q.reflectiveCopy = prior }()
	q.memberWriterScope(sourceMemberWriterInput{scope: scope}, func() {
		part := q.projectSourceCallReturns(child.creation, scope.bindings,
			sourceCallResultInterest{purpose: resultSourceProjection, createdGetter: &child},
			func(sourceValue, sourceValueBindings) {}, func() {})
		mergeAccessorCandidates(result, part)
	})
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
		if ast.IsVariableDeclaration(parent) && unwrapSourceCallableReference(parent.Initializer()) == call {
			if privateCreatedModuleRead(parent, q.owner) == read {
				return unwrapSourceCallableReference(argument)
			}
			return nil
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

// privateCreatedModuleRead keeps a single original named read of a private
// module value. An alias, write, export or second observation leaves it open.
func privateCreatedModuleRead(declaration *ast.Node, owner *sourceValueOwner) *ast.Node {
	if !ast.IsVariableDeclaration(declaration) || !runtimeModuleEvaluation(declaration) || !ast.IsIdentifier(declaration.Name()) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
		return nil
	}
	symbol := owner.checker.GetSymbolAtLocation(declaration.Name())
	if symbol == nil || symbol.ValueDeclaration != declaration {
		return nil
	}
	index := owner.index(ast.GetSourceFileOfNode(declaration))
	if index.privateUses == nil {
		return nil
	}
	uses := index.privateUses.uses[ast.GetSymbolId(symbol)]
	if len(uses) != 1 {
		return nil
	}
	use := uses[0].node
	field := use.Parent
	if !ast.IsPropertyAccessExpression(field) || field.Expression() != use || !privateSingleUse(use, symbol, declaration.Parent.Parent, owner) {
		return nil
	}
	read, write := accessorEvaluationMode(field)
	if !read || write {
		return nil
	}
	return field
}

// sourceReturnedDescriptorGetter describes the exact named read of a selected
// DefineProperty target. Source syntax supplies no callee or write authority.
func (q *sourceValueQuery) sourceReturnedDescriptorGetter(call *ast.Node, args []*ast.Node, name string, reflected *sourceGetInputs, result *accessorCandidates) *sourceCreatedGetter {
	if len(args) != 3 || !standardDescriptorMember(call.Expression(), q.owner.checker) {
		return nil
	}
	target := unwrapSourceCallableReference(args[0])
	descriptor := unwrapSourceCallableReference(args[2])
	if own := sourceLiteralMemberName(args[1]); own != name {
		if own == "" || reflected != nil || sourceCopyMember(target) != "create" || !sourceInertDataLiteral(descriptor, "value") ||
			q.sourceCreatedReadInput(call, q.protectedMember, args[0], false, result) != target {
			return nil
		}
		prototype := restrictedInvocationArguments(target.AsCallExpression())
		if len(prototype) != 1 || ast.IsSpreadElement(prototype[0]) {
			return nil
		}
		getter := createdPrototypeGetter(target, q.protectedMember, unwrapSourceCallableReference(prototype[0]), name)
		if getter != nil {
			getter.creation = call
		}
		return getter
	}
	if !ast.IsObjectLiteralExpression(target) || !ast.IsObjectLiteralExpression(descriptor) {
		return nil
	}
	properties := descriptor.AsObjectLiteralExpression().Properties.Nodes
	if len(properties) != 1 || !ast.IsPropertyAssignment(properties[0]) ||
		ast.IsComputedPropertyName(properties[0].Name()) || callableNameText(properties[0].Name()) != "get" {
		return nil
	}
	if reflected == nil && q.sourceCreatedReadInput(call, q.protectedMember, args[0], false, result) != target {
		return nil
	}
	return &sourceCreatedGetter{creation: call, read: q.protectedMember, receiver: target, body: properties[0].Initializer(), name: name, reflected: reflected}
}
