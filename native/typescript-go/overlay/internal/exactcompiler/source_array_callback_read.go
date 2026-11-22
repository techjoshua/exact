package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// confinedArrayCallback leaves the fresh literal inaccessible to the callback.
// Even the callback's own writes cannot replace a subsequent indexed Get.
func confinedArrayCallback(call, literal *ast.Node) bool {
	if literal == nil {
		return false
	}
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
	receiver := unwrapSourceCallableReference(reference.receiver)
	if receiver != call {
		if receiver == nil || !ast.IsIdentifier(receiver) {
			return false
		}
		symbol := q.owner.checker.GetSymbolAtLocation(receiver)
		if symbol == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
			return false
		}
		decl := symbol.ValueDeclaration
		if decl.Parent == nil || decl.Parent.Flags&ast.NodeFlagsConst == 0 || unwrapSourceCallableReference(decl.Initializer()) != call {
			return false
		}
		uses, known := q.mapKeySourceUses(symbol, decl)
		if !known || len(uses) != 1 || uses[0].node != receiver {
			return false
		}
	}
	return confinedArrayCallback(call, directDenseArrayCallbackReceiver(call, "filter", q.owner.checker))
}
