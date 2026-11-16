package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stagedLexicalFunctionImplementation authenticates a direct same-source lexical
// binding against the existing unique executable-body owner. Bodyless overload
// signatures retain checker call typing; they never become an executable BODY.
// This describes source identity only, not entry, input delivery or currentness.
func stagedLexicalFunctionImplementation(expression *ast.Node, owner *executableBodyOwner) (*ast.Symbol, *ast.Node) {
	if expression == nil || !ast.IsIdentifier(expression) || owner == nil || owner.values == nil || owner.checker == nil || owner.values.checker != owner.checker || owner.values.program == nil {
		return nil, nil
	}
	file := ast.GetSourceFileOfNode(expression)
	if file == nil || file.IsDeclarationFile || owner.values.program.GetSourceFile(file.FileName()) != file {
		return nil, nil
	}
	symbol := owner.checker.GetSymbolAtLocation(expression)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || !ast.IsFunctionDeclaration(symbol.ValueDeclaration) || len(symbol.Declarations) == 0 {
		return nil, nil
	}
	// A binding whose original value declaration already owns a body keeps its
	// existing domain, including legal type/namespace merges. Only promotion
	// past bodyless overload signatures needs the narrower declaration-set law.
	plainBody := symbol.ValueDeclaration.Body() != nil
	if !plainBody {
		for _, declaration := range symbol.Declarations {
			if declaration == nil || !ast.IsFunctionDeclaration(declaration) || declaration.Parent != symbol.ValueDeclaration.Parent || ast.GetSourceFileOfNode(declaration) != file {
				return nil, nil
			}
		}
	}
	body, _ := owner.uniqueSymbolDefinition(symbol)
	if body == nil || !ast.IsFunctionDeclaration(body) || body.Body() == nil || body.Parent != symbol.ValueDeclaration.Parent || ast.GetSourceFileOfNode(body) != file || plainBody && body != symbol.ValueDeclaration {
		return nil, nil
	}
	return symbol, body
}
