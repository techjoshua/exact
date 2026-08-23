package exactcompiler

import (
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

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
	elements := collectComponentElements(sourceFile, typeChecker)
	nodeIDs := expressionNodeIDs(sourceFile)
	for componentIndex, component := range components {
		owned := make([]componentElement, 0)
		for _, element := range elements {
			if componentOwnerIndex(element.node, candidates) == componentIndex {
				owned = append(owned, element)
			}
		}
		owned = promoteStateConnectedClientRanges(
			owned,
			component.Name,
			stateReads,
			stateWrites,
		)
		for index, element := range outerClientIslandElements(owned) {
			node := fullJSXElementNode(element.node)
			finiteSpreads := make(map[int][]finiteSpreadProperty)
			if !ast.IsJsxFragment(element.node) {
				finiteSpreads = islandFiniteSpreads(sourceFile, element.node, typeChecker)
			}
			valueCaptures, functionCaptures := islandCaptures(
				candidates[componentIndex].node,
				node,
				typeChecker,
			)
			valueCaptures, functionCaptures, spreadInputs := finiteSpreadCaptureInputs(
				candidates[componentIndex].node,
				element.node,
				finiteSpreads,
				valueCaptures,
				functionCaptures,
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
				spreadInputs,
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
			activation := analyzeIslandSubtreeActivation(
				sourceFile, node, typeChecker, nodeIDs,
			)
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
				statePaths:       paths,
				interaction:      activation.Mode == "interaction",
				activation:       activation,
				serverSlot:       serverSlot,
				valueCaptures:    valueCaptures,
				functionCaptures: functionCaptures,
				derivedCaptures:  derivedCaptures,
				hasSpread:        !ast.IsJsxFragment(element.node) && islandHasOpaqueSpread(element.node, finiteSpreads),
				finiteSpreads:    finiteSpreads,
			}
		}
	}
	return result
}

// promoteStateConnectedClientRanges gives all client work connected through one mutable state path
// a single durable owner. Without this compile-time coalescing, sibling islands would receive
// independent snapshots and an interaction in one range could not update consumers in another.
func promoteStateConnectedClientRanges(
	elements []componentElement,
	component string,
	reads []StateRead,
	writes []StateWrite,
) []componentElement {
	result := append([]componentElement(nil), elements...)
	for index, element := range result {
		if !element.interactive {
			continue
		}
		minimum, maximum := element.fullStart, element.fullEnd
		connected := false
		for _, write := range writes {
			if write.Component != component || write.Start < element.fullStart || write.Start >= element.fullEnd {
				continue
			}
			for _, read := range reads {
				if read.Component != component || !statePathsAffectEachOther(write.Path, read.Path) ||
					(read.Start >= element.fullStart && read.Start < element.fullEnd) {
					continue
				}
				connected = true
				if read.Start < minimum {
					minimum = read.Start
				}
				if read.Start >= maximum {
					maximum = read.Start + 1
				}
			}
		}
		if !connected {
			continue
		}
		owner := -1
		ownerWidth := int(^uint(0) >> 1)
		for candidateIndex, candidate := range result {
			if candidate.fullStart > minimum || candidate.fullEnd < maximum {
				continue
			}
			width := candidate.fullEnd - candidate.fullStart
			if width < ownerWidth {
				owner = candidateIndex
				ownerWidth = width
			}
		}
		if owner >= 0 && owner != index {
			result[owner].interactive = true
		}
	}
	return result
}

func statePathsAffectEachOther(left []string, right []string) bool {
	limit := min(len(left), len(right))
	if limit == 0 {
		return false
	}
	for index := range limit {
		if left[index] != right[index] {
			return false
		}
	}
	return true
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
