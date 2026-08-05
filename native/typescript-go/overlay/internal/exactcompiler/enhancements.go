package exactcompiler

import (
	"fmt"
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type enhancementComponent struct {
	identity  string
	canonical string
	members   map[string]enhancementMember
	variants  []map[string]enhancementMember
	module    string
	export    string
}

type enhancementActivator struct {
	name      string
	component *enhancementComponent
}

type enhancementBinding struct {
	defaultComponent *enhancementComponent
	activators       map[string]enhancementActivator
}

type enhancementMember struct {
	prop      string
	valueType *checker.Type
	optional  bool
}

type enhancementImports struct {
	bindings     map[string]enhancementBinding
	declarations map[int]struct{}
	spreads      map[int]enhancementSpread
	applications map[int]enhancementApplication
	catalog      []RendererEnhancement
	diagnostics  []Diagnostic
}

type enhancementSpreadMember struct {
	identity string
	prop     string
	source   string
}

type enhancementSpread struct {
	members []enhancementSpreadMember
	keys    []string
}

type enhancementApplication struct {
	components []enhancementComponent
	attributes map[int][]enhancementSpreadMember
}

type enhancementResolutionDiagnostic struct {
	code    string
	message string
}

func collectEnhancementImports(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) enhancementImports {
	result := enhancementImports{
		bindings:     make(map[string]enhancementBinding),
		declarations: make(map[int]struct{}),
		spreads:      make(map[int]enhancementSpread),
		applications: make(map[int]enhancementApplication),
	}
	ordinaryBindings := make(map[string]struct{})
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if !exactEnhancementImport(declaration) {
			collectImportLocalNames(declaration, ordinaryBindings)
			continue
		}
		result.declarations[statement.Pos()] = struct{}{}
		addDiagnostic := func(code string, message string) {
			line, column := sourceLocation(sourceFile, statement.Pos())
			result.diagnostics = append(result.diagnostics, Diagnostic{
				Severity: "error",
				Code:     code,
				Message: fmt.Sprintf(
					"error: %s:%d:%d %s",
					sourceFile.FileName(), line, column, message,
				),
				Start:  statement.Pos(),
				Length: statement.End() - statement.Pos(),
			})
		}
		if declaration.ImportClause == nil ||
			!ast.IsStringLiteral(declaration.ModuleSpecifier) {
			addDiagnostic("EXACT6001", "exact-enhancement imports require value bindings from a string module specifier")
			continue
		}
		clause := declaration.ImportClause.AsImportClause()
		if clause.PhaseModifier == ast.KindTypeKeyword {
			addDiagnostic("EXACT6002", "type-only imports cannot define an exact-enhancement JSX namespace")
			continue
		}
		moduleSpecifier := declaration.ModuleSpecifier.AsStringLiteral().Text
		if name := clause.Name(); name != nil {
			identity, identityDiagnostic := resolveEnhancementIdentity(
				declaration.ModuleSpecifier,
				moduleSpecifier,
				"default",
				typeChecker,
			)
			if identityDiagnostic != "" {
				addDiagnostic("EXACT6010", identityDiagnostic)
				continue
			}
			component, diagnostic := resolveEnhancementComponent(
				name,
				identity,
				moduleSpecifier,
				"default",
				typeChecker,
			)
			if diagnostic != "" {
				addDiagnostic("EXACT6004", diagnostic)
			} else {
				result.bindings[name.Text()] = enhancementBinding{defaultComponent: &component}
				appendEnhancementCatalog(&result, identity, moduleSpecifier, "default")
			}
		}
		bindings := clause.NamedBindings
		if bindings == nil {
			if clause.Name() == nil {
				addDiagnostic("EXACT6001", "exact-enhancement imports require a default or named value binding")
			}
			continue
		}
		if ast.IsNamespaceImport(bindings) {
			namespace := bindings.AsNamespaceImport().Name()
			binding, diagnostics := resolveEnhancementNamespace(
				declaration.ModuleSpecifier,
				namespace,
				moduleSpecifier,
				typeChecker,
			)
			for _, diagnostic := range diagnostics {
				addDiagnostic(diagnostic.code, diagnostic.message)
			}
			if binding.defaultComponent != nil || len(binding.activators) != 0 {
				result.bindings[namespace.Text()] = binding
				appendEnhancementBindingCatalog(&result, binding)
			}
			continue
		}
		for _, element := range bindings.AsNamedImports().Elements.Nodes {
			specifier := element.AsImportSpecifier()
			if specifier.IsTypeOnly {
				addDiagnostic("EXACT6002", "type-only imports cannot define an exact-enhancement JSX namespace")
				continue
			}
			exportName := specifier.Name().Text()
			if specifier.PropertyName != nil {
				exportName = specifier.PropertyName.Text()
			}
			identity, identityDiagnostic := resolveEnhancementIdentity(
				declaration.ModuleSpecifier,
				moduleSpecifier,
				exportName,
				typeChecker,
			)
			if identityDiagnostic != "" {
				addDiagnostic("EXACT6010", identityDiagnostic)
				continue
			}
			component, diagnostic := resolveEnhancementComponent(
				specifier.Name(),
				identity,
				moduleSpecifier,
				exportName,
				typeChecker,
			)
			if diagnostic != "" {
				addDiagnostic("EXACT6004", diagnostic)
				continue
			}
			result.bindings[specifier.Name().Text()] = enhancementBinding{defaultComponent: &component}
			appendEnhancementCatalog(&result, identity, moduleSpecifier, exportName)
		}
	}
	collectEnhancementApplications(sourceFile, typeChecker, &result, ordinaryBindings)
	collectEnhancementTypeDiagnostics(sourceFile, typeChecker, &result)
	return result
}

