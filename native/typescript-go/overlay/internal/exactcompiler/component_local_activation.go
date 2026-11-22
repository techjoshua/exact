package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// componentPublishesLocalActivation selects an independent client owner. A delivered provider
// island is the selective fallback for a whole-component owner under a server parent.
func componentPublishesLocalActivation(component Component, serverComponents bool) bool {
	return component.Placement == "isomorphic" && (!serverComponents || component.ClientIslandCount == 0 || component.ownsDeliveredProvider) &&
		(component.Interactions || component.Lifecycle || component.ownsDeliveredProvider || componentOwnsMutableContext(component))
}

// A stateful context provider must recreate its durable owner for descendant commands.
// Its consumers may be supplied by another module or a server slot, so absence of a local
// event handler cannot prove that the provided state is passive. Server-only owners retain
// their residency, and ordinary context readers do not manufacture a provider activation.
func componentOwnsMutableContext(component Component) bool {
	if component.Placement != "isomorphic" || len(component.StateSlots) == 0 {
		return false
	}
	for _, effect := range component.Contexts {
		if effect.Kind == "write" {
			return true
		}
	}
	return false
}

// Context commands and their state remain under one owner rather than detached element islands.
func retainMutableContextOwners(components []Component) {
	for index := range components {
		if componentOwnsMutableContext(components[index]) {
			components[index].ClientIslandCount = 0
		}
	}
}

// renderCallsInteractiveHelper follows the compiled view's returned helper call.
// The caller owns activation of that view. The helper still owns its JSX lowering,
// and the caller cannot slice helper-authored JSX into lexical element islands.
func renderCallsInteractiveHelper(render *ast.Node, c *checker.Checker, calls []CallEdge) bool {
	return callableReturnsMatching(render, func(value *ast.Node) bool {
		helper := compilerOwnedRenderHelper(value, c)
		return helper != nil && !usesForeignJSXRuntime(ast.GetSourceFileOfNode(helper)) &&
			callableReturnsMatching(helper, func(markup *ast.Node) bool {
				return renderedIntrinsicHasEvent(markup, calls)
			})
	})
}

func callableReturnsMatching(callable *ast.Node, match func(*ast.Node) bool) bool {
	if ast.IsArrowFunction(callable) && !ast.IsBlock(callable.Body()) {
		return match(callable.Body())
	}
	for _, value := range directCallableReturns(callable) {
		if match(value) {
			return true
		}
	}
	return false
}

// renderedIntrinsicHasEvent follows returned markup and its emitted children.
// JSX used inside an attribute or a discarded computation supplies no event
// evidence for the component's view.
func renderedIntrinsicHasEvent(value *ast.Node, calls []CallEdge) bool {
	value = unwrapRenderExpression(value)
	if value == nil {
		return false
	}
	var opening *ast.Node
	var children *ast.NodeList
	switch value.Kind {
	case ast.KindJsxElement:
		element := value.AsJsxElement()
		opening, children = element.OpeningElement, element.Children
	case ast.KindJsxSelfClosingElement:
		opening = value
	case ast.KindJsxFragment:
		children = value.AsJsxFragment().Children
	case ast.KindJsxExpression:
		return renderedIntrinsicHasEvent(value.AsJsxExpression().Expression, calls)
	case ast.KindCallExpression:
		// Only a map callback observed by the original eager effect owner can
		// contribute markup. Discarded calls and authored overrides have no such edge.
		for _, edge := range calls {
			if edge.Resolved && edge.arrayMapCall == value && edge.arrayMapBody != nil &&
				callableReturnsMatching(edge.arrayMapBody, func(markup *ast.Node) bool {
					return renderedIntrinsicHasEvent(markup, nil)
				}) {
				return true
			}
		}
		return false
	default:
		return false
	}
	if opening != nil {
		tag := opening.TagName()
		if tag == nil || !ast.IsIdentifier(tag) || !jsxIntrinsic(tag.Text()) {
			return false
		}
		for _, name := range jsxAttributeNames(opening) {
			if name != "ref" && interactiveJSXAttribute(name) {
				return true
			}
		}
	}
	if children != nil {
		for _, child := range children.Nodes {
			if renderedIntrinsicHasEvent(child, calls) {
				return true
			}
		}
	}
	return false
}
