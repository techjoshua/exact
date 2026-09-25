package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func (lowering *jsxLowering) lowerServerClientIsland(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
	island clientElementIsland,
) *ast.Node {
	previousCaptureIsland := lowering.serverCaptureIsland
	lowering.serverCaptureIsland = &island
	defer func() { lowering.serverCaptureIsland = previousCaptureIsland }()
	properties := []*ast.Node{}
	if len(island.statePaths) != 0 {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewStringLiteral(
					"__exactState",
					ast.TokenFlagsNone,
				),
				lowering.islandStateSnapshot(island.statePaths),
			),
		)
	}
	if len(island.valueCaptures) != 0 {
		captures := make([]*ast.Node, 0, len(island.valueCaptures))
		for _, capture := range island.valueCaptures {
			captures = append(
				captures,
				lowering.property(
					jsxPropertyName(lowering.factory, capture.name),
					lowering.islandCaptureValue(capture),
				),
			)
		}
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewStringLiteral(
					"__exactCapture",
					ast.TokenFlagsNone,
				),
				lowering.factory.NewObjectLiteralExpression(
					lowering.factory.NewNodeList(captures),
					false,
				),
			),
		)
	}
	if !lowering.islandUsesAuthoredRootProps(island) {
		properties = append(
			properties,
			lowering.serverIslandAttributeProperties(
				opening.Attributes(),
				false,
				"",
				island.finiteSpreads,
			)...,
		)
	}

	// Native components retain their server implementation and local inputs. Intrinsic
	// fallbacks require a finite surface so client-only attributes can be removed safely.
	tag := openingTag(opening)
	tagText := sourceText(lowering.sourceFile, tag)
	nativeFallback := lowering.compiledNativeComponentTag(tag)
	if edge, exists := lowering.renderEdges[fmt.Sprintf("%d:%s", identityNode.Pos(), tagText)]; exists && edge.ComponentID != "" && edge.Placement == "client" {
		nativeFallback = false
	}
	if (!island.hasSpread && (jsxIntrinsic(tagText) || tagText == "_")) || nativeFallback {
		activation := "eager"
		if island.interaction {
			activation = "interaction"
		}
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewIdentifier("__exactHydration"),
				lowering.factory.NewStringLiteral(
					activation,
					ast.TokenFlagsNone,
				),
			),
			lowering.property(
				lowering.factory.NewIdentifier(
					"__exactHydrationFallback",
				),
				lowering.serverIslandFallback(
					identityNode,
					opening,
					children,
					island.finiteSpreads,
				),
			),
		)
	}
	if capture, exists := islandChildrenCapture(island); exists {
		properties = append(properties, lowering.islandScalarChildrenProps(island))
		properties = append(properties, lowering.property(lowering.factory.NewIdentifier("__exactServerSlots"),
			lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{
				lowering.islandCaptureSlotReference(island, capture),
			}), false)))
	}
	props := lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList(properties),
		false,
	)
	arguments := []*ast.Node{
		lowering.factory.NewStringLiteral(
			island.id,
			ast.TokenFlagsNone,
		),
		lowering.factory.NewStringLiteral(
			island.name,
			ast.TokenFlagsNone,
		),
		props,
	}
	// Independent server descendants already occupy their own partition slots in the
	// fallback and activated layout. Only forwarded owner children need this prop envelope.
	if _, captured := islandChildrenCapture(island); captured {
		arguments = append(arguments, lowering.islandCapturedChildrenInput(island))
	} else if island.serverSlot {
		arguments = append(arguments, lowering.children(children)...)
	}
	return lowering.call(
		lowering.names.boundary,
		arguments,
	)
}

