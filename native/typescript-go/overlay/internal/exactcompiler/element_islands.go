package exactcompiler

import (
	"slices"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

type islandValueCapture struct {
	name   string
	symbol ast.SymbolId
	start  int
}

type islandFunctionCapture struct {
	name        string
	symbol      ast.SymbolId
	start       int
	declaration *ast.Node
}

type islandDerivedCapture struct {
	name        string
	start       int
	declaration *ast.Node
}

type clientElementIsland struct {
	component        Component
	node             *ast.Node
	index            int
	id               string
	name             string
	statePaths       [][]string
	interaction      bool
	activation       ActivationDecision
	serverSlot       bool
	valueCaptures    []islandValueCapture
	functionCaptures []islandFunctionCapture
	derivedCaptures  []islandDerivedCapture
	hasSpread        bool
	finiteSpreads    map[int][]finiteSpreadProperty
}

func (lowering *jsxLowering) recordClientIslandDefinitions(
	component Component,
) {
	islands := make([]clientElementIsland, 0, component.ClientIslandCount)
	for _, island := range lowering.clientIslands {
		if island.component.ID == component.ID {
			islands = append(islands, island)
		}
	}
	sort.Slice(islands, func(left int, right int) bool {
		return islands[left].index < islands[right].index
	})
	for _, island := range islands {
		if _, recorded := lowering.recordedClientIslands[island.id]; recorded {
			continue
		}
		lowering.recordedClientIslands[island.id] = struct{}{}
		lowering.clientDefinitions = append(
			lowering.clientDefinitions,
			lowering.clientIslandDefinition(island),
			lowering.factory.NewExpressionStatement(
				clientIslandArtifactAttachment(
					lowering.factory,
					lowering.factory.NewIdentifier(island.name),
					island,
				),
			),
		)
	}
}

// clientIslandArtifactAttachment gives compiler-synthesized island functions
// the same executable authority as analyzed source components. An island is a
// native component, not an identity-only exception to the artifact ABI.
func clientIslandArtifactAttachment(
	factory *printer.NodeFactory,
	implementation *ast.Node,
	island clientElementIsland,
) *ast.Node {
	state := []string{}
	seenState := make(map[string]struct{})
	for _, path := range island.statePaths {
		if len(path) == 0 {
			continue
		}
		if _, exists := seenState[path[0]]; !exists {
			seenState[path[0]] = struct{}{}
			state = append(state, path[0])
		}
	}
	capabilities := []string{}
	if island.interaction {
		capabilities = append(capabilities, "interactions")
	}
	role := "client-island"
	contract := contractObject(factory, true,
		contractProperty(factory, "version", contractNumber(factory, 2)),
		contractProperty(factory, "placement", contractString(factory, "client")),
		contractProperty(factory, "role", contractString(factory, "client")),
		contractProperty(factory, "implementations", contractArray(factory,
			contractObject(factory, false,
				contractProperty(factory, "id", contractString(factory, island.id+":implementation")),
				contractProperty(factory, "name", contractString(factory, island.name)),
				contractProperty(factory, "role", contractString(factory, role)),
				contractProperty(factory, "implementation", implementation),
			),
		)),
		contractProperty(factory, "continuations", contractArray(factory)),
		contractProperty(factory, "executors", contractArray(factory)),
		contractProperty(factory, "boundaries", contractArray(factory)),
		contractProperty(factory, "definition", contractObject(factory, true,
			contractProperty(factory, "version", contractNumber(factory, 1)),
			contractProperty(factory, "instantiate", implementation),
			contractProperty(factory, "state", stringMetadata(factory, state)),
			contractProperty(factory, "capabilities", stringMetadata(factory, capabilities)),
		)),
	)
	return factory.NewCallExpression(
		factory.NewPropertyAccessExpression(factory.NewIdentifier("Object"), nil, factory.NewIdentifier("assign"), ast.NodeFlagsNone),
		nil,
		nil,
		factory.NewNodeList([]*ast.Node{implementation, contractObject(factory, false,
			factory.NewPropertyAssignment(nil, factory.NewComputedPropertyName(
				factory.NewCallExpression(
					factory.NewPropertyAccessExpression(factory.NewIdentifier("Symbol"), nil, factory.NewIdentifier("for"), ast.NodeFlagsNone),
					nil, nil, factory.NewNodeList([]*ast.Node{contractString(factory, "@exactjs/component")}), ast.NodeFlagsNone,
				),
			), nil, nil, contractString(factory, island.id)),
			factory.NewPropertyAssignment(nil, factory.NewComputedPropertyName(
				factory.NewCallExpression(
					factory.NewPropertyAccessExpression(factory.NewIdentifier("Symbol"), nil, factory.NewIdentifier("for"), ast.NodeFlagsNone),
					nil, nil, factory.NewNodeList([]*ast.Node{contractString(factory, "@exactjs/component-contract")}), ast.NodeFlagsNone,
				),
			), nil, nil, contract),
		)}),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) clientIslandDefinition(
	island clientElementIsland,
) *ast.Node {
	previousCaptures := lowering.captureValues
	lowering.captureValues = make(map[ast.SymbolId]string)
	for _, capture := range island.valueCaptures {
		lowering.captureValues[capture.symbol] = capture.name
	}
	capturedFunctions := make(
		[]*ast.Node,
		0,
		len(island.functionCaptures),
	)
	for _, capture := range island.functionCaptures {
		capturedFunctions = append(
			capturedFunctions,
			lowering.clientIslandFunctionCapture(capture),
		)
	}
	derivedValues := make([]*ast.Node, 0, len(island.derivedCaptures))
	for _, capture := range island.derivedCaptures {
		derivedValues = append(
			derivedValues,
			lowering.clientIslandDerivedCapture(capture),
		)
	}
	props := lowering.factory.NewIdentifier("props")
	thisParameter := lowering.factory.NewParameterDeclaration(
		nil,
		nil,
		lowering.factory.NewIdentifier("this"),
		nil,
		lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
		nil,
	)
	propsParameter := lowering.factory.NewParameterDeclaration(
		nil,
		nil,
		props,
		nil,
		lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword),
		lowering.factory.NewObjectLiteralExpression(nil, false),
	)
	stateInput := lowering.factory.NewPropertyAccessExpression(
		props,
		nil,
		lowering.factory.NewIdentifier("__exactState"),
		ast.NodeFlagsNone,
	)
	assignState := lowering.factory.NewCallExpression(
		lowering.factory.NewPropertyAccessExpression(
			lowering.factory.NewIdentifier("Object"),
			nil,
			lowering.factory.NewIdentifier("assign"),
			ast.NodeFlagsNone,
		),
		nil,
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			lowering.stateRoot(),
			stateInput,
		}),
		ast.NodeFlagsNone,
	)
	stateInitialization := lowering.factory.NewIfStatement(
		stateInput,
		lowering.factory.NewExpressionStatement(assignState),
		nil,
	)

	var opening *ast.Node
	var children *ast.NodeList
	if ast.IsJsxElement(island.node) {
		element := island.node.AsJsxElement()
		opening = element.OpeningElement
		children = element.Children
	} else if ast.IsJsxFragment(island.node) {
		children = island.node.AsJsxFragment().Children
	} else {
		opening = island.node
	}
	arguments := []*ast.Node{}
	renderHelper := lowering.names.element
	if opening == nil {
		renderHelper = lowering.names.fragment
		arguments = append(arguments, lowering.props(nil, "", false, ""))
	} else {
		tag := openingTag(opening)
		tagText := sourceText(lowering.sourceFile, tag)
		var emittedTag *ast.Node
		if jsxIntrinsic(tagText) {
			emittedTag = lowering.factory.NewStringLiteral(tagText, ast.TokenFlagsNone)
		} else {
			emittedTag = lowering.visitor.VisitNode(tag)
			if lowering.interop != nil &&
				!lowering.localExactComponentTag(tag) &&
				!lowering.exactCoreVNodeTag(tag) {
				emittedTag = lowering.call(lowering.names.interop, []*ast.Node{emittedTag})
			}
		}
		arguments = append(
			arguments,
			emittedTag,
			lowering.factory.NewObjectLiteralExpression(
				lowering.factory.NewNodeList(
					lowering.clientIslandAttributeProperties(
						island,
						opening.Attributes(),
						props,
						tagText,
					),
				),
				false,
			),
		)
	}
	if island.serverSlot {
		arguments = append(
			arguments,
			lowering.factory.NewPropertyAccessExpression(
				props,
				nil,
				lowering.factory.NewIdentifier("children"),
				ast.NodeFlagsNone,
			),
		)
	} else {
		arguments = append(arguments, lowering.children(children)...)
	}
	render := lowering.arrow(
		lowering.call(renderHelper, arguments),
	)
	lowering.captureValues = previousCaptures
	bodyStatements := []*ast.Node{stateInitialization}
	bodyStatements = append(bodyStatements, derivedValues...)
	bodyStatements = append(bodyStatements, capturedFunctions...)
	if island.hasSpread {
		bodyStatements = append(
			bodyStatements,
			lowering.clientIslandSpreadSanitization(props)...,
		)
	}
	bodyStatements = append(
		bodyStatements,
		lowering.factory.NewReturnStatement(render),
	)
	body := lowering.factory.NewBlock(
		lowering.factory.NewNodeList(bodyStatements),
		true,
	)
	return lowering.factory.NewFunctionDeclaration(
		lowering.factory.NewModifierList([]*ast.Node{
			lowering.factory.NewModifier(ast.KindExportKeyword),
		}),
		nil,
		lowering.factory.NewIdentifier(island.name),
		nil,
		lowering.factory.NewNodeList([]*ast.Node{
			thisParameter,
			propsParameter,
		}),
		nil,
		nil,
		body,
	)
}

