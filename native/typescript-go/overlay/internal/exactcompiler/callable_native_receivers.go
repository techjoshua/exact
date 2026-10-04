package exactcompiler

import (
	"path/filepath"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// nativeNeutralReceiver recognizes standard-library receiver contracts without
// treating same-named application types as portable. Read-only collection views
// constrain mutation, not the environments in which their methods can execute.
func nativeNeutralReceiver(value *checker.Type) bool {
	symbol := value.Symbol()
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	switch symbol.Name {
	case "Map", "Set", "Array", "ReadonlyMap", "ReadonlySet", "ReadonlyArray":
		if symbol.Parent != nil {
			return false
		}
	default:
		if symbol.Parent == nil || symbol.Parent.Name != "Intl" {
			return false
		}
		if _, known := cachedIntlConstructors[symbol.Name]; !known {
			return false
		}
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if source == nil || !source.IsDeclarationFile {
			return false
		}
		name := filepath.Base(source.FileName())
		if !strings.HasPrefix(name, "lib.es") || !strings.HasSuffix(name, ".d.ts") {
			return false
		}
	}
	return true
}

// exactIntlReceiver recognizes the framework facade through its declaration owner.
// Naming a user-defined interface IntlFacade does not establish portable execution.
func exactIntlReceiver(value *checker.Type) bool {
	symbol := value.Symbol()
	if symbol == nil || symbol.Name != "IntlFacade" || len(symbol.Declarations) == 0 {
		return false
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if source == nil {
			return false
		}
		name := strings.ReplaceAll(source.FileName(), `\`, "/")
		if !strings.Contains(name, "/packages/core/") && !strings.Contains(name, "/@exactjs/core/") {
			return false
		}
	}
	return true
}
