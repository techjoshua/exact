package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/tspath"
)

type projectComponent struct {
	sourceFile     *ast.SourceFile
	candidate      componentCandidate
	candidateIndex int
	component      Component
}

type projectComponentLinkFacts struct {
	edges       []RenderEdge
	diagnostics []string
}

// linkProjectComponents resolves JSX component tags by checker symbol across
// every project source and computes one cross-file placement fixed point.
// Only components from the requested module are returned.
func linkProjectComponents(
	project *projectState,
	requested *ast.SourceFile,
	typeChecker *checker.Checker,
	current []Component,
	callables callableAnalysis,
) []Component {
	ensureProjectComponentCaches(project)
	if project.componentCache != nil {
		if cached, exists := project.componentCache[requested]; exists {
			project.counters.ComponentResultCacheHits++
			return append([]Component(nil), cached...)
		}
	}
	records := projectComponentRecords(
		project,
		requested,
		typeChecker,
		current,
		callables,
	)
	componentBySymbol := make(map[ast.SymbolId]int, len(records))
	componentByIdentity := make(map[string]int, len(records))
	componentByImport := make(map[string]int, len(records))
	importBindingsBySource := make(map[*ast.SourceFile]externalImportBindings)
	for index := range records {
		symbol := callableDeclarationSymbol(records[index].candidate.node, typeChecker)
		symbol = resolvedCallableSymbol(symbol, typeChecker)
		if symbol != nil {
			componentBySymbol[ast.GetSymbolId(symbol)] = index
			if identity := projectComponentSymbolIdentity(symbol); identity != "" {
				componentByIdentity[identity] = index
			}
		}
		if records[index].component.Exported {
			module := projectComponentModuleIdentity(records[index].sourceFile.FileName())
			componentByImport[module+"\x00"+records[index].component.Name] = index
			if ast.HasSyntacticModifier(
				records[index].candidate.node,
				ast.ModifierFlagsDefault,
			) {
				componentByImport[module+"\x00default"] = index
			}
		}
	}
	for index := range records {
		record := &records[index]
		edges := []RenderEdge{}
		if facts, exists := project.componentLinks[record.candidate.node]; exists {
			record.component.RenderEdges = append([]RenderEdge(nil), facts.edges...)
			record.component.Diagnostics = append(record.component.Diagnostics, facts.diagnostics...)
			continue
		}
		project.counters.ComponentLinkWalks++
		candidates := projectComponentCandidates(project, record.sourceFile)
		nodeIDs := projectComponentNodeIDs(project, record.sourceFile)
		diagnosticCount := len(record.component.Diagnostics)
		walkNode(record.candidate.node, func(node *ast.Node) bool {
			if componentOwnerIndex(node, candidates) != record.candidateIndex {
				return false
			}
			tag := jsxTagNode(node)
			if tag == nil {
				return true
			}
			tagText := strings.TrimSpace(sourceText(record.sourceFile, tag))
			if tagText == "_" || tagText == "_target" || jsxIntrinsic(tagText) {
				return true
			}
			symbol := resolvedCallableSymbol(
				typeChecker.GetSymbolAtLocation(jsxTagSymbolNode(tag)),
				typeChecker,
			)
			targetIndex, exists := -1, false
			if symbol != nil {
				targetIndex, exists = componentBySymbol[ast.GetSymbolId(symbol)]
				if !exists {
					identity := projectComponentSymbolIdentity(symbol)
					targetIndex, exists = componentByIdentity[identity]
				}
			}
			if !exists {
				if value, resolved := resolveJSXRegistryComponentValue(
					tag,
					record.sourceFile,
					typeChecker,
				); resolved {
					for _, possible := range value {
						possibleIndex, found := componentIndexForSymbol(
							possible.symbol,
							componentBySymbol,
							componentByIdentity,
						)
						if !found {
							continue
						}
						target := records[possibleIndex]
						edgeIndex := len(edges) + 1
						edges = append(edges, RenderEdge{
							ID: fmt.Sprintf(
								"%s:render:%d:%s",
								record.component.ID,
								node.Pos(),
								possible.tag,
							),
							NodeID:      nodeIDs[node],
							Tag:         possible.tag,
							Name:        target.component.Name,
							ComponentID: target.component.ID,
							Placement:   target.component.Placement,
							Boundary:    target.component.Placement,
							Index:       edgeIndex,
							Path:        fmt.Sprintf("%d", node.Pos()),
						})
					}
					return true
				}
				if jsxTagResolvesToLocalValue(tag, record.sourceFile, typeChecker) {
					value, resolved := resolveJSXComponentValue(
						tag,
						record.sourceFile,
						typeChecker,
					)
					if resolved {
						for _, possible := range value {
							possibleIndex, found := componentIndexForSymbol(
								possible.symbol,
								componentBySymbol,
								componentByIdentity,
							)
							if !found {
								continue
							}
							target := records[possibleIndex]
							edgeIndex := len(edges) + 1
							edges = append(edges, RenderEdge{
								ID: fmt.Sprintf(
									"%s:render:%d:%s",
									record.component.ID,
									node.Pos(),
									possible.tag,
								),
								NodeID:      nodeIDs[node],
								Tag:         possible.tag,
								Name:        target.component.Name,
								ComponentID: target.component.ID,
								Placement:   target.component.Placement,
								Boundary:    target.component.Placement,
								Index:       edgeIndex,
								Path:        fmt.Sprintf("%d", node.Pos()),
							})
						}
						return true
					}
					if scalarDerivedType(typeChecker.GetTypeAtLocation(tag)) {
						appendComponentDiagnostic(
							&record.component,
							"error: JSX component-position value is not callable or constructable and cannot be a dynamic component",
						)
					}
					// Other TypeScript-valid local values are open dynamic boundaries.
					// Shared analysis reports their acknowledgement warning.
					return true
				}
				bindings := importBindingsBySource[record.sourceFile]
				if bindings.byName == nil {
					bindings = collectExternalImportBindings(record.sourceFile, typeChecker)
					importBindingsBySource[record.sourceFile] = bindings
				}
				reference, imported := externalImportForExpression(tag, bindings, typeChecker)
				if !imported {
					appendComponentDiagnostic(
						&record.component,
						jsxComponentResolutionDiagnostic(
							tag,
							record.sourceFile,
							typeChecker,
						),
					)
					return true
				}
				if exactCoreStructuralReference(reference.moduleSpecifier, reference.exportName) {
					return true
				}
				localIdentity := importedProjectComponentIdentity(
					record.sourceFile,
					reference,
				)
				if localIdentity != "" {
					if localTarget, resolved := componentByImport[localIdentity]; resolved {
						targetIndex, exists = localTarget, true
					}
				}
				if exists {
					// Continue below so local imports use the same render-edge
					// representation as checker-resolved component symbols.
				} else {
					// Compiled dependencies are opaque. Target-specific exports
					// carry runtime ownership without imported compiler analysis.
					if diagnostic := jsxComponentResolutionDiagnostic(
						tag,
						record.sourceFile,
						typeChecker,
					); strings.Contains(diagnostic, "type-only import") {
						appendComponentDiagnostic(&record.component, diagnostic)
					}
					edgeIndex := len(edges) + 1
					edges = append(edges, RenderEdge{
						ID: fmt.Sprintf(
							"%s:render:%d:%s",
							record.component.ID,
							node.Pos(),
							tagText,
						),
						NodeID:          nodeIDs[node],
						Tag:             tagText,
						Name:            reference.exportName,
						ModuleSpecifier: reference.moduleSpecifier,
						ExportName:      reference.exportName,
						// Opaque packages publish their precise placement separately.
						// Keeping the owner placement here preserves existing lowering.
						Placement: record.component.Placement,
						Boundary:  record.component.Placement,
						Index:     edgeIndex,
						Path:      fmt.Sprintf("%d", node.Pos()),
					})
					return true
				}
			}
			target := records[targetIndex]
			edgeIndex := len(edges) + 1
			edges = append(edges, RenderEdge{
				ID: fmt.Sprintf(
					"%s:render:%d:%s",
					record.component.ID,
					node.Pos(),
					tagText,
				),
				NodeID:      nodeIDs[node],
				Tag:         tagText,
				Name:        target.component.Name,
				ComponentID: target.component.ID,
				Placement:   target.component.Placement,
				Boundary:    target.component.Placement,
				Index:       edgeIndex,
				Path:        fmt.Sprintf("%d", node.Pos()),
			})
			return true
		})
		record.component.RenderEdges = edges
		project.componentLinks[record.candidate.node] = projectComponentLinkFacts{
			edges:       append([]RenderEdge(nil), edges...),
			diagnostics: append([]string(nil), record.component.Diagnostics[diagnosticCount:]...),
		}
	}
	refreshProjectComponentEdgePlacements(records)
	resolveProjectComponentSubgraphs(records)

	result := []Component{}
	for _, record := range records {
		if record.sourceFile == requested {
			result = append(result, record.component)
		}
	}
	sort.Slice(result, func(left int, right int) bool {
		return result[left].Start < result[right].Start
	})
	cacheRequestedComponents(project, requested, result)
	return result
}