func appendEnhancementCatalog(
	imports *enhancementImports,
	identity string,
	moduleSpecifier string,
	exportName string,
) {
	for _, existing := range imports.catalog {
		if existing.Identity == identity {
			return
		}
	}
	imports.catalog = append(imports.catalog, RendererEnhancement{
		Identity: identity, ModuleSpecifier: moduleSpecifier, ExportName: exportName,
	})
}

func appendEnhancementBindingCatalog(imports *enhancementImports, binding enhancementBinding) {
	if binding.defaultComponent != nil {
		component := binding.defaultComponent
		appendEnhancementCatalog(imports, component.identity, component.module, component.export)
	}
	names := make([]string, 0, len(binding.activators))
	for name := range binding.activators {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		activator := binding.activators[name]
		component := activator.component
		appendEnhancementCatalog(imports, component.identity, component.module, component.export)
	}
}

func resolveEnhancementNamespace(
	moduleSpecifierNode *ast.Node,
	localName *ast.Node,
	moduleSpecifier string,
	typeChecker *checker.Checker,
) (enhancementBinding, []enhancementResolutionDiagnostic) {
	binding := enhancementBinding{activators: make(map[string]enhancementActivator)}
	if typeChecker == nil {
		return binding, []enhancementResolutionDiagnostic{{
			code: "EXACT6004", message: "exact-enhancement namespaces require semantic component resolution",
		}}
	}
	module := typeChecker.GetSymbolAtLocation(moduleSpecifierNode)
	if module == nil {
		return binding, []enhancementResolutionDiagnostic{{
			code: "EXACT6010", message: fmt.Sprintf("cannot resolve exact-enhancement module %q", moduleSpecifier),
		}}
	}
	namespaceType := typeChecker.GetTypeAtLocation(localName)
	diagnostics := []enhancementResolutionDiagnostic{}
	canonicalComponents := make(map[string]*enhancementComponent)
	for _, exported := range typeChecker.GetExportsOfModule(module) {
		exportName := ast.SymbolName(exported)
		identities := traceEnhancementExport(
			module,
			moduleSpecifier,
			exportName,
			typeChecker,
			make(map[string]struct{}),
		)
		if len(identities) == 0 {
			continue
		}
		if len(identities) != 1 {
			diagnostics = append(diagnostics, enhancementResolutionDiagnostic{
				code: "EXACT6010",
				message: fmt.Sprintf(
					"%s#%s resolves to ambiguous exact-enhancement identities: %s",
					moduleSpecifier,
					exportName,
					strings.Join(identities, ", "),
				),
			})
			continue
		}
		property := typeChecker.GetPropertyOfType(namespaceType, exportName)
		if property == nil {
			continue
		}
		component, diagnostic := resolveEnhancementComponentSymbol(
			property,
			localName,
			identities[0],
			moduleSpecifier,
			exportName,
			typeChecker,
		)
		if diagnostic != "" {
			diagnostics = append(diagnostics, enhancementResolutionDiagnostic{
				code: "EXACT6004", message: diagnostic,
			})
			continue
		}
		if existing := canonicalComponents[component.canonical]; existing != nil {
			component = *existing
		} else {
			componentCopy := component
			canonicalComponents[component.canonical] = &componentCopy
		}
		if exportName == "default" {
			binding.defaultComponent = canonicalComponents[component.canonical]
			continue
		}
		name := camelToKebab(exportName)
		if enhancementReservedMember(name) {
			diagnostics = append(diagnostics, enhancementResolutionDiagnostic{
				code:    "EXACT6006",
				message: fmt.Sprintf("%q is reserved and cannot be an exact-enhancement activator", name),
			})
			continue
		}
		if _, exists := binding.activators[name]; exists {
			diagnostics = append(diagnostics, enhancementResolutionDiagnostic{
				code:    "EXACT6012",
				message: fmt.Sprintf("duplicate exact-enhancement activator %q", name),
			})
			continue
		}
		binding.activators[name] = enhancementActivator{
			name: exportName, component: canonicalComponents[component.canonical],
		}
	}
	if binding.defaultComponent == nil && len(binding.activators) == 0 && len(diagnostics) == 0 {
		diagnostics = append(diagnostics, enhancementResolutionDiagnostic{
			code: "EXACT6004",
			message: fmt.Sprintf(
				"exact-enhancement namespace %q exposes no attributed component exports",
				localName.Text(),
			),
		})
	}
	return binding, diagnostics
}

