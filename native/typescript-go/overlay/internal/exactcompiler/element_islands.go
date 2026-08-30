package exactcompiler

import (
	"sort"
	"strconv"

	"github.com/microsoft/typescript-go/internal/ast"
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
	propsSlots       []string
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
		island.propsSlots = lowering.clientIslandPropsLayout(island)
		definition := lowering.clientIslandDefinition(island)
		initializer := lowering.factory.NewCallExpression(
			lowering.factory.NewParenthesizedExpression(
				lowering.factory.NewArrowFunction(
					nil,
					nil,
					lowering.factory.NewNodeList(nil),
					nil,
					nil,
					lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
					lowering.factory.NewBlock(
						lowering.factory.NewNodeList([]*ast.Node{
							definition,
							lowering.factory.NewReturnStatement(
								lowering.clientIslandArtifactAttachment(
									lowering.factory.NewIdentifier(island.name),
									island,
								),
							),
						}),
						true,
					),
				),
			),
			nil,
			nil,
			lowering.factory.NewNodeList(nil),
			ast.NodeFlagsNone,
		)
		initializer = lowering.emitContext.AddSyntheticLeadingComment(
			initializer,
			ast.KindMultiLineCommentTrivia,
			" @__PURE__ ",
			false,
		)
		lowering.clientDefinitions = append(
			lowering.clientDefinitions,
			lowering.factory.NewVariableStatement(
				lowering.factory.NewModifierList([]*ast.Node{
					lowering.factory.NewModifier(ast.KindExportKeyword),
				}),
				lowering.factory.NewVariableDeclarationList(
					lowering.factory.NewNodeList([]*ast.Node{
						lowering.factory.NewVariableDeclaration(
							lowering.factory.NewIdentifier(island.name),
							nil,
							nil,
							initializer,
						),
					}),
					ast.NodeFlagsConst,
				),
			),
		)
	}
}

