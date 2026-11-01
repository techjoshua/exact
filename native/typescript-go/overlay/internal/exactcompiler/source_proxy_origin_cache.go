package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// possibleProxyOriginMode binds effects-only Proxy metadata to its request mode.
func possibleProxyOriginMode(owner *sourceValueOwner, source *ast.SourceFile) [32]byte {
	if h := owner.closedPrefixes[source]; h != nil {
		return h.mode
	}
	if p := owner.closedPrefixCandidate; p != nil && p.source == source && p.history != nil {
		return p.history.mode
	}
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
