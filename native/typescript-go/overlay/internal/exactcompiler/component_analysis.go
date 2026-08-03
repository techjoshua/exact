package exactcompiler

import (
	"fmt"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type componentElement struct {
	node        *ast.Node
	tag         string
	intrinsic   bool
	interactive bool
	fullStart   int
	fullEnd     int
}

// analyzeComponents resolves task, JSX, callable, context, and platform facts
// into artifact placement owned entirely by the native compiler process.
func analyzeComponents(
	sourceFile *ast.SourceFile,
	components []Component,
	callables callableAnalysis,
	tasks []Task,
	typeChecker *checker.Checker,
) []Component {
	candidates := activeComponentCandidates(sourceFile)
	if len(candidates) != len(components) {
		return components
	}
	elements := collectComponentElements(sourceFile)
	contextRoots := moduleContextTokenRoots(sourceFile)

	for index := range components {
		component := &components[index]
		candidate := candidates[index]
		clientEffects, serverEffects := false, false
		clientTaskEffects := false
		indivisible := ""
		opaquePath := ""
		splitBoundaries := make(map[string]struct{})
		contexts := componentContextEffects(
			candidate,
			index,
			candidates,
			sourceFile,
			typeChecker,
		)
		diagnostics := []string{}
		taskActivations := make(map[string]struct{})
		for _, task := range tasks {
			if task.Component == component.Name &&
				task.Start >= component.Start &&
				task.Start+task.Length <= component.Start+component.Length {
				taskActivations[fmt.Sprintf("%d:%d", task.Start, task.Length)] = struct{}{}
			}
		}

		// A task-owning component is classified from its non-task setup walk and
		// the task placements below. The callable summary intentionally includes
		// task bodies, whose distributed effects must not become indivisible setup.
		if setup, exists := callables.byNode[candidate.node]; exists {
			contexts = append(contexts, setup.Contexts...)
			if len(taskActivations) == 0 {
				switch setup.Effect {
				case "browser":
					clientEffects = true
				case "server":
					serverEffects = true
				case "mixed":
					indivisible = setup.Effect
					diagnostics = append(
						diagnostics,
						"error: component setup has mixed placement effects ("+
							effectSourcePath(setup.EffectSources)+")",
					)
				case "unknown":
					knownBrowser, knownServer := knownEffectEnvironments(setup.EffectSources)
					switch {
					case knownBrowser && knownServer:
						indivisible = "mixed"
						diagnostics = append(
							diagnostics,
							"error: component setup has mixed placement effects ("+
								effectSourcePath(setup.EffectSources)+")",
						)
					case knownBrowser:
						clientEffects = true
					case knownServer:
						serverEffects = true
					default:
						indivisible = "unknown"
						opaquePath = effectSourcePath(setup.EffectSources)
					}
				}
			}
		}

		ownedElements := make([]componentElement, 0)
		for _, element := range elements {
			if componentOwnerIndex(element.node, candidates) != index ||
				insideTaskSpan(element.node.Pos(), tasks, component.Name) {
				continue
			}
			ownedElements = append(ownedElements, element)
			if element.interactive {
				clientEffects = true
				for _, attribute := range jsxAttributeNames(element.node) {
					if attribute == "ref" {
						splitBoundaries["ref"] = struct{}{}
					} else if interactiveJSXAttribute(attribute) {
						splitBoundaries["event-handler"] = struct{}{}
					}
				}
			}
		}
		component.ClientIslandCount = outerClientIslandCount(ownedElements)

		walkNode(candidate.node, func(node *ast.Node) bool {
			owner := componentOwnerIndex(node, candidates)
			if owner != index {
				return owner < 0
			}
			if insideTaskSpan(node.Pos(), tasks, component.Name) {
				if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) &&
					!isStaticPropertyName(node) {
					name := node.Text()
					symbol := typeChecker.GetSymbolAtLocation(node)
					if _, browser := browserGlobals[name]; browser &&
						symbolIsOutsideSource(symbol, sourceFile) {
						splitBoundaries["browser:"+name] = struct{}{}
					}
					if serverOnlyImportSymbol(symbol) {
						splitBoundaries["server-import:"+name] = struct{}{}
					}
				}
				return true
			}
			if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) &&
				!isStaticPropertyName(node) {
				name := node.Text()
				symbol := typeChecker.GetSymbolAtLocation(node)
				if _, browser := browserGlobals[name]; browser &&
					symbolIsOutsideSource(symbol, sourceFile) {
					clientEffects = true
					splitBoundaries["browser:"+name] = struct{}{}
				}
				if serverOnlyImportSymbol(symbol) {
					serverEffects = true
					splitBoundaries["server-import:"+name] = struct{}{}
				}
			}
			if ast.IsCallExpression(node) {
				if _, activation := taskActivations[nodeSpanKey(node)]; activation {
					return true
				}
				call := node.AsCallExpression()
				target, exists := callableEffectForCall(callables, node.Pos())
				if !exists {
					symbol := resolvedCallableSymbol(
						callTargetSymbol(call.Expression, typeChecker),
						typeChecker,
					)
					if symbol != nil {
						target, exists = callables.bySymbol[ast.GetSymbolId(symbol)]
					}
				}
				if exists {
					switch target.Effect {
					case "browser":
						clientEffects = true
						splitBoundaries["browser-call:"+strings.TrimSpace(
							sourceText(sourceFile, call.Expression),
						)] = struct{}{}
					case "server":
						serverEffects = true
						splitBoundaries["server-call:"+strings.TrimSpace(
							sourceText(sourceFile, call.Expression),
						)] = struct{}{}
					case "mixed":
						indivisible = target.Effect
					case "unknown":
						knownBrowser, knownServer := knownEffectEnvironments(target.EffectSources)
						switch {
						case knownBrowser && knownServer:
							indivisible = "mixed"
						case knownBrowser:
							clientEffects = true
							splitBoundaries["browser-call:"+strings.TrimSpace(
								sourceText(sourceFile, call.Expression),
							)] = struct{}{}
						case knownServer:
							serverEffects = true
							splitBoundaries["server-call:"+strings.TrimSpace(
								sourceText(sourceFile, call.Expression),
							)] = struct{}{}
						default:
							indivisible = "unknown"
							if opaquePath == "" {
								opaquePath = effectSourcePath(target.EffectSources)
							}
						}
					}
				}
			}
			return true
		})

		for _, task := range tasks {
			if task.Component != component.Name ||
				task.Start < component.Start ||
				task.Start+task.Length > component.Start+component.Length {
				continue
			}
			if task.Placement == "client" || task.Placement == "isomorphic" {
				clientEffects = true
				clientTaskEffects = true
			}
			if task.Placement == "server" || task.Placement == "isomorphic" {
				serverEffects = true
			}
			contexts = append(contexts, task.Contexts...)
			diagnostics = append(diagnostics, task.Diagnostics...)
		}

		// Opaque ordinary calls cannot erase a placement requirement proven by
		// browser globals, server imports, interactive JSX, or authored task policy.
		if indivisible == "unknown" && (clientEffects || serverEffects) {
			indivisible = ""
		}
		if indivisible == "unknown" {
			diagnostics = append(
				diagnostics,
				"error: component placement depends on an opaque call ("+
					opaquePath+")",
			)
		}
		component.Contexts = uniqueContextEffects(contexts)
		component.EnhancementContexts = enhancementContextEffects(
			component.Contexts,
			contextRoots,
		)
		component.SplitBoundaries = sortedSet(splitBoundaries)
		component.Diagnostics = uniqueStrings(diagnostics)
		component.EnvironmentEffect = "neutral"
		if indivisible != "" {
			component.EnvironmentEffect = indivisible
			component.Placement = "unknown"
		} else {
			if serverEffects {
				component.EnvironmentEffect = "server"
			} else if clientEffects {
				component.EnvironmentEffect = "browser"
			}
			switch {
			case clientEffects && serverEffects:
				component.Placement = "isomorphic"
			case serverEffects:
				component.Placement = "server"
			case clientEffects:
				component.Placement = "client"
			default:
				component.Placement = "isomorphic"
			}
		}
		component.SubgraphPlacement = component.Placement
		switch {
		case component.Placement == "unknown":
			component.ArtifactTargets = []string{}
		case serverEffects && clientTaskEffects:
			component.ArtifactTargets = []string{"client", "server"}
		case serverEffects:
			component.ArtifactTargets = []string{"server"}
		case clientEffects:
			component.ArtifactTargets = []string{"client"}
		default:
			component.ArtifactTargets = []string{"client", "server"}
		}

	}
	localComponents := uniqueComponentNames(components)
	nodeIDs := expressionNodeIDs(sourceFile)
	for index := range components {
		component := &components[index]
		edges := []RenderEdge{}
		for _, element := range elements {
			if element.intrinsic ||
				componentOwnerIndex(element.node, candidates) != index ||
				insideTaskSpan(element.node.Pos(), tasks, component.Name) {
				continue
			}
			targetIndex, exists := localComponents[element.tag]
			if !exists {
				continue
			}
			target := components[targetIndex]
			edgeIndex := len(edges) + 1
			edges = append(edges, RenderEdge{
				ID:          fmt.Sprintf("%s:render:%d:%s", component.Name, element.node.Pos(), element.tag),
				NodeID:      nodeIDs[element.node],
				Tag:         element.tag,
				Name:        target.Name,
				ComponentID: target.ID,
				Placement:   target.Placement,
				Boundary:    target.Placement,
				Index:       edgeIndex,
				Path:        fmt.Sprintf("%d", element.node.Pos()),
			})
		}
		component.RenderEdges = edges
	}
	resolveComponentSubgraphs(sourceFile, components)
	return components
}

