package exactcompiler

import (
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

var registryImportPattern = regexp.MustCompile(
	`import\s*\(\s*["']([^"']+)["']\s*\)`,
)
var registrySelectedExportPattern = regexp.MustCompile(
	`\{\s*(?:default\s*:\s*)?([A-Za-z_$][\w$]*)[^}]*\}\s*\)\s*=>`,
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
		if !ast.IsIdentifier(call.Expression) ||
			call.Expression.Text() != "createComponentRegistry" {
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
		text := sourceText(sourceFile, value)
		if match := registryImportPattern.FindStringSubmatch(text); len(match) == 2 {
			entry.ModuleSpecifier = match[1]
		}
		if match := registrySelectedExportPattern.FindStringSubmatch(text); len(match) == 2 {
			entry.ExportName = match[1]
			entry.ComponentName = match[1]
		}
		return entry
	}
	if component, exists := components[componentName]; exists {
		entry.ComponentID = component.ID
		entry.Placement = component.Placement
		entry.ArtifactTargets = append([]string(nil), component.ArtifactTargets...)
	}
	if entry.ComponentID == "" {
		entry.ComponentID = exactStableID(
			normalizedIdentityFilename(sourceFile.FileName()),
			"registry-entry",
			key,
			componentName,
		)
	}
	return entry
}
