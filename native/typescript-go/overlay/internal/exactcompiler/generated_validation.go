package exactcompiler

import (
	"context"

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

func (s *Session) validateGeneratedCode(request Request, fileName string, code string, sources *sourceOverlay) ([]Diagnostic, error) {
	if s.generatedValidations == nil {
		s.generatedValidations = make(map[Target]*generatedValidationProject)
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
	diagnostics := make([]Diagnostic, 0, len(parsed.Diagnostics()))
	for _, diagnostic := range parsed.Diagnostics() {
		diagnostics = append(diagnostics, projectDiagnostic(diagnostic))
	}
	if len(diagnostics) != 0 || request.Diagnostics != "semantic" {
		return diagnostics, nil
	}

	generatedRequest := request
	generatedRequest.ID = generatedFileName
	generatedRequest.Source = code
	var dependencySources map[string]string
	if sources != nil {
		dependencySources = sources.files
	}
	key := nativeProjectKey(request, fileName) + "\x00" + generatedFileName
	entry := cache[request.Target]
	var project *projectState
	if entry.reusable(key, generatedFileName, sources) {
		project = entry.project
		if err := updateValidationOverlays(project, sources); err != nil {
			return diagnostics, err
		}
	} else {
		observations := newValidationDependencies()
		created, configDiagnostics, err := newProjectStateWithSources(generatedRequest, generatedFileName, dependencySources, observations)
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
	generation, err := project.advance(context.Background(), generatedFileName, code)
	if err != nil {
		return diagnostics, err
	}
	defer generation.release()
	for _, diagnostic := range generation.sourceFile.BindDiagnostics() {
		diagnostics = append(diagnostics, projectDiagnostic(diagnostic))
	}
	for _, diagnostic := range generation.checker.GetDiagnostics(
		context.Background(),
		generation.sourceFile,
	) {
		diagnostics = append(diagnostics, projectDiagnostic(diagnostic))
	}
	return diagnostics, nil
}