func enhancementContextEffects(
	effects []ContextEffect,
	moduleRoots map[string]struct{},
) EnhancementContextEffects {
	optionalSet := make(map[string]struct{})
	provides := []string{}
	requires := []string{}
	for _, effect := range effects {
		if effect.Confidence != "exact" || effect.Token == "unknown" {
			continue
		}
		if !enhancementContextTokenIsModuleScoped(effect.Token, moduleRoots) {
			continue
		}
		switch effect.Kind {
		case "write":
			provides = append(provides, effect.Token)
		case "probe":
			optionalSet[effect.Token] = struct{}{}
		case "read":
			requires = append(requires, effect.Token)
		}
	}
	filteredRequires := make([]string, 0, len(requires))
	for _, token := range requires {
		if _, optional := optionalSet[token]; !optional {
			filteredRequires = append(filteredRequires, token)
		}
	}
	return EnhancementContextEffects{
		Provides:           uniqueStrings(provides),
		Requires:           uniqueStrings(filteredRequires),
		OptionallyConsumes: sortedSet(optionalSet),
	}
}

func enhancementContextTokenIsModuleScoped(
	token string,
	moduleRoots map[string]struct{},
) bool {
	root := strings.SplitN(token, ".", 2)[0]
	_, exists := moduleRoots[root]
	return exists
}