// applyJSXInteropBoundaries keeps foreign, compiler-unproven component values behind the explicit
// compatibility boundary. The configured client adapter can brand and mount them; a server
// artifact cannot safely execute that runtime-owned value or promise that its markup is hydratable.
func applyJSXInteropBoundaries(components []Component) []Component {
	result := append([]Component(nil), components...)
	for componentIndex := range result {
		component := &result[componentIndex]
		component.RenderEdges = append([]RenderEdge(nil), component.RenderEdges...)
		for edgeIndex := range component.RenderEdges {
			edge := &component.RenderEdges[edgeIndex]
			if edge.ModuleSpecifier == "" || edge.ComponentID != "" {
				continue
			}
			edge.Placement = "client"
			edge.Boundary = "client"
		}
	}
	return result
}

func jsxTagResolvesToLocalValue(
	tag *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	root := jsxTagSymbolNode(tag)
	if root == nil {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(root)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if ast.GetSourceFileOfNode(declaration) == sourceFile &&
			enclosingImportDeclaration(declaration) == nil {
			return true
		}
	}
	return false
}

func jsxTagResolvesToCallableValue(
	tag *ast.Node,
	typeChecker *checker.Checker,
) bool {
	symbol := resolvedCallableSymbol(
		typeChecker.GetSymbolAtLocation(jsxTagSymbolNode(tag)),
		typeChecker,
	)
	if symbol == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if ast.IsFunctionDeclaration(declaration) {
			return true
		}
		if ast.IsVariableDeclaration(declaration) {
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer != nil &&
				(ast.IsArrowFunction(initializer) ||
					ast.IsFunctionExpression(initializer)) {
				return true
			}
		}
	}
	return false
}

