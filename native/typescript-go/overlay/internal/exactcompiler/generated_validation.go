package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"maps"
	"slices"
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

// validateGeneratedCode reparses every native artifact and, when requested,
// checks it in an isolated TypeScript-Go program. The retained authored
// program is never replaced with generated source.
func validateGeneratedCode(
	request Request,
	fileName string,
	code string,
	sources *sourceOverlay,
) ([]Diagnostic, error) {
	return validateGeneratedCodeWithCache(request, fileName, code, sources, nil)
}

func (s *Session) validateGeneratedCode(request Request, fileName string, code string, sources *sourceOverlay, helpers generatedValidationHelpers) ([]Diagnostic, error) {
	if s.generatedValidations == nil {
		s.generatedValidations = make(map[Target]*generatedValidationProject)
	}
	if request.Kind != "check" && request.Diagnostics == "semantic" && (request.Target == TargetServer || request.ModuleRewrite != nil && len(request.ModuleRewrite.ModuleAliases) != 0) {
		sources = helpers.dependencies(fileName, sources, request.ModuleRewrite)
	}
	return validateGeneratedCodeWithCache(request, fileName, code, sources, s.generatedValidations)
}

func validateGeneratedCodeWithCache(request Request, fileName string, code string, sources *sourceOverlay, cache map[Target]*generatedValidationProject) ([]Diagnostic, error) {
	// JSX has been lowered before this boundary. Parsing the artifact as TSX
	// would misread ordinary TypeScript generic arrows (`<T>(...) => ...`) as
	// JSX and reject valid output based on the authored file's syntax kind.
	generatedFileName := tspath.NormalizePath(fileName + ".exact.generated.ts")
	parsed := parser.ParseSourceFile(
		ast.SourceFileParseOptions{
			FileName: generatedFileName,
			Path: tspath.ToPath(
				generatedFileName,
				tspath.GetDirectoryPath(generatedFileName),
				true,
			),
		},
		code,
		core.ScriptKindTS,
	)
	// A preserved ordinary TSX helper is parsed by the host after native component lowering.
	// Retain the TS-first path for emitted generic arrows in modules with no surviving JSX.
	if len(parsed.Diagnostics()) != 0 && tspath.FileExtensionIs(fileName, ".tsx") {
		parsed = parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: generatedFileName, Path: tspath.ToPath(generatedFileName, tspath.GetDirectoryPath(generatedFileName), true)}, code, core.ScriptKindTSX)
	}
	diagnostics := make([]Diagnostic, 0, len(parsed.Diagnostics()))
	for _, diagnostic := range parsed.Diagnostics() {
		diagnostics = append(diagnostics, projectDiagnostic(diagnostic))
	}
	if len(diagnostics) != 0 || request.Diagnostics != "semantic" {
		return diagnostics, nil
	}

	generatedRequest := request
	generatedRequest.ID = fileName
	generatedRequest.Source = code
	var dependencySources map[string]string
	if sources != nil {
		dependencySources = sources.files
	}
	key := nativeProjectKey(request, fileName) + "\x00" + generatedFileName
	entry := cache[request.Target]
	var project *projectState
	if entry.reusable(key, fileName, sources) {
		project = entry.project
		if err := updateValidationOverlays(project, sources); err != nil {
			return diagnostics, err
		}
	} else {
		observations := newValidationDependencies()
		created, configDiagnostics, err := newProjectStateWithGeneratedEntry(generatedRequest, fileName, dependencySources, fileName, observations)
		for _, diagnostic := range configDiagnostics {
			diagnostics = append(diagnostics, projectDiagnostic(diagnostic))
		}
		if err != nil || created == nil || len(diagnostics) != 0 {
			return diagnostics, err
		}
		project = created
		if cache != nil {
			cache[request.Target] = &generatedValidationProject{key: key, project: project, dependencies: observations}
		}
	}
	generation, err := project.advance(context.Background(), fileName, code)
	if err != nil {
		return diagnostics, err
	}
	defer generation.release()
	// Semantic checking shares the original module identity so imports cannot create a
	// second local nominal type. Keep the existing generated diagnostic label for mapping.
	appendGenerated := func(diagnostic *ast.Diagnostic) {
		projected := projectDiagnostic(diagnostic)
		if project.fs.canonical(projected.FileName) == project.fs.canonical(fileName) {
			projected.FileName = generatedFileName
		}
		diagnostics = append(diagnostics, projected)
	}
	for _, diagnostic := range generation.sourceFile.BindDiagnostics() {
		appendGenerated(diagnostic)
	}
	for _, diagnostic := range generation.checker.GetDiagnostics(
		context.Background(),
		generation.sourceFile,
	) {
		appendGenerated(diagnostic)
	}
	return diagnostics, nil
}

