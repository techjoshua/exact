package exactcompiler

import (
	"fmt"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/compiler"
)

var exactContextToken = regexp.MustCompile(
	`^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$`,
)
var neutralReceiverType = regexp.MustCompile(
	`\b(?:AbortController|AbortSignal|Array|Date|Headers|Map|Promise|RegExp|Request|Response|Set|String|URL|URLSearchParams|WeakMap|WeakSet)\b|\[\](?:\s|$)|^(?:readonly\s+)?\[|^(?:bigint|boolean|number|string|symbol)$`,
)
var browserReceiverType = regexp.MustCompile(
	`\b(?:Animation|CSSStyleDeclaration|Document|DOMTokenList|Element|Event|EventTarget|HTMLElement|Node|PointerEvent|Range|Selection|ShadowRoot|Storage|Text|Window)\b`,
)

var universalCallRoots = map[string]struct{}{
	"Array": {}, "BigInt": {}, "Boolean": {}, "Date": {}, "Error": {},
	"Intl": {}, "JSON": {}, "Map": {}, "Math": {}, "Number": {}, "Object": {},
	"Promise": {}, "Reflect": {}, "RegExp": {}, "Set": {}, "String": {},
	"Symbol": {}, "URL": {}, "URLSearchParams": {}, "WeakMap": {}, "WeakSet": {},
	"clearInterval": {}, "clearTimeout": {}, "console": {}, "fetch": {},
	"parseFloat": {}, "parseInt": {}, "queueMicrotask": {}, "setInterval": {},
	"setTimeout": {}, "structuredClone": {},
}

type callableFacts struct {
	node               *ast.Node
	sourceFile         *ast.SourceFile
	summary            CallableSummary
	directReads        []StateEffect
	directWrites       []StateEffect
	directContext      []ContextEffect
	targets            []int
	externalTargets    []CallableSummary
	callSymbols        map[string]ast.SymbolId
	artifactConstraint uint8
}

type callableAnalysis struct {
	summaries []CallableSummary
	byNode    map[*ast.Node]CallableSummary
	bySymbol  map[ast.SymbolId]CallableSummary
	facts     []callableFacts
}

type projectCallableCache struct {
	bySource     map[*ast.SourceFile]callableAnalysis
	fingerprints map[*ast.SourceFile]string
	owned        map[*ast.SourceFile]bool
	analyses     []callableAnalysis
	merged       callableAnalysis
}

// collectCallableEffects builds a source-order-independent local call graph and
// resolves environment, state, and context effects to a monotone fixed point.
// TypeScript symbols, rather than names, own edges so lexical shadowing cannot
// connect unrelated callables.
func collectCallableEffects(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components []Component,
	stateReads []StateRead,
	stateWrites []StateWrite,
) callableAnalysis {
	nodes := collectCallableNodes(sourceFile)
	facts := make([]callableFacts, 0, len(nodes))
	componentByStart := make(map[int]Component, len(components))
	for _, component := range components {
		componentByStart[component.Start] = component
	}
	symbolTargets := make(map[ast.SymbolId]int)
	importBindings := collectExternalImportBindings(sourceFile, typeChecker)
	for _, node := range nodes {
		name, kind, exportNames := callableIdentity(node, componentByStart)
		index := len(facts)
		facts = append(facts, callableFacts{
			node:       node,
			sourceFile: sourceFile,
			summary: CallableSummary{
				ID: fmt.Sprintf(
					"callable:%s:%d",
					sourceFile.FileName(),
					node.Pos(),
				),
				Name:                name,
				Kind:                kind,
				ExportNames:         nonNilSlice(exportNames),
				DirectEffectSources: []EnvironmentEffectSource{},
				EffectSources:       []EnvironmentEffectSource{},
				Calls:               []CallEdge{},
				ArtifactTargets:     []string{},
				StateReads:          []StateEffect{},
				StateWrites:         []StateEffect{},
				Contexts:            []ContextEffect{},
			},
			callSymbols: make(map[string]ast.SymbolId),
		})
		if symbol := callableDeclarationSymbol(node, typeChecker); symbol != nil {
			symbolTargets[ast.GetSymbolId(symbol)] = index
		}
	}
	bindCallableAliases(sourceFile, symbolTargets, typeChecker)
	syntacticTargets := collectSyntacticCallableTargets(facts)
	bindSyntacticCallableAliases(
		sourceFile,
		syntacticTargets,
		symbolTargets,
		typeChecker,
	)
	contextBindings := collectContextBindings(sourceFile)

	for index := range facts {
		if callableIsInteractiveHandler(facts[index].node) {
			facts[index].summary.DirectEffectSources = append(
				facts[index].summary.DirectEffectSources,
				environmentSource("browser", "interactive JSX handler", facts[index].summary.Name),
			)
		}
		collectDirectCallableEffects(
			&facts[index],
			index,
			facts,
			symbolTargets,
			syntacticTargets,
			sourceFile,
			typeChecker,
			stateReads,
			stateWrites,
			importBindings,
			contextBindings,
		)
	}
	resolveCallableEffects(facts)
	applyCallableArtifactConstraints(facts)

	summaries := make([]CallableSummary, len(facts))
	byNode := make(map[*ast.Node]CallableSummary, len(facts))
	for index := range facts {
		fact := &facts[index]
		fact.summary.DirectEffect = environmentEffectFor(fact.summary.DirectEffectSources)
		fact.summary.Effect = environmentEffectFor(fact.summary.EffectSources)
		fact.summary.ArtifactTargets = artifactTargetsFor(
			fact.summary.Effect,
			fact.summary.EffectSources,
			fact.artifactConstraint,
		)
		summaries[index] = fact.summary
		byNode[fact.node] = fact.summary
	}
	bySymbol := make(map[ast.SymbolId]CallableSummary, len(symbolTargets))
	for symbol, index := range symbolTargets {
		bySymbol[symbol] = summaries[index]
	}
	return callableAnalysis{
		summaries: summaries,
		byNode:    byNode,
		bySymbol:  bySymbol,
		facts:     facts,
	}
}

func collectSyntacticCallableTargets(facts []callableFacts) map[string]int {
	result := make(map[string]int)
	for index := range facts {
		node := facts[index].node
		memberName := ""
		container := node.Parent
		if ast.IsMethodDeclaration(node) {
			memberName = callableNameText(node.Name())
		} else if container != nil && ast.IsPropertyAssignment(container) {
			memberName = callableNameText(container.Name())
			container = container.Parent
		}
		if memberName == "" || container == nil ||
			!ast.IsObjectLiteralExpression(container) ||
			container.Parent == nil ||
			!ast.IsVariableDeclaration(container.Parent) {
			continue
		}
		declaration := container.Parent.AsVariableDeclaration()
		if declaration.Initializer != container ||
			declaration.Name() == nil ||
			!ast.IsIdentifier(declaration.Name()) {
			continue
		}
		result[declaration.Name().Text()+"."+memberName] = index
	}
	return result
}

func bindSyntacticCallableAliases(
	sourceFile *ast.SourceFile,
	targets map[string]int,
	symbolTargets map[ast.SymbolId]int,
	typeChecker *checker.Checker,
) {
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		declaration := node.AsVariableDeclaration()
		if declaration.Name() == nil ||
			!ast.IsIdentifier(declaration.Name()) ||
			declaration.Initializer == nil {
			return true
		}
		target, exists := targets[strings.TrimSpace(
			sourceText(sourceFile, declaration.Initializer),
		)]
		if !exists {
			return true
		}
		if symbol := typeChecker.GetSymbolAtLocation(declaration.Name()); symbol != nil {
			symbolTargets[ast.GetSymbolId(symbol)] = target
		}
		return true
	})
}

