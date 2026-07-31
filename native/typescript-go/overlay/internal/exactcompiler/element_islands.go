package exactcompiler

import (
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
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
	serverSlot       bool
	valueCaptures    []islandValueCapture
	functionCaptures []islandFunctionCapture
	derivedCaptures  []islandDerivedCapture
	hasSpread        bool
}

func indexClientElementIslands(
	sourceFile *ast.SourceFile,
	components []Component,
	stateAliases []StateAlias,
	stateReads []StateRead,
	stateWrites []StateWrite,
	reactiveBindings []ReactiveBinding,
	typeChecker *checker.Checker,
) map[*ast.Node]clientElementIsland {
	result := make(map[*ast.Node]clientElementIsland)
	candidates := activeComponentCandidates(sourceFile)
	if len(candidates) != len(components) {
		return result
	}
	elements := collectComponentElements(sourceFile)
	for componentIndex, component := range components {
		owned := make([]componentElement, 0)
		for _, element := range elements {
			if componentOwnerIndex(element.node, candidates) == componentIndex {
				owned = append(owned, element)
			}
		}
		for index, element := range outerClientIslandElements(owned) {
			node := fullJSXElementNode(element.node)
			valueCaptures, functionCaptures := islandCaptures(
				candidates[componentIndex].node,
				node,
				typeChecker,
			)
			stateCaptures := append([]islandValueCapture(nil), valueCaptures...)
			valueCaptures, derivedCaptures := islandDerivedCaptures(
				candidates[componentIndex].node,
				component.Name,
				valueCaptures,
				reactiveBindings,
			)
			paths := islandStatePaths(
				sourceFile,
				component.Name,
				node,
				stateAliases,
				stateReads,
				stateWrites,
				stateCaptures,
				reactiveBindings,
			)
			paths = islandDerivedStatePaths(
				paths,
				derivedCaptures,
				stateReads,
				stateAliases,
				component.Name,
				candidates[componentIndex],
				typeChecker,
			)
			serverSlot := clientIslandHasServerSlot(component, node)
			islandIndex := index + 1
			result[node] = clientElementIsland{
				component: component,
				node:      node,
				index:     islandIndex,
				id: exactStableID(
					sourceFile.FileName(),
					component.Name,
					"client-island",
					strconv.Itoa(islandIndex),
				),
				name: generatedComponentName(
					component.Name,
					"client-island",
					islandIndex,
				),
				statePaths: paths,
				interaction: interactionHydrationElement(element.node) &&
					!serverSlot,
				serverSlot:       serverSlot,
				valueCaptures:    valueCaptures,
				functionCaptures: functionCaptures,
				derivedCaptures:  derivedCaptures,
				hasSpread:        jsxOpeningHasSpread(element.node),
			}
		}
	}
	return result
}

func islandDerivedStatePaths(
	paths [][]string,
	captures []islandDerivedCapture,
	stateReads []StateRead,
	stateAliases []StateAlias,
	component string,
	candidate componentCandidate,
	typeChecker *checker.Checker,
) [][]string {
	seen := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		seen[strings.Join(path, ".")] = struct{}{}
	}
	for _, capture := range captures {
		for _, read := range stateReads {
			if read.Component != component ||
				read.Start < capture.declaration.Pos() ||
				read.Start >= capture.declaration.End() ||
				len(read.Path) == 0 {
				continue
			}
			key := strings.Join(read.Path, ".")
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			paths = append(paths, append([]string(nil), read.Path...))
		}
	}
	if typeChecker != nil {
		aliases := collectComponentStateAliases(candidate, typeChecker)
		for _, capture := range captures {
			walkNode(capture.declaration, func(node *ast.Node) bool {
				if !ast.IsPropertyAccessExpression(node) &&
					!ast.IsElementAccessExpression(node) &&
					!ast.IsIdentifier(node) {
					return true
				}
				target, eligible := stateReadTarget(node)
				if !eligible || insideStateWriteTarget(node) {
					return true
				}
				path, ok := statePath(
					target,
					aliases.bySymbol,
					typeChecker,
					true,
				)
				if !ok || len(path) == 0 {
					return true
				}
				key := strings.Join(path, ".")
				if _, exists := seen[key]; exists {
					return true
				}
				seen[key] = struct{}{}
				paths = append(paths, path)
				return true
			})
		}
	}
	for _, alias := range stateAliases {
		if alias.Component != component ||
			!hasDescendantStatePath(paths, alias.Path) {
			continue
		}
		filtered := paths[:0]
		for _, path := range paths {
			if !slices.Equal(path, alias.Path) {
				filtered = append(filtered, path)
			}
		}
		paths = filtered
	}
	sort.Slice(paths, func(left int, right int) bool {
		return strings.Join(paths[left], ".") <
			strings.Join(paths[right], ".")
	})
	return paths
}

