package exactcompiler

import (
	"fmt"
	"html"
	"strconv"
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
		element := lowering.call(
			lowering.names.fragment,
			append(
				[]*ast.Node{
					lowering.props(opening.Attributes(), "", false, ""),
				},
				lowering.children(children)...,
			),
		)
		return lowering.reactiveStructuralReceipt(identityNode, opening.Attributes(), element)
	}
	if tagText == "_target" {
		element := lowering.call(
			lowering.names.target,
			append(
				[]*ast.Node{lowering.props(opening.Attributes(), "", false, "")},
				lowering.children(children)...,
			),
		)
		return lowering.reactiveStructuralReceipt(identityNode, opening.Attributes(), element)
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
	if intrinsic && !lowering.renderProgramFallback &&
		!lowering.renderProgramIntrinsicHasEnhancements(opening.Attributes()) {
		if planned, _ := lowering.lowerRenderProgram(identityNode, opening, children); planned != nil {
			return planned
		}
	}
	var emittedTag *ast.Node
	var interopType *ast.Node
	derivedComponent := false
	if !intrinsic && ast.IsIdentifier(tag) {
		_, derivedComponent = lowering.derivedBindingAtReference(tag)
	}
	if intrinsic {
		emittedTag = lowering.factory.NewStringLiteral(tagText, ast.TokenFlagsNone)
	} else {
		emittedTag = lowering.visitor.VisitNode(tag)
		if lowering.interop != nil &&
			!lowering.compiledNativeComponentTag(tag) &&
			!derivedComponent &&
			!lowering.exactCoreStructuralTag(tag) {
			interopType = emittedTag
			emittedTag = lowering.factory.NewIdentifier(lowering.names.interop)
		}
	}
	props := lowering.props(
		opening.Attributes(),
		lowering.elementID(identityNode),
		intrinsic,
		tagText,
	)
	if interopType != nil {
		props = lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.property(lowering.factory.NewIdentifier("component"), interopType),
				lowering.factory.NewSpreadAssignment(props),
			}),
			false,
		)
	}
	arguments := []*ast.Node{
		emittedTag,
		props,
	}
	if interopType != nil {
		arguments = append(arguments, lowering.compatibilityContributionChildren(children)...)
	} else if !intrinsic {
		if exactCoreTag, exactCore := lowering.exactCoreStructuralExport(tag); exactCore &&
			exactCoreTag != "" {
			arguments = append(arguments, lowering.children(children)...)
		} else {
			arguments = append(arguments, lowering.componentChildren(children)...)
		}
	} else {
		arguments = append(arguments, lowering.children(children)...)
	}
	elementHelper := lowering.names.componentReceipt
	exactCoreTag, exactCore := lowering.exactCoreStructuralExport(tag)
	if intrinsic {
		elementHelper = lowering.names.intrinsicElement
	} else if exactCore && exactCoreTag == "Suspense" {
		elementHelper = lowering.names.suspenseReceipt
		arguments = arguments[1:]
	} else if exactCore && exactCoreTag == "Activity" {
		elementHelper = lowering.names.activityReceipt
		arguments = arguments[1:]
	} else if exactCore && exactCoreTag == "Portal" {
		elementHelper = lowering.names.portalReceipt
		arguments = arguments[1:]
	} else if exactCore && exactCoreTag == "ServerBoundary" {
		elementHelper = lowering.names.boundaryReceipt
		arguments = arguments[1:]
	} else if exactCore && exactCoreTag == "ServerSlot" {
		elementHelper = lowering.names.serverSlotReceipt
		arguments = arguments[1:]
	} else if exactCore && exactCoreTag == "UnsafeHtml" {
		elementHelper = lowering.names.unsafeHTMLReceipt
		arguments = arguments[1:2]
	} else if exactCore && exactCoreTag == "Fragment" {
		elementHelper = lowering.names.fragment
		arguments = arguments[1:]
	} else if exactCore && exactCoreTag == "Target" {
		elementHelper = lowering.names.target
		arguments = arguments[1:]
	} else {
		// Every non-intrinsic JSX tag has already been classified by the
		// compiler. Native values and explicit compatibility adapters cross
		// the target ABI through the same opaque component-receipt operation;
		// there is no generic JSX or runtime-tree fallback.
		elementHelper = lowering.names.componentReceipt
	}
	element := lowering.call(elementHelper, arguments)
	if lowering.target == TargetClient &&
		elementHelper == lowering.names.componentReceipt &&
		!derivedComponent &&
		lowering.renderProgramChildDepth == 0 &&
		lowering.renderProgramComponentDepth == 0 {
		if dependencies, closed := lowering.directComponentProgramReader(element); closed && len(dependencies) != 0 {
			target, updates, _, registered := lowering.registerComponentUpdates(
				identityNode,
				[]renderProgramDirectUpdate{{kind: "component-receipt", dependencies: dependencies}},
			)
			if registered {
				element = lowering.call(lowering.names.componentReceiptUpdate, []*ast.Node{
					element,
					lowering.factory.NewNumericLiteral(strconv.Itoa(target), ast.TokenFlagsNone),
					lowering.factory.NewIdentifier(updates),
				})
			}
		}
	}
	if lowering.directScheduledServerComponent(tag) {
		element = lowering.call(lowering.names.issueServerComponent, []*ast.Node{element})
	}
	if intrinsic && lowering.independentAsyncSiblings(children) {
		element = lowering.call(lowering.names.asyncSiblings, []*ast.Node{element})
	}
	if !intrinsic && partitionedServerComponent && lowering.target == TargetServer {
		element = lowering.serverPartitionSlot(opening, partitionEdge, element)
	}
	if derivedComponent {
		return lowering.call(
			lowering.names.dynamic,
			[]*ast.Node{lowering.arrow(element)},
		)
	}
	return element
}