func enhancementReservedMember(name string) bool {
	return name == "children" || name == "key" || name == "ref" || name == "root"
}

func resolveEnhancementIdentity(
	moduleSpecifierNode *ast.Node,
	moduleSpecifier string,
	exportName string,
	typeChecker *checker.Checker,
) (string, string) {
	if typeChecker == nil {
		return "", "exact-enhancement imports require semantic export resolution"
	}
	module := typeChecker.GetSymbolAtLocation(moduleSpecifierNode)
	if module == nil {
		return "", fmt.Sprintf("cannot resolve exact-enhancement module %q", moduleSpecifier)
	}
	identities := traceEnhancementExport(
		module,
		moduleSpecifier,
		exportName,
		typeChecker,
		make(map[string]struct{}),
	)
	if len(identities) == 0 {
		return "", fmt.Sprintf(
			"%s#%s has no reachable export edge with { type: 'exact-enhancement' }",
			moduleSpecifier,
			exportName,
		)
	}
	if len(identities) != 1 {
		return "", fmt.Sprintf(
			"%s#%s resolves to ambiguous exact-enhancement identities: %s",
			moduleSpecifier,
			exportName,
			strings.Join(identities, ", "),
		)
	}
	return identities[0], ""
}

func traceEnhancementExport(
	module *ast.Symbol,
	moduleSpecifier string,
	exportName string,
	typeChecker *checker.Checker,
	visited map[string]struct{},
) []string {
	key := fmt.Sprintf("%d:%s", ast.GetSymbolId(module), exportName)
	if _, exists := visited[key]; exists {
		return nil
	}
	visited[key] = struct{}{}
	sourceFile := moduleSourceFile(module)
	if sourceFile == nil {
		return nil
	}
	identities := []string{}
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsExportDeclaration(statement) {
			continue
		}
		declaration := statement.AsExportDeclaration()
		if declaration.IsTypeOnly || declaration.ModuleSpecifier == nil {
			continue
		}
		target := typeChecker.GetSymbolAtLocation(declaration.ModuleSpecifier)
		if target == nil || !ast.IsStringLiteral(declaration.ModuleSpecifier) {
			continue
		}
		targetSpecifier := declaration.ModuleSpecifier.AsStringLiteral().Text
		if declaration.ExportClause == nil {
			if exactEnhancementExport(declaration) {
				if moduleExportsName(target, exportName, typeChecker) {
					identities = append(identities, moduleSpecifier+"#"+exportName)
				}
			} else {
				identities = append(identities, traceEnhancementExport(
					target, targetSpecifier, exportName, typeChecker, cloneVisited(visited),
				)...)
			}
			continue
		}
		if !ast.IsNamedExports(declaration.ExportClause) {
			continue
		}
		for _, element := range declaration.ExportClause.AsNamedExports().Elements.Nodes {
			specifier := element.AsExportSpecifier()
			if specifier.IsTypeOnly || specifier.Name().Text() != exportName {
				continue
			}
			sourceName := exportName
			if specifier.PropertyName != nil {
				sourceName = specifier.PropertyName.Text()
			}
			if exactEnhancementExport(declaration) {
				identities = append(identities, moduleSpecifier+"#"+exportName)
			} else {
				identities = append(identities, traceEnhancementExport(
					target, targetSpecifier, sourceName, typeChecker, cloneVisited(visited),
				)...)
			}
		}
	}
	return uniqueStrings(identities)
}

