package exactcompiler

import (
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/tspath"
)

// invalidateChangedProjectSources retains generation-local facts only when
// their source identity survived the program update and no import path reaches
// the changed module. Path-mapped, root-dir, dynamic, and global-module cases
// deliberately fall back to full invalidation.
func (state *projectState) invalidateChangedProjectSources(changedFileName string) {
	if !state.hasAnalysisCaches() {
		return
	}
	if projectRequiresConservativeInvalidation(state) {
		state.counters.FullInvalidations++
		state.invalidateAnalysisCaches()
		return
	}
	affected := affectedProjectSourcePaths(state, changedFileName)
	state.counters.AffectedSourceCount += int64(len(affected))
	current := make(map[*ast.SourceFile]bool)
	for _, sourceFile := range state.program.GetSourceFiles() {
		current[sourceFile] = true
		if !sourceFile.IsDeclarationFile && !affected[state.fs.canonical(sourceFile.FileName())] {
			state.counters.ReusedSourceCount++
		}
	}
	state.pruneComponentCaches(current, affected)
	state.pruneCallableCache(current, affected)
}

func (state *projectState) hasAnalysisCaches() bool {
	return state.callableCache != nil ||
		state.componentCache != nil ||
		state.componentFacts != nil ||
		state.componentLinks != nil
}

func projectRequiresConservativeInvalidation(state *projectState) bool {
	options := state.config.CompilerOptions()
	if options.BaseUrl != "" || len(options.RootDirs) != 0 ||
		(options.Paths != nil && options.Paths.Size() != 0) {
		return true
	}
	for _, sourceFile := range state.program.GetSourceFiles() {
		if sourceFile.IsDeclarationFile {
			continue
		}
		text := sourceFile.Text()
		_, openDynamicImport := projectModuleSpecifiers(sourceFile)
		if strings.Contains(text, "declare global") ||
			strings.Contains(text, "declare module") ||
			openDynamicImport {
			return true
		}
	}
	return false
}

func projectModuleSpecifiers(sourceFile *ast.SourceFile) ([]string, bool) {
	specifiers := make([]string, 0)
	for _, imported := range collectImports(sourceFile) {
		specifiers = append(specifiers, imported.ModuleSpecifier)
	}
	open := false
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		call := node.AsCallExpression()
		if !moduleCallExpression(call.Expression) {
			return true
		}
		if call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
			open = true
			return true
		}
		argument := call.Arguments.Nodes[0]
		if ast.IsStringLiteral(argument) || ast.IsNoSubstitutionTemplateLiteral(argument) {
			specifiers = append(specifiers, argument.Text())
		} else {
			open = true
		}
		return true
	})
	return specifiers, open
}

func affectedProjectSourcePaths(
	state *projectState,
	changedFileName string,
) map[string]bool {
	affectedPaths := map[string]bool{state.fs.canonical(changedFileName): true}
	affectedModules := map[string]bool{projectComponentModuleIdentity(changedFileName): true}
	changed := true
	for changed {
		changed = false
		for _, sourceFile := range state.program.GetSourceFiles() {
			path := state.fs.canonical(sourceFile.FileName())
			if affectedPaths[path] || sourceFile.IsDeclarationFile {
				continue
			}
			specifiers, _ := projectModuleSpecifiers(sourceFile)
			for _, specifier := range specifiers {
				if !strings.HasPrefix(specifier, "./") &&
					!strings.HasPrefix(specifier, "../") {
					continue
				}
				resolved := tspath.GetNormalizedAbsolutePath(
					specifier,
					tspath.GetDirectoryPath(sourceFile.FileName()),
				)
				if !affectedModules[projectComponentModuleIdentity(resolved)] {
					continue
				}
				affectedPaths[path] = true
				affectedModules[projectComponentModuleIdentity(sourceFile.FileName())] = true
				changed = true
				break
			}
		}
	}
	return affectedPaths
}

func (state *projectState) pruneComponentCaches(
	current map[*ast.SourceFile]bool,
	affected map[string]bool,
) {
	for sourceFile := range state.componentCache {
		if !current[sourceFile] || affected[state.fs.canonical(sourceFile.FileName())] {
			delete(state.componentCache, sourceFile)
		}
	}
	for sourceFile, records := range state.componentFacts {
		if current[sourceFile] && !affected[state.fs.canonical(sourceFile.FileName())] {
			continue
		}
		for _, record := range records {
			delete(state.componentLinks, record.candidate.node)
		}
		delete(state.componentFacts, sourceFile)
		delete(state.componentCandidates, sourceFile)
		delete(state.componentNodeIDs, sourceFile)
	}
	// Requested sources are not necessarily present in dependency facts.
	for sourceFile := range state.componentCandidates {
		if !current[sourceFile] || affected[state.fs.canonical(sourceFile.FileName())] {
			for _, candidate := range state.componentCandidates[sourceFile] {
				delete(state.componentLinks, candidate.node)
			}
			delete(state.componentCandidates, sourceFile)
			delete(state.componentNodeIDs, sourceFile)
		}
	}
}

func (state *projectState) pruneCallableCache(
	current map[*ast.SourceFile]bool,
	affected map[string]bool,
) {
	if state.callableCache == nil {
		return
	}
	for sourceFile := range state.callableCache.bySource {
		if current[sourceFile] && !affected[state.fs.canonical(sourceFile.FileName())] {
			continue
		}
		delete(state.callableCache.bySource, sourceFile)
		delete(state.callableCache.fingerprints, sourceFile)
		delete(state.callableCache.owned, sourceFile)
	}
	// The next request rebuilds missing source facts and publishes one merged
	// fixed point before consulting requested-source ownership.
	state.callableCache.analyses = nil
	state.callableCache.merged = callableAnalysis{}
}
