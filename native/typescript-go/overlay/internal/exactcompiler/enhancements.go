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
	diagnostics  []Diagnostic
}

func collectEnhancementImports(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) enhancementImports {
	result := enhancementImports{
		bindings:     make(map[string]enhancementBinding),
		declarations: make(map[int]struct{}),
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
			binding, diagnostic := resolveEnhancementBinding(
				name,
				moduleSpecifier+"#default",
				typeChecker,
			)
			if diagnostic != "" {
				addDiagnostic("EXACT6004", diagnostic)
			} else {
				result.bindings[name.Text()] = binding
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
			binding, diagnostic := resolveEnhancementBinding(
				specifier.Name(),
				moduleSpecifier+"#"+exportName,
				typeChecker,
			)
			if diagnostic != "" {
				addDiagnostic("EXACT6004", diagnostic)
				continue
			}
			result.bindings[specifier.Name().Text()] = binding
		}
	}
	collectEnhancementAttributeDiagnostics(sourceFile, &result, ordinaryBindings)
	return result
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
