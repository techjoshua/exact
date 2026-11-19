package exactcompiler

import (
	"sort"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// collectExportRecords asks the retained checker for the module's runtime
// exports. This includes aliases and re-exports while excluding declarations
// that exist only in TypeScript's type namespace.
func collectExportRecords(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	components []Component,
	policy PolicyAnalysis,
	owner *executableBodyOwner,
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
		if typeChecker.GetTypeOnlyAliasDeclaration(exported) != nil {
			continue
		}
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
		ownedDeclaration := false
		for _, declaration := range resolved.Declarations {
			if ast.GetSourceFileOfNode(declaration) != sourceFile {
				continue
			}
			ownedDeclaration = true
			if value, exists := componentPlacementsByStart[declaration.Pos()]; exists {
				componentPlacement, componentByDeclaration = value, true
				break
			}
		}
		if componentByDeclaration {
			kind = "component"
			placement = componentPlacement
		} else if value, exists := componentPlacements[localName]; ownedDeclaration && exists {
			kind = "component"
			placement = value
		} else if value, exists := componentPlacements[name]; ownedDeclaration && exists {
			kind = "component"
			placement = value
		}
		if value, exists := policyPlacements[localName]; ownedDeclaration && exists {
			placement = value
		} else if value, exists := policyPlacements[name]; ownedDeclaration && exists {
			placement = value
		} else if kind == "value" {
			placement = moduleValueDefinitionPlacement(exported, typeChecker, owner)
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
