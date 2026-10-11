package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

type pendingStateAlias struct {
	path  []string
	start int
}

// capturePendingOwnedAliases carries proven state aliases into invocation ownership even when
// their original selection occurred during setup, before this transaction existed.
func (lowering *jsxLowering) capturePendingOwnedAliases() {
	for _, candidate := range componentCandidates(lowering.sourceFile) {
		aliases := sourceStateAliases(candidate, lowering.checker, lowering.analysisFacts)
		walkNode(candidate.node, func(node *ast.Node) bool {
			if !ast.IsIdentifier(node) || isNonReferenceComponentIdentifier(node) {
				return true
			}
			if path, owned := statePath(node, aliases.bySymbol, lowering.checker, true); owned && lowering.checker.GetTypeAtLocation(node).Flags()&(checker.TypeFlagsObject|checker.TypeFlagsUnion|checker.TypeFlagsAny) != 0 {
				lowering.pendingOwnedValues[nodeSourceSpan(node)] = true
				if symbol := lowering.checker.GetSymbolAtLocation(node); symbol != nil {
					binding := aliases.bySymbol[ast.GetSymbolId(symbol)]
					lowering.pendingOwnedAliases[nodeSourceSpan(node)] = pendingStateAlias{path: path, start: binding.fact.Start}
				}
			}
			return true
		})
	}
}