type jsxComponentValueTarget struct {
	symbol *ast.Symbol
	tag    string
}

// resolveJSXRegistryComponentValue recognizes static members, immutable
// aliases, and finite indexed selections rooted in createComponentRegistry().
// Lazy entries remain opaque render targets until their target-local artifact
// is loaded, while eager local entries contribute precise component edges.
func resolveJSXRegistryComponentValue(
	tag *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) ([]jsxComponentValueTarget, bool) {
	root := tag
	if ast.IsIdentifier(tag) {
		symbol := typeChecker.GetSymbolAtLocation(tag)
		if symbol == nil {
			return nil, false
		}
		for _, declaration := range symbol.Declarations {
			if !ast.IsVariableDeclaration(declaration) ||
				declaration.Parent == nil ||
				!ast.IsVariableDeclarationList(declaration.Parent) ||
				declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
				continue
			}
			if componentValueSymbolIsWrittenAfter(
				symbol,
				declaration.End(),
				sourceFile,
				typeChecker,
			) {
				return nil, false
			}
			root = declaration.AsVariableDeclaration().Initializer
			break
		}
	}
	if root == nil {
		return nil, false
	}

	var registryExpression *ast.Node
	selectedKey := ""
	switch {
	case ast.IsPropertyAccessExpression(root):
		member := root.AsPropertyAccessExpression()
		registryExpression = member.Expression
		selectedKey = member.Name().Text()
	case ast.IsElementAccessExpression(root):
		member := root.AsElementAccessExpression()
		registryExpression = member.Expression
		argument := member.ArgumentExpression
		if argument != nil &&
			(ast.IsStringLiteral(argument) || ast.IsNoSubstitutionTemplateLiteral(argument)) {
			selectedKey = argument.Text()
		}
	default:
		return nil, false
	}

	definition := componentRegistryDefinition(
		registryExpression,
		sourceFile,
		typeChecker,
	)
	if definition == nil {
		return nil, false
	}
	targets := []jsxComponentValueTarget{}
	for _, property := range definition.AsObjectLiteralExpression().Properties.Nodes {
		key, value, valid := componentRegistryProperty(property)
		if !valid || (selectedKey != "" && key != selectedKey) {
			continue
		}
		if ast.IsCallExpression(value) &&
			strings.TrimSpace(sourceText(
				sourceFile,
				value.AsCallExpression().Expression,
			)) == "lazy" {
			targets = append(targets, jsxComponentValueTarget{tag: key})
			continue
		}
		resolved, ok := resolveJSXComponentValueExpression(
			value,
			sourceFile,
			typeChecker,
			make(map[ast.SymbolId]bool),
		)
		if !ok {
			// The registry runtime retains safe provenance even when an entry
			// is imported or otherwise opaque to this project compilation.
			targets = append(targets, jsxComponentValueTarget{tag: key})
			continue
		}
		for index := range resolved {
			resolved[index].tag = key
		}
		targets = append(targets, resolved...)
	}
	return uniqueJSXComponentValueTargets(targets), len(targets) > 0
}

