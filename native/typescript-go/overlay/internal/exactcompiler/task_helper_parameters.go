package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// helperBindingName preserves native parameter binding while giving its computed names and nested
// default expressions explicit invocation ownership. Each expression owns any generated temporaries.
func (lowering *jsxLowering) helperBindingName(work, context, name *ast.Node) *ast.Node {
	if !ast.IsBindingPattern(name) {
		return name
	}
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if ast.IsBindingElement(node) {
			element := node.AsBindingElement()
			property := element.PropertyName
			if property != nil && ast.IsComputedPropertyName(property) {
				property = lowering.factory.NewComputedPropertyName(lowering.lowerTaskHelperNode(work, context, property.AsComputedPropertyName().Expression))
			}
			initializer := element.Initializer
			if initializer != nil {
				initializer = lowering.lowerTaskHelperNode(work, context, initializer)
			}
			return lowering.factory.UpdateBindingElement(element, element.DotDotDotToken, property, visitor.VisitNode(element.Name()), initializer)
		}
		return visitor.VisitEachChild(node)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(name)
}
