package exactcompiler

import (
	"context"
	"fmt"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/bundled"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/compiler"
	"github.com/microsoft/typescript-go/internal/core"
	"github.com/microsoft/typescript-go/internal/tsoptions"
	"github.com/microsoft/typescript-go/internal/tspath"
	"github.com/microsoft/typescript-go/internal/vfs/osvfs"
)

type projectState struct {
	currentDirectory string
	configFile       string
	sources          map[string]string
	fs               *sourceOverlay
	config           *tsoptions.ParsedCommandLine
	program          *compiler.Program
	callableCache    *projectCallableCache
	componentCache   map[*ast.SourceFile][]Component
	initialized      bool
}

type projectGeneration struct {
	sourceFile *ast.SourceFile
	program    *compiler.Program
	checker    *checker.Checker
	release    func()
	reused     bool
}

func newProjectState(request Request, fileName string) (*projectState, []*ast.Diagnostic, error) {
	currentDirectory := request.Root
	if currentDirectory == "" {
		currentDirectory = tspath.GetDirectoryPath(fileName)
	}
	currentDirectory = tspath.GetNormalizedAbsolutePath(currentDirectory, tspath.GetDirectoryPath(fileName))

	base := bundled.WrapFS(osvfs.FS())
	overlay := newSourceOverlay(base)
	overlay.set(fileName, request.Source)
	host := compiler.NewCompilerHost(currentDirectory, overlay, bundled.LibPath(), nil, nil)
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
		config = tsoptions.NewParsedCommandLine(
			options,
			rootFiles,
			tspath.ComparePathsOptions{
				CurrentDirectory:          currentDirectory,
				UseCaseSensitiveFileNames: overlay.UseCaseSensitiveFileNames(),
			},
		)
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
		config = tsoptions.NewParsedCommandLine(
			options,
			[]string{fileName},
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
		state.fs.set(fileName, source)
		host := compiler.NewCompilerHost(
			state.currentDirectory,
			state.fs,
			bundled.LibPath(),
			nil,
			nil,
		)
		if state.program.GetSourceFile(fileName) == nil {
			rootFiles := append([]string(nil), state.config.FileNames()...)
			rootFiles = append(rootFiles, fileName)
			state.config = tsoptions.NewParsedCommandLine(
				state.config.CompilerOptions().Clone(),
				rootFiles,
				tspath.ComparePathsOptions{
					CurrentDirectory:          state.currentDirectory,
					UseCaseSensitiveFileNames: state.fs.UseCaseSensitiveFileNames(),
				},
			)
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
		state.callableCache = nil
		state.componentCache = nil
	}
	state.initialized = true
	state.program.BindSourceFiles()
	sourceFile := state.program.GetSourceFile(fileName)
	if sourceFile == nil {
		return nil, fmt.Errorf("native TypeScript program did not contain %s", fileName)
	}
	typeChecker, release := state.program.GetTypeCheckerForFileExclusive(ctx, sourceFile)
	return &projectGeneration{
		sourceFile: sourceFile,
		program:    state.program,
		checker:    typeChecker,
		release:    release,
		reused:     reused,
	}, nil
}