func (lowering *jsxLowering) clientIslandDerivedCapture(
	capture islandDerivedCapture,
) *ast.Node {
	declaration := capture.declaration.AsVariableDeclaration()
	initializer := lowering.visitor.VisitNode(declaration.Initializer)
	updated := lowering.factory.UpdateVariableDeclaration(
		declaration,
		declaration.Name(),
		declaration.ExclamationToken,
		declaration.Type,
		lowering.call(
			lowering.names.derived,
			[]*ast.Node{lowering.arrow(initializer)},
		),
	)
	return lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{updated}),
			ast.NodeFlagsConst,
		),
	)
}

func (lowering *jsxLowering) clientIslandSpreadSanitization(
	props *ast.Node,
) []*ast.Node {
	local := lowering.factory.NewIdentifier(lowering.names.clientProps)
	declaration := lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{
				lowering.factory.NewVariableDeclaration(
					local,
					nil,
					nil,
					lowering.factory.NewObjectLiteralExpression(
						lowering.factory.NewNodeList([]*ast.Node{
							lowering.factory.NewSpreadAssignment(props),
						}),
						false,
					),
				),
			}),
			ast.NodeFlagsConst,
		),
	)
	result := []*ast.Node{declaration}
	for _, name := range []string{
		"__exactState",
		"__exactCapture",
		"__exactHydration",
		"__exactHydrationFallback",
		"children",
	} {
		result = append(
			result,
			lowering.factory.NewExpressionStatement(
				lowering.factory.NewDeleteExpression(
					lowering.factory.NewPropertyAccessExpression(
						lowering.factory.NewIdentifier(
							lowering.names.clientProps,
						),
						nil,
						lowering.factory.NewIdentifier(name),
						ast.NodeFlagsNone,
					),
				),
			),
		)
	}
	return result
}

