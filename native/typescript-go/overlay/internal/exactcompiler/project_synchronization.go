package exactcompiler

import (
	"fmt"
	"strings"
	"time"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/bundled"
	"github.com/microsoft/typescript-go/internal/compiler"
	"github.com/microsoft/typescript-go/internal/tsoptions"
	"github.com/microsoft/typescript-go/internal/tspath"
)

type synchronizedProjectSource struct {
	fileName string
	source   string
}

// synchronizeProject installs a complete set of prepared overlays before any
// per-module request acquires a checker. One program generation and one cache
// invalidation therefore own the entire batch.
func (s *Session) synchronizeProject(
	request Request,
	response Response,
	requestStarted time.Time,
) Response {
	if len(request.Sources) == 0 {
		response.Error = "native project synchronization requires at least one source"
		return response
	}
	prepared := make([]synchronizedProjectSource, 0, len(request.Sources))
	for _, source := range request.Sources {
		fileName, normalized, err := normalizeSynchronizedSource(source, request.Root)
		if err != nil {
			response.Error = err.Error()
			return response
		}
		prepared = append(prepared, synchronizedProjectSource{fileName: fileName, source: normalized})
	}
	if request.ConfigFile == "" {
		request.ConfigFile = nearestTypeScriptConfig(prepared[0].fileName)
	}
	request.ID = prepared[0].fileName
	request.Source = prepared[0].source
	projectKey := nativeProjectKey(request, prepared[0].fileName)
	project := s.projects[projectKey]
	if project == nil {
		var diagnostics []*ast.Diagnostic
		var err error
		project, diagnostics, err = newProjectState(request, prepared[0].fileName)
		for _, diagnostic := range diagnostics {
			response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
		}
		if err != nil {
			response.Error = err.Error()
			return response
		}
		if project == nil {
			return response
		}
		s.projects[projectKey] = project
	}
	countersBefore := project.counters
	programStarted := time.Now()
	changed := project.synchronize(prepared)
	response.Counters = project.counters.since(countersBefore)
	response.CacheHit = !changed
	response.Timings.ProgramMicroseconds = time.Since(programStarted).Microseconds()
	response.Timings.TotalMicroseconds = time.Since(requestStarted).Microseconds()
	return response
}

func normalizeSynchronizedSource(source ProjectSource, root string) (string, string, error) {
	fileName, err := normalizeFileName(source.ID, root)
	if err != nil {
		return "", "", err
	}
	authored := source.Source
	suffix := ""
	if source.PackageEnhancementBoundary > 0 {
		boundary, valid := utf16OffsetToByteOffset(source.Source, source.PackageEnhancementBoundary)
		if !valid {
			return "", "", fmt.Errorf(
				"package enhancement boundary for %s is not a valid UTF-16 source offset",
				fileName,
			)
		}
		authored = source.Source[:boundary]
		suffix = source.Source[boundary:]
	}
	normalization, err := normalizeAuthoredSource(fileName, authored)
	if err != nil {
		return "", "", err
	}
	return fileName, normalization.text + suffix, nil
}

func nativeProjectKey(request Request, fileName string) string {
	identity := request.ConfigFile
	if identity == "" {
		identity = fileName
	}
	return strings.Join([]string{request.Root, identity}, "\x00")
}

// synchronize publishes all changed overlays through one replacement program.
// Caches are invalidated once because they contain checker and AST identities
// owned by the superseded generation.
func (state *projectState) synchronize(sources []synchronizedProjectSource) bool {
	changed := false
	rootFiles := append([]string(nil), state.config.FileNames()...)
	for _, source := range sources {
		key := state.fs.canonical(source.fileName)
		if state.sources[key] == source.source {
			continue
		}
		changed = true
		state.fs.set(source.fileName, source.source)
		state.sources[key] = source.source
		if !projectContainsRoot(state, rootFiles, source.fileName) {
			rootFiles = append(rootFiles, source.fileName)
		}
	}
	if !changed {
		return false
	}
	state.counters.ProgramRebuilds++
	state.config = tsoptions.NewParsedCommandLine(
		state.config.CompilerOptions().Clone(),
		rootFiles,
		tspath.ComparePathsOptions{
			CurrentDirectory:          state.currentDirectory,
			UseCaseSensitiveFileNames: state.fs.UseCaseSensitiveFileNames(),
		},
	)
	host := compiler.NewCompilerHost(
		state.currentDirectory,
		state.fs,
		bundled.LibPath(),
		nil,
		nil,
	)
	state.program = compiler.NewProgram(compiler.ProgramOptions{Config: state.config, Host: host})
	state.program.BindSourceFiles()
	state.invalidateAnalysisCaches()
	state.initialized = true
	return true
}

func projectContainsRoot(state *projectState, roots []string, fileName string) bool {
	for _, root := range roots {
		if tspath.ComparePaths(root, fileName, tspath.ComparePathsOptions{
			CurrentDirectory:          state.currentDirectory,
			UseCaseSensitiveFileNames: state.fs.UseCaseSensitiveFileNames(),
		}) == 0 {
			return true
		}
	}
	return false
}
