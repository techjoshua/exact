package exactcompiler

import (
	"fmt"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type externalImportReference struct {
	moduleSpecifier string
	exportName      string
	namespace       bool
}

type externalImportBindings struct {
	bySymbol map[ast.SymbolId]externalImportReference
	byName   map[string]externalImportReference
}

type externalManifestIndex struct {
	bySource map[string][]ExternalManifest
}

func newExternalManifestIndex(
	sourceFile *ast.SourceFile,
	manifests []ExternalManifest,
) externalManifestIndex {
	result := externalManifestIndex{bySource: make(map[string][]ExternalManifest)}
	sourceDirectory := filepath.Dir(sourceFile.FileName())
	for _, manifest := range manifests {
		keys := []string{externalModuleKey(manifest.Filename, sourceDirectory)}
		if manifest.PackageName != "" {
			keys = append(keys, externalModuleKey(manifest.PackageName, sourceDirectory))
		}
		for _, key := range keys {
			if key == "" {
				continue
			}
			result.bySource[key] = append(result.bySource[key], manifest)
		}
	}
	return result
}

func (index externalManifestIndex) manifestsFor(
	sourceFile *ast.SourceFile,
	moduleSpecifier string,
) []ExternalManifest {
	return index.bySource[externalModuleKey(
		moduleSpecifier,
		filepath.Dir(sourceFile.FileName()),
	)]
}

func (index externalManifestIndex) component(
	sourceFile *ast.SourceFile,
	reference externalImportReference,
) (ExternalComponentExport, bool) {
	for _, manifest := range index.manifestsFor(sourceFile, reference.moduleSpecifier) {
		for _, component := range manifest.Components {
			if component.ExportName == reference.exportName {
				return component, true
			}
		}
	}
	return ExternalComponentExport{}, false
}

func (index externalManifestIndex) callable(
	sourceFile *ast.SourceFile,
	reference externalImportReference,
) (CallableSummary, bool) {
	for _, manifest := range index.manifestsFor(sourceFile, reference.moduleSpecifier) {
		for _, callable := range manifest.Callables {
			if reference.exportName == "*module*" &&
				callable.Kind == "module-initializer" {
				return callable, true
			}
			if containsString(callable.ExportNames, reference.exportName) {
				return callable, true
			}
		}
	}
	return CallableSummary{}, false
}

func externalModuleKey(specifier string, sourceDirectory string) string {
	value := strings.TrimSpace(strings.ReplaceAll(specifier, `\`, `/`))
	if value == "" {
		return ""
	}
	portableRooted := runtime.GOOS == "windows" && strings.HasPrefix(value, "/")
	if portableRooted {
		// Portable manifests commonly use project-rooted POSIX filenames
		// ("/src/View.tsx"). Native request ids use the same spelling but are
		// resolved relative to the retained project's root on Windows.
		value = strings.TrimLeft(value, "/")
	}
	if portableRooted || strings.HasPrefix(value, ".") || filepath.IsAbs(specifier) {
		if !portableRooted && !filepath.IsAbs(specifier) {
			value = filepath.Join(sourceDirectory, filepath.FromSlash(value))
		}
		absolute, err := filepath.Abs(value)
		if err == nil {
			value = filepath.ToSlash(filepath.Clean(absolute))
		}
	}
	value = stripExternalModuleSuffix(value)
	if runtime.GOOS == "windows" {
		value = strings.ToLower(value)
	}
	return value
}

func stripExternalModuleSuffix(value string) string {
	lower := strings.ToLower(value)
	for _, suffix := range []string{".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"} {
		if strings.HasSuffix(lower, suffix) {
			value = value[:len(value)-len(suffix)]
			lower = lower[:len(lower)-len(suffix)]
			break
		}
	}
	for _, suffix := range []string{".exact.client", ".exact.server", ".exact"} {
		if strings.HasSuffix(lower, suffix) {
			return value[:len(value)-len(suffix)]
		}
	}
	return value
}

func collectExternalImportBindings(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) externalImportBindings {
	result := externalImportBindings{
		bySymbol: make(map[ast.SymbolId]externalImportReference),
		byName:   make(map[string]externalImportReference),
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if declaration.ImportClause == nil ||
			!ast.IsStringLiteral(declaration.ModuleSpecifier) {
			continue
		}
		moduleSpecifier := declaration.ModuleSpecifier.AsStringLiteral().Text
		clause := declaration.ImportClause.AsImportClause()
		if clause.PhaseModifier == ast.KindTypeKeyword {
			continue
		}
		if name := clause.Name(); name != nil {
			bindExternalImportSymbol(
				result,
				name,
				externalImportReference{
					moduleSpecifier: moduleSpecifier,
					exportName:      "default",
				},
				typeChecker,
			)
		}
		bindings := clause.NamedBindings
		if bindings == nil {
			continue
		}
		if ast.IsNamespaceImport(bindings) {
			bindExternalImportSymbol(
				result,
				bindings.AsNamespaceImport().Name(),
				externalImportReference{
					moduleSpecifier: moduleSpecifier,
					namespace:       true,
				},
				typeChecker,
			)
			continue
		}
		for _, element := range bindings.AsNamedImports().Elements.Nodes {
			specifier := element.AsImportSpecifier()
			if specifier.IsTypeOnly {
				continue
			}
			exportName := specifier.Name().Text()
			if specifier.PropertyName != nil {
				exportName = specifier.PropertyName.Text()
			}
			bindExternalImportSymbol(
				result,
				specifier.Name(),
				externalImportReference{
					moduleSpecifier: moduleSpecifier,
					exportName:      exportName,
				},
				typeChecker,
			)
		}
	}
	return result
}

func bindExternalImportSymbol(
	bindings externalImportBindings,
	name *ast.Node,
	reference externalImportReference,
	typeChecker *checker.Checker,
) {
	bindings.byName[name.Text()] = reference
	symbol := typeChecker.GetSymbolAtLocation(name)
	if symbol == nil {
		return
	}
	bindings.bySymbol[ast.GetSymbolId(symbol)] = reference
	if target := resolvedCallableSymbol(symbol, typeChecker); target != nil {
		bindings.bySymbol[ast.GetSymbolId(target)] = reference
	}
}

func externalImportForExpression(
	expression *ast.Node,
	bindings externalImportBindings,
	typeChecker *checker.Checker,
) (externalImportReference, bool) {
	if ast.IsPropertyAccessExpression(expression) {
		member := expression.AsPropertyAccessExpression()
		if member.Name() != nil &&
			(member.Name().Text() == "call" || member.Name().Text() == "apply") {
			return externalImportForExpression(member.Expression, bindings, typeChecker)
		}
		if ast.IsIdentifier(member.Expression) {
			bindingSymbol := typeChecker.GetSymbolAtLocation(member.Expression)
			symbol := typeChecker.GetResolvedSymbol(member.Expression)
			if symbol != nil {
				reference, exists := bindings.bySymbol[ast.GetSymbolId(symbol)]
				if exists && reference.namespace {
					reference.exportName = member.Name().Text()
					reference.namespace = false
					return reference, true
				}
				if !exists &&
					(symbolDeclaredByImport(symbol) ||
						symbolDeclaredByImport(bindingSymbol) ||
						symbolDeclaredOutsideSource(symbol, member.Expression)) {
					reference, exists = bindings.byName[member.Expression.Text()]
					if exists && reference.namespace {
						reference.exportName = member.Name().Text()
						reference.namespace = false
						return reference, true
					}
				}
			}
			if reference, exists := bindings.byName[member.Expression.Text()]; exists &&
				reference.namespace {
				reference.exportName = member.Name().Text()
				reference.namespace = false
				return reference, true
			}
		}
	}
	if !ast.IsIdentifier(expression) {
		// Direct imported callables are identifiers. Property accesses are
		// relevant only for namespace imports, handled above; asking the
		// checker to resolve an arbitrary receiver can contextually check an
		// unrelated callback/object graph.
		return externalImportReference{}, false
	}
	symbol := typeChecker.GetResolvedSymbol(expression)
	bindingSymbol := typeChecker.GetSymbolAtLocation(expression)
	if symbol == nil {
		reference, exists := bindings.byName[expression.Text()]
		return reference, exists && !reference.namespace
	}
	reference, exists := bindings.bySymbol[ast.GetSymbolId(symbol)]
	if !exists {
		target := resolvedCallableSymbol(symbol, typeChecker)
		if target != nil {
			reference, exists = bindings.bySymbol[ast.GetSymbolId(target)]
		}
	}
	if !exists &&
		(symbolDeclaredByImport(symbol) ||
			symbolDeclaredByImport(bindingSymbol) ||
			symbolDeclaredOutsideSource(symbol, expression)) {
		reference, exists = bindings.byName[expression.Text()]
	}
	if !exists {
		reference, exists = bindings.byName[expression.Text()]
	}
	return reference, exists && !reference.namespace
}

func symbolDeclaredOutsideSource(symbol *ast.Symbol, location *ast.Node) bool {
	if symbol == nil || location == nil {
		return false
	}
	current := ast.GetSourceFileOfNode(location)
	if current == nil {
		return false
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if source != nil && source != current {
			return true
		}
	}
	return false
}

func symbolDeclaredByImport(symbol *ast.Symbol) bool {
	if symbol == nil {
		return false
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return true
	}
	for _, declaration := range symbol.Declarations {
		if enclosingImportDeclaration(declaration) != nil {
			return true
		}
	}
	return false
}

func linkExternalCallableEffects(
	requested *ast.SourceFile,
	analysis callableAnalysis,
	manifests []ExternalManifest,
) callableAnalysis {
	if len(manifests) == 0 {
		return analysis
	}
	index := newExternalManifestIndex(requested, manifests)
	for factIndex := range analysis.facts {
		fact := &analysis.facts[factIndex]
		fact.externalTargets = nil
		for edgeIndex := range fact.summary.Calls {
			edge := &fact.summary.Calls[edgeIndex]
			if edge.Resolved || edge.ModuleSpecifier == "" || edge.ExportName == "" {
				continue
			}
			target, exists := index.callable(
				fact.sourceFile,
				externalImportReference{
					moduleSpecifier: edge.ModuleSpecifier,
					exportName:      edge.ExportName,
				},
			)
			if !exists {
				continue
			}
			edge.TargetID = target.ID
			edge.Resolved = true
			fact.externalTargets = append(fact.externalTargets, target)
		}
		removeResolvedCallUnknownSources(fact)
		fact.summary.EffectSources = append(
			[]EnvironmentEffectSource(nil),
			fact.summary.DirectEffectSources...,
		)
		fact.summary.StateReads = append([]StateEffect(nil), fact.directReads...)
		fact.summary.StateWrites = append([]StateEffect(nil), fact.directWrites...)
		fact.summary.Contexts = append([]ContextEffect(nil), fact.directContext...)
	}
	resolveCallableEffects(analysis.facts)
	applyCallableArtifactConstraints(analysis.facts)
	return appendForwardedCallableExports(
		requested,
		rebuildCallableAnalysis(requested, analysis),
		index,
	)
}

func appendForwardedCallableExports(
	sourceFile *ast.SourceFile,
	analysis callableAnalysis,
	index externalManifestIndex,
) callableAnalysis {
	seen := make(map[string]struct{}, len(analysis.summaries))
	for _, summary := range analysis.summaries {
		for _, exportName := range summary.ExportNames {
			seen[exportName] = struct{}{}
		}
	}
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsExportDeclaration(statement) {
			continue
		}
		declaration := statement.AsExportDeclaration()
		if declaration.IsTypeOnly ||
			declaration.ModuleSpecifier == nil ||
			!ast.IsStringLiteral(declaration.ModuleSpecifier) ||
			declaration.ExportClause == nil ||
			!ast.IsNamedExports(declaration.ExportClause) {
			continue
		}
		moduleSpecifier := declaration.ModuleSpecifier.AsStringLiteral().Text
		for _, node := range declaration.ExportClause.AsNamedExports().Elements.Nodes {
			specifier := node.AsExportSpecifier()
			if specifier.IsTypeOnly {
				continue
			}
			exportName := specifier.Name().Text()
			if _, exists := seen[exportName]; exists {
				continue
			}
			importedName := exportName
			if specifier.PropertyName != nil {
				importedName = specifier.PropertyName.Text()
			}
			target, exists := index.callable(
				sourceFile,
				externalImportReference{
					moduleSpecifier: moduleSpecifier,
					exportName:      importedName,
				},
			)
			if !exists {
				continue
			}
			target.ID = fmt.Sprintf(
				"callable:%s:%d:%s",
				sourceFile.FileName(),
				statement.Pos(),
				exportName,
			)
			target.Name = exportName
			target.ExportNames = []string{exportName}
			target.DirectEffectSources = prefixForwardedEffectSources(
				exportName,
				target.DirectEffectSources,
			)
			target.EffectSources = prefixForwardedEffectSources(
				exportName,
				target.EffectSources,
			)
			analysis.summaries = append(analysis.summaries, target)
			seen[exportName] = struct{}{}
		}
	}
	sort.Slice(analysis.summaries, func(left int, right int) bool {
		return analysis.summaries[left].ID < analysis.summaries[right].ID
	})
	return analysis
}

func prefixForwardedEffectSources(
	exportName string,
	sources []EnvironmentEffectSource,
) []EnvironmentEffectSource {
	result := make([]EnvironmentEffectSource, len(sources))
	for index, source := range sources {
		result[index] = source
		if len(source.Path) == 0 || source.Path[0] != exportName {
			result[index].Path = append([]string{exportName}, source.Path...)
		} else {
			result[index].Path = append([]string(nil), source.Path...)
		}
	}
	return result
}

func removeResolvedCallUnknownSources(fact *callableFacts) {
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
}

func rebuildCallableAnalysis(
	requested *ast.SourceFile,
	analysis callableAnalysis,
) callableAnalysis {
	summaries := []CallableSummary{}
	byNode := make(map[*ast.Node]CallableSummary, len(analysis.facts))
	finalByID := make(map[string]CallableSummary, len(analysis.facts))
	for index := range analysis.facts {
		fact := &analysis.facts[index]
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
	bySymbol := make(map[ast.SymbolId]CallableSummary, len(analysis.bySymbol))
	for symbol, old := range analysis.bySymbol {
		if current, exists := finalByID[old.ID]; exists {
			bySymbol[symbol] = current
		}
	}
	sort.Slice(summaries, func(left int, right int) bool {
		return summaries[left].ID < summaries[right].ID
	})
	return callableAnalysis{
		summaries: summaries,
		byNode:    byNode,
		bySymbol:  bySymbol,
		facts:     analysis.facts,
	}
}
