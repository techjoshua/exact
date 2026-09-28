package exactcompiler

import (
	"path/filepath"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// standardLibraryCallOwner identifies the selected built-in method declaration.
// Custom overrides and similarly named application types retain their own effects.
func standardLibraryCallOwner(call *ast.CallExpression, typeChecker *checker.Checker) string {
	signature := typeChecker.GetResolvedSignature(call.AsNode())
	if signature == nil || signature.Declaration() == nil {
		return ""
	}
	declaration := signature.Declaration()
	source := ast.GetSourceFileOfNode(declaration)
	if source == nil || !source.IsDeclarationFile {
		return ""
	}
	filename := filepath.Base(source.FileName())
	if (!strings.HasPrefix(filename, "lib.es") && filename != "lib.scripthost.d.ts") || !strings.HasSuffix(filename, ".d.ts") {
		return ""
	}
	parent := declaration.Parent
	if parent == nil || !ast.IsInterfaceDeclaration(parent) || parent.Name() == nil {
		return ""
	}
	return parent.Name().Text()
}

// standardLibraryValue excludes imported or local functions that happen to use
// a built-in name. Placement and reevaluation remain separate decisions.
func standardLibraryValue(node *ast.Node, typeChecker *checker.Checker) bool {
	symbol := typeChecker.GetSymbolAtLocation(node)
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		return false
	}
	valueDeclaration := false
	for _, declaration := range symbol.Declarations {
		// Ambient interface augmentation extends instance types without replacing
		// the global runtime value (for example Node's Array compatibility types).
		if ast.IsInterfaceDeclaration(declaration) {
			continue
		}
		valueDeclaration = true
		source := ast.GetSourceFileOfNode(declaration)
		if source == nil || !source.IsDeclarationFile {
			return false
		}
		filename := filepath.Base(source.FileName())
		if (!strings.HasPrefix(filename, "lib.es") && filename != "lib.scripthost.d.ts") || !strings.HasSuffix(filename, ".d.ts") {
			return false
		}
	}
	return valueDeclaration
}