func componentRegistryDefinition(
	expression *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) *ast.Node {
	if expression == nil {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(expression)
	if symbol == nil {
		return nil
	}
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) ||
			declaration.Parent == nil ||
			!ast.IsVariableDeclarationList(declaration.Parent) ||
			declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		call := declaration.AsVariableDeclaration().Initializer
		if call == nil || !ast.IsCallExpression(call) {
			continue
		}
		invocation := call.AsCallExpression()
		if strings.TrimSpace(sourceText(sourceFile, invocation.Expression)) !=
			"createComponentRegistry" ||
			invocation.Arguments == nil ||
			len(invocation.Arguments.Nodes) != 1 {
			continue
		}
		define := invocation.Arguments.Nodes[0]
		if !ast.IsArrowFunction(define) && !ast.IsFunctionExpression(define) {
			continue
		}
		body := unwrapRegistryDefinitionBody(define.Body())
		if body != nil && ast.IsObjectLiteralExpression(body) {
			return body
		}
	}
	return nil
}

func componentRegistryProperty(property *ast.Node) (string, *ast.Node, bool) {
	if ast.IsPropertyAssignment(property) {
		assignment := property.AsPropertyAssignment()
		name := assignment.Name()
		if name == nil || ast.IsComputedPropertyName(name) {
			return "", nil, false
		}
		return name.Text(), assignment.Initializer, true
	}
	if ast.IsShorthandPropertyAssignment(property) {
		return property.Name().Text(), property.Name(), true
	}
	return "", nil, false
}

func componentIndexForSymbol(
	symbol *ast.Symbol,
	bySymbol map[ast.SymbolId]int,
	byIdentity map[string]int,
) (int, bool) {
	if symbol == nil {
		return -1, false
	}
	if index, exists := bySymbol[ast.GetSymbolId(symbol)]; exists {
		return index, true
	}
	index, exists := byIdentity[projectComponentSymbolIdentity(symbol)]
	return index, exists
}

// resolveJSXComponentValue proves immutable aliases and finite conditional
// selections. Calls and element access remain deliberately opaque because
// their possible runtime component identities cannot be represented in the
// render graph.
func resolveJSXComponentValue(
	tag *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) ([]jsxComponentValueTarget, bool) {
	root := jsxTagSymbolNode(tag)
	if root == nil {
		return nil, false
	}
	return resolveJSXComponentValueExpression(
		root,
		sourceFile,
		typeChecker,
		make(map[ast.SymbolId]bool),
	)
}