func moduleContextTokenRoots(sourceFile *ast.SourceFile) map[string]struct{} {
	result := make(map[string]struct{})
	for _, statement := range sourceFile.Statements.Nodes {
		switch {
		case ast.IsImportDeclaration(statement):
			declaration := statement.AsImportDeclaration()
			clause := declaration.ImportClause
			if clause == nil {
				continue
			}
			if clause.Name() != nil {
				result[clause.Name().Text()] = struct{}{}
			}
			bindings := clause.AsImportClause().NamedBindings
			if bindings == nil {
				continue
			}
			if ast.IsNamespaceImport(bindings) {
				result[bindings.Name().Text()] = struct{}{}
			} else if ast.IsNamedImports(bindings) {
				for _, element := range bindings.AsNamedImports().Elements.Nodes {
					result[element.Name().Text()] = struct{}{}
				}
			}
		case ast.IsVariableStatement(statement):
			for _, declaration := range statement.AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes {
				name := declaration.Name()
				if name != nil && ast.IsIdentifier(name) {
					result[name.Text()] = struct{}{}
				}
			}
		case ast.IsFunctionDeclaration(statement), ast.IsClassDeclaration(statement):
			if statement.Name() != nil {
				result[statement.Name().Text()] = struct{}{}
			}
		}
	}
	return result
}

