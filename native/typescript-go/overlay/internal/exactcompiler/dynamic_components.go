package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type dynamicComponentUseKind string

const (
	dynamicComponentHelper      dynamicComponentUseKind = "helper"
	dynamicComponentAnnotated   dynamicComponentUseKind = "annotated"
	dynamicComponentUnannotated dynamicComponentUseKind = "unannotated"
	dynamicComponentInvalid     dynamicComponentUseKind = "invalid"
)

type dynamicComponentAnalysis struct {
	uses        map[int]dynamicComponentUseKind
	diagnostics []Diagnostic
}

// analyzeDynamicComponents classifies open component-position values once for
// diagnostics and lowering so the language and emitted artifact cannot disagree.
func analyzeDynamicComponents(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	directives []Directive,
	components []Component,
) dynamicComponentAnalysis {
	result := dynamicComponentAnalysis{uses: make(map[int]dynamicComponentUseKind)}
	componentNames := componentIndexByName(components)
	registryNames := dynamicComponentRegistryNames(sourceFile)
	claimed := make(map[int]struct{})
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		var opening *ast.Node
		switch {
		case ast.IsJsxElement(node):
			opening = node.AsJsxElement().OpeningElement
		case ast.IsJsxSelfClosingElement(node):
			opening = node
		default:
			return true
		}
		tag := openingTag(opening)
		if jsxIntrinsic(sourceText(sourceFile, tag)) {
			return true
		}
		kind, directive, declaration := classifyDynamicComponentTag(
			tag,
			sourceFile,
			typeChecker,
			directives,
			componentNames,
			registryNames,
			make(map[ast.SymbolId]struct{}),
		)
		if kind == "" {
			return true
		}
		if directive != nil {
			claimed[directive.Start] = struct{}{}
		}
		if kind == dynamicComponentInvalid {
			result.diagnostics = append(result.diagnostics, Diagnostic{
				Severity: "error",
				Code:     "EXACT2215",
				Message:  "JSX component-position value is not callable or constructable and cannot be a dynamic component",
				Start:    tag.Pos(),
				Length:   tag.End() - tag.Pos(),
			})
			return true
		}
		result.uses[tag.Pos()] = kind
		if kind == dynamicComponentUnannotated {
			fixStart, fixText := dynamicAnnotationFix(sourceFile, declaration)
			result.diagnostics = append(result.diagnostics, Diagnostic{
				Severity: "warning",
				Code:     "EXACT2213",
				Message:  "component identity cannot be determined statically; prefer createComponentRegistry() or createDynamicComponent(), or add @exact dynamic to the owning binding",
				Start:    tag.Pos(),
				Length:   tag.End() - tag.Pos(),
				FixStart: fixStart,
				FixText:  fixText,
			})
		}
		return true
	})
	for index := range directives {
		directive := &directives[index]
		if directive.Namespace != "exact" || directive.Name != "dynamic" {
			continue
		}
		if _, used := claimed[directive.Start]; used {
			continue
		}
		result.diagnostics = append(result.diagnostics, Diagnostic{
			Severity: "warning",
			Code:     "EXACT2214",
			Message:  "@exact dynamic must be attached to a variable, parameter, property, or property signature used in JSX component position",
			Start:    directive.Start,
			Length:   directive.Length,
		})
	}
	return result
}

func classifyDynamicComponentTag(
	tag *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	directives []Directive,
	components map[string]Component,
	registries map[string]struct{},
	visited map[ast.SymbolId]struct{},
) (dynamicComponentUseKind, *Directive, *ast.Node) {
	text := strings.TrimSpace(sourceText(sourceFile, tag))
	for name := range registries {
		if strings.HasPrefix(text, name+".") || strings.HasPrefix(text, name+"[") {
			return "", nil, nil
		}
	}
	if ast.IsIdentifier(tag) {
		if _, local := components[tag.Text()]; local {
			return "", nil, nil
		}
	}
	if typeChecker == nil {
		return dynamicComponentUnannotated, nil, nil
	}
	symbol := typeChecker.GetSymbolAtLocation(tag)
	if symbol == nil {
		return dynamicComponentUnannotated, nil, nil
	}
	directive := dynamicComponentAnnotatedDeclaration(symbol, sourceFile, directives)
	if scalarDerivedType(typeChecker.GetTypeAtLocation(tag)) {
		return dynamicComponentInvalid, directive, dynamicComponentOwningDeclaration(symbol)
	}
	if directive != nil {
		return dynamicComponentAnnotated, directive, nil
	}
	if dynamicComponentHelperSymbol(symbol, sourceFile, typeChecker, visited) {
		return dynamicComponentHelper, nil, nil
	}
	if dynamicComponentRegistrySelection(tag, sourceFile, typeChecker) {
		return "", nil, nil
	}
	if dynamicComponentStaticSymbol(symbol, sourceFile, typeChecker, components, visited) {
		return "", nil, nil
	}
	return dynamicComponentUnannotated, nil, dynamicComponentOwningDeclaration(symbol)
}