func islandDerivedCaptures(
	componentNode *ast.Node,
	component string,
	values []islandValueCapture,
	reactiveBindings []ReactiveBinding,
) ([]islandValueCapture, []islandDerivedCapture) {
	bindings := make(map[string]ReactiveBinding)
	for _, binding := range reactiveBindings {
		if binding.Component == component &&
			binding.Provenance == "derived" &&
			binding.SafeToReevaluate {
			bindings[binding.Name] = binding
		}
	}
	if len(bindings) == 0 {
		return values, nil
	}
	declarations := make(map[string]*ast.Node)
	walkNode(componentNode, func(node *ast.Node) bool {
		if ast.IsVariableDeclaration(node) &&
			node.Name() != nil &&
			ast.IsIdentifier(node.Name()) {
			name := node.Name().Text()
			if binding, exists := bindings[name]; exists &&
				binding.Start == node.Name().Pos() {
				declarations[name] = node
			}
		}
		return true
	})
	selected := make(map[string]struct{})
	var selectBinding func(string)
	selectBinding = func(name string) {
		if _, exists := selected[name]; exists {
			return
		}
		binding, exists := bindings[name]
		if !exists || declarations[name] == nil {
			return
		}
		selected[name] = struct{}{}
		for _, dependency := range binding.Dependencies {
			selectBinding(dependency)
		}
	}
	for _, value := range values {
		selectBinding(value.name)
	}
	ordinary := make([]islandValueCapture, 0, len(values))
	for _, value := range values {
		if _, derived := selected[value.name]; !derived {
			ordinary = append(ordinary, value)
		}
	}
	derived := make([]islandDerivedCapture, 0, len(selected))
	for name := range selected {
		declaration := declarations[name]
		derived = append(derived, islandDerivedCapture{
			name:        name,
			start:       declaration.Pos(),
			declaration: declaration,
		})
	}
	sort.Slice(derived, func(left int, right int) bool {
		return derived[left].start < derived[right].start
	})
	return ordinary, derived
}

func jsxOpeningHasSpread(opening *ast.Node) bool {
	attributes := opening.Attributes()
	if attributes == nil {
		return false
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			return true
		}
	}
	return false
}

