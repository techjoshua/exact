package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// policyInvocationTarget identifies native invocation syntax without transforming its execution.
func policyInvocationTarget(node *ast.Node) *ast.Node {
	if node == nil {
		return nil
	}
	switch {
	case ast.IsCallExpression(node):
		return node.AsCallExpression().Expression
	case ast.IsNewExpression(node):
		return node.AsNewExpression().Expression
	case ast.IsTaggedTemplateExpression(node):
		return node.AsTaggedTemplateExpression().Tag
	default:
		return nil
	}
}

// policyInvocationArgument retains the native parameter position of each authored value.
// A tag's synthetic template-array parameter has no authored secret value to inspect.
type policyInvocationArgument struct {
	value     *ast.Node
	parameter int
}

func policyInvocationArguments(node *ast.Node) []policyInvocationArgument {
	var values []*ast.Node
	if ast.IsCallExpression(node) && node.AsCallExpression().Arguments != nil {
		values = node.AsCallExpression().Arguments.Nodes
	} else if ast.IsNewExpression(node) && node.AsNewExpression().Arguments != nil {
		values = node.AsNewExpression().Arguments.Nodes
	} else if ast.IsTaggedTemplateExpression(node) {
		template := node.AsTaggedTemplateExpression().Template
		if !ast.IsTemplateExpression(template) {
			return nil
		}
		arguments := make([]policyInvocationArgument, 0, len(template.AsTemplateExpression().TemplateSpans.Nodes))
		for index, span := range template.AsTemplateExpression().TemplateSpans.Nodes {
			arguments = append(arguments, policyInvocationArgument{value: span.AsTemplateSpan().Expression, parameter: index + 1})
		}
		return arguments
	}
	arguments := make([]policyInvocationArgument, 0, len(values))
	for index, value := range values {
		arguments = append(arguments, policyInvocationArgument{value: value, parameter: index})
	}
	return arguments
}

// policyInvocationName reports callable identity without copying argument values or inline bodies.
func policyInvocationName(expression *ast.Node) string {
	if ast.IsIdentifier(expression) {
		return expression.Text()
	}
	if ast.IsPropertyAccessExpression(expression) {
		access := expression.AsPropertyAccessExpression()
		name := access.Name().Text()
		if ast.IsIdentifier(access.Expression) || ast.IsPropertyAccessExpression(access.Expression) {
			return policyInvocationName(access.Expression) + "." + name
		}
		return name
	}
	return "callable result"
}

// policyInvocationReceiver distinguishes execution of a member from public data projection.
func policyInvocationReceiver(node *ast.Node) bool {
	selected := node
	member := false
	for selected.Parent != nil {
		parent := selected.Parent
		if ast.IsPropertyAccessExpression(parent) && parent.AsPropertyAccessExpression().Expression == selected {
			selected = parent
			member = true
		} else if ast.IsElementAccessExpression(parent) && parent.AsElementAccessExpression().Expression == selected {
			selected = parent
			member = true
		} else {
			break
		}
	}
	return member && selected.Parent != nil && policyInvocationTarget(selected.Parent) == selected
}