func moduleSourceFile(module *ast.Symbol) *ast.SourceFile {
	for _, declaration := range module.Declarations {
		if ast.IsSourceFile(declaration) {
			return declaration.AsSourceFile()
		}
		if sourceFile := ast.GetSourceFileOfNode(declaration); sourceFile != nil && sourceFile.Symbol == module {
			return sourceFile
		}
	}
	return nil
}

func moduleExportsName(module *ast.Symbol, name string, typeChecker *checker.Checker) bool {
	for _, exported := range typeChecker.GetExportsOfModule(module) {
		if ast.SymbolName(exported) == name {
			return true
		}
	}
	return false
}

func cloneVisited(source map[string]struct{}) map[string]struct{} {
	result := make(map[string]struct{}, len(source))
	for key := range source {
		result[key] = struct{}{}
	}
	return result
}

func resolveEnhancementComponent(
	localName *ast.Node,
	identity string,
	moduleSpecifier string,
	exportName string,
	typeChecker *checker.Checker,
) (enhancementComponent, string) {
	if typeChecker == nil {
		return enhancementComponent{}, "exact-enhancement imports require semantic component resolution"
	}
	symbol := typeChecker.GetSymbolAtLocation(localName)
	if symbol == nil {
		return enhancementComponent{}, fmt.Sprintf(
			"exact-enhancement import %q does not resolve to an eXact component with public props",
			localName.Text(),
		)
	}
	return resolveEnhancementComponentSymbol(
		symbol,
		localName,
		identity,
		moduleSpecifier,
		exportName,
		typeChecker,
	)
}

