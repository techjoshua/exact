package exactcompiler

import (
	"fmt"
	"html"
	"strings"
	"unicode"

	"github.com/microsoft/typescript-go/internal/ast"
)

func (lowering *jsxLowering) lowerOpeningLike(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
) *ast.Node {
	if activation, adopted, planNode, planInputs, adoptedRanges := lowering.timeUpdateActivationForRange(identityNode, opening); activation != nil {
		previous := lowering.timeActivation
		previousAdopted := lowering.timeActivationAdopted
		previousPlan := lowering.timePlanNode
		previousInputs := lowering.timePlanInputs
		previousRanges := lowering.timeAdoptedRanges
		previousSelection := lowering.timeAdoptedSelection
		lowering.timeActivation = lowering.names.timeActivation
		lowering.timeActivationAdopted = adopted
		lowering.timePlanNode = planNode
		lowering.timePlanInputs = planInputs
		lowering.timeAdoptedRanges = adoptedRanges
		lowering.timeAdoptedSelection = nil
		lowered := lowering.lowerOpeningLikeWithoutTime(identityNode, opening, children)
		lowering.timeActivation = previous
		lowering.timeActivationAdopted = previousAdopted
		lowering.timePlanNode = previousPlan
		lowering.timePlanInputs = previousInputs
		lowering.timeAdoptedRanges = previousRanges
		lowering.timeAdoptedSelection = previousSelection
		return lowering.factory.NewCallExpression(
			lowering.factory.NewParenthesizedExpression(
				lowering.arrowWithParameter(
					lowering.factory.NewIdentifier(lowering.names.timeActivation),
					lowered,
				),
			),
			nil,
			nil,
			lowering.factory.NewNodeList([]*ast.Node{activation}),
			ast.NodeFlagsNone,
		)
	}
	return lowering.lowerOpeningLikeWithoutTime(identityNode, opening, children)
}

func (lowering *jsxLowering) lowerOpeningLikeWithoutTime(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
) *ast.Node {
	tag := openingTag(opening)
	tagText := sourceText(lowering.sourceFile, tag)
	if tagText == "_" {
		return lowering.call(
			lowering.names.fragment,
			append(
				[]*ast.Node{
					lowering.props(opening.Attributes(), "", false, ""),
				},
				lowering.children(children)...,
			),
		)
	}
	if tagText == "_target" {
		return lowering.call(
			lowering.names.target,
			append(
				[]*ast.Node{lowering.props(opening.Attributes(), "", false, "")},
				lowering.children(children)...,
			),
		)
	}
	if kind, exists := lowering.dynamicComponents[tag.Pos()]; exists {
		return lowering.lowerDynamicComponent(identityNode, tag, opening, children, kind)
	}
	if lowering.microComponentTag(tag) {
		return lowering.lowerMicroComponent(tag, opening, children)
	}
	intrinsic := jsxIntrinsic(tagText)
	partitionEdge, partitionedServerComponent := lowering.serverPartitionRangeEdge(identityNode.Pos())
	if !intrinsic && partitionedServerComponent && lowering.target == TargetClient &&
		lowering.serverComponents {
		return lowering.clientPartitionSlot(opening, partitionEdge)
	}
	if lowering.target == TargetServer {
		if island, exists := lowering.clientIslands[identityNode]; exists {
			if _, explicit := lowering.explicitServerIsland(identityNode); !explicit {
				return lowering.serverIslandFallback(
					identityNode,
					opening,
					children,
					island.finiteSpreads,
				)
			}
			return lowering.lowerServerClientIsland(
				identityNode,
				opening,
				children,
				island,
			)
		}
	}
	if !intrinsic && lowering.target == TargetServer {
		if edge, exists := lowering.renderEdges[fmt.Sprintf("%d:%s", identityNode.Pos(), tagText)]; exists && edge.Placement == "client" {
			if lowering.serverClientFallbackDepth > 0 {
				arguments := []*ast.Node{lowering.props(nil, "", false, "")}
				arguments = append(arguments, lowering.children(children)...)
				return lowering.call(lowering.names.fragment, arguments)
			}
			return lowering.clientComponentBoundary(
				opening,
				children,
				edge,
			)
		}
	}
	if intrinsic && !lowering.renderProgramFallback {
		if planned := lowering.lowerRenderProgram(identityNode, opening, children); planned != nil {
			return planned
		}
	}
	var emittedTag *ast.Node
	if intrinsic {
		emittedTag = lowering.factory.NewStringLiteral(tagText, ast.TokenFlagsNone)
	} else {
		emittedTag = lowering.visitor.VisitNode(tag)
		if lowering.interop != nil &&
			!lowering.localExactComponentTag(tag) &&
			!lowering.exactCoreVNodeTag(tag) {
			emittedTag = lowering.call(lowering.names.interop, []*ast.Node{emittedTag})
		}
	}
	props := lowering.props(
		opening.Attributes(),
		lowering.elementID(identityNode),
		intrinsic,
		tagText,
	)
	arguments := []*ast.Node{
		emittedTag,
		props,
	}
	arguments = append(arguments, lowering.children(children)...)
	elementHelper := lowering.names.element
	if (!intrinsic && lowering.localExactComponentTag(tag)) ||
		(intrinsic && lowering.renderProgramChildDepth > 0) {
		elementHelper = lowering.names.componentElement
	}
	element := lowering.call(elementHelper, arguments)
	if lowering.directScheduledServerComponent(tag) {
		element = lowering.call(lowering.names.issueServerComponent, []*ast.Node{element})
	}
	if intrinsic && lowering.independentAsyncSiblings(children) {
		element = lowering.call(lowering.names.asyncSiblings, []*ast.Node{element})
	}
	if !intrinsic && partitionedServerComponent && lowering.target == TargetServer {
		element = lowering.serverPartitionSlot(opening, partitionEdge, element)
	}
	if !intrinsic && ast.IsIdentifier(tag) {
		if _, derived := lowering.derivedBindingAtReference(tag); derived {
			return lowering.call(
				lowering.names.dynamic,
				[]*ast.Node{lowering.arrow(element)},
			)
		}
	}
	return element
}

