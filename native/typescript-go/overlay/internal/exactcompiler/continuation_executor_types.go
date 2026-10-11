package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// continuationExecutorTypeParameters retains the scope of receiver and callback types copied
// out of a generic component. Constraints and defaults remain part of that authored scope.
func continuationExecutorTypeParameters(factory *printer.NodeFactory, componentFunction *ast.Node) *ast.NodeList {
	parameters := componentFunction.TypeParameters()
	if len(parameters) == 0 {
		return nil
	}
	cloned := make([]*ast.Node, 0, len(parameters))
	for _, parameter := range parameters {
		cloned = append(cloned, parameter.Clone(factory))
	}
	return factory.NewNodeList(cloned)
}

// continuationExecutorStateType preserves the authored Component<State>
// receiver type when a task body is copied into a module-level executor.
func continuationExecutorStateType(
	factory *printer.NodeFactory,
	componentFunction *ast.Node,
) *ast.Node {
	for _, parameter := range componentFunction.Parameters() {
		name := parameter.Name()
		if name == nil || !ast.IsIdentifier(name) || name.Text() != "this" {
			continue
		}
		typeNode := parameter.Type()
		if typeNode == nil || !ast.IsTypeReferenceNode(typeNode) {
			return nil
		}
		arguments := typeNode.TypeArguments()
		if len(arguments) == 0 {
			return nil
		}
		return arguments[0].Clone(factory)
	}
	return nil
}

func continuationComponentValue(
	factory *printer.NodeFactory,
	activation *ast.Node,
	stateType *ast.Node,
	continuation Continuation,
	localizationContextName string,
) *ast.Node {
	state := factory.NewPropertyAccessExpression(activation, nil, factory.NewIdentifier("state"), ast.NodeFlagsNone)
	if stateType != nil {
		state = factory.NewAsExpression(state, stateType)
	}
	properties := []*ast.Node{contractProperty(factory, "state", state)}
	if continuation.localization {
		properties = append(properties, continuationLocalizationOwner(factory, activation, len(continuation.Activation.Dependencies)-1, localizationContextName)...)
	}
	return contractObject(factory, false, properties...)
}