func resolveJSXComponentValueExpression(
	expression *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	resolving map[ast.SymbolId]bool,
) ([]jsxComponentValueTarget, bool) {
	if expression == nil {
		return nil, false
	}
	switch {
	case ast.IsParenthesizedExpression(expression):
		return resolveJSXComponentValueExpression(
			expression.AsParenthesizedExpression().Expression,
			sourceFile,
			typeChecker,
			resolving,
		)
	case ast.IsAsExpression(expression):
		return resolveJSXComponentValueExpression(
			expression.AsAsExpression().Expression,
			sourceFile,
			typeChecker,
			resolving,
		)
	case ast.IsSatisfiesExpression(expression):
		return resolveJSXComponentValueExpression(
			expression.AsSatisfiesExpression().Expression,
			sourceFile,
			typeChecker,
			resolving,
		)
	case ast.IsNonNullExpression(expression):
		return resolveJSXComponentValueExpression(
			expression.AsNonNullExpression().Expression,
			sourceFile,
			typeChecker,
			resolving,
		)
	case ast.IsConditionalExpression(expression):
		conditional := expression.AsConditionalExpression()
		left, leftOK := resolveJSXComponentValueExpression(
			conditional.WhenTrue,
			sourceFile,
			typeChecker,
			resolving,
		)
		right, rightOK := resolveJSXComponentValueExpression(
			conditional.WhenFalse,
			sourceFile,
			typeChecker,
			resolving,
		)
		if !leftOK || !rightOK {
			return nil, false
		}
		return uniqueJSXComponentValueTargets(append(left, right...)), true
	case ast.IsArrowFunction(expression), ast.IsFunctionExpression(expression):
		return []jsxComponentValueTarget{{tag: ""}}, true
	}

	symbol := typeChecker.GetSymbolAtLocation(jsxTagSymbolNode(expression))
	if symbol == nil {
		return nil, false
	}
	original := symbol
	symbol = resolvedCallableSymbol(symbol, typeChecker)
	if symbol == nil {
		symbol = original
	}
	symbolID := ast.GetSymbolId(symbol)
	if resolving[symbolID] {
		return nil, false
	}
	for _, declaration := range symbol.Declarations {
		if ast.IsFunctionDeclaration(declaration) {
			return []jsxComponentValueTarget{{
				symbol: symbol,
				tag:    strings.TrimSpace(sourceText(sourceFile, expression)),
			}}, true
		}
	}
	for _, declaration := range original.Declarations {
		if enclosingImportDeclaration(declaration) != nil {
			return []jsxComponentValueTarget{{
				symbol: symbol,
				tag:    strings.TrimSpace(sourceText(sourceFile, expression)),
			}}, true
		}
		if !ast.IsVariableDeclaration(declaration) ||
			declaration.Parent == nil ||
			!ast.IsVariableDeclarationList(declaration.Parent) ||
			declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		initializer := declaration.AsVariableDeclaration().Initializer
		if initializer == nil ||
			componentValueSymbolIsWrittenAfter(
				original,
				declaration.End(),
				sourceFile,
				typeChecker,
			) {
			return nil, false
		}
		next := make(map[ast.SymbolId]bool, len(resolving)+1)
		for id, active := range resolving {
			next[id] = active
		}
		next[symbolID] = true
		targets, ok := resolveJSXComponentValueExpression(
			initializer,
			sourceFile,
			typeChecker,
			next,
		)
		if ok {
			for index := range targets {
				if targets[index].tag == "" {
					targets[index].tag = declaration.Name().Text()
				}
			}
		}
		return targets, ok
	}
	return nil, false
}

func componentValueSymbolIsWrittenAfter(
	symbol *ast.Symbol,
	declarationEnd int,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	written := false
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if written || node.Pos() <= declarationEnd ||
			!ast.IsIdentifier(node) || !identifierIsWriteTarget(node) {
			return !written
		}
		reference := typeChecker.GetSymbolAtLocation(node)
		if reference != nil && ast.GetSymbolId(reference) == ast.GetSymbolId(symbol) {
			written = true
		}
		return !written
	})
	return written
}

func uniqueJSXComponentValueTargets(
	targets []jsxComponentValueTarget,
) []jsxComponentValueTarget {
	seen := make(map[string]bool, len(targets))
	result := make([]jsxComponentValueTarget, 0, len(targets))
	for _, target := range targets {
		key := target.tag
		if target.symbol != nil {
			key = fmt.Sprintf("%d", ast.GetSymbolId(target.symbol))
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, target)
	}
	return result
}

func appendComponentDiagnostic(component *Component, message string) {
	if message == "" || containsString(component.Diagnostics, message) {
		return
	}
	component.Diagnostics = append(component.Diagnostics, message)
}

func jsxComponentResolutionDiagnostic(
	tag *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) string {
	tagText := strings.TrimSpace(sourceText(sourceFile, tag))
	root := jsxTagSymbolNode(tag)
	if root == nil {
		return ""
	}
	if ast.IsIdentifier(root) && jsxTypeOnlyImport(root.Text(), sourceFile) {
		return "error: JSX tag " + tagText +
			" resolves to a type-only import and cannot be rendered at runtime"
	}
	symbol := typeChecker.GetSymbolAtLocation(root)
	if symbol == nil {
		return "error: JSX tag " + tagText +
			" is not defined as a runtime component"
	}
	return "error: JSX tag " + tagText +
		" resolves to variable, not a runtime component"
}

