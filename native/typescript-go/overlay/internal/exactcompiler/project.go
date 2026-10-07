package exactcompiler

import (
	"context"
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/bundled"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/compiler"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/tsoptions"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
	"github.com/microsoft/TypeScript/tsc/internal/vfs/osvfs"
)

type projectState struct {
	currentDirectory    string
	configFile          string
	sources             map[string]string
	normalizations      map[string]normalizedSource
	fs                  *sourceOverlay
	config              *tsoptions.ParsedCommandLine
	program             *compiler.Program
	moduleImports       map[*ast.SourceFile]projectModuleImports
	policyTypes         *projectPolicyTypes
	callableCache       *projectCallableCache
	componentCache      map[*ast.SourceFile][]Component
	componentFacts      map[*ast.SourceFile][]projectComponent
	componentCandidates map[*ast.SourceFile][]componentCandidate
	componentNodeIDs    map[*ast.SourceFile]map[*ast.Node]string
	componentLinks      map[*ast.Node]projectComponentLinkFacts
	initialized         bool
	counters            WorkCounters
}

type projectGeneration struct {
	sourceFile *ast.SourceFile
	program    *compiler.Program
	checker    *checker.Checker
	release    func()
	reused     bool
}

func newProjectState(request Request, fileName string) (*projectState, []*ast.Diagnostic, error) {
	return newProjectStateWithSources(request, fileName, nil)
}

// newProjectStateWithSources isolates validation from the retained program while
// preserving prepared dependencies which need not exist on disk.
func newProjectStateWithSources(request Request, fileName string, sources map[string]string, observations ...*validationDependencies) (*projectState, []*ast.Diagnostic, error) {
	currentDirectory := request.Root
	if currentDirectory == "" {
		currentDirectory = tspath.GetDirectoryPath(fileName)
	}
	currentDirectory = tspath.GetNormalizedAbsolutePath(currentDirectory, tspath.GetDirectoryPath(fileName))

	base := bundled.WrapFS(osvfs.FS())
	if len(observations) != 0 {
		observations[0].FS = base
		base = observations[0]
	}
	overlay := newSourceOverlay(base)
	for path, source := range sources {
		overlay.set(path, source)
	}
	overlay.set(fileName, request.Source)
	// eXact owns source lowering through its overlay, without an upstream content-mapper project.
	host := compiler.NewCompilerHost(currentDirectory, overlay, bundled.LibPath(), nil, nil, nil)
	configFile := request.ConfigFile
	var config *tsoptions.ParsedCommandLine
	var diagnostics []*ast.Diagnostic
	if configFile != "" {
		configFile = tspath.GetNormalizedAbsolutePath(configFile, currentDirectory)
		parsed, errors := tsoptions.GetParsedCommandLineOfConfigFile(
			configFile,
			nil,
			nil,
			host,
			nil,
		)
		if len(errors) != 0 {
			return nil, errors, nil
		}
		diagnostics = append(diagnostics, parsed.Errors...)
		options := parsed.CompilerOptions().Clone()
		// exactc accepts explicitly requested JavaScript modules even when the
		// owning TypeScript project excludes them from ordinary tsc roots.
		options.AllowJs = core.TSTrue
		rootFiles := append([]string(nil), parsed.FileNames()...)
		found := false
		for _, rootFile := range rootFiles {
			if tspath.ComparePaths(
				rootFile,
				fileName,
				tspath.ComparePathsOptions{
					CurrentDirectory:          currentDirectory,
					UseCaseSensitiveFileNames: overlay.UseCaseSensitiveFileNames(),
				},
			) == 0 {
				found = true
				break
			}
		}
		if !found {
			rootFiles = append(rootFiles, fileName)
		}
		// Preserve reference syntax and resolution metadata for upstream diagnostics.
		config = parsed.WithFileNames(rootFiles)
		config.ParsedConfig.CompilerOptions = options
	} else {
		options := &core.CompilerOptions{
			AllowJs:          core.TSTrue,
			Jsx:              core.JsxEmitPreserve,
			Module:           core.ModuleKindESNext,
			ModuleResolution: core.ModuleResolutionKindBundler,
			NoEmit:           core.TSTrue,
			SkipLibCheck:     core.TSTrue,
			Target:           core.ScriptTargetES2022,
		}
		if standaloneIntlAnalysisRequest(request) {
			// The standalone analyzer has no authored tsconfig. Resolve supported native Intl and
			// Temporal declarations instead of inferring identity from unresolved type display text.
			options.Lib = []string{"esnext", "dom", "dom.iterable"}
		}
		config = tsoptions.NewParsedCommandLine(
			options,
			[]string{fileName},
			nil,
			tspath.ComparePathsOptions{
				CurrentDirectory:          currentDirectory,
				UseCaseSensitiveFileNames: overlay.UseCaseSensitiveFileNames(),
			},
		)
	}
	state := &projectState{
		currentDirectory: currentDirectory,
		configFile:       configFile,
		sources: map[string]string{
			overlay.canonical(fileName): request.Source,
		},
		fs:     overlay,
		config: config,
	}
	state.program = compiler.NewProgram(compiler.ProgramOptions{
		Config: config,
		Host:   host,
	})
	return state, diagnostics, nil
}

