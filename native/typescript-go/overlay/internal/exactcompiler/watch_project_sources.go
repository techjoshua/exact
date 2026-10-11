package exactcompiler

import (
	"sort"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/module"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

// watchedProjectFiles exposes resolved inputs, including erased type imports.
// Bundled default libraries are immutable compiler resources rather than watched files.
func (session *Session) watchedProjectFiles(fileName string) []string {
	files := make(map[string]bool)
	for _, project := range session.projects {
		root := project.program.GetSourceFile(fileName)
		if fileName != "" && root == nil {
			continue
		}
		visited := make(map[*ast.SourceFile]bool)
		var visit func(*ast.SourceFile)
		visit = func(sourceFile *ast.SourceFile) {
			if sourceFile == nil || visited[sourceFile] || project.program.IsSourceFileDefaultLibrary(sourceFile.Path()) {
				return
			}
			visited[sourceFile] = true
			if sourceFile != root {
				files[project.fs.base.Realpath(sourceFile.FileName())] = true
			}
			project.program.ForEachResolvedModule(func(resolution *module.ResolvedModule, _ string, _ core.ResolutionMode, _ tspath.Path) {
				if resolution.IsResolved() {
					visit(project.program.GetSourceFile(resolution.ResolvedFileName))
				}
			}, sourceFile)
		}
		visit(root)
		for _, sourceFile := range project.program.GetSourceFiles() {
			// Globals and declarations can affect types without a runtime import.
			if fileName == "" || sourceFile.IsDeclarationFile || !ast.IsExternalModule(sourceFile) || strings.Contains(sourceFile.Text(), "declare global") {
				visit(sourceFile)
			}
		}
	}
	result := make([]string, 0, len(files))
	for file := range files {
		result = append(result, file)
	}
	sort.Strings(result)
	return result
}

// refreshWatchedConsumers carries dependency edits across project keys without
// discarding prepared consumer sources or acquiring unused dependency checkers.
func (session *Session) refreshWatchedConsumers(owner *projectState, fileName string, normalization normalizedSource) {
	for _, project := range session.projects {
		if project == owner {
			continue
		}
		// A preserveSymlinks consumer can retain the linked spelling while its
		// watcher reports the physical file. Refresh every spelling of that file.
		realPath := project.fs.canonical(project.fs.base.Realpath(fileName))
		var affected []*ast.SourceFile
		for _, sourceFile := range project.program.GetSourceFiles() {
			if sourceFile.Text() == normalization.text {
				continue
			}
			if project.fs.canonical(sourceFile.FileName()) == project.fs.canonical(fileName) ||
				project.fs.canonical(project.fs.base.Realpath(sourceFile.FileName())) == realPath {
				affected = append(affected, sourceFile)
			}
		}
		for _, sourceFile := range affected {
			project.refreshWatchedSource(sourceFile, normalization)
		}
	}
}

// refreshWatchedSource preserves authored coordinates in the replaced dependency.
func (project *projectState) refreshWatchedSource(sourceFile *ast.SourceFile, normalization normalizedSource) {
	// Virtual enhancement imports belong to the consumer's preparation catalog.
	// A watcher supplies authored text and must not erase those retained imports.
	if previous, exists := project.normalizations[project.fs.canonical(sourceFile.FileName())]; exists {
		preparedEnd := len(previous.authoredOffsets) - 1
		normalizedEnd := len(normalization.authoredOffsets) - 1
		normalization.text = normalization.text[:normalizedEnd] + previous.text[preparedEnd:]
	}
	project.refreshSource(sourceFile.FileName(), normalization.text)
	project.retainNormalization(sourceFile.FileName(), normalization)
}