func jsxTypeOnlyImport(name string, sourceFile *ast.SourceFile) bool {
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if declaration.ImportClause == nil {
			continue
		}
		clause := declaration.ImportClause.AsImportClause()
		clauseTypeOnly := clause.PhaseModifier == ast.KindTypeKeyword
		if clause.Name() != nil && clause.Name().Text() == name {
			return clauseTypeOnly
		}
		if clause.NamedBindings == nil ||
			!ast.IsNamedImports(clause.NamedBindings) {
			continue
		}
		for _, element := range clause.NamedBindings.AsNamedImports().Elements.Nodes {
			specifier := element.AsImportSpecifier()
			if specifier.Name().Text() == name {
				return clauseTypeOnly || specifier.IsTypeOnly
			}
		}
	}
	return false
}

func importedProjectComponentIdentity(
	sourceFile *ast.SourceFile,
	reference externalImportReference,
) string {
	if sourceFile == nil ||
		(!strings.HasPrefix(reference.moduleSpecifier, "./") &&
			!strings.HasPrefix(reference.moduleSpecifier, "../")) {
		return ""
	}
	resolved := tspath.GetNormalizedAbsolutePath(
		reference.moduleSpecifier,
		tspath.GetDirectoryPath(sourceFile.FileName()),
	)
	return projectComponentModuleIdentity(resolved) + "\x00" + reference.exportName
}

