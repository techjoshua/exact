package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceComponentInputSelection follows JSX's ordered own-property writes.
// Unknown later spreads keep the earlier MAY value beside uncertainty. A later
// definite write replaces both. These are source recipes, never evaluated Gets.
type sourceComponentInputSelection struct {
	values  []*ast.Node
	unknown bool
}

func (selection *sourceComponentInputSelection) replace(value *ast.Node) {
	selection.values = nil
	selection.unknown = value == nil
	if value != nil {
		selection.values = []*ast.Node{value}
	}
}

// spread inspects only an authored finite object literal. It neither follows
// mutable storage nor invokes accessors. Computed unknown keys remain MAY writes.
func (selection *sourceComponentInputSelection) spread(expression *ast.Node, key string) {
	expression = unwrapSourceCallableReference(expression)
	if !ast.IsObjectLiteralExpression(expression) {
		selection.unknown = true
		return
	}
	for _, property := range expression.AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsSpreadAssignment(property) {
			selection.spread(property.AsSpreadAssignment().Expression, key)
			continue
		}
		name := property.Name()
		if name == nil {
			selection.unknown = true
			continue
		}
		named, known := "", false
		if ast.IsIdentifier(name) {
			named, known = name.Text(), true
		} else if ast.IsComputedPropertyName(name) {
			picked := sourceMemberKey(name.AsComputedPropertyName().Expression)
			named, known = picked.name, picked.resolved
		} else {
			picked := sourceMemberKey(name)
			named, known = picked.name, picked.resolved
		}
		if !known {
			selection.unknown = true
			if ast.IsPropertyAssignment(property) {
				selection.values = append(selection.values, property.AsPropertyAssignment().Initializer)
			} else if ast.IsMethodDeclaration(property) {
				selection.values = append(selection.values, property)
			}
			continue
		}
		if named != key {
			continue
		}
		if ast.IsPropertyAssignment(property) {
			selection.replace(property.AsPropertyAssignment().Initializer)
		} else if ast.IsMethodDeclaration(property) {
			selection.replace(property)
		} else if ast.IsShorthandPropertyAssignment(property) {
			selection.replace(property.Name())
		} else {
			selection.replace(nil)
		}
	}
}

func selectComponentCallableInput(site *ast.Node, key string) sourceComponentInputSelection {
	var selection sourceComponentInputSelection
	if site.Attributes() == nil {
		return selection
	}
	for _, input := range site.Attributes().AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(input) {
			selection.spread(input.AsJsxSpreadAttribute().Expression, key)
			continue
		}
		if !ast.IsJsxAttribute(input) || jsxAttributeText(input.Name()) != key {
			continue
		}
		var value *ast.Node
		if init := input.AsJsxAttribute().Initializer; init != nil && ast.IsJsxExpression(init) {
			value = init.AsJsxExpression().Expression
		}
		selection.replace(value)
	}
	return selection
}
