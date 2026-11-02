package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// possibleProxyOriginMode retains the ordinary source mode without a prefix
// execution override. Program/generation and native-contract fences stay owned
// by the existing Proxy metadata consumers.
func possibleProxyOriginMode(owner *sourceValueOwner, source *ast.SourceFile) [32]byte {
	return [32]byte{}
}

// stalePossibleProxyOriginCache requires genuine recollection after request-generation
// turnover. Re-stamping an old Proxy origin could renew a discarded construction.
func stalePossibleProxyOriginCache(cache *projectCallableCache, generation *projectGeneration) bool {
	if cache == nil {
		return false
	}
	for _, analysis := range cache.bySource {
		for _, fact := range analysis.facts {
			if d := fact.initializerDraft; d != nil && len(d.PossibleProxyGets) != 0 && d.OriginGeneration != generation {
				return true
			}
		}
	}
	return false
}
