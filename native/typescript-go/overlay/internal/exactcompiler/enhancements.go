package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type enhancementBinding struct {
	identity string
	members  map[string]string
}

type enhancementImports struct {
	bindings     map[string]enhancementBinding
	declarations map[int]struct{}
	spreads      map[int]enhancementSpread
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

func collectEnhancementImports(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) enhancementImports {
	result := enhancementImports{
		bindings:     make(map[string]enhancementBinding),
		declarations: make(map[int]struct{}),
		spreads:      make(map[int]enhancementSpread),
	}
	ordinaryBindings := make(map[string]struct{})
	for _, statement := range sourceFile.Statements.Nodes {
		if !ast.IsImportDeclaration(statement) {
			continue
		}
		declaration := statement.AsImportDeclaration()
		if !exactPluginImport(declaration) {
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
			addDiagnostic("EXACT6001", "exact-plugin imports require value bindings from a string module specifier")
			continue
		}
		clause := declaration.ImportClause.AsImportClause()
		if clause.PhaseModifier == ast.KindTypeKeyword {
			addDiagnostic("EXACT6002", "type-only imports cannot define an exact-plugin JSX namespace")
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
			binding, diagnostic := resolveEnhancementBinding(
				name,
				identity,
				typeChecker,
			)
			if diagnostic != "" {
				addDiagnostic("EXACT6004", diagnostic)
			} else {
				result.bindings[name.Text()] = binding
				appendEnhancementCatalog(&result, identity, moduleSpecifier, "default")
			}
		}
		bindings := clause.NamedBindings
		if bindings == nil {
			if clause.Name() == nil {
				addDiagnostic("EXACT6001", "exact-plugin imports require a default or named value binding")
			}
			continue
		}
		if ast.IsNamespaceImport(bindings) {
			addDiagnostic("EXACT6003", "namespace imports cannot define an exact-plugin JSX namespace")
			continue
		}
		for _, element := range bindings.AsNamedImports().Elements.Nodes {
			specifier := element.AsImportSpecifier()
			if specifier.IsTypeOnly {
				addDiagnostic("EXACT6002", "type-only imports cannot define an exact-plugin JSX namespace")
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
			binding, diagnostic := resolveEnhancementBinding(
				specifier.Name(),
				identity,
				typeChecker,
			)
			if diagnostic != "" {
				addDiagnostic("EXACT6004", diagnostic)
				continue
			}
			result.bindings[specifier.Name().Text()] = binding
			appendEnhancementCatalog(&result, identity, moduleSpecifier, exportName)
		}
	}
	collectEnhancementAttributeDiagnostics(sourceFile, &result, ordinaryBindings)
	collectEnhancementSpreadDiagnostics(sourceFile, typeChecker, &result, ordinaryBindings)
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

func resolveEnhancementIdentity(
	moduleSpecifierNode *ast.Node,
	moduleSpecifier string,
	exportName string,
	typeChecker *checker.Checker,
) (string, string) {
	if typeChecker == nil {
		return "", "exact-plugin imports require semantic export resolution"
	}
	module := typeChecker.GetSymbolAtLocation(moduleSpecifierNode)
	if module == nil {
		return "", fmt.Sprintf("cannot resolve exact-plugin module %q", moduleSpecifier)
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
			"%s#%s has no reachable export edge with { type: 'exact-plugin' }",
			moduleSpecifier,
			exportName,
		)
	}
	if len(identities) != 1 {
		return "", fmt.Sprintf(
			"%s#%s resolves to ambiguous exact-plugin identities: %s",
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
			if exactPluginExport(declaration) {
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
			if exactPluginExport(declaration) {
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

func collectEnhancementSpreadDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	imports *enhancementImports,
	ordinaryBindings map[string]struct{},
) {
	if typeChecker == nil || len(imports.bindings) == 0 {
		return
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsJsxSpreadAttribute(node) {
			return true
		}
		expression := node.AsJsxSpreadAttribute().Expression
		spreadType := typeChecker.GetTypeAtLocation(expression)
		plan := enhancementSpread{}
		seen := make(map[string]struct{})
		open := false
		for _, memberType := range spreadType.Distributed() {
			open = open || len(typeChecker.GetIndexInfosOfType(memberType)) != 0
			for _, property := range typeChecker.GetPropertiesOfType(memberType) {
				source := ast.SymbolName(property)
				prefix, member, namespaced := strings.Cut(source, ":")
				if !namespaced {
					continue
				}
				binding, attributed := imports.bindings[prefix]
				if !attributed {
					if _, imported := ordinaryBindings[prefix]; imported {
						imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
							sourceFile,
							node,
							"EXACT6005",
							fmt.Sprintf("JSX plugin prefix %q requires an import with { type: 'exact-plugin' }", prefix),
						))
					}
					continue
				}
				if member == "root" {
					if _, exists := seen[source]; !exists {
						plan.members = append(plan.members, enhancementSpreadMember{
							identity: binding.identity,
							prop:     "__exactRoot",
							source:   source,
						})
						plan.keys = append(plan.keys, source)
						seen[source] = struct{}{}
					}
					continue
				}
				prop, exists := binding.members[member]
				if !exists {
					code := "EXACT6007"
					message := fmt.Sprintf("unknown %s prop %q", binding.identity, member)
					if member == "children" || member == "key" || member == "ref" {
						code = "EXACT6006"
						message = fmt.Sprintf("%s is reserved and cannot be a plugin prop", source)
					}
					imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
						sourceFile, node, code, message,
					))
					continue
				}
				if _, exists := seen[source]; exists {
					continue
				}
				plan.members = append(plan.members, enhancementSpreadMember{
					identity: binding.identity,
					prop:     prop,
					source:   source,
				})
				plan.keys = append(plan.keys, source)
				seen[source] = struct{}{}
			}
		}
		if open {
			imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
				sourceFile,
				node,
				"EXACT6008",
				"JSX spreads in a plugin-enabled module require a statically finite key space",
			))
		}
		if len(plan.members) != 0 {
			if !ast.IsIdentifier(expression) && !ast.IsPropertyAccessExpression(expression) {
				imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
					sourceFile,
					node,
					"EXACT6009",
					"enhancement-bearing JSX spreads require a stable setup-derived binding",
				))
			} else {
				imports.spreads[node.Pos()] = plan
			}
		}
		return true
	})
}