func dynamicComponentRegistryNames(sourceFile *ast.SourceFile) map[string]struct{} {
	result := make(map[string]struct{})
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		declaration := node.AsVariableDeclaration()
		initializer := declaration.Initializer
		if initializer == nil || !ast.IsCallExpression(initializer) {
			return true
		}
		call := initializer.AsCallExpression()
		if strings.TrimSpace(sourceText(sourceFile, call.Expression)) == "createComponentRegistry" {
			result[declaration.Name().Text()] = struct{}{}
		}
		return true
	})
	return result
}

func dynamicComponentOwningDeclaration(symbol *ast.Symbol) *ast.Node {
	for _, declaration := range symbol.Declarations {
		if dynamicComponentAnnotationTarget(declaration) {
			return declaration
		}
	}
	return nil
}

func dynamicAnnotationFix(sourceFile *ast.SourceFile, declaration *ast.Node) (int, string) {
	if declaration == nil || !ast.IsVariableDeclaration(declaration) {
		return 0, ""
	}
	source := sourceFile.Text()
	start := declaration.Pos()
	for start > 0 && source[start-1] != '\n' && source[start-1] != '\r' {
		start--
	}
	indentEnd := start
	for indentEnd < len(source) && (source[indentEnd] == ' ' || source[indentEnd] == '\t') {
		indentEnd++
	}
	indent := source[start:indentEnd]
	return start, indent + "/** @exact dynamic */\n"
}

func dynamicComponentAnnotatedDeclaration(
	symbol *ast.Symbol,
	sourceFile *ast.SourceFile,
	directives []Directive,
) *Directive {
	for _, declaration := range symbol.Declarations {
		if !dynamicComponentAnnotationTarget(declaration) {
			continue
		}
		for index := range directives {
			directive := &directives[index]
			if directive.Namespace == "exact" && directive.Name == "dynamic" &&
				dynamicDirectiveAttachesTo(directive, declaration, sourceFile) {
				return directive
			}
		}
	}
	return nil
}

func dynamicDirectiveAttachesTo(
	directive *Directive,
	declaration *ast.Node,
	sourceFile *ast.SourceFile,
) bool {
	if directive.Start >= declaration.Pos() && directive.Start < declaration.End() {
		return true
	}
	end := directive.Start + directive.Length
	if end > declaration.Pos() {
		return false
	}
	between := sourceFile.Text()[end:declaration.Pos()]
	if len(between) > 160 || strings.ContainsAny(between, ";{}(),=") {
		return false
	}
	// TypeScript-Go starts a variable/property declaration at its binding
	// name, after declaration keywords and modifiers. Those tokens may sit
	// between an attached JSDoc directive and the declaration position.
	return !strings.Contains(between, "/**") && !strings.Contains(between, "//")
}

func dynamicComponentAnnotationTarget(node *ast.Node) bool {
	return ast.IsVariableDeclaration(node) || ast.IsParameterDeclaration(node) ||
		ast.IsPropertyDeclaration(node) || ast.IsPropertySignatureDeclaration(node)
}

func dynamicComponentHelperSymbol(
	symbol *ast.Symbol,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	visited map[ast.SymbolId]struct{},
) bool {
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) {
			continue
		}
		initializer := declaration.AsVariableDeclaration().Initializer
		if initializer == nil || !ast.IsCallExpression(initializer) {
			continue
		}
		call := initializer.AsCallExpression()
		if strings.TrimSpace(sourceText(sourceFile, call.Expression)) == "createDynamicComponent" {
			return true
		}
	}
	return false
}

func dynamicComponentStaticSymbol(
	symbol *ast.Symbol,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components map[string]Component,
	visited map[ast.SymbolId]struct{},
) bool {
	id := ast.GetSymbolId(symbol)
	if _, seen := visited[id]; seen {
		return false
	}
	visited[id] = struct{}{}
	for _, declaration := range symbol.Declarations {
		switch {
		case ast.IsFunctionDeclaration(declaration), ast.IsClassDeclaration(declaration),
			ast.IsImportSpecifier(declaration), ast.IsNamespaceImport(declaration),
			ast.IsImportClause(declaration):
			return true
		case ast.IsVariableDeclaration(declaration):
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer == nil {
				continue
			}
			if ast.IsArrowFunction(initializer) || ast.IsFunctionExpression(initializer) {
				return true
			}
			if componentRegistryDefinition(initializer, sourceFile, typeChecker) != nil {
				return true
			}
			if dynamicComponentRegistrySelection(initializer, sourceFile, typeChecker) {
				return true
			}
			if ast.IsIdentifier(initializer) {
				if _, local := components[initializer.Text()]; local {
					return true
				}
				target := typeChecker.GetSymbolAtLocation(initializer)
				if target != nil && dynamicComponentStaticSymbol(
					target, sourceFile, typeChecker, components, visited,
				) {
					return true
				}
			}
		}
	}
	return false
}

func dynamicComponentRegistrySelection(
	expression *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	if expression == nil {
		return false
	}
	var registry *ast.Node
	switch {
	case ast.IsPropertyAccessExpression(expression):
		registry = expression.AsPropertyAccessExpression().Expression
	case ast.IsElementAccessExpression(expression):
		registry = expression.AsElementAccessExpression().Expression
	default:
		return false
	}
	return componentRegistryDefinition(registry, sourceFile, typeChecker) != nil
}
