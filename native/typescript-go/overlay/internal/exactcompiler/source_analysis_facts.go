package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// sourceAnalysisFacts shares authored import and alias proofs within one acquired checker.
// It never survives a request or participates in analysis after executable reparenting.
type sourceAnalysisFacts struct {
	source  *ast.SourceFile
	checker *checker.Checker
	imports externalImportBindings
	aliases map[componentAliasKey]componentStateAliases
}

type componentAliasKey struct {
	node *ast.Node
	name string
}

func newSourceAnalysisFacts(source *ast.SourceFile, typeChecker *checker.Checker) *sourceAnalysisFacts {
	return &sourceAnalysisFacts{source: source, checker: typeChecker, imports: collectExternalImportBindings(source, typeChecker), aliases: make(map[componentAliasKey]componentStateAliases)}
}

func sourceStateAliases(candidate componentCandidate, typeChecker *checker.Checker, facts *sourceAnalysisFacts) componentStateAliases {
	if facts == nil {
		return collectComponentStateAliases(candidate, typeChecker)
	}
	if facts.checker != typeChecker || ast.GetSourceFileOfNode(candidate.node) != facts.source {
		panic("source alias facts used outside authored checker scope")
	}
	key := componentAliasKey{candidate.node, candidate.name}
	if value, exists := facts.aliases[key]; exists {
		return value
	}
	value := collectComponentStateAliases(candidate, typeChecker)
	facts.aliases[key] = value
	return value
}