func resolveEnhancementBinding(
	localName *ast.Node,
	identity string,
	typeChecker *checker.Checker,
) (enhancementBinding, string) {
	if typeChecker == nil {
		return enhancementBinding{}, "exact-plugin imports require semantic component resolution"
	}
	valueType := typeChecker.GetTypeAtLocation(localName)
	signatures := typeChecker.GetSignaturesOfType(valueType, checker.SignatureKindCall)
	if len(signatures) == 0 || len(signatures[0].Parameters()) == 0 {
		return enhancementBinding{}, fmt.Sprintf(
			"exact-plugin import %q does not resolve to an eXact component with public props",
			localName.Text(),
		)
	}
	propsType := typeChecker.GetTypeOfSymbolAtLocation(signatures[0].Parameters()[0], localName)
	for _, memberType := range propsType.Distributed() {
		if len(typeChecker.GetIndexInfosOfType(memberType)) != 0 {
			return enhancementBinding{}, fmt.Sprintf(
				"exact-plugin import %q has an open prop key space; plugin props must be finite",
				localName.Text(),
			)
		}
	}
	members := make(map[string]string)
	for _, memberType := range propsType.Distributed() {
		for _, property := range typeChecker.GetPropertiesOfType(memberType) {
			name := ast.SymbolName(property)
			if name == "children" || name == "key" || name == "ref" {
				continue
			}
			members[camelToKebab(name)] = name
		}
	}
	return enhancementBinding{identity: identity, members: members}, ""
}

func collectEnhancementAttributeDiagnostics(
	sourceFile *ast.SourceFile,
	imports *enhancementImports,
	ordinaryBindings map[string]struct{},
) {
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsJsxAttribute(node) || !ast.IsJsxNamespacedName(node.AsJsxAttribute().Name()) {
			return true
		}
		name := node.AsJsxAttribute().Name().AsJsxNamespacedName()
		prefix := name.Namespace.Text()
		member := name.Name().Text()
		binding, attributed := imports.bindings[prefix]
		if !attributed {
			if _, imported := ordinaryBindings[prefix]; imported {
				imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
					sourceFile,
					node,
					"EXACT6005",
					fmt.Sprintf("JSX plugin prefix %q requires an import with { type: 'exact-plugin' }", prefix),
				))
			}
			return true
		}
		if member == "root" {
			return true
		}
		if member == "children" || member == "key" || member == "ref" {
			imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
				sourceFile,
				node,
				"EXACT6006",
				fmt.Sprintf("%s:%s is reserved and cannot be a plugin prop", prefix, member),
			))
			return true
		}
		if _, exists := binding.members[member]; !exists {
			imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
				sourceFile,
				node,
				"EXACT6007",
				fmt.Sprintf("unknown %s prop %q", binding.identity, member),
			))
		}
		return true
	})
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

func exactPluginImport(declaration *ast.ImportDeclaration) bool {
	if declaration.Attributes == nil {
		return false
	}
	for _, attribute := range declaration.Attributes.AsImportAttributes().Attributes.Nodes {
		item := attribute.AsImportAttribute()
		if item.Name().Text() != "type" || item.Value == nil ||
			!ast.IsStringLiteral(item.Value) {
			continue
		}
		if item.Value.AsStringLiteral().Text == "exact-plugin" {
			return true
		}
	}
	return false
}

func exactPluginExport(declaration *ast.ExportDeclaration) bool {
	if declaration.Attributes == nil {
		return false
	}
	for _, attribute := range declaration.Attributes.AsImportAttributes().Attributes.Nodes {
		item := attribute.AsImportAttribute()
		if item.Name().Text() == "type" && item.Value != nil && ast.IsStringLiteral(item.Value) &&
			item.Value.AsStringLiteral().Text == "exact-plugin" {
			return true
		}
	}
	return false
}