// knownEffectEnvironments preserves proven placement when a callable also
// contains unresolved ordinary calls. Unknown evidence must not erase a known
// browser or server requirement, but evidence for both remains indivisible.
func knownEffectEnvironments(
	sources []EnvironmentEffectSource,
) (browser bool, server bool) {
	for _, source := range sources {
		browser = browser || source.Environment == "browser"
		server = server || source.Environment == "server"
	}
	return browser, server
}

func componentContextEffects(
	candidate componentCandidate,
	owner int,
	candidates []componentCandidate,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) []ContextEffect {
	result := []ContextEffect{}
	walkNode(candidate.node, func(node *ast.Node) bool {
		currentOwner := componentOwnerIndex(node, candidates)
		if currentOwner != owner {
			return currentOwner < 0
		}
		if ast.IsCallExpression(node) {
			if effect, ok := contextEffect(
				node.AsCallExpression(),
				sourceFile,
				typeChecker,
			); ok {
				result = append(result, effect)
			}
		}
		return true
	})
	return result
}

func callableEffectForCall(
	callables callableAnalysis,
	position int,
) (CallableSummary, bool) {
	suffix := fmt.Sprintf(":call:%d", position)
	for _, fact := range callables.facts {
		for _, edge := range fact.summary.Calls {
			if !edge.Resolved || !strings.HasSuffix(edge.ID, suffix) {
				continue
			}
			for _, target := range callables.facts {
				if target.summary.ID == edge.TargetID {
					return target.summary, true
				}
			}
			for _, target := range fact.externalTargets {
				if target.ID == edge.TargetID {
					return target, true
				}
			}
		}
	}
	return CallableSummary{}, false
}

func activeComponentCandidates(sourceFile *ast.SourceFile) []componentCandidate {
	result := []componentCandidate{}
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) != 0 {
			result = append(result, candidate)
		}
	}
	sort.Slice(result, func(left int, right int) bool {
		return result[left].node.Pos() < result[right].node.Pos()
	})
	return result
}

func collectComponentElements(sourceFile *ast.SourceFile) []componentElement {
	result := []componentElement{}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		var tag *ast.Node
		switch {
		case ast.IsJsxOpeningElement(node):
			tag = node.AsJsxOpeningElement().TagName
		case ast.IsJsxSelfClosingElement(node):
			tag = node.AsJsxSelfClosingElement().TagName
		default:
			return true
		}
		tagText := strings.TrimSpace(sourceText(sourceFile, tag))
		full := node
		if ast.IsJsxOpeningElement(node) && node.Parent != nil &&
			ast.IsJsxElement(node.Parent) {
			full = node.Parent
		}
		interactive := false
		for _, name := range jsxAttributeNames(node) {
			interactive = interactive || interactiveJSXAttribute(name)
		}
		result = append(result, componentElement{
			node:        node,
			tag:         tagText,
			intrinsic:   jsxIntrinsic(tagText),
			interactive: interactive,
			fullStart:   full.Pos(),
			fullEnd:     full.End(),
		})
		return true
	})
	return result
}

func jsxAttributeNames(node *ast.Node) []string {
	var attributes *ast.Node
	if ast.IsJsxOpeningElement(node) {
		attributes = node.AsJsxOpeningElement().Attributes
	} else if ast.IsJsxSelfClosingElement(node) {
		attributes = node.AsJsxSelfClosingElement().Attributes
	}
	if attributes == nil {
		return nil
	}
	result := []string{}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if !ast.IsJsxAttribute(property) {
			continue
		}
		name := property.AsJsxAttribute().Name()
		if ast.IsJsxNamespacedName(name) {
			namespaced := name.AsJsxNamespacedName()
			result = append(
				result,
				namespaced.Namespace.Text()+":"+namespaced.Name().Text(),
			)
		} else {
			result = append(result, name.Text())
		}
	}
	return result
}

