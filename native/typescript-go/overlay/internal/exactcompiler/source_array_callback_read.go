package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// arrayCallbackCannotAccessReceiver refuses callback forms that can inspect
// the third argument or have their own arguments object.
func arrayCallbackCannotAccessReceiver(call *ast.Node) bool {
	args := restrictedInvocationArguments(call.AsCallExpression())
	if len(args) != 1 {
		return false
	}
	callback := unwrapSourceCallableReference(args[0])
	if callback == nil || !ast.IsArrowFunction(callback) || len(callback.Parameters()) > 2 {
		return false
	}
	for _, parameter := range callback.Parameters() {
		if parameter.AsParameterDeclaration().DotDotDotToken != nil {
			return false
		}
	}
	return true
}

// confinedFilterIndexRead accounts for the terminal Get of an index on a
// fresh filter result. Call effects, including the predicate and its input
// Gets, retain the original invocation owner. Contents and index presence
// remain unmodeled. An exposed result needs the ordinary member inventory.
func (q *sourceValueQuery) confinedFilterIndexRead(call *ast.Node, projection []string, name string, mode accessorTraversal, reference *sourceGetReference) bool {
	if !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || mode != accessorRead ||
		reference == nil || reference.operation != q.protectedMember || !reference.matches(projection, name) {
		return false
	}
	if _, index := sourceArrayIndex(reference.key.name); !index {
		return false
	}
	return q.confinedFilterReceiver(reference.receiver, nil) == call
}

// confinedFilterReceiver recognizes an inaccessible filter result at its sole consumer.
// Its input literal provides possible element origins without predicting survival.
func (q *sourceValueQuery) confinedFilterReceiver(receiver *ast.Node, bindings sourceValueBindings) *ast.Node {
	call := q.confinedArrayConsumerSource(receiver)
	if !(directDenseArrayCallbackReceiver(call, "filter", q.owner.checker) != nil && arrayCallbackCannotAccessReceiver(call)) &&
		q.componentFilterInputs(call, bindings) == nil {
		return nil
	}
	return call
}

// confinedArrayConsumerSource names the expression delivered to a sole Get.
func (q *sourceValueQuery) confinedArrayConsumerSource(receiver *ast.Node) *ast.Node {
	receiver = unwrapSourceCallableReference(receiver)
	call := receiver
	if receiver != nil && ast.IsIdentifier(receiver) {
		symbol := q.owner.checker.GetSymbolAtLocation(receiver)
		if symbol == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			return nil
		}
		decl := symbol.ValueDeclaration
		if decl.Parent == nil || decl.Parent.Flags&ast.NodeFlagsConst == 0 {
			return nil
		}
		uses, known := q.mapKeySourceUses(symbol, decl)
		if !known || len(uses) != 1 || uses[0].node != receiver {
			return nil
		}
		call = unwrapSourceCallableReference(decl.Initializer())
	}
	return call
}

// confinedFilterMap obtains both the original filter and the inherited map used
// by the consumer. The filtered array is private until map acquires its elements.
func (q *sourceValueQuery) confinedFilterMap(member *ast.Node, bindings sourceValueBindings) (filter, declaration *ast.Node) {
	if member == nil || !ast.IsPropertyAccessExpression(member) || member.Name().Text() != "map" {
		return nil, nil
	}
	call := normalCalleeGetOwner(member)
	if call == nil || !ast.IsCallExpression(call) || ast.IsOptionalChain(call) || !arrayCallbackCannotAccessReceiver(call) {
		return nil, nil
	}
	filter = q.confinedFilterReceiver(member.Expression(), bindings)
	if filter == nil || standardLibraryCallOwner(call.AsCallExpression(), q.owner.checker) != "Array" ||
		!nativeReceiverMemberDeclarations(member, q.owner.checker) {
		return nil, nil
	}
	signature := q.owner.checker.GetResolvedSignature(call)
	if signature == nil {
		return nil, nil
	}
	return filter, signature.Declaration()
}

// relativeFilterMapReceiver identifies the original formal on which the map Get
// depends. While the formal is unbound, the lookup remains a per-use demand.
func (q *sourceValueQuery) relativeFilterMapReceiver(member, receiver *ast.Node) *ast.Node {
	if !q.dependenciesOnly || member == nil || !ast.IsPropertyAccessExpression(member) || member.Name().Text() != "map" {
		return nil
	}
	producer := q.confinedArrayConsumerSource(receiver)
	if producer == nil || !ast.IsCallExpression(producer) || enclosingCallableNode(producer) != enclosingCallableNode(member) {
		return nil
	}
	base, name := restrictedInvocationMember(producer.Expression(), q.owner.checker)
	if name != "filter" || base == nil || !ast.IsPropertyAccessExpression(base) {
		return nil
	}
	call := normalCalleeGetOwner(member)
	if call == nil || !ast.IsCallExpression(call) || ast.IsOptionalChain(call) ||
		standardLibraryCallOwner(call.AsCallExpression(), q.owner.checker) != "Array" {
		return nil
	}
	return base
}