func resolveEnhancementComponentSymbol(
	symbol *ast.Symbol,
	location *ast.Node,
	identity string,
	moduleSpecifier string,
	exportName string,
	typeChecker *checker.Checker,
) (enhancementComponent, string) {
	valueType := typeChecker.GetTypeOfSymbolAtLocation(symbol, location)
	signatures := typeChecker.GetSignaturesOfType(valueType, checker.SignatureKindCall)
	if len(signatures) == 0 || len(signatures[0].Parameters()) == 0 {
		return enhancementComponent{}, fmt.Sprintf(
			"exact-enhancement import %q does not resolve to an eXact component with public props",
			exportName,
		)
	}
	propsType := typeChecker.GetTypeOfSymbolAtLocation(signatures[0].Parameters()[0], location)
	for _, memberType := range propsType.Distributed() {
		if len(typeChecker.GetIndexInfosOfType(memberType)) != 0 {
			return enhancementComponent{}, fmt.Sprintf(
				"exact-enhancement import %q has an open prop key space; enhancement props must be finite",
				exportName,
			)
		}
	}
	members := make(map[string]enhancementMember)
	variants := make([]map[string]enhancementMember, 0, len(propsType.Distributed()))
	for _, memberType := range propsType.Distributed() {
		variant := make(map[string]enhancementMember)
		for _, property := range typeChecker.GetPropertiesOfType(memberType) {
			name := ast.SymbolName(property)
			if name == "children" || name == "key" || name == "ref" {
				continue
			}
			canonical := camelToKebab(name)
			valueType := typeChecker.GetTypeOfSymbolAtLocation(property, location)
			member := enhancementMember{
				prop: name, valueType: valueType, optional: property.Flags&ast.SymbolFlagsOptional != 0,
			}
			variant[name] = member
			if _, exists := members[canonical]; !exists {
				members[canonical] = member
			}
		}
		variants = append(variants, variant)
	}
	canonical := typeChecker.SkipAlias(symbol)
	canonicalIdentity := projectComponentSymbolIdentity(canonical)
	if canonicalIdentity == "" {
		canonicalIdentity = identity
	}
	return enhancementComponent{
		identity:  identity,
		canonical: canonicalIdentity,
		members:   members,
		variants:  variants,
		module:    moduleSpecifier,
		export:    exportName,
	}, ""
}

func enhancementDiagnostic(
	sourceFile *ast.SourceFile,
	node *ast.Node,
	code string,
	message string,
) Diagnostic {
	line, column := sourceLocation(sourceFile, node.Pos())
	return Diagnostic{
		Severity: "error",
		Code:     code,
		Message: fmt.Sprintf(
			"error: %s:%d:%d %s",
			sourceFile.FileName(), line, column, message,
		),
		Start:  node.Pos(),
		Length: node.End() - node.Pos(),
	}
}

func collectImportLocalNames(declaration *ast.ImportDeclaration, result map[string]struct{}) {
	if declaration.ImportClause == nil {
		return
	}
	clause := declaration.ImportClause.AsImportClause()
	if name := clause.Name(); name != nil {
		result[name.Text()] = struct{}{}
	}
	if clause.NamedBindings == nil {
		return
	}
	if ast.IsNamespaceImport(clause.NamedBindings) {
		result[clause.NamedBindings.AsNamespaceImport().Name().Text()] = struct{}{}
		return
	}
	for _, element := range clause.NamedBindings.AsNamedImports().Elements.Nodes {
		result[element.AsImportSpecifier().Name().Text()] = struct{}{}
	}
}

func camelToKebab(value string) string {
	var result strings.Builder
	for index, character := range value {
		if character >= 'A' && character <= 'Z' {
			if index != 0 {
				result.WriteByte('-')
			}
			result.WriteRune(character + ('a' - 'A'))
			continue
		}
		result.WriteRune(character)
	}
	return result.String()
}

func exactEnhancementImport(declaration *ast.ImportDeclaration) bool {
	if declaration.Attributes == nil {
		return false
	}
	for _, attribute := range declaration.Attributes.AsImportAttributes().Attributes.Nodes {
		item := attribute.AsImportAttribute()
		if item.Name().Text() != "type" || item.Value == nil ||
			!ast.IsStringLiteral(item.Value) {
			continue
		}
		if item.Value.AsStringLiteral().Text == "exact-enhancement" {
			return true
		}
	}
	return false
}

func exactEnhancementExport(declaration *ast.ExportDeclaration) bool {
	if declaration.Attributes == nil {
		return false
	}
	for _, attribute := range declaration.Attributes.AsImportAttributes().Attributes.Nodes {
		item := attribute.AsImportAttribute()
		if item.Name().Text() == "type" && item.Value != nil && ast.IsStringLiteral(item.Value) &&
			item.Value.AsStringLiteral().Text == "exact-enhancement" {
			return true
		}
	}
	return false
}