// lowerServerClientFragment preserves the complete server-rendered range while assigning all
// state-connected client work to one generated component instance. The eager boundary adopts the
// fallback immediately; no renderer-side state synchronization is required.
func (lowering *jsxLowering) lowerServerClientFragment(
	_ *ast.Node,
	children *ast.NodeList,
	island clientElementIsland,
) *ast.Node {
	previousCaptureIsland := lowering.serverCaptureIsland
	lowering.serverCaptureIsland = &island
	defer func() { lowering.serverCaptureIsland = previousCaptureIsland }()
	properties := []*ast.Node{}
	if len(island.statePaths) != 0 {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewStringLiteral("__exactState", ast.TokenFlagsNone),
				lowering.islandStateSnapshot(island.statePaths),
			),
		)
	}
	if len(island.valueCaptures) != 0 {
		captures := make([]*ast.Node, 0, len(island.valueCaptures))
		for _, capture := range island.valueCaptures {
			captures = append(captures, lowering.property(
				jsxPropertyName(lowering.factory, capture.name),
				lowering.islandCaptureValue(capture),
			))
		}
		properties = append(properties, lowering.property(
			lowering.factory.NewStringLiteral("__exactCapture", ast.TokenFlagsNone),
			lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(captures), false),
		))
	}
	fallbackArguments := []*ast.Node{lowering.props(nil, "", false, "")}
	lowering.serverClientFallbackDepth++
	fallbackArguments = append(fallbackArguments, lowering.children(children)...)
	lowering.serverClientFallbackDepth--
	properties = append(properties, lowering.property(
		lowering.factory.NewIdentifier("__exactHydration"),
		lowering.factory.NewStringLiteral("eager", ast.TokenFlagsNone),
	), lowering.property(
		lowering.factory.NewIdentifier("__exactHydrationFallback"),
		lowering.call(lowering.names.fragment, fallbackArguments),
	))
	if capture, exists := islandChildrenCapture(island); exists {
		properties = append(properties, lowering.islandScalarChildrenProps(island))
		properties = append(properties, lowering.property(lowering.factory.NewIdentifier("__exactServerSlots"),
			lowering.factory.NewArrayLiteralExpression(lowering.factory.NewNodeList([]*ast.Node{
				lowering.islandCaptureSlotReference(island, capture),
			}), false)))
	}
	arguments := []*ast.Node{
		lowering.factory.NewStringLiteral(island.id, ast.TokenFlagsNone),
		lowering.factory.NewStringLiteral(island.name, ast.TokenFlagsNone),
		lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(properties), false),
	}
	if _, captured := islandChildrenCapture(island); captured {
		arguments = append(arguments, lowering.islandCapturedChildrenInput(island))
	}
	return lowering.call(lowering.names.boundary, arguments)
}

func (lowering *jsxLowering) serverIslandFallback(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
	finiteSpreads map[int][]finiteSpreadProperty,
) *ast.Node {
	tag := openingTag(opening)
	tagText := sourceText(lowering.sourceFile, tag)
	intrinsic := jsxIntrinsic(tagText)
	if tagText == "_" {
		return lowering.call(lowering.names.fragment, append([]*ast.Node{
			lowering.propsWithProjection(opening.Attributes(), "", false, "", false, true),
		}, lowering.children(children)...))
	}
	properties := lowering.serverIslandAttributeProperties(
		opening.Attributes(),
		true,
		lowering.elementID(identityNode),
		finiteSpreads,
	)
	// Enhanced hosts use receipt children on the client. Preserve that topology and
	// resolve namespace props through the enhancement planner on the server as well.
	enhanced := intrinsic && lowering.renderProgramIntrinsicHasEnhancements(opening.Attributes())
	if enhanced {
		projected := lowering.propsWithProjection(opening.Attributes(), lowering.elementID(identityNode), true, tagText, false, true)
		properties = projected.AsObjectLiteralExpression().Properties.Nodes
	}
	if intrinsic && !lowering.renderProgramFallback && !enhanced {
		rootAttributes := lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList(properties),
			false,
		)
		if planned, _ := lowering.lowerRenderProgramWithRootAttributes(
			identityNode,
			opening,
			children,
			rootAttributes,
		); planned != nil {
			return planned
		}
	}
	var emittedTag *ast.Node
	var interopType *ast.Node
	if intrinsic {
		emittedTag = lowering.factory.NewStringLiteral(tagText, ast.TokenFlagsNone)
	} else {
		emittedTag = lowering.visitor.VisitNode(tag)
		if lowering.interop != nil &&
			!lowering.compiledNativeComponentTag(tag) &&
			!lowering.exactCoreStructuralTag(tag) {
			interopType = emittedTag
			emittedTag = lowering.factory.NewIdentifier(lowering.names.interop)
		}
	}
	if interopType != nil {
		properties = append(
			[]*ast.Node{lowering.property(lowering.factory.NewIdentifier("component"), interopType)},
			properties...,
		)
	}
	var props *ast.Node = lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList(properties), false,
	)
	if !intrinsic && interopType == nil {
		// Native component inputs remain local under a hydrated owner. Preserve callback
		// props so the child can render normally; only independent captures serialize.
		localProps := lowering.propsWithReactivity(opening.Attributes(), "", false, tagText, false)
		props = lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(append(
			[]*ast.Node{properties[0]}, localProps.AsObjectLiteralExpression().Properties.Nodes...,
		)), false)
	}
	arguments := []*ast.Node{emittedTag, props}
	if !intrinsic || tagText == "title" || tagText == "textarea" || tagText == "script" || tagText == "style" {
		arguments = append(arguments, lowering.componentChildren(children)...)
	} else {
		arguments = append(arguments, lowering.children(children)...)
	}
	helper := lowering.names.componentReceipt
	if intrinsic {
		helper = lowering.names.intrinsicElement
	} else {
		helper = lowering.names.componentReceipt
	}
	element := lowering.call(helper, arguments)
	if !intrinsic {
		return lowering.componentSpreadReceipt(identityNode, opening.Attributes(), element)
	}
	return element
}

