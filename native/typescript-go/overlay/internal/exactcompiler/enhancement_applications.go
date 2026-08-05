package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type enhancementPrefixSelection struct {
	binding    enhancementBinding
	components []*enhancementComponent
	seen       map[string]struct{}
}

// collectEnhancementApplications selects canonical components before distributing
// values so lowering, type validation, and partition planning consume one decision.
func collectEnhancementApplications(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	imports *enhancementImports,
	ordinaryBindings map[string]struct{},
) {
	if typeChecker == nil {
		return
	}
	if len(imports.bindings) == 0 {
		collectOrdinaryEnhancementPrefixDiagnostics(sourceFile, imports, ordinaryBindings)
		return
	}
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		attributes := jsxOpeningAttributes(node)
		if attributes == nil {
			return true
		}
		selections := make(map[string]*enhancementPrefixSelection)
		prefixOrder := []string{}
		ensureSelection := func(prefix string) *enhancementPrefixSelection {
			if selection := selections[prefix]; selection != nil {
				return selection
			}
			binding, exists := imports.bindings[prefix]
			if !exists {
				return nil
			}
			selection := &enhancementPrefixSelection{
				binding: binding,
				seen:    make(map[string]struct{}),
			}
			selections[prefix] = selection
			prefixOrder = append(prefixOrder, prefix)
			return selection
		}

		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if ast.IsJsxSpreadAttribute(property) {
				collectSpreadActivatorSelections(
					sourceFile,
					property,
					typeChecker,
					imports,
					ensureSelection,
				)
				continue
			}
			attribute := property.AsJsxAttribute()
			if !ast.IsJsxNamespacedName(attribute.Name()) {
				continue
			}
			name := attribute.Name().AsJsxNamespacedName()
			prefix := name.Namespace.Text()
			selection := ensureSelection(prefix)
			if selection == nil {
				if _, imported := ordinaryBindings[prefix]; imported {
					imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
						sourceFile,
						property,
						"EXACT6005",
						fmt.Sprintf(
							"JSX enhancement prefix %q requires an import with { type: 'exact-enhancement' }",
							prefix,
						),
					))
				}
				continue
			}
			if activator, exists := selection.binding.activators[name.Name().Text()]; exists {
				selection.add(activator.component)
			}
		}

		for _, prefix := range prefixOrder {
			selection := selections[prefix]
			if len(selection.components) == 0 && selection.binding.defaultComponent != nil {
				selection.add(selection.binding.defaultComponent)
			}
		}

		application := enhancementApplication{attributes: make(map[int][]enhancementSpreadMember)}
		seenComponents := make(map[string]struct{})
		for _, prefix := range prefixOrder {
			for _, component := range selections[prefix].components {
				if _, exists := seenComponents[component.canonical]; exists {
					continue
				}
				seenComponents[component.canonical] = struct{}{}
				application.components = append(application.components, *component)
			}
		}

		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if ast.IsJsxSpreadAttribute(property) {
				planEnhancementSpread(
					sourceFile,
					property,
					typeChecker,
					imports,
					selections,
					ordinaryBindings,
				)
				continue
			}
			attribute := property.AsJsxAttribute()
			if !ast.IsJsxNamespacedName(attribute.Name()) {
				continue
			}
			name := attribute.Name().AsJsxNamespacedName()
			selection := selections[name.Namespace.Text()]
			if selection == nil {
				continue
			}
			members := distributeEnhancementMember(
				sourceFile,
				property,
				name.Namespace.Text(),
				name.Name().Text(),
				attribute.Initializer == nil,
				selection,
				imports,
			)
			application.attributes[property.Pos()] = members
		}
		if len(application.components) != 0 {
			imports.applications[attributes.Pos()] = application
		}
		return true
	})
}

func collectOrdinaryEnhancementPrefixDiagnostics(
	sourceFile *ast.SourceFile,
	imports *enhancementImports,
	ordinaryBindings map[string]struct{},
) {
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		attributes := jsxOpeningAttributes(node)
		if attributes == nil {
			return true
		}
		for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
			if ast.IsJsxSpreadAttribute(property) {
				continue
			}
			attribute := property.AsJsxAttribute()
			if !ast.IsJsxNamespacedName(attribute.Name()) {
				continue
			}
			name := attribute.Name().AsJsxNamespacedName()
			if _, imported := ordinaryBindings[name.Namespace.Text()]; !imported {
				continue
			}
			imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
				sourceFile,
				property,
				"EXACT6005",
				fmt.Sprintf(
					"JSX enhancement prefix %q requires an import with { type: 'exact-enhancement' }",
					name.Namespace.Text(),
				),
			))
		}
		return true
	})
}

func (selection *enhancementPrefixSelection) add(component *enhancementComponent) {
	if component == nil {
		return
	}
	if _, exists := selection.seen[component.canonical]; exists {
		return
	}
	selection.seen[component.canonical] = struct{}{}
	selection.components = append(selection.components, component)
}

func jsxOpeningAttributes(node *ast.Node) *ast.Node {
	switch {
	case ast.IsJsxOpeningElement(node):
		return node.AsJsxOpeningElement().Attributes
	case ast.IsJsxSelfClosingElement(node):
		return node.AsJsxSelfClosingElement().Attributes
	default:
		return nil
	}
}