func (lowering *jsxLowering) clientIslandFunctionCapture(
	capture islandFunctionCapture,
) *ast.Node {
	if ast.IsFunctionDeclaration(capture.declaration) {
		return lowering.visitor.VisitNode(capture.declaration)
	}
	declaration := capture.declaration.AsVariableDeclaration()
	updated := lowering.factory.UpdateVariableDeclaration(
		declaration,
		declaration.Name(),
		declaration.ExclamationToken,
		declaration.Type,
		lowering.visitor.VisitNode(declaration.Initializer),
	)
	return lowering.factory.NewVariableStatement(
		nil,
		lowering.factory.NewVariableDeclarationList(
			lowering.factory.NewNodeList([]*ast.Node{updated}),
			ast.NodeFlagsConst,
		),
	)
}

func (lowering *jsxLowering) clientIslandCaptureReference(
	node *ast.Node,
) *ast.Node {
	if len(lowering.captureValues) == 0 || lowering.checker == nil {
		return nil
	}
	symbol := lowering.checker.GetSymbolAtLocation(node)
	if symbol == nil {
		return nil
	}
	name, exists := lowering.captureValues[ast.GetSymbolId(symbol)]
	if !exists {
		return nil
	}
	return lowering.factory.NewPropertyAccessExpression(
		lowering.factory.NewPropertyAccessExpression(
			lowering.factory.NewIdentifier("props"),
			nil,
			lowering.factory.NewIdentifier("__exactCapture"),
			ast.NodeFlagsNone,
		),
		nil,
		lowering.factory.NewIdentifier(name),
		ast.NodeFlagsNone,
	)
}

