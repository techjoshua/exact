package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/bundled"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"strings"
)

// standardLibrarySource proves ownership by the compiler's library directory.
// An application declaration cannot acquire authority by using a lib.* filename.
func standardLibrarySource(source *ast.SourceFile) bool {
	if source == nil || !source.IsDeclarationFile {
		return false
	}
	filename := strings.ReplaceAll(source.FileName(), `\`, "/")
	separator := strings.LastIndexByte(filename, '/')
	return separator >= 0 && filename[:separator] == strings.TrimSuffix(strings.ReplaceAll(bundled.LibPath(), `\`, "/"), "/")
}

// standardLibraryCallRoot rejects local and imported shadows of portable globals.
// Ambient interface augmentation does not replace the selected global value.
func standardLibraryCallRoot(expression *ast.Node, typeChecker *checker.Checker) bool {
	root := unwrapSourceCallableReference(expression)
	for ast.IsPropertyAccessExpression(root) || ast.IsElementAccessExpression(root) {
		if ast.IsPropertyAccessExpression(root) {
			root = root.AsPropertyAccessExpression().Expression
		} else {
			root = root.AsElementAccessExpression().Expression
		}
		root = unwrapSourceCallableReference(root)
	}
	if !ast.IsIdentifier(root) {
		return false
	}
	if _, known := universalCallRoots[root.Text()]; !known {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(root)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
		return false
	}
	return root == unwrapSourceCallableReference(expression) || nativeReceiverMemberDeclarations(expression, typeChecker)
}