// generatedValidationHelpers carries existing checked source authority only across this emission.
// Its finite dependency view is shared by fresh and retained validation, never the authored program.
type generatedValidationHelpers struct {
	callables callableAnalysis
	checker   *checker.Checker
	imports   []Import
}

func (helpers generatedValidationHelpers) dependencies(entry string, sources *sourceOverlay, rewrite *ModuleRewrite) *sourceOverlay {
	if sources == nil || (rewrite == nil || len(rewrite.ModuleAliases) == 0) {
		return sources
	}
	projected := &sourceOverlay{base: sources.base, files: maps.Clone(sources.files)}
	owners := make(map[string]*ast.SourceFile)
	// Relative aliases retain original checker module identity without rewriting helpers.
	if rewrite != nil {
		selected := []struct{ ModuleSpecifier, SourceFile string }{}
		// Relocated imports retain their original nominal checking identity.
		// Use resolved local identities in the existing program, never another dependency walk.
		if helpers.callables.owner != nil {
			program := helpers.callables.owner.project.program
			entrySource := program.GetSourceFile(entry)
			for _, specifier := range slices.Sorted(maps.Keys(rewrite.ModuleAliases)) {
				if !tspath.IsExternalModuleNameRelative(specifier) {
					continue
				}
				file := ""
				for _, edge := range helpers.imports {
					if edge.ModuleSpecifier == specifier {
						file = edge.ResolvedFile
						break
					}
				}
				// Lowered inferred types can refer to a transitive source module.
				// Resolve only explicit host aliases, retaining an actual source in
				// the existing program rather than constructing another dependency graph.
				if file == "" && entrySource != nil {
					if resolved := program.ResolveModuleName(specifier, entry, program.GetDefaultResolutionModeForFile(entrySource)); resolved != nil && resolved.IsResolved() {
						file = resolved.ResolvedFileName
					}
				}
				source := program.GetSourceFile(file)
				if source == nil || source.IsDeclarationFile {
					continue
				}
				owners[projected.canonical(source.FileName())] = source
				selected = append(selected, struct{ ModuleSpecifier, SourceFile string }{ModuleSpecifier: specifier, SourceFile: source.FileName()})
			}
		}
		for _, helper := range selected {
			target := rewrite.ModuleAliases[helper.ModuleSpecifier]
			if target == "" || target == helper.ModuleSpecifier || !tspath.IsExternalModuleNameRelative(target) {
				continue
			}
			source := owners[projected.canonical(helper.SourceFile)]
			if source == nil {
				continue
			}
			filename := tspath.GetNormalizedAbsolutePath(target, tspath.GetDirectoryPath(entry))
			if projected.canonical(filename) == projected.canonical(helper.SourceFile) {
				continue
			}
			reference := tspath.GetRelativePathFromDirectory(tspath.GetDirectoryPath(filename), tspath.GetNormalizedAbsolutePath(helper.ModuleSpecifier, tspath.GetDirectoryPath(entry)), tspath.ComparePathsOptions{UseCaseSensitiveFileNames: projected.UseCaseSensitiveFileNames()})
			if !tspath.IsExternalModuleNameRelative(reference) {
				reference = "./" + reference
			}
			text := "export * from " + strconv.Quote(reference) + ";"
			if symbol := source.AsNode().Symbol(); symbol != nil {
				if helpers.checker.TryGetMemberInModuleExports("default", symbol) != nil {
					text += "export {default} from " + strconv.Quote(reference) + ";"
				}
			}
			projected.set(filename, text)
		}
	}
	return projected
}