func (lowering *jsxLowering) clientIslandAttributeProperties(
	island clientElementIsland,
	attributes *ast.Node,
	props *ast.Node,
	tag string,
) []*ast.Node {
	properties := []*ast.Node{
		lowering.property(
			lowering.factory.NewStringLiteral(
				"data-exact-id",
				ast.TokenFlagsNone,
			),
			lowering.factory.NewStringLiteral(
				lowering.elementID(island.node),
				ast.TokenFlagsNone,
			),
		),
	}
	if attributes == nil {
		return properties
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			if members, finite := island.finiteSpreads[property.Pos()]; finite {
				for _, member := range members {
					value := lowering.propertyAccess(props, member.name)
					if interactiveJSXAttribute(member.name) {
						value = lowering.finiteSpreadPropertyValue(&member)
					}
					properties = append(properties, lowering.property(
						jsxPropertyName(lowering.factory, member.name), value,
					))
				}
				continue
			}
			properties = append(
				properties,
				lowering.factory.NewSpreadAssignment(
					lowering.factory.NewIdentifier(
						lowering.names.clientProps,
					),
				),
			)
			continue
		}
		attribute := property.AsJsxAttribute()
		name := jsxAttributeText(attribute.Name())
		if bindingProperties := lowering.formBindingProperties(
			name,
			attribute.Initializer,
			attributes,
		); len(bindingProperties) != 0 {
			properties = append(properties, bindingProperties...)
			continue
		}
		var value *ast.Node
		if name == "ref" || interactiveJSXAttribute(name) {
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
			default:
				value = lowering.visitor.VisitNode(attribute.Initializer)
			}
		} else if ast.IsJsxExpression(attribute.Initializer) &&
			lowering.clientIslandAttributeReadsState(island, attribute.Initializer.AsJsxExpression().Expression) {
			value = lowering.jsxAttributeInitializer(attribute, tag, name, true)
		} else {
			value = lowering.propertyAccess(props, name)
		}
		properties = append(
			properties,
			lowering.property(jsxPropertyName(lowering.factory, name), value),
		)
	}
	return properties
}

