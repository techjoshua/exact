package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// projectModuleImports contains immutable source syntax, not module resolution or checker facts.
// Surviving source identities retain discovery through reverse-dependent invalidation. Replaced
// sources are pruned, and full invalidation releases the complete cache.
type projectModuleImports struct {
	specifiers  []string
	openDynamic bool
}

func (state *projectState) sourceModuleSpecifiers(source *ast.SourceFile) ([]string, bool) {
	if cached, exists := state.moduleImports[source]; exists {
		return cached.specifiers, cached.openDynamic
	}
	specifiers, open := projectModuleSpecifiers(source)
	if state.moduleImports == nil {
		state.moduleImports = make(map[*ast.SourceFile]projectModuleImports)
	}
	state.moduleImports[source] = projectModuleImports{specifiers, open}
	return specifiers, open
}
