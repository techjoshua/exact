package exactcompiler

import (
	"context"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/core"
	"github.com/microsoft/typescript-go/internal/parser"
	"github.com/microsoft/typescript-go/internal/tspath"
)

// validateGeneratedCode reparses every native artifact and, when requested,
// checks it in an isolated TypeScript-Go program. The retained authored
// program is never replaced with generated source.
func validateGeneratedCode(
	request Request,
	fileName string,
	code string,
) ([]Diagnostic, error) {
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
	project, configDiagnostics, err := newProjectState(
		generatedRequest,
		generatedFileName,
	)
	for _, diagnostic := range configDiagnostics {
		diagnostics = append(diagnostics, projectDiagnostic(diagnostic))
	}
	if err != nil || project == nil || len(diagnostics) != 0 {
		return diagnostics, err
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