// clientIslandArtifactAttachment gives compiler-synthesized island functions
// the same executable authority as analyzed source components. An island is a
// native component, not an identity-only exception to the artifact ABI.
func (lowering *jsxLowering) clientIslandArtifactAttachment(
	implementation *ast.Node,
	island clientElementIsland,
) *ast.Node {
	factory := lowering.factory
	// Generated island reads and form bindings retain the parent component's
	// compiler-assigned indexes. The request snapshot may contain only the
	// island's required paths, but its storage layout must preserve those indexes.
	state := append([]string(nil), island.component.StateSlots...)
	capabilities := []string{}
	if island.interaction {
		capabilities = append(capabilities, "interactions")
	}
	abi := componentABICompiledRender
	constructor := lowering.names.constructRenderComponent
	role := "client-island"
	contract := contractObject(factory, true,
		contractProperty(factory, "version", contractNumber(factory, 3)),
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
		contractProperty(factory, "artifact", contractObject(factory, true,
			contractProperty(factory, "version", contractNumber(factory, 1)),
			contractProperty(factory, "target", contractString(factory, "client")),
			contractProperty(factory, "id", contractString(factory, island.id)),
			contractProperty(factory, "instantiate", implementation),
			contractProperty(factory, "construct", factory.NewIdentifier(constructor)),
			contractProperty(factory, "attach", factory.NewIdentifier(lowering.names.clientAttachComponent)),
			contractProperty(factory, "receive", factory.NewIdentifier(lowering.names.clientReceiveProps)),
			contractProperty(factory, "dispose", factory.NewIdentifier(lowering.names.clientDisposeComponent)),
			contractProperty(factory, "abi", contractNumber(factory, abi)),
			contractProperty(factory, "state", stringMetadata(factory, state)),
			contractProperty(factory, "props", stringMetadata(factory, island.propsSlots)),
			contractProperty(factory, "capabilities", stringMetadata(factory, capabilities)),
		)),
	)
	assigned := factory.NewCallExpression(
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
	// Generated island exports likewise expose only their callable signature;
	// their component contract remains a compiler/runtime protocol.
	return factory.NewAsExpression(
		assigned,
		factory.NewTypeQueryNode(implementation, nil),
	)
}

func (lowering *jsxLowering) clientIslandDefinition(
	island clientElementIsland,
) *ast.Node {
	previousCaptures := lowering.captureValues
	previousPropsSlots := lowering.clientIslandPropsSlots
	lowering.clientIslandPropsSlots = make(map[string]int, len(island.propsSlots))
	for slot, key := range island.propsSlots {
		lowering.clientIslandPropsSlots[key] = slot
	}
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
		name := capture.declaration.AsVariableDeclaration().Name()
		if _, materialized := lowering.elidedDerived[name.Pos()]; materialized {
			// The island's sole render consumer owns this calculation in its
			// generated reactive binding. Recreating a durable derived cell here
			// would retain the generic computation graph and evaluate the same
			// authored initializer twice.
			continue
		}
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
	var stateInitialization *ast.Node
	if len(island.statePaths) != 0 {
		stateInput := lowering.clientIslandPropsRead(props, "__exactState")
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
		stateInitialization = lowering.factory.NewIfStatement(
			stateInput,
			lowering.factory.NewExpressionStatement(assignState),
			nil,
		)
	}

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
	renderHelper := lowering.names.componentReceipt
	if opening == nil {
		renderHelper = lowering.names.fragment
		arguments = append(arguments, lowering.props(nil, "", false, ""))
	} else {
		tag := openingTag(opening)
		tagText := sourceText(lowering.sourceFile, tag)
		var emittedTag *ast.Node
		var interopType *ast.Node
		if jsxIntrinsic(tagText) {
			emittedTag = lowering.factory.NewStringLiteral(tagText, ast.TokenFlagsNone)
			renderHelper = lowering.names.intrinsicElement
		} else {
			emittedTag = lowering.visitor.VisitNode(tag)
			if lowering.interop != nil &&
				!lowering.compiledNativeComponentTag(tag) &&
				!lowering.exactCoreStructuralTag(tag) {
				interopType = emittedTag
				emittedTag = lowering.factory.NewIdentifier(lowering.names.interop)
				renderHelper = lowering.names.componentReceipt
			} else {
				renderHelper = lowering.names.componentReceipt
			}
		}
		properties := lowering.clientIslandAttributeProperties(
			island,
			opening.Attributes(),
			props,
			tagText,
		)
		if interopType != nil {
			properties = append(
				[]*ast.Node{lowering.property(lowering.factory.NewIdentifier("component"), interopType)},
				properties...,
			)
		}
		arguments = append(
			arguments,
			emittedTag,
			lowering.factory.NewObjectLiteralExpression(
				lowering.factory.NewNodeList(properties),
				false,
			),
		)
	}
	if island.serverSlot {
		arguments = append(
			arguments,
			lowering.clientIslandPropsRead(props, "children"),
		)
	} else {
		arguments = append(arguments, lowering.children(children)...)
	}
	render := lowering.arrow(
		lowering.call(renderHelper, arguments),
	)
	lowering.captureValues = previousCaptures
	lowering.clientIslandPropsSlots = previousPropsSlots
	bodyStatements := []*ast.Node{}
	if stateInitialization != nil {
		bodyStatements = append(bodyStatements, stateInitialization)
	}
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
		nil,
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
		if task, exists := lowering.invokedTasks[capture.declaration.Pos()]; exists {
			operation, hasOperation := lowering.operations[nodeSpanKey(capture.declaration)]
			if hasOperation {
				return lowering.lowerInvokedTaskDeclaration(
					capture.declaration.AsFunctionDeclaration(),
					task,
					&operation,
				)
			}
			return lowering.lowerInvokedTaskDeclaration(
				capture.declaration.AsFunctionDeclaration(),
				task,
				nil,
			)
		}
		if task, exists := lowering.functionTasks[capture.declaration.Pos()]; exists {
			return lowering.lowerInvokedTaskDeclaration(
				capture.declaration.AsFunctionDeclaration(),
				task,
				nil,
			)
		}
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
		lowering.clientIslandPropsRead(
			lowering.factory.NewIdentifier("props"),
			"__exactCapture",
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
					var value *ast.Node
					if interactiveJSXAttribute(member.name) {
						value = lowering.finiteSpreadPropertyValue(&member)
					} else {
						value = lowering.clientIslandPropsRead(props, member.name)
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
			value = lowering.clientIslandPropsRead(props, name)
		}
		properties = append(
			properties,
			lowering.property(jsxPropertyName(lowering.factory, name), value),
		)
	}
	return properties
}

// clientIslandPropsRead emits the direct numeric read selected by the generated island layout.
func (lowering *jsxLowering) clientIslandPropsRead(props *ast.Node, key string) *ast.Node {
	slot, exists := lowering.clientIslandPropsSlots[key]
	if !exists {
		panic("generated client island read missing props slot: " + key)
	}
	return lowering.call(lowering.names.readState, []*ast.Node{
		props,
		lowering.factory.NewNumericLiteral(strconv.Itoa(slot), ast.TokenFlagsNone),
	})
}

// clientIslandPropsLayout records every statically addressed input of one synthesized component.
// Opaque spreads remain enumerable through the facade, while all named reads bypass its proxy trap.
func (lowering *jsxLowering) clientIslandPropsLayout(island clientElementIsland) []string {
	keys := make(map[string]struct{})
	add := func(key string) { keys[key] = struct{}{} }
	if len(island.statePaths) != 0 {
		add("__exactState")
	}
	if len(island.valueCaptures) != 0 {
		add("__exactCapture")
	}
	if island.serverSlot {
		add("children")
	}
	var opening *ast.Node
	switch {
	case ast.IsJsxElement(island.node):
		opening = island.node.AsJsxElement().OpeningElement
	case ast.IsJsxSelfClosingElement(island.node):
		opening = island.node
	}
	if opening != nil && opening.Attributes() != nil {
		attributes := opening.Attributes()
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if ast.IsJsxSpreadAttribute(property) {
				for _, member := range island.finiteSpreads[property.Pos()] {
					if !interactiveJSXAttribute(member.name) {
						add(member.name)
					}
				}
				continue
			}
			attribute := property.AsJsxAttribute()
			name := jsxAttributeText(attribute.Name())
			if name == "ref" || interactiveJSXAttribute(name) {
				continue
			}
			if attribute.Initializer != nil && ast.IsJsxExpression(attribute.Initializer) {
				expression := attribute.Initializer.AsJsxExpression().Expression
				if expression != nil {
					if binding, exists := lowering.formBindings[expression.Pos()]; exists && binding.name == name {
						continue
					}
					if lowering.clientIslandAttributeReadsState(island, expression) {
						continue
					}
				}
			}
			add(name)
		}
	}
	result := make([]string, 0, len(keys))
	for key := range keys {
		result = append(result, key)
	}
	sort.Strings(result)
	return result
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
	intrinsic := jsxIntrinsic(tagText)
	properties := lowering.serverIslandAttributeProperties(
		opening.Attributes(),
		true,
		lowering.elementID(identityNode),
		finiteSpreads,
	)
	if intrinsic {
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
	arguments := []*ast.Node{
		emittedTag,
		lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList(properties),
			false,
		),
	}
	arguments = append(arguments, lowering.children(children)...)
	helper := lowering.names.componentReceipt
	if intrinsic {
		helper = lowering.names.intrinsicElement
	} else {
		helper = lowering.names.componentReceipt
	}
	return lowering.call(helper, arguments)
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
