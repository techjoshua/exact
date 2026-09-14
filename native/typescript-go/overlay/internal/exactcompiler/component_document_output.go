package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// componentHasStaticDocumentHead proves that moving the static head ahead of task settlement
// cannot execute authored code. The body admits intrinsic markup and scalar state reads only;
// calls, child components, enhancements, spreads and conditional views keep atomic rendering.
func componentHasStaticDocumentHead(component *ast.Node) bool {
	if !componentHasDocumentView(component) {
		return false
	}
	view := unwrapRenderExpression(directCallableReturns(component)[0])
	root := unwrapRenderExpression(view.AsArrowFunction().Body).AsJsxElement()
	if !canonicalProgramDocument(root.Children) || !literalDocumentAttributes(root.OpeningElement) {
		return false
	}
	var elements []*ast.Node
	for _, child := range root.Children.Nodes {
		if ast.IsJsxElement(child) {
			elements = append(elements, child)
		}
	}
	return len(elements) == 2 && pureDocumentIntrinsic(elements[0], false) && pureDocumentIntrinsic(elements[1], true)
}

func literalDocumentAttributes(opening *ast.Node) bool {
	attrs := opening.Attributes()
	if attrs == nil {
		return true
	}
	for _, property := range attrs.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			return false
		}
		attr := property.AsJsxAttribute()
		name := jsxAttributeText(attr.Name())
		if name == "ref" || name == "key" || name == "use" || strings.HasPrefix(name, "on") || strings.HasPrefix(name, "_") || strings.Contains(name, ":") {
			return false
		}
		if attr.Initializer != nil && attr.Initializer.Kind != ast.KindStringLiteral {
			return false
		}
	}
	return true
}

func pureDocumentIntrinsic(node *ast.Node, state bool) bool {
	var opening *ast.Node
	var children *ast.NodeList
	if ast.IsJsxElement(node) {
		opening = node.AsJsxElement().OpeningElement
		children = node.AsJsxElement().Children
	} else if ast.IsJsxSelfClosingElement(node) {
		opening = node
	} else {
		return false
	}
	tag := openingTag(opening)
	if !ast.IsIdentifier(tag) || !jsxIntrinsic(tag.Text()) ||
		(unsupportedPlannedHost(tag.Text()) && !plannedDocumentHost(tag.Text())) || !literalDocumentAttributes(opening) {
		return false
	}
	if children == nil {
		return true
	}
	for _, child := range children.Nodes {
		if ast.IsJsxText(child) {
			continue
		}
		if ast.IsJsxExpression(child) {
			value := unwrapRenderExpression(child.AsJsxExpression().Expression)
			if value == nil {
				continue
			}
			switch value.Kind {
			case ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
				continue
			}
			if state && directDocumentStateRead(value) {
				continue
			}
			return false
		}
		if !pureDocumentIntrinsic(child, state) {
			return false
		}
	}
	return true
}

func directDocumentStateRead(node *ast.Node) bool {
	if !ast.IsPropertyAccessExpression(node) {
		return false
	}
	state := node.AsPropertyAccessExpression().Expression
	return ast.IsPropertyAccessExpression(state) && state.AsPropertyAccessExpression().Expression.Kind == ast.KindThisKeyword && state.AsPropertyAccessExpression().Name().Text() == "state"
}

// Only blocking task generations participate in this first output-region proof.
func hasStreamingDocumentTasks(candidate bool, execution ComponentExecution) bool {
	if !candidate || len(execution.Transitions) == 0 {
		return false
	}
	for _, transition := range execution.Transitions {
		if transition.Readiness != "blocking" {
			return false
		}
	}
	return true
}

func (lowering *jsxLowering) deferredDocumentBody(node *ast.Node, tag string) bool {
	if lowering.target != TargetServer || tag != "body" {
		return false
	}
	component, found := lowering.componentContaining(node)
	return found && hasStreamingDocumentTasks(component.StaticDocumentHead, component.TargetPlan.ServerExecution)
}