// Reactive attributes on transparent structural ranges must republish the opaque receipt just as
// focused intrinsic ranges do. The renderer can then retain the range and update its target-local
// behavior without a component rerender or a generic runtime tree representation.
func (lowering *jsxLowering) reactiveStructuralReceipt(
	identityNode *ast.Node,
	attributes *ast.Node,
	element *ast.Node,
) *ast.Node {
	if lowering.target != TargetClient || attributes == nil ||
		!lowering.hasReactiveComponentCapture(attributes) {
		return element
	}
	return lowering.call(lowering.names.dynamic, []*ast.Node{
		lowering.arrow(element),
		lowering.factory.NewStringLiteral(lowering.dynamicID(identityNode), ast.TokenFlagsNone),
	})
}

// directScheduledServerComponent selects only compiler-closed children whose setup contains
// scheduled transitions. Their component-receipt creation is the earliest semantically valid point at which
// the request renderer can issue task readiness without rediscovering the authored tree.
func (lowering *jsxLowering) directScheduledServerComponent(tag *ast.Node) bool {
	if lowering.target != TargetServer || !ast.IsIdentifier(tag) {
		return false
	}
	component, exists := lowering.components[tag.Text()]
	if !exists || !component.TargetPlan.DirectServer {
		return false
	}
	execution := component.TargetPlan.ServerExecution
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
		if jsxIntrinsic(sourceText(lowering.sourceFile, tag)) || lowering.compiledNativeComponentTag(tag) {
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
	if ast.IsIdentifier(tag) {
		if _, exists := lowering.components[tag.Text()]; exists {
			return true
		}
	}
	importReference, imported := externalImportForExpression(
		tag,
		lowering.externalImports,
		lowering.checker,
	)
	if imported && lowering.configuredExactComponent(importReference) {
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
		if _, resolved := lowering.resolvedComponentTagSymbols[id]; resolved {
			return lowering.componentTagSymbols[id]
		}
		if _, seen := visited[id]; seen {
			return false
		}
		visited[id] = struct{}{}
		if imported && lowering.publishedExactComponent(candidate, importReference) {
			lowering.resolvedComponentTagSymbols[id] = struct{}{}
			lowering.componentTagSymbols[id] = true
			return true
		}
		if candidate.Flags&ast.SymbolFlagsAlias != 0 {
			target := lowering.checker.GetAliasedSymbol(candidate)
			if target != nil && resolvesToComponent(target) {
				lowering.resolvedComponentTagSymbols[id] = struct{}{}
				lowering.componentTagSymbols[id] = true
				return true
			}
		}
		for _, declaration := range candidate.Declarations {
			if sourceFile := ast.GetSourceFileOfNode(declaration); sourceFile != nil {
				for _, component := range lowering.componentSpans(sourceFile) {
					if component.Start >= declaration.Pos() && component.Start < declaration.End() {
						lowering.resolvedComponentTagSymbols[id] = struct{}{}
						lowering.componentTagSymbols[id] = true
						return true
					}
				}
			}
			if !ast.IsVariableDeclaration(declaration) {
				continue
			}
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer == nil {
				continue
			}
			if ast.IsIdentifier(initializer) {
				if _, exists := lowering.components[initializer.Text()]; exists {
					lowering.resolvedComponentTagSymbols[id] = struct{}{}
					lowering.componentTagSymbols[id] = true
					return true
				}
			}
			initializerImport, initializerImported := externalImportForExpression(
				initializer,
				lowering.externalImports,
				lowering.checker,
			)
			if initializerImported &&
				(lowering.configuredExactComponent(initializerImport) ||
					lowering.publishedExactComponent(candidate, initializerImport)) {
				lowering.resolvedComponentTagSymbols[id] = struct{}{}
				lowering.componentTagSymbols[id] = true
				return true
			}
			target := lowering.checker.GetSymbolAtLocation(initializer)
			if target != nil && resolvesToComponent(target) {
				lowering.resolvedComponentTagSymbols[id] = struct{}{}
				lowering.componentTagSymbols[id] = true
				return true
			}
		}
		lowering.resolvedComponentTagSymbols[id] = struct{}{}
		lowering.componentTagSymbols[id] = false
		return false
	}
	return resolvesToComponent(symbol)
}

// compiledNativeComponentTag proves that a compiled component expression stays
// on the native target ABI. Registry selections are compiler-owned component
// values even though their runtime facade is a property access, and immutable
// aliases retain that provenance. A false result is used only to select an
// explicit configured compatibility adapter; it never selects a generic JSX
// representation.
func (lowering *jsxLowering) compiledNativeComponentTag(tag *ast.Node) bool {
	if lowering.localExactComponentTag(tag) {
		return true
	}
	if lowering.checker == nil {
		return false
	}
	return lowering.registryComponentTag(tag, make(map[ast.SymbolId]struct{}))
}

func (lowering *jsxLowering) registryComponentTag(
	expression *ast.Node,
	visited map[ast.SymbolId]struct{},
) bool {
	if dynamicComponentRegistrySelection(expression, lowering.sourceFile, lowering.checker) {
		return true
	}
	if !ast.IsIdentifier(expression) {
		return false
	}
	symbol := lowering.checker.GetSymbolAtLocation(expression)
	if symbol == nil {
		return false
	}
	id := ast.GetSymbolId(symbol)
	if _, seen := visited[id]; seen {
		return false
	}
	visited[id] = struct{}{}
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) ||
			declaration.Parent == nil ||
			!ast.IsVariableDeclarationList(declaration.Parent) ||
			declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		initializer := declaration.AsVariableDeclaration().Initializer
		if initializer != nil && lowering.registryComponentTag(initializer, visited) {
			return true
		}
	}
	return false
}