func (lowering *jsxLowering) clientIslandAttributeReadsState(
	island clientElementIsland,
	expression *ast.Node,
) bool {
	if expression == nil {
		return false
	}
	for _, read := range lowering.stateReads {
		if read.Component == island.component.Name &&
			read.Start >= expression.Pos() && read.Start < expression.End() {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) finiteSpreadPropertyValue(
	property *finiteSpreadProperty,
) *ast.Node {
	if property.condition == nil {
		return lowering.visitor.VisitNode(property.value)
	}
	return lowering.conditional(
		lowering.visitor.VisitNode(property.condition),
		lowering.finiteSpreadPropertyValue(property.whenTrue),
		lowering.finiteSpreadPropertyValue(property.whenFalse),
	)
}

func outerClientIslandElements(elements []componentElement) []componentElement {
	result := make([]componentElement, 0)
	for index, element := range elements {
		if !element.interactive {
			continue
		}
		nested := false
		for candidateIndex, candidate := range elements {
			if candidateIndex == index || !candidate.interactive {
				continue
			}
			if candidate.fullStart <= element.fullStart &&
				candidate.fullEnd >= element.fullEnd &&
				(candidate.fullStart != element.fullStart ||
					candidate.fullEnd != element.fullEnd) {
				nested = true
				break
			}
		}
		if !nested {
			result = append(result, element)
		}
	}
	return result
}

func fullJSXElementNode(node *ast.Node) *ast.Node {
	if ast.IsJsxOpeningElement(node) && node.Parent != nil &&
		ast.IsJsxElement(node.Parent) {
		return node.Parent
	}
	return node
}

func islandStatePaths(
	sourceFile *ast.SourceFile,
	component string,
	node *ast.Node,
	stateAliases []StateAlias,
	stateReads []StateRead,
	stateWrites []StateWrite,
	captures []islandValueCapture,
	reactiveBindings []ReactiveBinding,
	additionalInputs []*ast.Node,
) [][]string {
	result := [][]string{}
	seen := make(map[string]struct{})
	add := func(path []string) {
		if len(path) == 0 {
			return
		}
		key := strings.Join(path, ".")
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		result = append(result, append([]string(nil), path...))
	}
	for _, read := range stateReads {
		if read.Component != component || len(read.Path) == 0 ||
			!positionInIslandInputs(read.Start, node, additionalInputs) {
			continue
		}
		add(read.Path)
	}
	for _, write := range stateWrites {
		if write.Component == component &&
			positionInIslandInputs(write.Start, node, additionalInputs) {
			add(write.Path)
		}
	}
	bindings := make(map[string]ReactiveBinding)
	bindingRanges := make(map[string][2]int)
	aliases := make(map[string]StateAlias)
	for _, alias := range stateAliases {
		if alias.Component == component {
			aliases[alias.Name] = alias
		}
	}
	for _, binding := range reactiveBindings {
		if binding.Component == component {
			bindings[binding.Name] = binding
		}
	}
	walkNode(sourceFile.AsNode(), func(candidate *ast.Node) bool {
		if !ast.IsVariableDeclaration(candidate) ||
			candidate.Name() == nil ||
			!ast.IsIdentifier(candidate.Name()) {
			return true
		}
		name := candidate.Name().Text()
		binding, exists := bindings[name]
		if exists && binding.Start == candidate.Name().Pos() {
			bindingRanges[name] = [2]int{candidate.Pos(), candidate.End()}
		}
		return true
	})
	visited := make(map[string]struct{})
	var addBindingReads func(string)
	addBindingReads = func(name string) {
		if _, duplicate := visited[name]; duplicate {
			return
		}
		visited[name] = struct{}{}
		binding, exists := bindings[name]
		if !exists {
			return
		}
		start := binding.Start
		end := binding.Start + binding.Length
		if value, exists := bindingRanges[name]; exists {
			start, end = value[0], value[1]
		}
		for _, read := range stateReads {
			if read.Component == component &&
				read.Start >= start &&
				read.Start < end {
				// A direct state alias is reconstructed from its snapshot. If
				// island expressions already identify narrower reads through
				// that alias, retaining the alias declaration's root read would
				// unnecessarily serialize the entire object. Whole-alias uses
				// inside the island are direct reads and therefore remain.
				if alias, isAlias := aliases[name]; isAlias &&
					slices.Equal(read.Path, alias.Path) &&
					hasDescendantStatePath(result, alias.Path) {
					continue
				}
				add(read.Path)
			}
		}
		for _, dependency := range binding.Dependencies {
			addBindingReads(dependency)
		}
	}
	for _, capture := range captures {
		addBindingReads(capture.name)
	}
	sort.Slice(result, func(left int, right int) bool {
		return strings.Join(result[left], ".") < strings.Join(result[right], ".")
	})
	return result
}

func hasDescendantStatePath(paths [][]string, prefix []string) bool {
	for _, path := range paths {
		if len(path) <= len(prefix) {
			continue
		}
		matches := true
		for index := range prefix {
			if path[index] != prefix[index] {
				matches = false
				break
			}
		}
		if matches {
			return true
		}
	}
	return false
}

func (lowering *jsxLowering) lowerServerClientIsland(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
	island clientElementIsland,
) *ast.Node {
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
					lowering.factory.NewIdentifier(capture.name),
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
	properties = append(
		properties,
		lowering.serverIslandAttributeProperties(
			opening.Attributes(),
			false,
			"",
			island.finiteSpreads,
		)...,
	)
	if island.interaction && jsxIntrinsic(sourceText(lowering.sourceFile, openingTag(opening))) {
		properties = append(
			properties,
			lowering.property(
				lowering.factory.NewIdentifier("__exactHydration"),
				lowering.factory.NewStringLiteral(
					"interaction",
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
	if island.serverSlot {
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
				lowering.factory.NewIdentifier(capture.name),
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
	return lowering.call(lowering.names.boundary, []*ast.Node{
		lowering.factory.NewStringLiteral(island.id, ast.TokenFlagsNone),
		lowering.factory.NewStringLiteral(island.name, ast.TokenFlagsNone),
		lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(properties), false),
	})
}

func (lowering *jsxLowering) serverIslandFallback(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
	finiteSpreads map[int][]finiteSpreadProperty,
) *ast.Node {
	tag := openingTag(opening)
	tagText := sourceText(lowering.sourceFile, tag)
	properties := lowering.serverIslandAttributeProperties(
		opening.Attributes(),
		true,
		lowering.elementID(identityNode),
		finiteSpreads,
	)
	arguments := []*ast.Node{
		lowering.factory.NewStringLiteral(tagText, ast.TokenFlagsNone),
		lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList(properties),
			false,
		),
	}
	arguments = append(arguments, lowering.children(children)...)
	return lowering.call(lowering.names.element, arguments)
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
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
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
		if name == "ref" || interactiveJSXAttribute(name) {
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

type islandStateNode struct {
	leaf     bool
	children map[string]*islandStateNode
}

func (lowering *jsxLowering) islandStateSnapshot(
	paths [][]string,
) *ast.Node {
	root := &islandStateNode{children: make(map[string]*islandStateNode)}
	for _, path := range paths {
		current := root
		for _, segment := range path {
			if current.leaf {
				break
			}
			child := current.children[segment]
			if child == nil {
				child = &islandStateNode{
					children: make(map[string]*islandStateNode),
				}
				current.children[segment] = child
			}
			current = child
		}
		current.leaf = true
		current.children = nil
	}
	return lowering.islandStateObject(root, nil)
}

func (lowering *jsxLowering) islandStateObject(
	node *islandStateNode,
	prefix []string,
) *ast.Node {
	names := make([]string, 0, len(node.children))
	for name := range node.children {
		names = append(names, name)
	}
	sort.Strings(names)
	properties := make([]*ast.Node, 0, len(names))
	for _, name := range names {
		child := node.children[name]
		path := append(append([]string(nil), prefix...), name)
		value := lowering.stateValue(path)
		if !child.leaf {
			value = lowering.islandStateObject(child, path)
		}
		properties = append(
			properties,
			lowering.property(
				jsxPropertyName(lowering.factory, name),
				value,
			),
		)
	}
	return lowering.factory.NewObjectLiteralExpression(
		lowering.factory.NewNodeList(properties),
		false,
	)
}