func (lowering *jsxLowering) serverIslandAttributeProperties(
	attributes *ast.Node,
	includeElementID bool,
	elementID string,
	finiteSpreads map[int][]finiteSpreadProperty,
) []*ast.Node {
	properties := []*ast.Node{}
	if includeElementID {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewStringLiteral(
					"data-exact-id",
					ast.TokenFlagsNone,
				),
				lowering.factory.NewStringLiteral(
					elementID,
					ast.TokenFlagsNone,
				),
			),
		)
	}
	if attributes == nil {
		return properties
	}
	conditionalClasses := jsxHasConditionalClassName(attributes)
	classNameEmitted := false
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if conditionalClasses && jsxClassNameContribution(property) {
			if !classNameEmitted {
				properties = append(properties, lowering.property(
					lowering.factory.NewIdentifier("className"),
					lowering.lowerClassNameValue(attributes, false, false),
				))
				classNameEmitted = true
			}
			continue
		}
		if ast.IsJsxSpreadAttribute(property) {
			if members, finite := finiteSpreads[property.Pos()]; finite {
				for _, member := range members {
					if interactiveJSXAttribute(member.name) {
						continue
					}
					properties = append(properties, lowering.property(
						jsxPropertyName(lowering.factory, member.name),
						lowering.finiteSpreadPropertyValue(&member),
					))
				}
				continue
			}
			properties = append(
				properties,
				lowering.factory.NewSpreadAssignment(
					lowering.visitor.VisitNode(
						property.AsJsxSpreadAttribute().Expression,
					),
				),
			)
			continue
		}
		attribute := property.AsJsxAttribute()
		name := jsxAttributeText(attribute.Name())
		if bindingProperty := lowering.serverFormBindingProperty(
			name,
			attribute.Initializer,
		); bindingProperty != nil {
			properties = append(properties, bindingProperty)
			continue
		}
		if name == "ref" {
			if lowering.serverObservableRefAttribute(attribute) &&
				ast.IsJsxExpression(attribute.Initializer) {
				expression := attribute.Initializer.AsJsxExpression().Expression
				if expression != nil {
					properties = append(properties, lowering.property(
						jsxPropertyName(lowering.factory, name),
						lowering.visitor.VisitNode(expression),
					))
				}
			}
			continue
		}
		if interactiveJSXAttribute(name) {
			continue
		}
		var value *ast.Node
		switch {
		case attribute.Initializer == nil:
			value = lowering.factory.NewTrueExpression()
		case ast.IsStringLiteral(attribute.Initializer):
			value = lowering.factory.NewStringLiteral(
				attribute.Initializer.AsStringLiteral().Text,
				ast.TokenFlagsNone,
			)
		case ast.IsJsxExpression(attribute.Initializer):
			expression := attribute.Initializer.AsJsxExpression().Expression
			if expression == nil {
				continue
			}
			value = lowering.visitor.VisitNode(expression)
			if name == "className" {
				if closed := lowering.lowerCompilerClosedServerClassName(expression); closed != nil {
					value = closed
				}
			}
		default:
			value = lowering.visitor.VisitNode(attribute.Initializer)
		}
		properties = append(
			properties,
			lowering.property(jsxPropertyName(lowering.factory, name), value),
		)
	}
	return properties
}

// serverObservableRefAttribute retains a request-local binding only when its authored local is
// consumed outside its declaration and ref attribute. That preserves SSR relationship identity
// without allocating server bindings for refs used exclusively by the client renderer.
func (lowering *jsxLowering) serverObservableRefAttribute(attribute *ast.JsxAttribute) bool {
	if lowering.checker == nil || attribute.Initializer == nil ||
		!ast.IsJsxExpression(attribute.Initializer) {
		return false
	}
	expression := attribute.Initializer.AsJsxExpression().Expression
	if expression == nil || !ast.IsIdentifier(expression) {
		return false
	}
	symbol := resolvedCallableSymbol(
		lowering.checker.GetSymbolAtLocation(expression),
		lowering.checker,
	)
	if symbol == nil {
		return false
	}
	id := ast.GetSymbolId(symbol)
	references := 0
	walkNode(lowering.sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) {
			return true
		}
		candidate := resolvedCallableSymbol(
			lowering.checker.GetSymbolAtLocation(node),
			lowering.checker,
		)
		if candidate != nil && ast.GetSymbolId(candidate) == id {
			references++
		}
		return references < 3
	})
	return references >= 3
}

type islandStateNode struct {
	leaf     bool
	children map[string]*islandStateNode
}