func islandCaptures(
	component *ast.Node,
	island *ast.Node,
	typeChecker *checker.Checker,
) ([]islandValueCapture, []islandFunctionCapture) {
	if typeChecker == nil {
		return nil, nil
	}
	locals := make(map[ast.SymbolId]islandValueCapture)
	functions := make(map[ast.SymbolId]islandFunctionCapture)
	walkNode(component, func(node *ast.Node) bool {
		if node == island {
			return false
		}
		if node != component &&
			(ast.IsArrowFunction(node) || ast.IsFunctionExpression(node)) {
			return false
		}
		var name *ast.Node
		switch {
		case ast.IsFunctionDeclaration(node):
			if node == component {
				return true
			}
			name = node.Name()
			if name == nil {
				return true
			}
			symbol := typeChecker.GetSymbolAtLocation(name)
			if symbol != nil {
				functions[ast.GetSymbolId(symbol)] = islandFunctionCapture{
					name:        name.Text(),
					symbol:      ast.GetSymbolId(symbol),
					start:       name.Pos(),
					declaration: node,
				}
			}
			return false
		case ast.IsVariableDeclaration(node):
			declaration := node.AsVariableDeclaration()
			if declaration.Initializer == nil {
				return true
			}
			name = declaration.Name()
			if name != nil && ast.IsIdentifier(name) &&
				(ast.IsArrowFunction(declaration.Initializer) ||
					ast.IsFunctionExpression(declaration.Initializer)) {
				symbol := typeChecker.GetSymbolAtLocation(name)
				if symbol != nil {
					functions[ast.GetSymbolId(symbol)] = islandFunctionCapture{
						name:        name.Text(),
						symbol:      ast.GetSymbolId(symbol),
						start:       name.Pos(),
						declaration: node,
					}
				}
				return false
			}
		case ast.IsParameterDeclaration(node):
			name = node.Name()
		default:
			return true
		}
		if name == nil || !ast.IsIdentifier(name) || name.Text() == "this" {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(name)
		if symbol != nil {
			locals[ast.GetSymbolId(symbol)] = islandValueCapture{
				name:   name.Text(),
				symbol: ast.GetSymbolId(symbol),
				start:  name.Pos(),
			}
		}
		return true
	})
	capturedValues := make(map[ast.SymbolId]islandValueCapture)
	capturedFunctions := make(map[ast.SymbolId]islandFunctionCapture)
	walkNode(island, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			isStaticPropertyName(node) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		id := ast.GetSymbolId(symbol)
		if capture, exists := locals[id]; exists {
			capturedValues[id] = capture
		}
		if capture, exists := functions[id]; exists {
			capturedFunctions[id] = capture
		}
		return true
	})
	for changed := true; changed; {
		changed = false
		for _, capture := range capturedFunctions {
			walkNode(capture.declaration, func(node *ast.Node) bool {
				if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
					isStaticPropertyName(node) {
					return true
				}
				symbol := typeChecker.GetSymbolAtLocation(node)
				if symbol == nil {
					return true
				}
				id := ast.GetSymbolId(symbol)
				if value, exists := locals[id]; exists {
					if _, already := capturedValues[id]; !already {
						capturedValues[id] = value
						changed = true
					}
				}
				if function, exists := functions[id]; exists {
					if _, already := capturedFunctions[id]; !already {
						capturedFunctions[id] = function
						changed = true
					}
				}
				return true
			})
		}
	}
	values := make([]islandValueCapture, 0, len(capturedValues))
	for _, capture := range capturedValues {
		values = append(values, capture)
	}
	sort.Slice(values, func(left int, right int) bool {
		return values[left].start < values[right].start
	})
	functionValues := make(
		[]islandFunctionCapture,
		0,
		len(capturedFunctions),
	)
	for _, capture := range capturedFunctions {
		functionValues = append(functionValues, capture)
	}
	sort.Slice(functionValues, func(left int, right int) bool {
		return functionValues[left].start < functionValues[right].start
	})
	return values, functionValues
}

func clientIslandHasServerSlot(
	component Component,
	node *ast.Node,
) bool {
	for _, edge := range component.RenderEdges {
		if edge.Placement != "server" {
			continue
		}
		start, err := strconv.Atoi(edge.Path)
		if err != nil {
			continue
		}
		if start >= node.Pos() && start < node.End() {
			return true
		}
	}
	return false
}

