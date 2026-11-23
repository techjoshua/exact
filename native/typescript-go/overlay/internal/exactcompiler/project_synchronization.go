package exactcompiler

import (
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/bundled"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

type synchronizedProjectSource struct {
	fileName        string
	source          string
	normalization   normalizedSource
	contentRevision string
	input           string // Original immutable bytes, already checked against the snapshot revision.
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
		prepared = append(prepared, synchronizedProjectSource{fileName: fileName, source: normalized.text, normalization: normalized, contentRevision: preparedContentRevision(source.Source), input: source.Source})
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
		remapDiagnosticLocations(response.Diagnostics, "", newNormalizedSource(""), 0)
		if err != nil {
			response.Error = err.Error()
			return response
		}
		if project == nil {
			return response
		}
	}
	selection, err := prepareExecutableSelection(request, prepared, project)
	if err != nil {
		response.Error = err.Error()
		return response
	}
	selectionChanged := !reflect.DeepEqual(project.executableSelection, selection)
	if selectionChanged && project.initialized {
		// Reparse configuration and drop obsolete execution roots as one selection generation.
		// Resolver/config changes have no narrower proven invalidation boundary yet.
		replacement, diagnostics, err := newProjectState(request, prepared[0].fileName)
		for _, diagnostic := range diagnostics {
			response.Diagnostics = append(response.Diagnostics, projectDiagnostic(diagnostic))
		}
		if err != nil {
			response.Error = err.Error()
			return response
		}
		if replacement == nil {
			return response
		}
		replacement.counters = project.counters
		replacement.selectionGeneration = project.selectionGeneration
		project = replacement
		s.authoredValidations = nil
		s.generatedValidations = nil
	}
	project.executableSelection = selection
	if selection != nil {
		project.selectionGeneration = selection.snapshot.Generation
	}
	project.executionRoots = true

	countersBefore := project.counters
	programStarted := time.Now()
	changed := project.synchronize(prepared)
	s.projects[projectKey] = project
	response.Counters = project.counters.since(countersBefore)
	response.CacheHit = !changed && !selectionChanged
	if selection != nil {
		response.ExecutableSelection = &executableSelectionAcknowledgement{selection.snapshot.Generation, selection.snapshot.Revision, selection.snapshot.Target}
	}
	response.Timings.ProgramMicroseconds = time.Since(programStarted).Microseconds()
	response.Timings.TotalMicroseconds = time.Since(requestStarted).Microseconds()
	return response
}

func normalizeSynchronizedSource(source ProjectSource, root string) (string, normalizedSource, error) {
	fileName, err := normalizeFileName(source.ID, root)
	if err != nil {
		return "", normalizedSource{}, err
	}
	authored := source.Source
	suffix := ""
	if source.PackageEnhancementBoundary > 0 {
		boundary, valid := utf16OffsetToByteOffset(source.Source, source.PackageEnhancementBoundary)
		if !valid {
			return "", normalizedSource{}, fmt.Errorf(
				"package enhancement boundary for %s is not a valid UTF-16 source offset",
				fileName,
			)
		}
		authored = source.Source[:boundary]
		suffix = source.Source[boundary:]
	}
	normalization, err := normalizeAuthoredSource(fileName, authored)
	if err != nil {
		return "", normalizedSource{}, err
	}
	normalization.text += suffix
	normalization.synchronized = source.PackageEnhancementBoundary == 0
	return fileName, normalization, nil
}

func nativeProjectKey(request Request, fileName string) string {
	identity := request.ConfigFile
	if identity == "" {
		identity = fileName
	}
	if standaloneIntlAnalysisRequest(request) {
		identity += "\x00intl-native-libraries"
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
		// A folded key cannot attest which original filename reached the parser.
		source.normalization.synchronized = source.normalization.synchronized && key == source.fileName
		state.retainNormalization(source.fileName, source.normalization)
		if previous, exists := state.sources[key]; exists && previous == source.source {
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
		state.program.BindSourceFiles()
		state.initialized = true
		return false
	}
	state.counters.ProgramRebuilds++
	state.config = state.config.WithFileNames(rootFiles)
	host := compiler.NewCompilerHost(
		state.currentDirectory,
		state.fs,
		bundled.LibPath(),
		nil,
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
