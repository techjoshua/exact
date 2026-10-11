package compiler

import (
	"context"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// GetExactSemanticDiagnostics applies the program's diagnostic policy using an
// already-owned checker. Retained eXact sessions must not reacquire the checker
// pool while holding its checker, or bypass JavaScript and directive filtering.
func (p *Program) GetExactSemanticDiagnostics(ctx context.Context, c *checker.Checker, sourceFile *ast.SourceFile) []*ast.Diagnostic {
	return p.getSemanticDiagnosticsWithChecker(ctx, c, sourceFile)
}
