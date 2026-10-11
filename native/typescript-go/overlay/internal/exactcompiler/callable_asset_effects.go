package exactcompiler

import (
	"fmt"
	"path/filepath"
	"strings"
)

// collectSideEffectImportFacts uses the normalized asset evaluation contract.
// Delivery describes bundler output and must not determine execution placement.
// Undeclared imports retain their opaque JavaScript initializer obligation.
func collectSideEffectImportFacts(fact *callableFacts, assets assetAnalysis) {
	environment := ""
	switch assets.sideEffectEvaluation[fact.node.Pos()] {
	case "client":
		environment = "browser"
	case "server":
		environment = "server"
	case "both":
		environment = "neutral"
	}
	if environment != "" {
		fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources,
			environmentSource(environment, "declared asset import", fact.summary.Name))
		return
	}

	declaration := fact.node.AsImportDeclaration()
	moduleSpecifier := declaration.ModuleSpecifier.AsStringLiteral().Text
	edge := CallEdge{
		ID:              fmt.Sprintf("%s:import:%d", fact.summary.ID, fact.node.Pos()),
		Name:            `import "` + moduleSpecifier + `"`,
		ModuleSpecifier: moduleSpecifier,
		ExportName:      "*module*",
		Resolved:        false,
	}
	fact.summary.Calls = append(fact.summary.Calls, edge)
	source := environmentSource(
		"unknown",
		"unresolved call "+edge.Name,
		fact.summary.Name,
	)
	source.Opaque = !strings.HasPrefix(moduleSpecifier, ".") &&
		!filepath.IsAbs(moduleSpecifier)
	fact.summary.DirectEffectSources = append(
		fact.summary.DirectEffectSources,
		source,
	)
}