// directScheduledServerComponent selects only compiler-closed children whose setup contains
// scheduled transitions. Their VNode creation is the earliest semantically valid point at which
// the request renderer can issue task readiness without rediscovering the authored tree.
func (lowering *jsxLowering) directScheduledServerComponent(tag *ast.Node) bool {
	if lowering.target != TargetServer || !ast.IsIdentifier(tag) {
		return false
	}
	component, exists := lowering.components[tag.Text()]
	if !exists || !component.DirectServer {
		return false
	}
	execution := projectComponentExecution(component.Execution, TargetServer)
	return len(execution.Transitions) != 0
}

func (lowering *jsxLowering) componentRetainsContinuation(componentID string) bool {
	_, retained := lowering.continuationComponents[componentID]
	return retained
}

func (lowering *jsxLowering) explicitServerIsland(
	identityNode *ast.Node,
) (clientElementIsland, bool) {
	island, exists := lowering.clientIslands[identityNode]
	if !exists || lowering.target != TargetServer {
		return clientElementIsland{}, false
	}
	if !lowering.serverComponents {
		var opening *ast.Node
		switch {
		case ast.IsJsxElement(identityNode):
			opening = identityNode.AsJsxElement().OpeningElement
		case ast.IsJsxSelfClosingElement(identityNode):
			opening = identityNode
		default:
			return clientElementIsland{}, false
		}
		tag := openingTag(opening)
		if jsxIntrinsic(sourceText(lowering.sourceFile, tag)) || lowering.localExactComponentTag(tag) {
			return clientElementIsland{}, false
		}
	}
	if island.component.Placement == "isomorphic" &&
		lowering.componentRetainsContinuation(island.component.ID) {
		return clientElementIsland{}, false
	}
	return island, true
}

func (lowering *jsxLowering) lowerDynamicComponent(
	identityNode *ast.Node,
	tag *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
	kind dynamicComponentUseKind,
) *ast.Node {
	id := lowering.factory.NewStringLiteral(
		exactStableID(
			normalizedIdentityFilename(lowering.sourceFile.FileName()),
			"dynamic-component",
			lowering.nodeIDs[identityNode],
		),
		ast.TokenFlagsNone,
	)
	if lowering.target == TargetServer {
		return lowering.call(lowering.names.serverDynamicComponent, []*ast.Node{id})
	}
	props := lowering.props(opening.Attributes(), "", false, "")
	values := lowering.children(children)
	if len(values) != 0 {
		var childrenValue *ast.Node
		if len(values) == 1 {
			childrenValue = values[0]
		} else {
			childrenValue = lowering.factory.NewArrayLiteralExpression(
				lowering.factory.NewNodeList(values),
				false,
			)
		}
		props = lowering.appendObjectProperty(props, "children", childrenValue)
	}
	source := lowering.visitor.VisitNode(tag)
	if kind != dynamicComponentHelper {
		source = lowering.call(
			lowering.names.dynamicComponentValue,
			[]*ast.Node{lowering.arrow(source)},
		)
	}
	property := func(name string, value *ast.Node) *ast.Node {
		return lowering.property(lowering.factory.NewIdentifier(name), value)
	}
	options := lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList([]*ast.Node{
			property("id", id),
			property("source", source),
			property("props", props),
		}),
		false,
	)
	return lowering.call(lowering.names.dynamicComponent, []*ast.Node{options})
}

