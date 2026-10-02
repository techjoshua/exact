package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// collectComponentRegistries records finite registry provenance for module analysis,
// explain tools, artifact planning, and target-local authority checks.
func collectComponentRegistries(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components []Component,
	identityFilename string,
) []ComponentRegistry {
	componentsByName := make(map[string]Component, len(components))
	for _, component := range components {
		componentsByName[component.Name] = component
	}
	var registries []ComponentRegistry
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if !componentRegistryFactoryCall(call.Expression, sourceFile, typeChecker) {
			return true
		}
		declaration := componentRegistryDeclaration(node)
		if declaration == nil || !ast.IsIdentifier(declaration.Name()) {
			return false
		}
		name := declaration.Name().Text()
		definition := componentRegistryDefinition(
			declaration.Name(),
			sourceFile,
			typeChecker,
		)
		if definition == nil {
			return false
		}
		registry := ComponentRegistry{
			ID: exactStableID(
				normalizedIdentityFilename(identityFilename),
				"registry",
				name,
			),
			Name:    name,
			Entries: []ComponentRegistryEntry{},
		}
		for _, property := range definition.AsObjectLiteralExpression().Properties.Nodes {
			key, value, valid := componentRegistryProperty(property)
			if !valid {
				continue
			}
			entry := componentRegistryEntry(
				key,
				value,
				sourceFile,
				componentsByName,
				typeChecker,
			)
			registry.Entries = append(registry.Entries, entry)
		}
		registries = append(registries, registry)
		return false
	})
	return registries
}

func componentRegistryEntry(
	key string,
	value *ast.Node,
	sourceFile *ast.SourceFile,
	components map[string]Component,
	typeChecker *checker.Checker,
) ComponentRegistryEntry {
	componentName := strings.TrimSpace(sourceText(sourceFile, value))
	entry := ComponentRegistryEntry{
		Key:             key,
		Mode:            "eager",
		ComponentName:   componentName,
		Placement:       "unknown",
		Ownership:       "exact",
		ArtifactTargets: []string{"client", "server"},
	}
	if registryLazyCall(value) {
		entry.Mode = "lazy"
		arguments := value.AsCallExpression().Arguments
		if arguments != nil && len(arguments.Nodes) == 1 {
			module, exported, selected, valid := registryLazySelectionExpression(arguments.Nodes[0], typeChecker)
			if valid {
				entry.ModuleSpecifier = module
				entry.ExportName = exported
				entry.ComponentName = exported
				entry.ComponentID = registryCanonicalComponentID(selected, sourceFile, typeChecker, components)
				if entry.ComponentID == "" {
					// A proven destructured module selector carries the export's function type,
					// while its value symbol belongs to the selector's binding parameter.
					entry.ComponentID = registryCanonicalSymbolID(typeChecker.GetTypeAtLocation(selected).Symbol(), sourceFile, components)
				}
			}
		}
		return entry
	}
	entry.ComponentID = registryCanonicalComponentID(value, sourceFile, typeChecker, components)
	if targets, valid := resolveJSXComponentValueExpression(value, sourceFile, typeChecker, make(map[ast.SymbolId]bool)); valid && len(targets) == 1 {
		bindings := collectExternalImportBindings(sourceFile, typeChecker)
		parts := strings.Split(targets[0].tag, ".")
		if reference, exists := bindings.byName[parts[0]]; exists {
			if !reference.namespace && len(parts) == 1 {
				entry.ModuleSpecifier = reference.moduleSpecifier
				entry.ExportName = reference.exportName
			} else if reference.namespace && len(parts) == 2 {
				entry.ModuleSpecifier = reference.moduleSpecifier
				entry.ExportName = parts[1]
			}
		}
	}
	if component, exists := components[componentName]; exists {
		entry.ComponentID = component.ID
		entry.Placement = component.Placement
		entry.ArtifactTargets = append([]string(nil), component.ArtifactTargets...)
	}
	if entry.ComponentID == "" && entry.ModuleSpecifier == "" {
		entry.ComponentID = exactStableID(
			normalizedIdentityFilename(sourceFile.FileName()),
			"registry-entry",
			key,
			componentName,
		)
	}
	return entry
}

// registryCanonicalComponentID reuses immutable component-value proof rather than registry names.
// Unresolved external declarations retain no canonical claim.
func registryCanonicalComponentID(value *ast.Node, sourceFile *ast.SourceFile, typeChecker *checker.Checker, components map[string]Component) string {
	targets, valid := resolveJSXComponentValueExpression(value, sourceFile, typeChecker, make(map[ast.SymbolId]bool))
	if !valid || len(targets) != 1 || targets[0].symbol == nil {
		return ""
	}
	return registryCanonicalSymbolID(targets[0].symbol, sourceFile, components)
}

// registryCanonicalSymbolID accepts only a source component declaration, never an ambient signature.
func registryCanonicalSymbolID(symbol *ast.Symbol, sourceFile *ast.SourceFile, components map[string]Component) string {
	if symbol == nil {
		return ""
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if source == nil || source.IsDeclarationFile {
			continue
		}
		if source == sourceFile && declaration.Name() != nil {
			if component, exists := components[declaration.Name().Text()]; exists {
				return component.ID
			}
		}
		for _, candidate := range activeComponentCandidates(source) {
			if candidate.node == declaration {
				return exactStableID(normalizedIdentityFilename(source.FileName()), expressionNodeIDs(source)[declaration])
			}
		}
	}
	return ""
}
