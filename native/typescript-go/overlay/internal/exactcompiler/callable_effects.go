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
	"Array": {}, "atob": {}, "BigInt": {}, "Boolean": {}, "btoa": {}, "Date": {}, "Error": {},
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
	callExpressions    map[string]*ast.Node
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
	componentBindings map[int]componentBinding,
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
			callSymbols:     make(map[string]ast.SymbolId),
			callExpressions: make(map[string]*ast.Node),
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
	contextBindings := collectContextBindings(sourceFile, typeChecker)

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
	facts = appendComponentBindingCallableFacts(facts, sourceFile, componentBindings)
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
	componentBindings map[int]componentBinding,
) callableAnalysis {
	if project.callableCache == nil {
		project.callableCache = buildProjectCallableCache(
			project.program,
			typeChecker,
			&project.counters,
		)
	}
	cache := project.callableCache
	ensureProjectCallableSources(project, typeChecker, cache)
	if !cache.owned[sourceFile] {
		project.counters.CallableSourceAnalyses++
		refreshed := collectCallableEffects(
			sourceFile,
			typeChecker,
			components,
			stateReads,
			stateWrites,
			componentBindings,
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

func buildProjectCallableCache(
	program *compiler.Program,
	typeChecker *checker.Checker,
	counters *WorkCounters,
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
		counters.CallableSourceAnalyses++
		analysis := analyzeProjectCallableSource(sourceFile, typeChecker)
		cache.bySource[sourceFile] = analysis
		cache.fingerprints[sourceFile] = callableAnalysisFingerprint(analysis)
	}
	rebuildProjectCallableCache(program, cache)
	return cache
}

func ensureProjectCallableSources(
	project *projectState,
	typeChecker *checker.Checker,
	cache *projectCallableCache,
) {
	changed := false
	for _, sourceFile := range project.program.GetSourceFiles() {
		if sourceFile.IsDeclarationFile ||
			strings.Contains(strings.ReplaceAll(sourceFile.FileName(), `\`, `/`), "/node_modules/") {
			continue
		}
		if _, exists := cache.bySource[sourceFile]; exists {
			continue
		}
		project.counters.CallableSourceAnalyses++
		analysis := analyzeProjectCallableSource(sourceFile, typeChecker)
		cache.bySource[sourceFile] = analysis
		cache.fingerprints[sourceFile] = callableAnalysisFingerprint(analysis)
		changed = true
	}
	if changed {
		rebuildProjectCallableCache(project.program, cache)
	}
}

func analyzeProjectCallableSource(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) callableAnalysis {
	components := collectComponents(sourceFile)
	_, reads, writes := collectStateAnalysis(sourceFile, typeChecker)
	bindings, bindingWrites, _ := analyzeComponentBindings(
		sourceFile,
		typeChecker,
		collectEnhancementImports(sourceFile, typeChecker, nil, 0),
	)
	writes = append(writes, bindingWrites...)
	return collectCallableEffects(
		sourceFile,
		typeChecker,
		components,
		reads,
		writes,
		bindings,
	)
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
	value.callExpressions = cloneCallExpressions(value.callExpressions)
	return value
}

func cloneCallExpressions(values map[string]*ast.Node) map[string]*ast.Node {
	result := make(map[string]*ast.Node, len(values))
	for id, expression := range values {
		result[id] = expression
	}
	return result
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