func interactiveJSXAttribute(name string) bool {
	if name == "ref" || name == "value:input" || name == "value:change" ||
		name == "checked:change" {
		return true
	}
	if !strings.HasPrefix(name, "on") {
		return false
	}
	remainder := strings.TrimPrefix(name, "on")
	first, _ := utf8.DecodeRuneInString(remainder)
	return first != utf8.RuneError && unicode.IsUpper(first)
}

func outerClientIslandCount(elements []componentElement) int {
	return len(outerClientIslandElements(elements))
}

func componentOwnerIndex(node *ast.Node, candidates []componentCandidate) int {
	owner := -1
	width := int(^uint(0) >> 1)
	for index, candidate := range candidates {
		if node.Pos() < candidate.node.Pos() || node.End() > candidate.node.End() {
			continue
		}
		candidateWidth := candidate.node.End() - candidate.node.Pos()
		if candidateWidth < width {
			owner = index
			width = candidateWidth
		}
	}
	return owner
}

func insideTaskSpan(position int, tasks []Task, component string) bool {
	for _, task := range tasks {
		if task.Component != component {
			continue
		}
		if position >= task.Start && position < task.Start+task.Length {
			return true
		}
		if task.FunctionDefined &&
			position >= task.WorkStart &&
			position < task.WorkStart+task.WorkLength {
			return true
		}
	}
	return false
}

func uniqueComponentNames(components []Component) map[string]int {
	result := make(map[string]int)
	duplicates := make(map[string]struct{})
	for index, component := range components {
		if _, exists := result[component.Name]; exists {
			duplicates[component.Name] = struct{}{}
		} else {
			result[component.Name] = index
		}
	}
	for duplicate := range duplicates {
		delete(result, duplicate)
	}
	return result
}

func resolveComponentSubgraphs(
	sourceFile *ast.SourceFile,
	components []Component,
) {
	byID := make(map[string]int, len(components))
	for index, component := range components {
		byID[component.ID] = index
	}
	changed := true
	for changed {
		changed = false
		for index := range components {
			placements := []string{components[index].Placement}
			for _, edge := range components[index].RenderEdges {
				if target, exists := byID[edge.ComponentID]; exists {
					placements = append(placements, components[target].SubgraphPlacement)
				} else {
					placements = append(placements, edge.Placement)
				}
			}
			next := combinePlacements(placements)
			if next != components[index].SubgraphPlacement {
				components[index].SubgraphPlacement = next
				changed = true
			}
		}
	}
}

func nativeComponentID(sourceFile *ast.SourceFile, start int) string {
	for _, candidate := range activeComponentCandidates(sourceFile) {
		if candidate.node.Pos() == start {
			return nativeComponentIDForNode(sourceFile, candidate.node)
		}
	}
	return exactStableID(
		sourceFile.FileName(),
		fmt.Sprintf("component:%s:%d", sourceFile.FileName(), start),
	)
}

func nativeComponentIDForNode(
	sourceFile *ast.SourceFile,
	node *ast.Node,
) string {
	return exactStableID(
		sourceFile.FileName(),
		expressionNodeIDs(sourceFile)[node],
	)
}

func combinePlacements(placements []string) string {
	client, server, unknown := false, false, false
	for _, placement := range placements {
		switch placement {
		case "isomorphic":
			client, server = true, true
		case "client":
			client = true
		case "server":
			server = true
		default:
			unknown = true
		}
	}
	if client && server {
		return "isomorphic"
	}
	if client {
		return "client"
	}
	if server {
		return "server"
	}
	if unknown {
		return "unknown"
	}
	return "server"
}

func sortedSet(values map[string]struct{}) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func effectSourcePath(sources []EnvironmentEffectSource) string {
	if len(sources) == 0 {
		return "unknown"
	}
	return strings.Join(sources[0].Path, " -> ")
}
