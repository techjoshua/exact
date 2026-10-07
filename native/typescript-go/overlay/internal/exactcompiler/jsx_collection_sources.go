package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// collectionMapReceiver retains the receiver of a statically named map member.
// Only literal indexed names are accepted, so lowering never discards a computed key's effects.
func collectionMapReceiver(expression *ast.Node) *ast.Node {
	receiver, name := sourceLiteralMemberReference(expression)
	if name == "map" {
		return receiver
	}
	return nil
}

// collectionMapRender follows transparent callback wrappers without changing authored call arguments.
func collectionMapRender(call *ast.CallExpression) *ast.Node {
	if call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
		return nil
	}
	render := unwrapSourceCallableReference(call.Arguments.Nodes[0])
	if render == nil || (!ast.IsArrowFunction(render) && !ast.IsFunctionExpression(render)) || len(render.Parameters()) != 1 {
		return nil
	}
	return render
}

// collectionMapCallbackInvocation proves the first map argument through transparent callable wrappers.
func collectionMapCallbackInvocation(render *ast.Node) *ast.Node {
	parent := render.Parent
	for parent != nil && unwrapSourceCallableReference(parent) == render {
		parent = parent.Parent
	}
	if parent == nil || !ast.IsCallExpression(parent) {
		return nil
	}
	call := parent.AsCallExpression()
	if collectionMapReceiver(call.Expression) == nil || call.Arguments == nil || len(call.Arguments.Nodes) == 0 || unwrapSourceCallableReference(call.Arguments.Nodes[0]) != render {
		return nil
	}
	return parent
}

// Primitive inference shares the public string-or-number key contract. Other values
// retain ordinary array mapping rather than receiving an invalid compiler-generated selector.
func collectionPrimitiveKeyType(value *checker.Type, typeChecker *checker.Checker) bool {
	if value == nil || value.Flags()&checker.TypeFlagsAnyOrUnknown != 0 {
		return false
	}
	if typeChecker.IsTypeAssignableTo(value, typeChecker.GetStringType()) || typeChecker.IsTypeAssignableTo(value, typeChecker.GetNumberType()) {
		return true
	}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		for _, member := range value.AsUnionType().Types() {
			if !collectionPrimitiveKeyType(member, typeChecker) {
				return false
			}
		}
		return len(value.AsUnionType().Types()) > 0
	}
	if value.Flags()&checker.TypeFlagsTypeParameter != 0 {
		constraint := typeChecker.GetBaseConstraintOfType(value)
		return constraint != nil && constraint != value && collectionPrimitiveKeyType(constraint, typeChecker)
	}
	return false
}

// Callback-local keys stay inside the authored invocation instead of being hoisted
// into a selector that cannot access destructured parameters, locals or dynamic this.
func collectionMapKeyNeedsCallbackScope(render, key *ast.Node, typeChecker *checker.Checker) bool {
	parameter := render.Parameters()[0].Name()
	if !ast.IsIdentifier(parameter) {
		return true
	}
	parameterSymbol := typeChecker.GetSymbolAtLocation(parameter)
	scoped := false
	walkNode(key, func(node *ast.Node) bool {
		if ast.IsFunctionExpression(render) && node.Kind == ast.KindThisKeyword {
			scoped = true
			return false
		}
		if !ast.IsIdentifier(node) {
			return !scoped
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil || symbol == parameterSymbol {
			return !scoped
		}
		for _, declaration := range symbol.Declarations {
			if declaration.Pos() >= render.Pos() && declaration.End() <= render.End() {
				scoped = true
				return false
			}
		}
		return !scoped
	})
	return scoped
}