func callableIsInteractiveHandler(node *ast.Node) bool {
	current := node.Parent
	if current != nil && ast.IsJsxExpression(current) {
		current = current.Parent
	}
	if current == nil || !ast.IsJsxAttribute(current) {
		return false
	}
	name := current.AsJsxAttribute().Name()
	return name != nil && !ast.IsJsxNamespacedName(name) &&
		interactiveJSXAttribute(name.Text())
}

// collectProjectCallableEffects links callable graphs from every non-declaration
// source retained by the TypeScript-Go program. The response remains scoped to
// the requested module, while transitive effects cross local import cycles in
// one native fixed point.
func collectProjectCallableEffects(
	project *projectState,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components []Component,
	stateReads []StateRead,
	stateWrites []StateWrite,
	externalManifests []ExternalManifest,
) callableAnalysis {
	if len(externalManifests) == 0 {
		if project.callableCache == nil {
			project.callableCache = buildProjectCallableCache(
				project.program,
				typeChecker,
			)
		}
		cache := project.callableCache
		if !cache.owned[sourceFile] {
			refreshed := collectCallableEffects(
				sourceFile,
				typeChecker,
				components,
				stateReads,
				stateWrites,
			)
			fingerprint := callableAnalysisFingerprint(refreshed)
			if fingerprint != cache.fingerprints[sourceFile] {
				cache.bySource[sourceFile] = refreshed
				cache.fingerprints[sourceFile] = fingerprint
				rebuildProjectCallableCache(project.program, cache)
			}
			cache.owned[sourceFile] = true
		}
		return callableAnalysisFromFacts(
			sourceFile,
			cache.merged.facts,
			cache.analyses,
		)
	}
	return collectUncachedProjectCallableEffects(
		project.program,
		sourceFile,
		typeChecker,
		components,
		stateReads,
		stateWrites,
		externalManifests,
	)
}