func collectSpreadActivatorSelections(
	sourceFile *ast.SourceFile,
	spread *ast.Node,
	typeChecker *checker.Checker,
	imports *enhancementImports,
	ensureSelection func(string) *enhancementPrefixSelection,
) {
	expression := spread.AsJsxSpreadAttribute().Expression
	distributed := typeChecker.GetTypeAtLocation(expression).Distributed()
	activatorPresence := make(map[string]int)
	for _, memberType := range distributed {
		seen := make(map[string]struct{})
		for _, property := range typeChecker.GetPropertiesOfType(memberType) {
			prefix, member, namespaced := strings.Cut(ast.SymbolName(property), ":")
			selection := ensureSelection(prefix)
			if !namespaced || selection == nil {
				continue
			}
			activator, exists := selection.binding.activators[member]
			if !exists {
				continue
			}
			key := prefix + ":" + member
			if _, duplicate := seen[key]; duplicate {
				continue
			}
			seen[key] = struct{}{}
			activatorPresence[key]++
			selection.add(activator.component)
		}
	}
	for key, count := range activatorPresence {
		if count == len(distributed) {
			continue
		}
		imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
			sourceFile,
			spread,
			"EXACT6013",
			fmt.Sprintf(
				"enhancement activator %q must have statically consistent presence across a finite spread",
				key,
			),
		))
	}
}

func distributeEnhancementMember(
	sourceFile *ast.SourceFile,
	node *ast.Node,
	prefix string,
	member string,
	valueless bool,
	selection *enhancementPrefixSelection,
	imports *enhancementImports,
) []enhancementSpreadMember {
	if enhancementReservedMember(member) && member != "root" {
		imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
			sourceFile,
			node,
			"EXACT6006",
			fmt.Sprintf("%s:%s is reserved and cannot be an enhancement prop", prefix, member),
		))
		return nil
	}
	if len(selection.components) == 0 {
		imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
			sourceFile,
			node,
			"EXACT6014",
			fmt.Sprintf("enhancement namespace %q requires at least one activator", prefix),
		))
		return nil
	}
	if member == "root" {
		result := make([]enhancementSpreadMember, 0, len(selection.components))
		for _, component := range selection.components {
			result = append(result, enhancementSpreadMember{
				identity: component.identity, prop: "__exactRoot", source: prefix + ":" + member,
			})
		}
		return result
	}
	if activator, exists := selection.binding.activators[member]; exists {
		canonical, payload := activator.component.members[member]
		if !payload {
			if !valueless {
				imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
					sourceFile,
					node,
					"EXACT6015",
					fmt.Sprintf("selector-only enhancement activator %s:%s must be valueless", prefix, member),
				))
			}
			return nil
		}
		return []enhancementSpreadMember{{
			identity: activator.component.identity,
			prop:     canonical.prop,
			source:   prefix + ":" + member,
		}}
	}
	result := []enhancementSpreadMember{}
	for _, component := range selection.components {
		canonical, exists := component.members[member]
		if !exists {
			continue
		}
		result = append(result, enhancementSpreadMember{
			identity: component.identity,
			prop:     canonical.prop,
			source:   prefix + ":" + member,
		})
	}
	if len(result) == 0 {
		identities := make([]string, 0, len(selection.components))
		for _, component := range selection.components {
			identities = append(identities, component.identity)
		}
		imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
			sourceFile,
			node,
			"EXACT6007",
			fmt.Sprintf("unknown enhancement prop %q for %s", member, strings.Join(identities, ", ")),
		))
	}
	return result
}

func planEnhancementSpread(
	sourceFile *ast.SourceFile,
	spread *ast.Node,
	typeChecker *checker.Checker,
	imports *enhancementImports,
	selections map[string]*enhancementPrefixSelection,
	ordinaryBindings map[string]struct{},
) {
	expression := spread.AsJsxSpreadAttribute().Expression
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
			selection := selections[prefix]
			if selection == nil {
				if _, imported := ordinaryBindings[prefix]; imported {
					imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
						sourceFile,
						spread,
						"EXACT6005",
						fmt.Sprintf(
							"JSX enhancement prefix %q requires an import with { type: 'exact-enhancement' }",
							prefix,
						),
					))
				}
				continue
			}
			members := distributeEnhancementMember(
				sourceFile,
				spread,
				prefix,
				member,
				false,
				selection,
				imports,
			)
			if _, exists := seen[source]; !exists {
				plan.keys = append(plan.keys, source)
				seen[source] = struct{}{}
			}
			for _, planned := range members {
				planned.source = source
				plan.members = append(plan.members, planned)
			}
		}
	}
	if open {
		imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
			sourceFile,
			spread,
			"EXACT6008",
			"JSX spreads in an enhancement-enabled module require a statically finite key space",
		))
	}
	if len(plan.keys) == 0 {
		return
	}
	if !ast.IsIdentifier(expression) && !ast.IsPropertyAccessExpression(expression) {
		imports.diagnostics = append(imports.diagnostics, enhancementDiagnostic(
			sourceFile,
			spread,
			"EXACT6009",
			"enhancement-bearing JSX spreads require a stable setup-derived binding",
		))
		return
	}
	imports.spreads[spread.Pos()] = plan
}