func componentOmittedFromClient(component Component, serverComponents bool) bool {
	if !serverComponents {
		return false
	}
	if component.ClientIslandCount == 0 {
		return false
	}
	for _, target := range component.ArtifactTargets {
		if target == "client" {
			return false
		}
	}
	return true
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
		lowering.clientDefinitions = append(
			lowering.clientDefinitions,
			lowering.clientIslandDefinition(island),
			lowering.factory.NewExpressionStatement(
				componentBrandAttachment(
					lowering.factory,
					lowering.factory.NewIdentifier(island.name),
					island.id,
				),
			),
		)
	}
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
	} else {
		opening = island.node
	}
	tag := openingTag(opening)
	tagText := sourceText(lowering.sourceFile, tag)
	arguments := []*ast.Node{
		lowering.factory.NewStringLiteral(tagText, ast.TokenFlagsNone),
		lowering.factory.NewObjectLiteralExpression(
			lowering.factory.NewNodeList(
				lowering.clientIslandAttributeProperties(
					island,
					opening.Attributes(),
					props,
				),
			),
			false,
		),
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
		lowering.call(lowering.names.element, arguments),
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
		} else {
			value = lowering.factory.NewPropertyAccessExpression(
				props,
				nil,
				lowering.factory.NewIdentifier(name),
				ast.NodeFlagsNone,
			)
		}
		properties = append(
			properties,
			lowering.property(jsxPropertyName(lowering.factory, name), value),
		)
	}
	return properties
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
			read.Start < node.Pos() || read.Start >= node.End() {
			continue
		}
		add(read.Path)
	}
	for _, write := range stateWrites {
		if write.Component == component &&
			write.Start >= node.Pos() &&
			write.Start < node.End() {
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

func interactionHydrationElement(opening *ast.Node) bool {
	attributes := opening.Attributes()
	if attributes == nil {
		return false
	}
	hasActivation := false
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			if !ast.IsObjectLiteralExpression(
				property.AsJsxSpreadAttribute().Expression,
			) {
				return false
			}
			continue
		}
		attribute := property.AsJsxAttribute()
		name := jsxAttributeText(attribute.Name())
		if name == "ref" {
			return false
		}
		if interactiveJSXAttribute(name) {
			if _, activation := interactionHydrationEvents[name]; !activation {
				return false
			}
			hasActivation = true
		}
	}
	return hasActivation
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
		)...,
	)
	if island.interaction {
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

func (lowering *jsxLowering) serverIslandFallback(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
) *ast.Node {
	tag := openingTag(opening)
	tagText := sourceText(lowering.sourceFile, tag)
	properties := lowering.serverIslandAttributeProperties(
		opening.Attributes(),
		true,
		lowering.elementID(identityNode),
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

var interactionHydrationEvents = map[string]struct{}{
	"onAuxClick": {}, "onAuxClickCapture": {},
	"onBeforeInput": {}, "onBeforeInputCapture": {},
	"onBlur": {}, "onBlurCapture": {},
	"onChange": {}, "onChangeCapture": {},
	"onClick": {}, "onClickCapture": {},
	"onCompositionEnd": {}, "onCompositionEndCapture": {},
	"onCompositionStart": {}, "onCompositionStartCapture": {},
	"onCompositionUpdate": {}, "onCompositionUpdateCapture": {},
	"onContextMenu": {}, "onContextMenuCapture": {},
	"onDoubleClick": {}, "onDoubleClickCapture": {},
	"onDragEnd": {}, "onDragEndCapture": {},
	"onDragEnter": {}, "onDragEnterCapture": {},
	"onDragLeave": {}, "onDragLeaveCapture": {},
	"onDragOver": {}, "onDragOverCapture": {},
	"onDragStart": {}, "onDragStartCapture": {},
	"onDrop": {}, "onDropCapture": {},
	"onFocus": {}, "onFocusCapture": {},
	"onFocusIn": {}, "onFocusInCapture": {},
	"onFocusOut": {}, "onFocusOutCapture": {},
	"onInput": {}, "onInputCapture": {},
	"onKeyDown": {}, "onKeyDownCapture": {},
	"onKeyUp": {}, "onKeyUpCapture": {},
	"onMouseDown": {}, "onMouseDownCapture": {},
	"onMouseUp": {}, "onMouseUpCapture": {},
	"onPointerDown": {}, "onPointerDownCapture": {},
	"onPointerUp": {}, "onPointerUpCapture": {},
	"onSubmit": {}, "onSubmitCapture": {},
	"onTouchEnd": {}, "onTouchEndCapture": {},
	"onTouchStart": {}, "onTouchStartCapture": {},
	"onWheel": {}, "onWheelCapture": {},
}