func projectComponentModuleIdentity(fileName string) string {
	normalized := strings.ToLower(strings.ReplaceAll(fileName, `\`, `/`))
	for _, extension := range []string{".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"} {
		if strings.HasSuffix(normalized, extension) {
			normalized = strings.TrimSuffix(normalized, extension)
			break
		}
	}
	return strings.TrimSuffix(normalized, "/index")
}

func projectComponentSymbolIdentity(symbol *ast.Symbol) string {
	if symbol == nil {
		return ""
	}
	for _, declaration := range symbol.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		return strings.ToLower(
			strings.ReplaceAll(sourceFile.FileName(), `\`, `/`),
		) + "\x00" + ast.SymbolName(symbol)
	}
	return ""
}

func cacheRequestedComponents(
	project *projectState,
	requested *ast.SourceFile,
	components []Component,
) {
	if project.componentCache == nil {
		project.componentCache = make(map[*ast.SourceFile][]Component)
		for _, sourceFile := range project.program.GetSourceFiles() {
			if sourceFile.IsDeclarationFile ||
				strings.Contains(
					strings.ReplaceAll(sourceFile.FileName(), `\`, `/`),
					"/node_modules/",
				) {
				continue
			}
			if len(collectComponents(sourceFile)) == 0 {
				project.componentCache[sourceFile] = []Component{}
			}
		}
	}
	project.componentCache[requested] = append([]Component(nil), components...)
}

func projectComponentRecords(
	project *projectState,
	requested *ast.SourceFile,
	typeChecker *checker.Checker,
	current []Component,
	callables callableAnalysis,
) []projectComponent {
	records := []projectComponent{}
	currentCandidates := projectComponentCandidates(project, requested)
	for index := range current {
		records = append(records, projectComponent{
			sourceFile:     requested,
			candidate:      currentCandidates[index],
			candidateIndex: index,
			component:      current[index],
		})
	}
	for _, dependency := range project.program.GetSourceFiles() {
		if dependency == requested || dependency.IsDeclarationFile ||
			strings.Contains(strings.ReplaceAll(dependency.FileName(), `\`, `/`), "/node_modules/") {
			continue
		}
		if cached, exists := project.componentFacts[dependency]; exists {
			for _, record := range cached {
				record.component = cloneProjectComponent(record.component)
				records = append(records, record)
			}
			continue
		}
		components := collectComponents(dependency)
		if len(components) == 0 {
			continue
		}
		project.counters.ComponentSourceAnalyses++
		assignComponentIDs(dependency, components, dependency.FileName())
		aliases, reads, writes := collectStateAnalysis(dependency, typeChecker)
		reactive := collectReactiveBindings(
			dependency,
			typeChecker,
			aliases,
			reads,
		)
		policy := collectPolicyAnalysis(
			dependency,
			typeChecker,
			components,
			reads,
			Request{Target: TargetDefault},
		)
		tasks := collectTasks(
			dependency,
			typeChecker,
			reads,
			writes,
			reactive,
			callables,
		)
		tasks = applyTaskPolicies(tasks, policy)
		components = analyzeComponents(
			dependency,
			components,
			callables,
			tasks,
			typeChecker,
		)
		candidates := activeComponentCandidates(dependency)
		facts := make([]projectComponent, 0, len(components))
		for index := range components {
			record := projectComponent{
				sourceFile:     dependency,
				candidate:      candidates[index],
				candidateIndex: index,
				component:      components[index],
			}
			facts = append(facts, record)
			records = append(records, record)
		}
		project.componentFacts[dependency] = facts
	}
	return records
}

func ensureProjectComponentCaches(project *projectState) {
	if project.componentFacts == nil {
		project.componentFacts = make(map[*ast.SourceFile][]projectComponent)
	}
	if project.componentCandidates == nil {
		project.componentCandidates = make(map[*ast.SourceFile][]componentCandidate)
	}
	if project.componentNodeIDs == nil {
		project.componentNodeIDs = make(map[*ast.SourceFile]map[*ast.Node]string)
	}
	if project.componentLinks == nil {
		project.componentLinks = make(map[*ast.Node]projectComponentLinkFacts)
	}
}

func projectComponentCandidates(project *projectState, sourceFile *ast.SourceFile) []componentCandidate {
	if cached, exists := project.componentCandidates[sourceFile]; exists {
		return cached
	}
	candidates := activeComponentCandidates(sourceFile)
	project.componentCandidates[sourceFile] = candidates
	return candidates
}

func projectComponentNodeIDs(project *projectState, sourceFile *ast.SourceFile) map[*ast.Node]string {
	if cached, exists := project.componentNodeIDs[sourceFile]; exists {
		return cached
	}
	nodeIDs := expressionNodeIDs(sourceFile)
	project.componentNodeIDs[sourceFile] = nodeIDs
	return nodeIDs
}

func cloneProjectComponent(component Component) Component {
	component.RenderEdges = append([]RenderEdge(nil), component.RenderEdges...)
	component.Diagnostics = append([]string(nil), component.Diagnostics...)
	return component
}

func refreshProjectComponentEdgePlacements(records []projectComponent) {
	placements := make(map[string]string, len(records))
	for _, record := range records {
		placements[record.component.ID] = record.component.Placement
	}
	for index := range records {
		for edgeIndex := range records[index].component.RenderEdges {
			edge := &records[index].component.RenderEdges[edgeIndex]
			if placement, exists := placements[edge.ComponentID]; exists {
				edge.Placement = placement
				edge.Boundary = placement
			} else if edge.ModuleSpecifier != "" {
				edge.Placement = records[index].component.Placement
				edge.Boundary = records[index].component.Placement
			}
		}
	}
}

func jsxTagNode(node *ast.Node) *ast.Node {
	if ast.IsJsxOpeningElement(node) {
		return node.AsJsxOpeningElement().TagName
	}
	if ast.IsJsxSelfClosingElement(node) {
		return node.AsJsxSelfClosingElement().TagName
	}
	return nil
}

func jsxTagSymbolNode(tag *ast.Node) *ast.Node {
	if ast.IsPropertyAccessExpression(tag) {
		return tag.AsPropertyAccessExpression().Name()
	}
	return tag
}

func resolveProjectComponentSubgraphs(records []projectComponent) {
	byID := make(map[string]int, len(records))
	for index, record := range records {
		byID[record.component.ID] = index
	}
	changed := true
	for changed {
		changed = false
		for index := range records {
			placements := []string{records[index].component.Placement}
			for _, edge := range records[index].component.RenderEdges {
				if target, exists := byID[edge.ComponentID]; exists {
					placements = append(
						placements,
						records[target].component.SubgraphPlacement,
					)
				} else {
					placements = append(placements, edge.Placement)
				}
			}
			next := combinePlacements(placements)
			if next != records[index].component.SubgraphPlacement {
				records[index].component.SubgraphPlacement = next
				changed = true
			}
		}
	}
}
