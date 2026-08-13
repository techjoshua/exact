package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

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
) *ast.Node {
	value := contractObject(factory, false,
		contractProperty(
			factory,
			"state",
			factory.NewPropertyAccessExpression(
				activation,
				nil,
				factory.NewIdentifier("state"),
				ast.NodeFlagsNone,
			),
		),
	)
	if stateType == nil {
		return value
	}
	return factory.NewAsExpression(
		value,
		factory.NewTypeLiteralNode(factory.NewNodeList([]*ast.Node{
			factory.NewPropertySignatureDeclaration(
				nil,
				factory.NewIdentifier("state"),
				nil,
				stateType,
				nil,
			),
		})),
	)
}
