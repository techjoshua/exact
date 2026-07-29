package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

var unsafeComponentRegistryKeys = map[string]struct{}{
	"__proto__":   {},
	"constructor": {},
	"prototype":   {},
}

// componentRegistryDiagnostics keeps registry provenance finite before JSX
// lowering relies on it for identity, placement, and lazy reachability.
func componentRegistryDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) []Diagnostic {
	var diagnostics []Diagnostic
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if strings.TrimSpace(sourceText(sourceFile, call.Expression)) !=
			"createComponentRegistry" {
			return true
		}
		declaration := componentRegistryDeclaration(node)
		if declaration == nil {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				node,
				"component registries require an immutable named module-level binding",
			))
			return false
		}
		name := declaration.Name()
		if !ast.IsIdentifier(name) || strings.TrimSpace(name.Text()) == "" ||
			declaration.Parent.Flags&ast.NodeFlagsConst == 0 ||
			!componentRegistryDeclarationIsModuleLevel(declaration) {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				declaration,
				"component registries require an immutable named module-level binding",
			))
			return false
		}
		symbol := typeChecker.GetSymbolAtLocation(name)
		if symbol != nil && componentValueSymbolIsWrittenAfter(
			symbol, declaration.End(), sourceFile, typeChecker,
		) {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				name,
				fmt.Sprintf("component registry %s may not be reassigned or mutated", name.Text()),
			))
		}
		if call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				node,
				fmt.Sprintf("component registry %s must use one declarative definition callback", name.Text()),
			))
			return false
		}
		define := call.Arguments.Nodes[0]
		if !ast.IsArrowFunction(define) && !ast.IsFunctionExpression(define) {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				define,
				fmt.Sprintf("component registry %s definition must be a declarative callback", name.Text()),
			))
			return false
		}
		body := unwrapRegistryDefinitionBody(define.Body())
		if body == nil || !ast.IsObjectLiteralExpression(body) {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				define.Body(),
				fmt.Sprintf("component registry %s definition must directly return a finite object without side effects or runtime branching", name.Text()),
			))
			return false
		}
		diagnostics = append(
			diagnostics,
			validateComponentRegistryDefinition(
				name.Text(),
				define,
				body,
				sourceFile,
				typeChecker,
			)...,
		)
		return false
	})
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsElementAccessExpression(node) {
			return true
		}
		member := node.AsElementAccessExpression()
		definition := componentRegistryDefinition(
			member.Expression,
			sourceFile,
			typeChecker,
		)
		if definition == nil || member.ArgumentExpression == nil {
			return true
		}
		keys := make(map[string]struct{})
		for _, property := range definition.AsObjectLiteralExpression().Properties.Nodes {
			key, _, valid := componentRegistryProperty(property)
			if valid {
				keys[key] = struct{}{}
			}
		}
		registryName := strings.TrimSpace(sourceText(
			sourceFile,
			member.Expression,
		))
		if !registrySelectionKeyIsFinite(
			typeChecker.GetTypeAtLocation(member.ArgumentExpression),
			typeChecker,
			keys,
		) && !strings.Contains(
			sourceFile.Text(),
			"KeyOf<typeof "+registryName+">",
		) {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				member.ArgumentExpression,
				"dynamic component registry keys must be proven by KeyOf<typeof Registry> or hasComponent() narrowing",
			))
		}
		return true
	})
	return diagnostics
}

func registrySelectionKeyIsFinite(
	value *checker.Type,
	typeChecker *checker.Checker,
	keys map[string]struct{},
) bool {
	if value == nil || value.Flags()&checker.TypeFlagsAnyOrUnknown != 0 {
		return false
	}
	members := []*checker.Type{value}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		members = value.Types()
	}
	if len(members) == 0 {
		return false
	}
	for _, member := range members {
		if member.Flags()&checker.TypeFlagsStringLiteral == 0 {
			return false
		}
		literal := strings.Trim(
			typeChecker.TypeToString(member),
			"'\"",
		)
		if _, exists := keys[literal]; !exists {
			return false
		}
	}
	return true
}

func componentRegistryDeclaration(call *ast.Node) *ast.Node {
	parent := call.Parent
	for parent != nil && ast.IsParenthesizedExpression(parent) {
		parent = parent.Parent
	}
	if parent == nil || !ast.IsVariableDeclaration(parent) ||
		parent.AsVariableDeclaration().Initializer != call {
		return nil
	}
	if parent.Parent == nil || !ast.IsVariableDeclarationList(parent.Parent) {
		return nil
	}
	return parent
}

func componentRegistryDeclarationIsModuleLevel(declaration *ast.Node) bool {
	list := declaration.Parent
	if list == nil || list.Parent == nil || !ast.IsVariableStatement(list.Parent) {
		return false
	}
	return list.Parent.Parent != nil && ast.IsSourceFile(list.Parent.Parent)
}

func unwrapRegistryDefinitionBody(body *ast.Node) *ast.Node {
	for body != nil {
		switch {
		case ast.IsParenthesizedExpression(body):
			body = body.AsParenthesizedExpression().Expression
		case ast.IsAsExpression(body):
			body = body.AsAsExpression().Expression
		case ast.IsSatisfiesExpression(body):
			body = body.AsSatisfiesExpression().Expression
		default:
			return body
		}
	}
	return body
}