// componentSpans discovers a dependency source's durable component declarations once per
// lowering. JSX can use the same imported component hundreds of times; component identity
// resolution must not rescan the dependency's complete AST for every tag occurrence.
func (lowering *jsxLowering) componentSpans(sourceFile *ast.SourceFile) []SourceSpan {
	if spans, exists := lowering.componentDeclarationSpans[sourceFile]; exists {
		return spans
	}
	components := collectComponents(sourceFile)
	spans := make([]SourceSpan, len(components))
	for index, component := range components {
		spans[index] = SourceSpan{Start: component.Start, Length: component.Length}
	}
	lowering.componentDeclarationSpans[sourceFile] = spans
	return spans
}

func (lowering *jsxLowering) exactCoreStructuralTag(tag *ast.Node) bool {
	_, exists := lowering.exactCoreStructuralExport(tag)
	return exists
}

func (lowering *jsxLowering) exactCoreStructuralExport(tag *ast.Node) (string, bool) {
	if !ast.IsIdentifier(tag) || lowering.checker == nil {
		return "", false
	}
	bindings := collectExternalImportBindings(lowering.sourceFile, lowering.checker)
	reference, exists := bindings.byName[tag.Text()]
	if !exists || !exactCoreStructuralReference(reference.moduleSpecifier, reference.exportName) {
		return "", false
	}
	return reference.exportName, true
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
			if lowering.clientIslandPropsSlots == nil &&
				lowering.checker != nil &&
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

// componentChildren lowers authored children as finalized component-ABI inputs. Unlike an
// intrinsic child range, a component child is delivered through the receiving artifact's prop
// receipt. Keeping a parent-owned live range here would hide keyed identity from transparent
// components and allow a retained outgoing generation to observe values from its replacement.
func (lowering *jsxLowering) componentChildren(children *ast.NodeList) []*ast.Node {
	if children == nil {
		return nil
	}
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
			emitted := lowering.visitor.VisitNode(expression)
			if lowering.declarativeRenderDepth > 0 {
				result = append(result, emitted)
				continue
			}
			result = append(result, lowering.reactiveExpression(expression, emitted))
		default:
			result = append(result, lowering.visitor.VisitNode(child))
		}
	}
	return result
}

// compatibilityContributionChildren closes each authored native child over its supplier-selected
// placement operation. The React island receives only the opaque handle and cannot inspect whether
// the operation contributes text, intrinsic topology, a component, a collection, or no output.
func (lowering *jsxLowering) compatibilityContributionChildren(children *ast.NodeList) []*ast.Node {
	values := lowering.children(children)
	result := make([]*ast.Node, 0, len(values))
	for _, value := range values {
		target := lowering.factory.NewIdentifier("__exactContributionTarget")
		place := lowering.factory.NewCallExpression(
			lowering.factory.NewPropertyAccessExpression(
				target,
				nil,
				lowering.factory.NewIdentifier("place"),
				ast.NodeFlagsNone,
			),
			nil,
			nil,
			lowering.factory.NewNodeList([]*ast.Node{value}),
			ast.NodeFlagsNone,
		)
		operation := lowering.factory.NewArrowFunction(
			nil,
			nil,
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewParameterDeclaration(nil, nil, target, nil, nil, nil),
			}),
			nil,
			nil,
			lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
			place,
		)
		result = append(
			result,
			lowering.call(lowering.names.compatibilityContribution, []*ast.Node{operation}),
		)
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