func (lowering *jsxLowering) independentAsyncSiblings(children *ast.NodeList) bool {
	if children == nil || lowering.target == TargetClient {
		return false
	}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	if len(semantic) < 2 {
		return false
	}
	for _, child := range semantic {
		var tag *ast.Node
		switch {
		case ast.IsJsxElement(child):
			tag = child.AsJsxElement().OpeningElement.AsJsxOpeningElement().TagName
		case ast.IsJsxSelfClosingElement(child):
			tag = child.AsJsxSelfClosingElement().TagName
		default:
			return false
		}
		if !ast.IsIdentifier(tag) {
			return false
		}
		component, exists := lowering.components[tag.Text()]
		if !exists || component.Placement == "client" ||
			(component.EnvironmentEffect != "neutral" && component.EnvironmentEffect != "server") ||
			len(component.Contexts) != 0 || len(component.EnhancementContexts.Provides) != 0 ||
			len(component.EnhancementContexts.Requires) != 0 ||
			len(component.EnhancementContexts.OptionallyConsumes) != 0 ||
			(component.Placement != "server" && len(component.SplitBoundaries) != 0) {
			return false
		}
	}
	return true
}

// lowerRenderProgram emits the first deliberately conservative planned subset:
// intrinsic HTML trees with no authored attributes and with scalar expression
// children occupying their own text node. Unsupported regions remain generic.

func (lowering *jsxLowering) microComponentTag(tag *ast.Node) bool {
	if lowering.checker == nil || !ast.IsIdentifier(tag) {
		return false
	}
	symbol := lowering.checker.GetSymbolAtLocation(tag)
	if symbol == nil {
		return false
	}
	symbol = lowering.checker.SkipAlias(symbol)
	if symbol == nil {
		return false
	}
	_, exists := lowering.microComponents[ast.GetSymbolId(symbol)]
	return exists
}

func (lowering *jsxLowering) lowerMicroComponent(
	tag *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
) *ast.Node {
	props := lowering.props(opening.Attributes(), "", false, tag.Text())
	values := lowering.children(children)
	if len(values) != 0 {
		var value *ast.Node
		if len(values) == 1 {
			value = values[0]
		} else {
			value = lowering.factory.NewArrayLiteralExpression(
				lowering.factory.NewNodeList(values),
				false,
			)
		}
		props = lowering.appendObjectProperty(props, "children", value)
	}
	return lowering.factory.NewCallExpression(
		lowering.visitor.VisitNode(tag),
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{props}),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) localExactComponentTag(tag *ast.Node) bool {
	if !ast.IsIdentifier(tag) {
		return false
	}
	if _, exists := lowering.components[tag.Text()]; exists {
		return true
	}
	if lowering.checker == nil {
		return false
	}
	symbol := lowering.checker.GetSymbolAtLocation(tag)
	if symbol == nil {
		return false
	}
	visited := make(map[ast.SymbolId]struct{})
	var resolvesToComponent func(*ast.Symbol) bool
	resolvesToComponent = func(candidate *ast.Symbol) bool {
		id := ast.GetSymbolId(candidate)
		if _, seen := visited[id]; seen {
			return false
		}
		visited[id] = struct{}{}
		if candidate.Flags&ast.SymbolFlagsAlias != 0 {
			target := lowering.checker.GetAliasedSymbol(candidate)
			if target != nil && resolvesToComponent(target) {
				return true
			}
		}
		for _, declaration := range candidate.Declarations {
			if sourceFile := ast.GetSourceFileOfNode(declaration); sourceFile != nil {
				for _, component := range collectComponents(sourceFile) {
					if component.Start >= declaration.Pos() && component.Start < declaration.End() {
						return true
					}
				}
			}
			if !ast.IsVariableDeclaration(declaration) {
				continue
			}
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer == nil || !ast.IsIdentifier(initializer) {
				continue
			}
			if _, exists := lowering.components[initializer.Text()]; exists {
				return true
			}
			target := lowering.checker.GetSymbolAtLocation(initializer)
			if target != nil && resolvesToComponent(target) {
				return true
			}
		}
		return false
	}
	return resolvesToComponent(symbol)
}

func (lowering *jsxLowering) exactCoreVNodeTag(tag *ast.Node) bool {
	if !ast.IsIdentifier(tag) || lowering.checker == nil {
		return false
	}
	bindings := collectExternalImportBindings(lowering.sourceFile, lowering.checker)
	reference, exists := bindings.byName[tag.Text()]
	if !exists || reference.moduleSpecifier != "@exactjs/core" {
		return false
	}
	switch reference.exportName {
	case "Activity", "Cell", "Dynamic", "Fragment", "Portal", "RenderProgram", "ServerBoundary", "ServerSlot", "Suspense", "Target", "Text", "UnsafeHtml":
		return true
	default:
		return false
	}
}