func standaloneIntlAnalysisRequest(request Request) bool {
	return request.ConfigFile == "" && request.Kind == "extension" && request.Extension != nil && request.Extension.Namespace == intlAnalyzeNamespace
}

func (state *projectState) advance(
	ctx context.Context,
	fileName string,
	source string,
) (*projectGeneration, error) {
	sourceKey := state.fs.canonical(fileName)
	existingSource := state.program.GetSourceFile(fileName)
	unchanged := existingSource != nil && existingSource.Text() == source
	reused := state.initialized && unchanged
	if !unchanged {
		state.counters.ProgramRebuilds++
		state.fs.set(fileName, source)
		host := compiler.NewCompilerHost(
			state.currentDirectory,
			state.fs,
			bundled.LibPath(),
			nil,
			nil,
			nil,
		)
		if state.program.GetSourceFile(fileName) == nil {
			rootFiles := append([]string(nil), state.config.FileNames()...)
			rootFiles = append(rootFiles, fileName)
			state.config = state.config.WithFileNames(rootFiles)
			state.program = compiler.NewProgram(compiler.ProgramOptions{
				Config: state.config,
				Host:   host,
			})
		} else {
			changedPath := tspath.ToPath(
				fileName,
				state.currentDirectory,
				state.fs.UseCaseSensitiveFileNames(),
			)
			next, _, _ := state.program.UpdateProgram(changedPath, host, nil)
			state.program = next
		}
		state.sources[sourceKey] = source
		state.invalidateChangedProjectSources(fileName)
	}
	state.initialized = true
	state.program.BindSourceFiles()
	sourceFile := state.program.GetSourceFile(fileName)
	if sourceFile == nil {
		return nil, fmt.Errorf("native TypeScript program did not contain %s", fileName)
	}
	// Session requests are serialized and inspect dependencies as well as the requested file.
	// Acquire the pool's primary checker exclusively to reuse one coherent type graph.
	typeChecker, release := state.program.GetCheckerPool().GetChecker(ctx, nil)
	return &projectGeneration{
		sourceFile: sourceFile,
		program:    state.program,
		checker:    typeChecker,
		release:    release,
		reused:     reused,
	}, nil
}

// invalidateAnalysisCaches releases every checker and AST identity owned by
// the superseded TypeScript program generation.
func (state *projectState) invalidateAnalysisCaches() {
	state.moduleImports = nil
	state.policyTypes = nil
	state.callableCache = nil
	state.componentCache = nil
	state.componentFacts = nil
	state.componentCandidates = nil
	state.componentNodeIDs = nil
	state.componentLinks = nil
}