func validateComponentRegistryDefinition(
	registryName string,
	define *ast.Node,
	body *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) []Diagnostic {
	var diagnostics []Diagnostic
	seen := make(map[string]struct{})
	for _, property := range body.AsObjectLiteralExpression().Properties.Nodes {
		key, value, valid := componentRegistryProperty(property)
		if !valid {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				property,
				fmt.Sprintf("component registry %s entries require finite, non-computed keys", registryName),
			))
			continue
		}
		if key == "" {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				property,
				fmt.Sprintf("component registry %s contains an empty entry key", registryName),
			))
			continue
		}
		if _, unsafe := unsafeComponentRegistryKeys[key]; unsafe {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				property,
				fmt.Sprintf("component registry %s entry %q uses an unsafe prototype key", registryName, key),
			))
			continue
		}
		if _, duplicate := seen[key]; duplicate {
			diagnostics = append(diagnostics, componentRegistryDiagnostic(
				property,
				fmt.Sprintf("component registry %s declares entry %q more than once", registryName, key),
			))
			continue
		}
		seen[key] = struct{}{}
		if ast.IsConditionalExpression(value) {
			diagnostics = append(diagnostics, componentRegistryEntryDiagnostic(
				property,
				registryName,
				key,
				"may not use runtime branching",
			))
			continue
		}
		if registryLazyCall(value) {
			call := value.AsCallExpression()
			if call.Arguments == nil || len(call.Arguments.Nodes) != 1 {
				diagnostics = append(diagnostics, componentRegistryEntryDiagnostic(
					value,
					registryName,
					key,
					"lazy definition requires exactly one loader",
				))
			} else if !registryLazyLoaderIsStatic(
				call.Arguments.Nodes[0],
				sourceFile,
				typeChecker,
			) {
				diagnostics = append(diagnostics, componentRegistryEntryDiagnostic(
					call.Arguments.Nodes[0],
					registryName,
					key,
					"lazy loader must use one static import and select one component export",
				))
			}
			continue
		}
		if _, validComponent := resolveJSXComponentValueExpression(
			value,
			sourceFile,
			typeChecker,
			make(map[ast.SymbolId]bool),
		); !validComponent {
			diagnostics = append(diagnostics, componentRegistryEntryDiagnostic(
				value,
				registryName,
				key,
				"must be a component or the scoped lazy() result",
			))
		}
	}
	diagnostics = append(
		diagnostics,
		componentRegistryLazyEscapeDiagnostics(registryName, define)...,
	)
	return diagnostics
}

func registryLazyLoaderIsStatic(
	loader *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	resolved := loader
	if ast.IsIdentifier(loader) {
		symbol := typeChecker.GetSymbolAtLocation(loader)
		if symbol == nil {
			return false
		}
		for _, declaration := range symbol.Declarations {
			switch {
			case ast.IsFunctionDeclaration(declaration):
				resolved = declaration
			case ast.IsVariableDeclaration(declaration):
				if initializer := declaration.AsVariableDeclaration().Initializer; initializer != nil {
					resolved = initializer
				}
			}
		}
	}
	if !ast.IsArrowFunction(resolved) &&
		!ast.IsFunctionExpression(resolved) &&
		!ast.IsFunctionDeclaration(resolved) {
		return false
	}
	text := sourceText(sourceFile, resolved)
	return registryImportPattern.MatchString(text) &&
		registrySelectedExportPattern.MatchString(text)
}

func registryLazyCall(node *ast.Node) bool {
	return node != nil && ast.IsCallExpression(node) &&
		ast.IsIdentifier(node.AsCallExpression().Expression) &&
		node.AsCallExpression().Expression.Text() == "lazy"
}

func componentRegistryLazyEscapeDiagnostics(
	registryName string,
	define *ast.Node,
) []Diagnostic {
	var diagnostics []Diagnostic
	for _, parameter := range define.Parameters() {
		name := parameter.Name()
		if !ast.IsObjectBindingPattern(name) {
			continue
		}
		for _, element := range name.AsBindingPattern().Elements.Nodes {
			binding := element.AsBindingElement()
			property := binding.PropertyName
			if property == nil {
				property = binding.Name()
			}
			if !ast.IsIdentifier(property) || property.Text() != "lazy" {
				continue
			}
			local := binding.Name().Text()
			walkNode(define.Body(), func(node *ast.Node) bool {
				if !ast.IsIdentifier(node) || node.Text() != local {
					return true
				}
				parent := node.Parent
				if parent != nil && ast.IsCallExpression(parent) &&
					parent.AsCallExpression().Expression == node {
					return true
				}
				diagnostics = append(diagnostics, componentRegistryDiagnostic(
					node,
					fmt.Sprintf("component registry %s scoped lazy() capability may not escape its definition callback", registryName),
				))
				return true
			})
		}
	}
	return diagnostics
}

func componentRegistryEntryDiagnostic(
	node *ast.Node,
	registryName string,
	key string,
	detail string,
) Diagnostic {
	return componentRegistryDiagnostic(
		node,
		fmt.Sprintf("component registry %s entry %q %s", registryName, key, detail),
	)
}

func componentRegistryDiagnostic(node *ast.Node, message string) Diagnostic {
	return Diagnostic{
		Severity: "error",
		Code:     "EXACT_COMPONENT_REGISTRY",
		Message:  "error: " + message,
		Start:    node.Pos(),
		Length:   node.End() - node.Pos(),
	}
}