func (lowering *jsxLowering) lowerFragment(fragment *ast.JsxFragment) *ast.Node {
	if lowering.target == TargetServer && lowering.serverComponents {
		if island, exists := lowering.clientIslands[fragment.AsNode()]; exists {
			return lowering.lowerServerClientFragment(fragment.AsNode(), fragment.Children, island)
		}
	}
	if lowering.renderProgramChildDepth > 0 {
		return lowering.factory.NewArrayLiteralExpression(
			lowering.factory.NewNodeList(lowering.children(fragment.Children)),
			false,
		)
	}
	arguments := []*ast.Node{lowering.props(nil, "", false, "")}
	arguments = append(arguments, lowering.children(fragment.Children)...)
	return lowering.call(lowering.names.fragment, arguments)
}

func openingTag(opening *ast.Node) *ast.Node {
	if ast.IsJsxOpeningElement(opening) {
		return opening.AsJsxOpeningElement().TagName
	}
	return opening.AsJsxSelfClosingElement().TagName
}

func (lowering *jsxLowering) children(children *ast.NodeList) []*ast.Node {
	if children == nil {
		return nil
	}
	directIndependentServerChildren :=
		lowering.target == TargetServer && lowering.independentAsyncSiblings(children)
	result := []*ast.Node{}
	semantic := ast.GetSemanticJsxChildren(children.Nodes)
	for childIndex, child := range semantic {
		switch {
		case ast.IsJsxText(child):
			text := normalizeJSXChildText(child.AsJsxText().Text, childIndex, len(semantic))
			if text != "" {
				result = append(
					result,
					lowering.factory.NewStringLiteral(text, ast.TokenFlagsNone),
				)
			}
		case ast.IsJsxExpression(child):
			expression := child.AsJsxExpression().Expression
			if expression == nil {
				continue
			}
			if lowering.moduleDeclarativeCollection(expression) {
				lowering.declarativeRenderDepth++
				emitted := lowering.visitor.VisitNode(expression)
				lowering.declarativeRenderDepth--
				result = append(result, emitted)
				continue
			}
			emitted := lowering.visitor.VisitNode(expression)
			if lowering.declarativeRenderDepth > 0 {
				result = append(result, emitted)
				continue
			}
			closure := lowering.reactiveClosure(expression)
			if closure == nil {
				closure = lowering.arrow(emitted)
			}
			arguments := []*ast.Node{
				closure,
				lowering.factory.NewStringLiteral(
					lowering.dynamicID(child),
					ast.TokenFlagsNone,
				),
			}
			if lowering.checker != nil &&
				!ast.NodeIsSynthesized(expression) &&
				ast.GetSourceFileOfNode(expression) != nil &&
				scalarDerivedType(lowering.checker.GetTypeAtLocation(expression)) {
				arguments = append(
					arguments,
					lowering.factory.NewKeywordExpression(ast.KindFalseKeyword),
				)
			}
			result = append(
				result,
				lowering.call(lowering.names.dynamic, arguments),
			)
		default:
			emitted := lowering.visitor.VisitNode(child)
			var tag *ast.Node
			if ast.IsJsxElement(child) {
				tag = child.AsJsxElement().OpeningElement.AsJsxOpeningElement().TagName
			} else if ast.IsJsxSelfClosingElement(child) {
				tag = child.AsJsxSelfClosingElement().TagName
			}
			if tag != nil && lowering.plannedComponentChild(tag) && !directIndependentServerChildren {
				emitted = lowering.call(lowering.names.dynamic, []*ast.Node{
					lowering.arrow(emitted),
					lowering.factory.NewStringLiteral(lowering.dynamicID(child), ast.TokenFlagsNone),
				})
			}
			result = append(result, emitted)
		}
	}
	return result
}

func normalizeJSXText(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	value = strings.ReplaceAll(value, "\r", "\n")
	if !strings.Contains(value, "\n") {
		return html.UnescapeString(value)
	}
	characters := []rune(value)
	content := strings.Join(strings.Fields(value), " ")
	if content == "" {
		return ""
	}
	if unicode.IsSpace(characters[0]) {
		content = " " + content
	}
	if unicode.IsSpace(characters[len(characters)-1]) {
		content += " "
	}
	return html.UnescapeString(content)
}

func normalizeJSXChildText(value string, index int, count int) string {
	text := normalizeJSXText(value)
	if strings.ContainsAny(value, "\r\n") {
		if index == 0 {
			text = strings.TrimLeftFunc(text, unicode.IsSpace)
		}
		if index == count-1 {
			text = strings.TrimRightFunc(text, unicode.IsSpace)
		}
		if strings.HasPrefix(text, " ") {
			trimmed := strings.TrimLeftFunc(text, unicode.IsSpace)
			for _, first := range trimmed {
				if strings.ContainsRune(".,;:!?%)]}»›。，、；：！？％）］｝", first) {
					text = trimmed
				}
				break
			}
		}
	}
	return text
}