func buildProjectCallableCache(
	program *compiler.Program,
	typeChecker *checker.Checker,
) *projectCallableCache {
	cache := &projectCallableCache{
		bySource:     make(map[*ast.SourceFile]callableAnalysis),
		fingerprints: make(map[*ast.SourceFile]string),
		owned:        make(map[*ast.SourceFile]bool),
	}
	for _, sourceFile := range program.GetSourceFiles() {
		if sourceFile.IsDeclarationFile ||
			strings.Contains(strings.ReplaceAll(sourceFile.FileName(), `\`, `/`), "/node_modules/") {
			continue
		}
		components := collectComponents(sourceFile)
		_, reads, writes := collectStateAnalysis(sourceFile, typeChecker)
		analysis := collectCallableEffects(
			sourceFile,
			typeChecker,
			components,
			reads,
			writes,
		)
		cache.bySource[sourceFile] = analysis
		cache.fingerprints[sourceFile] = callableAnalysisFingerprint(analysis)
	}
	rebuildProjectCallableCache(program, cache)
	return cache
}

func callableAnalysisFingerprint(analysis callableAnalysis) string {
	var result strings.Builder
	for _, fact := range analysis.facts {
		result.WriteString(fact.summary.ID)
		result.WriteByte('|')
		result.WriteString(fact.summary.Name)
		result.WriteByte('|')
		result.WriteString(fact.summary.Kind)
		result.WriteByte('|')
		result.WriteString(strings.Join(fact.summary.ExportNames, ","))
		result.WriteByte('\n')
		result.WriteString(environmentSourcesSignature(fact.summary.DirectEffectSources))
		result.WriteString(stateEffectsSignature(fact.directReads))
		result.WriteString(stateEffectsSignature(fact.directWrites))
		result.WriteString(contextEffectsSignature(fact.directContext))
		for _, edge := range fact.summary.Calls {
			result.WriteString(edge.ID)
			result.WriteByte('|')
			result.WriteString(edge.Name)
			result.WriteByte('|')
			result.WriteString(edge.ModuleSpecifier)
			result.WriteByte('|')
			result.WriteString(edge.ExportName)
			result.WriteByte('|')
			if symbol, exists := fact.callSymbols[edge.ID]; exists {
				result.WriteString(fmt.Sprintf("%d", symbol))
			}
			result.WriteByte('\n')
		}
	}
	symbols := make([]int, 0, len(analysis.bySymbol))
	for symbol := range analysis.bySymbol {
		symbols = append(symbols, int(symbol))
	}
	sort.Ints(symbols)
	for _, symbol := range symbols {
		result.WriteString(fmt.Sprintf("symbol:%d:%s\n", symbol, analysis.bySymbol[ast.SymbolId(symbol)].ID))
	}
	return result.String()
}

func rebuildProjectCallableCache(
	program *compiler.Program,
	cache *projectCallableCache,
) {
	cache.analyses = cache.analyses[:0]
	var requested *ast.SourceFile
	for _, sourceFile := range program.GetSourceFiles() {
		analysis, exists := cache.bySource[sourceFile]
		if !exists {
			continue
		}
		if requested == nil {
			requested = sourceFile
		}
		cache.analyses = append(cache.analyses, analysis)
	}
	cache.merged = callableAnalysis{}
	if len(cache.analyses) == 1 {
		cache.merged = cache.analyses[0]
	} else if len(cache.analyses) > 1 {
		cache.merged = mergeProjectCallableEffects(requested, cache.analyses)
	}
}

func collectUncachedProjectCallableEffects(
	program *compiler.Program,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components []Component,
	stateReads []StateRead,
	stateWrites []StateWrite,
	externalManifests []ExternalManifest,
) callableAnalysis {
	analyses := []callableAnalysis{
		collectCallableEffects(
			sourceFile,
			typeChecker,
			components,
			stateReads,
			stateWrites,
		),
	}
	for _, dependency := range program.GetSourceFiles() {
		if dependency == sourceFile || dependency.IsDeclarationFile ||
			strings.Contains(strings.ReplaceAll(dependency.FileName(), `\`, `/`), "/node_modules/") {
			continue
		}
		dependencyComponents := collectComponents(dependency)
		_, dependencyReads, dependencyWrites :=
			collectStateAnalysis(dependency, typeChecker)
		analyses = append(
			analyses,
			collectCallableEffects(
				dependency,
				typeChecker,
				dependencyComponents,
				dependencyReads,
				dependencyWrites,
			),
		)
	}
	var result callableAnalysis
	if len(analyses) == 1 {
		result = analyses[0]
	} else {
		result = mergeProjectCallableEffects(sourceFile, analyses)
	}
	return linkExternalCallableEffects(sourceFile, result, externalManifests)
}

func mergeProjectCallableEffects(
	requested *ast.SourceFile,
	analyses []callableAnalysis,
) callableAnalysis {
	facts := []callableFacts{}
	symbolSummaryIDs := make(map[ast.SymbolId]string)
	for _, analysis := range analyses {
		for _, fact := range analysis.facts {
			facts = append(facts, cloneCallableFact(fact))
		}
		for symbol, summary := range analysis.bySymbol {
			symbolSummaryIDs[symbol] = summary.ID
		}
	}
	factByID := make(map[string]int, len(facts))
	exportedByModule := make(map[string]int)
	for index := range facts {
		factByID[facts[index].summary.ID] = index
		module := callableModuleKey(facts[index].sourceFile.FileName())
		for _, exportName := range facts[index].summary.ExportNames {
			exportedByModule[module+"\x00"+exportName] = index
		}
		facts[index].targets = nil
		facts[index].summary.EffectSources = append(
			[]EnvironmentEffectSource(nil),
			facts[index].summary.DirectEffectSources...,
		)
		facts[index].summary.StateReads = append(
			[]StateEffect(nil),
			facts[index].directReads...,
		)
		facts[index].summary.StateWrites = append(
			[]StateEffect(nil),
			facts[index].directWrites...,
		)
		facts[index].summary.Contexts = append(
			[]ContextEffect(nil),
			facts[index].directContext...,
		)
		for edgeIndex := range facts[index].summary.Calls {
			edge := &facts[index].summary.Calls[edgeIndex]
			if _, symbolOwned := facts[index].callSymbols[edge.ID]; !symbolOwned &&
				edge.Resolved && edge.TargetID != "" {
				continue
			}
			edge.TargetID = ""
			edge.Resolved = false
		}
	}
	for factIndex := range facts {
		fact := &facts[factIndex]
		for edgeIndex := range fact.summary.Calls {
			edge := &fact.summary.Calls[edgeIndex]
			symbol, exists := fact.callSymbols[edge.ID]
			targetIndex := -1
			if edge.Resolved && edge.TargetID != "" {
				if index, present := factByID[edge.TargetID]; present {
					targetIndex = index
				}
			}
			if exists {
				if targetID, resolved := symbolSummaryIDs[symbol]; resolved {
					if index, present := factByID[targetID]; present {
						targetIndex = index
					}
				}
			}
			// TS-Go does not currently substitute every authored `.js` edge
			// to a sibling `.tsx` root. The retained project already owns those
			// source files, so link the same export by normalized module stem.
			if targetIndex < 0 && edge.ModuleSpecifier != "" &&
				strings.HasPrefix(edge.ModuleSpecifier, ".") &&
				edge.ExportName != "" {
				module := callableModuleKey(filepath.Join(
					filepath.Dir(fact.sourceFile.FileName()),
					edge.ModuleSpecifier,
				))
				if index, present := exportedByModule[module+"\x00"+edge.ExportName]; present {
					targetIndex = index
				}
			}
			if targetIndex < 0 {
				continue
			}
			edge.TargetID = facts[targetIndex].summary.ID
			edge.Resolved = true
			fact.targets = append(fact.targets, targetIndex)
		}
		unresolved := make(map[string]struct{})
		for _, edge := range fact.summary.Calls {
			if !edge.Resolved {
				unresolved["unresolved call "+edge.Name] = struct{}{}
			}
		}
		filtered := fact.summary.DirectEffectSources[:0]
		for _, source := range fact.summary.DirectEffectSources {
			if source.Environment == "unknown" &&
				strings.HasPrefix(source.Description, "unresolved call ") {
				if _, remains := unresolved[source.Description]; !remains {
					continue
				}
			}
			filtered = append(filtered, source)
		}
		fact.summary.DirectEffectSources = filtered
		fact.summary.EffectSources = append(
			[]EnvironmentEffectSource(nil),
			filtered...,
		)
	}
	resolveCallableEffects(facts)
	applyCallableArtifactConstraints(facts)
	return callableAnalysisFromFacts(requested, facts, analyses)
}

func callableModuleKey(filename string) string {
	resolved, err := filepath.Abs(filename)
	if err == nil {
		filename = resolved
	}
	extension := filepath.Ext(filename)
	switch strings.ToLower(extension) {
	case ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs":
		filename = strings.TrimSuffix(filename, extension)
	}
	filename = filepath.ToSlash(filepath.Clean(filename))
	if filepath.Separator == '\\' {
		filename = strings.ToLower(filename)
	}
	return filename
}

func cloneCallableFact(value callableFacts) callableFacts {
	value.summary.ExportNames = append([]string(nil), value.summary.ExportNames...)
	value.summary.DirectEffectSources = append(
		[]EnvironmentEffectSource(nil),
		value.summary.DirectEffectSources...,
	)
	value.summary.EffectSources = append(
		[]EnvironmentEffectSource(nil),
		value.summary.EffectSources...,
	)
	value.summary.Calls = append([]CallEdge(nil), value.summary.Calls...)
	value.summary.ArtifactTargets = append(
		[]string(nil),
		value.summary.ArtifactTargets...,
	)
	value.summary.StateReads = append([]StateEffect(nil), value.summary.StateReads...)
	value.summary.StateWrites = append([]StateEffect(nil), value.summary.StateWrites...)
	value.summary.Contexts = append([]ContextEffect(nil), value.summary.Contexts...)
	value.targets = append([]int(nil), value.targets...)
	value.externalTargets = append([]CallableSummary(nil), value.externalTargets...)
	return value
}

func callableAnalysisFromFacts(
	requested *ast.SourceFile,
	facts []callableFacts,
	analyses []callableAnalysis,
) callableAnalysis {
	finalByID := make(map[string]CallableSummary, len(facts))
	byNode := make(map[*ast.Node]CallableSummary, len(facts))
	summaries := []CallableSummary{}
	for index := range facts {
		fact := &facts[index]
		fact.summary.DirectEffect = environmentEffectFor(fact.summary.DirectEffectSources)
		fact.summary.Effect = environmentEffectFor(fact.summary.EffectSources)
		fact.summary.ArtifactTargets = artifactTargetsFor(
			fact.summary.Effect,
			fact.summary.EffectSources,
			fact.artifactConstraint,
		)
		finalByID[fact.summary.ID] = fact.summary
		byNode[fact.node] = fact.summary
		if fact.sourceFile == requested {
			summaries = append(summaries, fact.summary)
		}
	}
	bySymbol := make(map[ast.SymbolId]CallableSummary)
	for _, analysis := range analyses {
		for symbol, summary := range analysis.bySymbol {
			if final, exists := finalByID[summary.ID]; exists {
				bySymbol[symbol] = final
			}
		}
	}
	sort.Slice(summaries, func(left int, right int) bool {
		return summaries[left].ID < summaries[right].ID
	})
	return callableAnalysis{
		summaries: summaries,
		byNode:    byNode,
		bySymbol:  bySymbol,
		facts:     facts,
	}
}

func collectCallableNodes(sourceFile *ast.SourceFile) []*ast.Node {
	var result []*ast.Node
	for _, statement := range sourceFile.Statements.Nodes {
		if ast.IsExpressionStatement(statement) ||
			isSideEffectImport(statement) {
			result = append(result, statement)
		}
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if isCallableNode(node) {
			result = append(result, node)
		}
		return true
	})
	sort.Slice(result, func(left int, right int) bool {
		return result[left].Pos() < result[right].Pos()
	})
	return result
}

func isCallableNode(node *ast.Node) bool {
	return ast.IsFunctionDeclaration(node) ||
		ast.IsFunctionExpression(node) ||
		ast.IsArrowFunction(node) ||
		ast.IsMethodDeclaration(node)
}

func callableIdentity(
	node *ast.Node,
	componentByStart map[int]Component,
) (string, string, []string) {
	if ast.IsExpressionStatement(node) || isSideEffectImport(node) {
		return fmt.Sprintf("module@%d", node.Pos()), "module-initializer", nil
	}
	if component, ok := componentByStart[node.Pos()]; ok {
		exports := []string{}
		if component.Exported {
			exports = append(exports, component.Name)
		}
		return component.Name, "component", exports
	}
	if isTaskWork(node) {
		return fmt.Sprintf("task@%d", node.Pos()), "task", nil
	}
	name := ""
	if declarationName := node.Name(); declarationName != nil {
		name = callableNameText(declarationName)
	}
	if name == "" && node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
		declarationName := node.Parent.Name()
		if declarationName != nil {
			name = callableNameText(declarationName)
		}
	}
	if name == "" {
		name = fmt.Sprintf("<anonymous@%d>", node.Pos())
	}
	kind := "function"
	if ast.IsMethodDeclaration(node) {
		kind = "method"
	}
	exports := []string{}
	if ast.IsFunctionDeclaration(node) &&
		ast.HasSyntacticModifier(node, ast.ModifierFlagsExport) {
		exports = append(exports, name)
	}
	if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) &&
		node.Parent.Parent != nil && node.Parent.Parent.Parent != nil &&
		ast.IsVariableStatement(node.Parent.Parent.Parent) &&
		ast.HasSyntacticModifier(node.Parent.Parent.Parent, ast.ModifierFlagsExport) {
		exports = append(exports, name)
	}
	return name, kind, exports
}

func callableNameText(name *ast.Node) string {
	if ast.IsIdentifier(name) || ast.IsStringLiteral(name) || ast.IsNumericLiteral(name) {
		return name.Text()
	}
	return ""
}

func isTaskWork(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil || !ast.IsCallExpression(parent) {
		return false
	}
	call := parent.AsCallExpression()
	if call.Arguments == nil || len(call.Arguments.Nodes) == 0 ||
		call.Arguments.Nodes[len(call.Arguments.Nodes)-1] != node {
		return false
	}
	_, ok := taskFacets(call.Expression)
	return ok
}

func callableDeclarationSymbol(
	node *ast.Node,
	typeChecker *checker.Checker,
) *ast.Symbol {
	if name := node.Name(); name != nil && ast.IsIdentifier(name) {
		return typeChecker.GetSymbolAtLocation(name)
	}
	if node.Parent != nil && ast.IsVariableDeclaration(node.Parent) {
		if name := node.Parent.Name(); name != nil && ast.IsIdentifier(name) {
			return typeChecker.GetSymbolAtLocation(name)
		}
	}
	return nil
}

func bindCallableAliases(
	sourceFile *ast.SourceFile,
	symbolTargets map[ast.SymbolId]int,
	typeChecker *checker.Checker,
) {
	changed := true
	for changed {
		changed = false
		walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
			if !ast.IsVariableDeclaration(node) {
				return true
			}
			declaration := node.AsVariableDeclaration()
			name := declaration.Name()
			if name == nil || !ast.IsIdentifier(name) || declaration.Initializer == nil {
				return true
			}
			alias := typeChecker.GetSymbolAtLocation(name)
			target := callableAliasTarget(declaration.Initializer, typeChecker)
			if alias == nil || target == nil {
				return true
			}
			targetIndex, exists := symbolTargets[ast.GetSymbolId(target)]
			if !exists {
				return true
			}
			aliasID := ast.GetSymbolId(alias)
			if current, bound := symbolTargets[aliasID]; !bound || current != targetIndex {
				symbolTargets[aliasID] = targetIndex
				changed = true
			}
			return true
		})
	}
}

func callableAliasTarget(
	initializer *ast.Node,
	typeChecker *checker.Checker,
) *ast.Symbol {
	if ast.IsCallExpression(initializer) {
		expression := initializer.AsCallExpression().Expression
		if ast.IsPropertyAccessExpression(expression) {
			member := expression.AsPropertyAccessExpression()
			if member.Name() != nil && member.Name().Text() == "bind" {
				return typeChecker.GetSymbolAtLocation(member.Expression)
			}
		}
		return nil
	}
	return callTargetSymbol(initializer, typeChecker)
}

func collectDirectCallableEffects(
	fact *callableFacts,
	factIndex int,
	facts []callableFacts,
	symbolTargets map[ast.SymbolId]int,
	syntacticTargets map[string]int,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	stateReads []StateRead,
	stateWrites []StateWrite,
	importBindings externalImportBindings,
	contextBindings map[string]ContextEffect,
) {
	if isSideEffectImport(fact.node) {
		declaration := fact.node.AsImportDeclaration()
		moduleSpecifier := declaration.ModuleSpecifier.AsStringLiteral().Text
		edge := CallEdge{
			ID:              fmt.Sprintf("%s:import:%d", fact.summary.ID, fact.node.Pos()),
			Name:            `import "` + moduleSpecifier + `"`,
			ModuleSpecifier: moduleSpecifier,
			ExportName:      "*module*",
			Resolved:        false,
		}
		fact.summary.Calls = append(fact.summary.Calls, edge)
		source := environmentSource(
			"unknown",
			"unresolved call "+edge.Name,
			fact.summary.Name,
		)
		source.Opaque = !strings.HasPrefix(moduleSpecifier, ".") &&
			!filepath.IsAbs(moduleSpecifier)
		fact.summary.DirectEffectSources = append(
			fact.summary.DirectEffectSources,
			source,
		)
	}
	parameterReads, parameterWrites := collectParameterStateEffects(
		fact.node,
		typeChecker,
	)
	fact.directReads = append(fact.directReads, parameterReads...)
	fact.directWrites = append(fact.directWrites, parameterWrites...)
	for _, read := range stateReads {
		if directlyOwnedSpan(read.Start, read.Start+read.Length, factIndex, facts) {
			fact.directReads = append(fact.directReads, StateEffect{
				Path: strings.Join(read.Path, "."), Kind: "read", Confidence: read.Confidence,
			})
		}
	}
	for _, write := range stateWrites {
		if directlyOwnedSpan(write.Start, write.Start+write.Length, factIndex, facts) {
			confidence := "exact"
			if containsString(write.Path, "*") || write.Operation == "array-mutation" {
				confidence = "broad"
			}
			fact.directWrites = append(fact.directWrites, StateEffect{
				Path:       strings.Join(write.Path, "."),
				Kind:       "write",
				Confidence: confidence,
				Operation:  stateEffectOperation(write.Operation),
			})
		}
	}

	walkCallable(fact.node, func(node *ast.Node) bool {
		if ast.IsJsxAttribute(node) {
			name := node.AsJsxAttribute().Name()
			if name != nil && !ast.IsJsxNamespacedName(name) &&
				interactiveJSXAttribute(name.Text()) {
				fact.summary.DirectEffectSources = append(
					fact.summary.DirectEffectSources,
					environmentSource(
						"browser",
						"interactive JSX attribute "+name.Text(),
						fact.summary.Name,
					),
				)
			}
		}
		if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) &&
			!isStaticPropertyName(node) {
			name := node.Text()
			symbol := typeChecker.GetSymbolAtLocation(node)
			if _, candidate := browserGlobals[name]; candidate &&
				symbolIsOutsideSource(symbol, sourceFile) {
				fact.summary.DirectEffectSources = append(
					fact.summary.DirectEffectSources,
					environmentSource("browser", name, fact.summary.Name),
				)
			}
			if _, candidate := serverGlobals[name]; candidate &&
				symbolIsOutsideSource(symbol, sourceFile) {
				fact.summary.DirectEffectSources = append(
					fact.summary.DirectEffectSources,
					environmentSource("server", name, fact.summary.Name),
				)
			}
			if serverOnlyImportSymbol(symbol) {
				fact.summary.DirectEffectSources = append(
					fact.summary.DirectEffectSources,
					environmentSource("server", "server-only import "+name, fact.summary.Name),
				)
			}
		}
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if effect, ok := contextEffect(call, sourceFile); ok {
			fact.directContext = append(fact.directContext, effect)
		} else if effect, ok := contextBindingCallEffect(
			call.Expression,
			contextBindings,
		); ok {
			fact.directContext = append(fact.directContext, effect)
		}
		targetSymbol := resolvedCallableSymbol(
			callTargetSymbol(call.Expression, typeChecker),
			typeChecker,
		)
		targetIndex, resolved := syntacticTargets[strings.TrimSpace(
			sourceText(sourceFile, call.Expression),
		)]
		if ast.IsIdentifier(call.Expression) &&
			call.Expression.Text() == fact.summary.Name {
			targetIndex, resolved = factIndex, true
		}
		if targetSymbol != nil {
			if symbolTarget, exists := symbolTargets[ast.GetSymbolId(targetSymbol)]; exists {
				targetIndex, resolved = symbolTarget, true
			}
		}
		edge := CallEdge{
			ID:       fmt.Sprintf("%s:call:%d", fact.summary.ID, node.Pos()),
			Name:     strings.TrimSpace(sourceText(sourceFile, call.Expression)),
			Resolved: resolved,
		}
		if reference, exists := externalImportForExpression(
			call.Expression,
			importBindings,
			typeChecker,
		); exists {
			edge.ModuleSpecifier = reference.moduleSpecifier
			edge.ExportName = reference.exportName
		}
		if targetSymbol != nil {
			fact.callSymbols[edge.ID] = ast.GetSymbolId(targetSymbol)
		}
		if resolved {
			edge.TargetID = facts[targetIndex].summary.ID
			edge.ReceiverBindings = receiverBindingsForCall(
				call,
				fact.node,
				facts[targetIndex].node,
				typeChecker,
			)
			fact.targets = append(fact.targets, targetIndex)
		} else if environment := unresolvedCallEnvironment(
			call.Expression,
			sourceFile,
			typeChecker,
			contextBindings,
		); environment != "" {
			description := edge.Name
			if environment == "unknown" {
				description = "unresolved call " + edge.Name
			}
			source := environmentSource(environment, description, fact.summary.Name)
			source.Opaque = environment == "unknown" &&
				opaqueCallExpression(call.Expression, typeChecker)
			fact.summary.DirectEffectSources = append(
				fact.summary.DirectEffectSources,
				source,
			)
		}
		fact.summary.Calls = append(fact.summary.Calls, edge)
		if eagerCallbackCall(call.Expression) && call.Arguments != nil {
			for argumentIndex, argument := range call.Arguments.Nodes {
				if !ast.IsArrowFunction(argument) &&
					!ast.IsFunctionExpression(argument) {
					continue
				}
				for callbackIndex := range facts {
					if facts[callbackIndex].node != argument {
						continue
					}
					fact.summary.Calls = append(
						fact.summary.Calls,
						CallEdge{
							ID: fmt.Sprintf(
								"%s:callback:%d:%d",
								fact.summary.ID,
								node.Pos(),
								argumentIndex,
							),
							Name:     facts[callbackIndex].summary.Name,
							TargetID: facts[callbackIndex].summary.ID,
							Resolved: true,
						},
					)
					fact.targets = append(fact.targets, callbackIndex)
					break
				}
			}
		}
		return true
	})
	applyCallableAnnotations(fact, sourceFile)
	fact.summary.DirectEffectSources = uniqueEnvironmentSources(
		fact.summary.DirectEffectSources,
	)
	fact.summary.EffectSources = append(
		[]EnvironmentEffectSource(nil),
		fact.summary.DirectEffectSources...,
	)
	fact.directReads = minimalStateEffects(fact.directReads)
	fact.directWrites = uniqueStateEffects(fact.directWrites)
	fact.directContext = uniqueContextEffects(fact.directContext)
	fact.summary.StateReads = append([]StateEffect(nil), fact.directReads...)
	fact.summary.StateWrites = append([]StateEffect(nil), fact.directWrites...)
	fact.summary.Contexts = append([]ContextEffect(nil), fact.directContext...)
}

func eagerCallbackCall(expression *ast.Node) bool {
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	switch expression.AsPropertyAccessExpression().Name().Text() {
	case "map", "flatMap", "filter", "forEach", "some", "every",
		"find", "findIndex", "reduce", "reduceRight", "sort",
		"then", "catch", "finally":
		return true
	default:
		return false
	}
}

func collectParameterStateEffects(
	callable *ast.Node,
	typeChecker *checker.Checker,
) ([]StateEffect, []StateEffect) {
	if !isCallableNode(callable) {
		return nil, nil
	}
	parameters := make(map[ast.SymbolId]int)
	for index, parameter := range callable.Parameters() {
		name := parameter.Name()
		if name == nil || !ast.IsIdentifier(name) {
			continue
		}
		if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
			parameters[ast.GetSymbolId(symbol)] = index
		}
	}
	if len(parameters) == 0 {
		return nil, nil
	}
	reads := []StateEffect{}
	writes := []StateEffect{}
	walkCallable(callable, func(node *ast.Node) bool {
		if target, operation := stateWriteTarget(node, typeChecker); operation != "" {
			if effect, exists := parameterStateEffect(
				target,
				"write",
				parameters,
				typeChecker,
			); exists {
				effect.Operation = stateEffectOperation(operation)
				writes = append(writes, effect)
			}
			return true
		}
		if (!ast.IsPropertyAccessExpression(node) &&
			!ast.IsElementAccessExpression(node)) ||
			insideStateWriteTarget(node) {
			return true
		}
		target, eligible := stateReadTarget(node)
		if !eligible {
			return true
		}
		if effect, exists := parameterStateEffect(
			target,
			"read",
			parameters,
			typeChecker,
		); exists {
			reads = append(reads, effect)
		}
		return true
	})
	return minimalStateEffects(reads), uniqueStateEffects(writes)
}

func parameterStateEffect(
	node *ast.Node,
	kind string,
	parameters map[ast.SymbolId]int,
	typeChecker *checker.Checker,
) (StateEffect, bool) {
	if node == nil {
		return StateEffect{}, false
	}
	segments := []string{}
	current := node
	for {
		switch {
		case ast.IsPropertyAccessExpression(current):
			member := current.AsPropertyAccessExpression()
			if member.Name() == nil {
				return StateEffect{}, false
			}
			segments = append(segments, member.Name().Text())
			current = member.Expression
		case ast.IsElementAccessExpression(current):
			member := current.AsElementAccessExpression()
			if member.ArgumentExpression == nil ||
				(!ast.IsStringLiteral(member.ArgumentExpression) &&
					!ast.IsNumericLiteral(member.ArgumentExpression)) {
				segments = append(segments, "*")
			} else {
				segments = append(segments, member.ArgumentExpression.Text())
			}
			current = member.Expression
		default:
			goto resolved
		}
	}
resolved:
	if !ast.IsIdentifier(current) {
		return StateEffect{}, false
	}
	symbol := typeChecker.GetSymbolAtLocation(current)
	if symbol == nil {
		return StateEffect{}, false
	}
	parameterIndex, exists := parameters[ast.GetSymbolId(symbol)]
	if !exists {
		return StateEffect{}, false
	}
	for left, right := 0, len(segments)-1; left < right; left, right = left+1, right-1 {
		segments[left], segments[right] = segments[right], segments[left]
	}
	if len(segments) == 0 || segments[0] != "state" {
		return StateEffect{}, false
	}
	segments = segments[1:]
	confidence := "exact"
	if len(segments) == 0 {
		segments = []string{"*"}
		confidence = "broad"
	} else if containsString(segments, "*") {
		confidence = "unknown"
	}
	return StateEffect{
		Path:       strings.Join(segments, "."),
		Kind:       kind,
		Confidence: confidence,
		Receiver:   &StateReceiver{Kind: "parameter", Index: parameterIndex},
	}, true
}

func receiverBindingsForCall(
	call *ast.CallExpression,
	caller *ast.Node,
	callee *ast.Node,
	typeChecker *checker.Checker,
) []ReceiverBinding {
	callerParameters := make(map[ast.SymbolId]int)
	if isCallableNode(caller) {
		for index, parameter := range caller.Parameters() {
			name := parameter.Name()
			if name == nil || !ast.IsIdentifier(name) {
				continue
			}
			if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
				callerParameters[ast.GetSymbolId(symbol)] = index
			}
		}
	}
	if !isCallableNode(callee) {
		return nil
	}
	result := make([]ReceiverBinding, 0, len(callee.Parameters()))
	for index := range callee.Parameters() {
		binding := ReceiverBinding{ParameterIndex: index, Source: "unknown"}
		if call.Arguments != nil && index < len(call.Arguments.Nodes) {
			argument := call.Arguments.Nodes[index]
			if argument.Kind == ast.KindThisKeyword {
				binding.Source = "component"
			} else if ast.IsIdentifier(argument) {
				if symbol := typeChecker.GetSymbolAtLocation(argument); symbol != nil {
					if sourceIndex, exists := callerParameters[ast.GetSymbolId(symbol)]; exists {
						binding.Source = "parameter"
						binding.SourceParameterIndex = sourceIndex
					}
				}
			}
		}
		result = append(result, binding)
	}
	return result
}

func isSideEffectImport(node *ast.Node) bool {
	return ast.IsImportDeclaration(node) &&
		node.AsImportDeclaration().ImportClause == nil &&
		node.AsImportDeclaration().ModuleSpecifier != nil &&
		ast.IsStringLiteral(node.AsImportDeclaration().ModuleSpecifier)
}

func walkCallable(root *ast.Node, visit func(*ast.Node) bool) {
	var walk func(*ast.Node)
	walk = func(node *ast.Node) {
		if node != root && isCallableNode(node) {
			return
		}
		if !visit(node) {
			return
		}
		node.ForEachChild(func(child *ast.Node) bool {
			walk(child)
			return false
		})
	}
	walk(root)
}

func directlyOwnedSpan(start int, end int, owner int, facts []callableFacts) bool {
	node := facts[owner].node
	if start < node.Pos() || end > node.End() {
		return false
	}
	for index := range facts {
		if index == owner {
			continue
		}
		if facts[index].sourceFile != facts[owner].sourceFile {
			continue
		}
		candidate := facts[index].node
		if candidate.Pos() >= node.Pos() && candidate.End() <= node.End() &&
			start >= candidate.Pos() && end <= candidate.End() {
			return false
		}
	}
	return true
}

func contextEffect(
	call *ast.CallExpression,
	sourceFile *ast.SourceFile,
) (ContextEffect, bool) {
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return ContextEffect{}, false
	}
	member := call.Expression.AsPropertyAccessExpression()
	if member.Expression == nil || member.Expression.Kind != ast.KindThisKeyword ||
		member.Name() == nil ||
		(member.Name().Text() != "getContext" && member.Name().Text() != "setContext") {
		return ContextEffect{}, false
	}
	token := "unknown"
	confidence := "unknown"
	if call.Arguments != nil && len(call.Arguments.Nodes) != 0 {
		candidate := strings.TrimSpace(sourceText(sourceFile, call.Arguments.Nodes[0]))
		if exactContextToken.MatchString(candidate) {
			token = candidate
			confidence = "exact"
		}
	}
	kind := "read"
	if member.Name().Text() == "setContext" {
		kind = "write"
	}
	return ContextEffect{Token: token, Kind: kind, Confidence: confidence}, true
}

func collectContextBindings(sourceFile *ast.SourceFile) map[string]ContextEffect {
	result := make(map[string]ContextEffect)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		declaration := node.AsVariableDeclaration()
		if declaration.Name() == nil ||
			!ast.IsIdentifier(declaration.Name()) ||
			declaration.Initializer == nil ||
			!ast.IsCallExpression(declaration.Initializer) {
			return true
		}
		if effect, ok := contextEffect(
			declaration.Initializer.AsCallExpression(),
			sourceFile,
		); ok && effect.Kind == "read" {
			result[declaration.Name().Text()] = effect
		}
		return true
	})
	return result
}

func contextBindingCallEffect(
	expression *ast.Node,
	bindings map[string]ContextEffect,
) (ContextEffect, bool) {
	text := ""
	if ast.IsPropertyAccessExpression(expression) {
		receiver := expression.AsPropertyAccessExpression().Expression
		for ast.IsPropertyAccessExpression(receiver) {
			receiver = receiver.AsPropertyAccessExpression().Expression
		}
		if ast.IsIdentifier(receiver) {
			text = receiver.Text()
		}
	} else if ast.IsIdentifier(expression) {
		text = expression.Text()
	}
	effect, exists := bindings[text]
	return effect, exists
}

func callTargetSymbol(
	expression *ast.Node,
	typeChecker *checker.Checker,
) *ast.Symbol {
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		if member.Name() != nil &&
			(member.Name().Text() == "call" || member.Name().Text() == "apply") {
			return callTargetSymbol(member.Expression, typeChecker)
		}
		// Resolving an arbitrary property-call name forces contextual checking of
		// its receiver. TS-Go can currently panic there for otherwise valid
		// generic callbacks. Opaque instance methods remain conservative edges.
		return nil
	}
	if ast.IsIdentifier(expression) {
		return typeChecker.GetResolvedSymbol(expression)
	}
	return typeChecker.GetSymbolAtLocation(expression)
}

func resolvedCallableSymbol(
	symbol *ast.Symbol,
	typeChecker *checker.Checker,
) *ast.Symbol {
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return typeChecker.GetAliasedSymbol(symbol)
	}
	return symbol
}

func unresolvedCallEnvironment(
	expression *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	contextBindings map[string]ContextEffect,
) string {
	text := strings.TrimSpace(sourceText(sourceFile, expression))
	if exactComponentOperation(text) {
		return ""
	}
	root := text
	if separator := strings.IndexAny(root, ".("); separator >= 0 {
		root = root[:separator]
	}
	if _, universal := universalCallRoots[root]; universal {
		return ""
	}
	if _, contextBinding := contextBindings[root]; contextBinding {
		return ""
	}
	if environment := receiverTypeEnvironment(expression, typeChecker); environment == "neutral" {
		return ""
	} else if environment != "" {
		return environment
	}
	symbol := callTargetSymbol(expression, typeChecker)
	if serverOnlyImportSymbol(symbol) {
		return "server"
	}
	if environment, classified := declarationCallEnvironment(
		resolvedCallableSymbol(symbol, typeChecker),
		expression,
	); classified {
		return environment
	}
	if _, server := serverGlobals[root]; server &&
		symbolIsOutsideSource(symbol, sourceFile) {
		return "server"
	}
	if _, browser := browserGlobals[root]; browser &&
		symbolIsOutsideSource(symbol, sourceFile) {
		return "browser"
	}
	return "unknown"
}

func declarationCallEnvironment(
	symbol *ast.Symbol,
	expression *ast.Node,
) (string, bool) {
	if symbol == nil {
		return "", false
	}
	name := ""
	switch {
	case ast.IsIdentifier(expression):
		name = expression.Text()
	case ast.IsPropertyAccessExpression(expression):
		member := expression.AsPropertyAccessExpression().Name()
		if member != nil {
			name = member.Text()
		}
	}
	for _, declaration := range symbol.Declarations {
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		filename := strings.ToLower(
			strings.ReplaceAll(sourceFile.FileName(), `\`, "/"),
		)
		switch {
		case strings.Contains(filename, "/@types/node/"):
			return "server", true
		case strings.Contains(filename, "/packages/hydrate/") ||
			strings.Contains(filename, "/@exactjs/hydrate/"):
			return "browser", true
		case strings.Contains(filename, "/packages/dom/") ||
			strings.Contains(filename, "/@exactjs/dom/"):
			switch name {
			case "render", "unmount", "dispose", "adoptStatic",
				"adoptComponentRoot", "adoptMarkerlessComponentRoot",
				"findComponentDomNode", "disposeOwnedSubtree":
				return "browser", true
			default:
				return "", true
			}
		case strings.Contains(filename, "/packages/core/") ||
			strings.Contains(filename, "/@exactjs/core/") ||
			strings.Contains(filename, "/packages/reactive/") ||
			strings.Contains(filename, "/@exactjs/reactive/") ||
			strings.Contains(filename, "/packages/request/") ||
			strings.Contains(filename, "/@exactjs/request/"):
			return "", true
		}
	}
	return "", false
}

func opaqueCallExpression(expression *ast.Node, typeChecker *checker.Checker) bool {
	root := expression
	for ast.IsPropertyAccessExpression(root) {
		root = root.AsPropertyAccessExpression().Expression
	}
	if !ast.IsIdentifier(root) {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(root)
	if symbol == nil {
		return false
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return true
	}
	for _, declaration := range symbol.Declarations {
		if ast.IsParameterDeclaration(declaration) {
			return true
		}
	}
	return false
}

func exactComponentOperation(text string) bool {
	if strings.HasPrefix(text, "TaskContext.") {
		return true
	}
	if !strings.HasPrefix(text, "this.") {
		return false
	}
	member := strings.TrimPrefix(text, "this.")
	switch member {
	case "hasContext", "map", "getContext", "setContext", "prop", "ref", "reactive",
		"onMount", "onActivate", "onDeactivate", "onUnmount", "onRender":
		return true
	}
	return member == "task" ||
		strings.HasPrefix(member, "task.") ||
		member == "action" ||
		strings.HasPrefix(member, "action.") ||
		strings.HasPrefix(member, "log.") ||
		strings.HasPrefix(member, "refs.")
}

func receiverTypeEnvironment(
	expression *ast.Node,
	typeChecker *checker.Checker,
) (environment string) {
	if !ast.IsPropertyAccessExpression(expression) {
		return ""
	}
	defer func() {
		if recover() != nil {
			environment = ""
		}
	}()
	value := typeChecker.GetTypeAtLocation(
		expression.AsPropertyAccessExpression().Expression,
	)
	if value == nil {
		return ""
	}
	display := typeChecker.TypeToString(value)
	if neutralReceiverType.MatchString(display) {
		return "neutral"
	}
	if browserReceiverType.MatchString(display) {
		return "browser"
	}
	return ""
}

func resolveCallableEffects(facts []callableFacts) {
	changed := true
	for changed {
		changed = false
		for index := range facts {
			fact := &facts[index]
			sources := append(
				[]EnvironmentEffectSource(nil),
				fact.summary.DirectEffectSources...,
			)
			reads := append([]StateEffect(nil), fact.directReads...)
			writes := append([]StateEffect(nil), fact.directWrites...)
			contexts := append([]ContextEffect(nil), fact.directContext...)
			for _, targetIndex := range fact.targets {
				target := facts[targetIndex].summary
				for _, source := range target.EffectSources {
					path := source.Path
					if len(path) == 0 || path[0] != fact.summary.Name {
						path = append([]string{fact.summary.Name}, path...)
					}
					sources = append(sources, EnvironmentEffectSource{
						Environment: source.Environment,
						Description: source.Description,
						Path:        path,
						Opaque:      source.Opaque,
					})
				}
				reads = append(
					reads,
					mapStateEffects(
						target.StateReads,
						fact.summary.Calls,
						target.ID,
					)...,
				)
				writes = append(
					writes,
					mapStateEffects(
						target.StateWrites,
						fact.summary.Calls,
						target.ID,
					)...,
				)
				contexts = append(contexts, target.Contexts...)
			}
			for _, target := range fact.externalTargets {
				for _, source := range target.EffectSources {
					path := source.Path
					if len(path) == 0 || path[0] != fact.summary.Name {
						path = append([]string{fact.summary.Name}, path...)
					}
					sources = append(sources, EnvironmentEffectSource{
						Environment: source.Environment,
						Description: source.Description,
						Path:        path,
						Opaque:      source.Opaque,
					})
				}
				reads = append(
					reads,
					mapStateEffects(
						target.StateReads,
						fact.summary.Calls,
						target.ID,
					)...,
				)
				writes = append(
					writes,
					mapStateEffects(
						target.StateWrites,
						fact.summary.Calls,
						target.ID,
					)...,
				)
				contexts = append(contexts, target.Contexts...)
			}
			sources = uniqueEnvironmentSources(sources)
			reads = minimalStateEffects(reads)
			writes = uniqueStateEffects(writes)
			contexts = uniqueContextEffects(contexts)
			if environmentSourcesSignature(sources) !=
				environmentSourcesSignature(fact.summary.EffectSources) {
				fact.summary.EffectSources = sources
				changed = true
			}
			if stateEffectsSignature(reads) != stateEffectsSignature(fact.summary.StateReads) {
				fact.summary.StateReads = reads
				changed = true
			}
			if stateEffectsSignature(writes) != stateEffectsSignature(fact.summary.StateWrites) {
				fact.summary.StateWrites = writes
				changed = true
			}
			if contextEffectsSignature(contexts) != contextEffectsSignature(fact.summary.Contexts) {
				fact.summary.Contexts = contexts
				changed = true
			}
		}
	}
}

func mapStateEffects(
	effects []StateEffect,
	edges []CallEdge,
	targetID string,
) []StateEffect {
	var bindings []ReceiverBinding
	for _, edge := range edges {
		if edge.Resolved && edge.TargetID == targetID {
			bindings = edge.ReceiverBindings
			break
		}
	}
	result := make([]StateEffect, len(effects))
	for index, effect := range effects {
		result[index] = effect
		if effect.Receiver == nil || effect.Receiver.Kind != "parameter" {
			continue
		}
		var binding *ReceiverBinding
		for bindingIndex := range bindings {
			if bindings[bindingIndex].ParameterIndex == effect.Receiver.Index {
				binding = &bindings[bindingIndex]
				break
			}
		}
		switch {
		case binding != nil && binding.Source == "component":
			result[index].Receiver = &StateReceiver{Kind: "component"}
		case binding != nil && binding.Source == "parameter":
			result[index].Receiver = &StateReceiver{
				Kind:  "parameter",
				Index: binding.SourceParameterIndex,
			}
		default:
			result[index].Receiver = &StateReceiver{Kind: "unknown"}
			result[index].Confidence = "unknown"
			if result[index].Path == "" {
				result[index].Path = "*"
			}
		}
	}
	return result
}

func applyCallableArtifactConstraints(facts []callableFacts) {
	constraints := make([]uint8, len(facts))
	for index := range facts {
		for _, source := range facts[index].summary.EffectSources {
			if source.Environment == "browser" {
				constraints[index] |= 1
			}
			if source.Environment == "server" {
				constraints[index] |= 2
			}
		}
	}
	changed := true
	for changed {
		changed = false
		for callerIndex := range facts {
			for _, targetIndex := range facts[callerIndex].targets {
				next := constraints[targetIndex] | constraints[callerIndex]
				if next != constraints[targetIndex] {
					constraints[targetIndex] = next
					changed = true
				}
			}
		}
	}
	for index := range facts {
		facts[index].artifactConstraint = constraints[index]
	}
}

func environmentSource(
	environment string,
	description string,
	callable string,
) EnvironmentEffectSource {
	return EnvironmentEffectSource{
		Environment: environment,
		Description: description,
		Path:        []string{callable, description},
	}
}

func uniqueEnvironmentSources(
	values []EnvironmentEffectSource,
) []EnvironmentEffectSource {
	result := make([]EnvironmentEffectSource, 0, len(values))
	shortest := make(map[string]EnvironmentEffectSource, len(values))
	for _, value := range values {
		key := value.Environment + ":" + value.Description
		current, exists := shortest[key]
		if !exists || len(value.Path) < len(current.Path) ||
			(len(value.Path) == len(current.Path) &&
				strings.Join(value.Path, ".") < strings.Join(current.Path, ".")) {
			value.Path = nonNilSlice(value.Path)
			shortest[key] = value
		}
	}
	for _, value := range shortest {
		result = append(result, value)
	}
	sort.Slice(result, func(left int, right int) bool {
		leftKey := result[left].Environment + ":" + result[left].Description + ":" +
			strings.Join(result[left].Path, ".")
		rightKey := result[right].Environment + ":" + result[right].Description + ":" +
			strings.Join(result[right].Path, ".")
		return leftKey < rightKey
	})
	return result
}

func uniqueContextEffects(values []ContextEffect) []ContextEffect {
	unique := make([]ContextEffect, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		key := value.Kind + ":" + value.Token
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		unique = append(unique, value)
	}
	result := make([]ContextEffect, 0, len(unique))
	for _, value := range unique {
		if value.Kind == "read" {
			result = append(result, value)
		}
	}
	for _, value := range unique {
		if value.Kind != "read" {
			result = append(result, value)
		}
	}
	return result
}

func environmentEffectFor(sources []EnvironmentEffectSource) string {
	browser, server, unknown := false, false, false
	for _, source := range sources {
		browser = browser || source.Environment == "browser"
		server = server || source.Environment == "server"
		unknown = unknown || source.Environment == "unknown"
	}
	if browser && server {
		return "mixed"
	}
	if unknown {
		return "unknown"
	}
	if browser {
		return "browser"
	}
	if server {
		return "server"
	}
	return "neutral"
}

func artifactTargetsFor(
	effect string,
	sources []EnvironmentEffectSource,
	constraint uint8,
) []string {
	switch effect {
	case "browser":
		return []string{"client"}
	case "server":
		return []string{"server"}
	case "neutral":
		return []string{"client", "server"}
	default:
		if constraint == 1 {
			return []string{"client"}
		}
		if constraint == 2 {
			return []string{"server"}
		}
		browser, server := false, false
		for _, source := range sources {
			browser = browser || source.Environment == "browser"
			server = server || source.Environment == "server"
		}
		if browser && !server {
			return []string{"client"}
		}
		if server && !browser {
			return []string{"server"}
		}
		return []string{}
	}
}

func moduleInitializerDiagnostics(
	callables callableAnalysis,
	target Target,
	sourceFile *ast.SourceFile,
	policy PolicyManifest,
) []Diagnostic {
	diagnostics := []Diagnostic{}
	if target == TargetDefault {
		return diagnostics
	}
	for _, fact := range callables.facts {
		if fact.sourceFile != sourceFile {
			continue
		}
		callable := fact.summary
		if callable.Kind != "module-initializer" {
			continue
		}
		message := ""
		switch callable.Effect {
		case "mixed":
			message = "executable module initializer has indivisible browser and server effects"
		case "unknown":
			if containsOpaqueEnvironment(callable.EffectSources) &&
				!artifactTargetsInclude(callable.ArtifactTargets, target) &&
				!(target == TargetServer &&
					policyConstrainsModuleInitializer(
						fact.node,
						sourceFile,
						policy,
					)) {
				message = "executable module initializer depends on an opaque call or side-effect import"
			}
		}
		if message != "" {
			diagnostics = append(diagnostics, Diagnostic{
				Severity: "error",
				Code:     "EXACT2101",
				Message:  "error: " + message,
			})
		}
	}
	return diagnostics
}

func policyConstrainsModuleInitializer(
	node *ast.Node,
	sourceFile *ast.SourceFile,
	policy PolicyManifest,
) bool {
	startLine, _ := sourceLocation(sourceFile, node.Pos())
	endLine, _ := sourceLocation(sourceFile, node.End())
	for _, consumer := range policy.SecretConsumers {
		if consumer.Target == "server" &&
			consumer.Line >= startLine &&
			consumer.Line <= endLine {
			return true
		}
	}
	return false
}

func environmentSourcesSignature(values []EnvironmentEffectSource) string {
	var result strings.Builder
	for _, value := range values {
		result.WriteString(value.Environment)
		result.WriteByte(':')
		result.WriteString(value.Description)
		result.WriteByte(':')
		result.WriteString(strings.Join(value.Path, "."))
		if value.Opaque {
			result.WriteString(":opaque")
		}
		result.WriteByte('\n')
	}
	return result.String()
}

func stateEffectsSignature(values []StateEffect) string {
	var result strings.Builder
	for _, value := range values {
		result.WriteString(value.Kind)
		result.WriteByte(':')
		result.WriteString(value.Path)
		result.WriteByte(':')
		result.WriteString(value.Confidence)
		result.WriteByte(':')
		result.WriteString(stateReceiverSignature(value.Receiver))
		result.WriteByte('\n')
	}
	return result.String()
}

func stateReceiverSignature(receiver *StateReceiver) string {
	if receiver == nil {
		return "component"
	}
	if receiver.Kind == "parameter" {
		return fmt.Sprintf("parameter:%d", receiver.Index)
	}
	return receiver.Kind
}

func contextEffectsSignature(values []ContextEffect) string {
	var result strings.Builder
	for _, value := range values {
		result.WriteString(value.Kind)
		result.WriteByte(':')
		result.WriteString(value.Token)
		result.WriteByte(':')
		result.WriteString(value.Confidence)
		result.WriteByte('\n')
	}
	return result.String()
}
