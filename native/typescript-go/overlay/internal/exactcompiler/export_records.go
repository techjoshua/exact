package exactcompiler

import (
	"sort"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

// collectExportRecords asks the retained checker for the module's runtime
// exports. This includes aliases and re-exports while excluding declarations
// that exist only in TypeScript's type namespace.
func collectExportRecords(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components []Component,
	callables []CallableSummary,
	policy PolicyManifest,
) []ExportRecord {
	if sourceFile.Symbol == nil {
		return []ExportRecord{}
	}
	componentPlacements := make(map[string]string)
	componentPlacementsByStart := make(map[int]string)
	for _, component := range components {
		componentPlacements[component.Name] = component.Placement
		componentPlacementsByStart[component.Start] = component.Placement
	}
	callablePlacements := make(map[string]string)
	for _, callable := range callables {
		callablePlacements[callable.Name] = placementForCallable(callable)
		for _, exportName := range callable.ExportNames {
			callablePlacements[exportName] = placementForCallable(callable)
		}
	}
	policyPlacements := make(map[string]string)
	for _, subject := range policy.Subjects {
		placement := placementForResidency(subject.Policy.Residency)
		if placement != "unknown" {
			policyPlacements[subject.Name] = placement
		}
	}
	records := []ExportRecord{}
	seen := make(map[string]struct{})
	for _, exported := range typeChecker.GetExportsOfModule(sourceFile.Symbol) {
		resolved := typeChecker.SkipAlias(exported)
		if resolved == nil || resolved.Flags&ast.SymbolFlagsValue == 0 {
			continue
		}
		name := ast.SymbolName(exported)
		if name == ast.InternalSymbolNameExportEquals || name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			continue
		}
		seen[name] = struct{}{}
		localName := ast.SymbolName(resolved)
		kind := "value"
		placement := "isomorphic"
		componentPlacement, componentByDeclaration := "", false
		for _, declaration := range resolved.Declarations {
			if value, exists := componentPlacementsByStart[declaration.Pos()]; exists {
				componentPlacement, componentByDeclaration = value, true
				break
			}
		}
		if componentByDeclaration {
			kind = "component"
			placement = componentPlacement
		} else if value, exists := componentPlacements[localName]; exists {
			kind = "component"
			placement = value
		} else if value, exists := componentPlacements[name]; exists {
			kind = "component"
			placement = value
		} else if value, exists := callablePlacements[localName]; exists {
			placement = value
		} else if value, exists := callablePlacements[name]; exists {
			placement = value
		} else if value := exportedValuePlacement(
			resolved,
			sourceFile,
			typeChecker,
		); value != "" {
			placement = value
		}
		if value, exists := policyPlacements[localName]; exists {
			placement = value
		} else if value, exists := policyPlacements[name]; exists {
			placement = value
		}
		records = append(records, ExportRecord{
			Name:      name,
			LocalName: localName,
			Kind:      kind,
			Placement: placement,
		})
	}
	sort.Slice(records, func(left int, right int) bool {
		return records[left].Name < records[right].Name
	})
	return records
}

func exportedValuePlacement(
	symbol *ast.Symbol,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) string {
	browser, server := false, false
	for _, declaration := range symbol.Declarations {
		if !ast.IsVariableDeclaration(declaration) ||
			declaration.AsVariableDeclaration().Initializer == nil {
			continue
		}
		valueBrowser, valueServer := taskEnvironmentEffects(
			declaration.AsVariableDeclaration().Initializer,
			sourceFile,
			typeChecker,
		)
		browser = browser || valueBrowser
		server = server || valueServer
	}
	switch {
	case browser && server:
		return "unknown"
	case browser:
		return "client"
	case server:
		return "server"
	default:
		return ""
	}
}

func placementForCallable(callable CallableSummary) string {
	switch {
	case callable.Effect == "browser" ||
		(len(callable.ArtifactTargets) == 1 &&
			callable.ArtifactTargets[0] == "client"):
		return "client"
	case callable.Effect == "server" ||
		(len(callable.ArtifactTargets) == 1 &&
			callable.ArtifactTargets[0] == "server"):
		return "server"
	case callable.Effect == "neutral":
		return "isomorphic"
	default:
		return "unknown"
	}
}

func placementForResidency(residency string) string {
	switch residency {
	case "client":
		return "client"
	case "server":
		return "server"
	case "shared":
		return "isomorphic"
	default:
		return "unknown"
	}
}
