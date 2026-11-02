package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// policyStandardLibraryProperty excludes only wholly native declarations.
// A merged application declaration keeps its stored-data obligation visible.
func policyStandardLibraryProperty(property *ast.Symbol, c *checker.Checker) bool {
	if len(property.Declarations) == 0 {
		return false
	}
	for _, declaration := range property.Declarations {
		if !c.IsLibSymbolForHoverVerbosity(&ast.Symbol{Declarations: []*ast.Node{declaration}}) {
			return false
		}
	}
	return true
}

// policyNativeDataCarrier recognizes native data-position contracts. A
// generic marker such as ThisType<T>, descriptor metadata, or a user type with
// the same spelling does not establish a runtime payload position. Augmentation
// preserves an original native payload contract rather than erasing it.
func policyNativeDataCarrier(value *checker.Type, c *checker.Checker) bool {
	if value == nil || value.Symbol() == nil {
		return false
	}
	switch ast.SymbolName(value.Symbol()) {
	case "Array", "ReadonlyArray", "Promise", "PromiseLike", "Map", "ReadonlyMap", "Set", "ReadonlySet", "WeakMap", "WeakSet":
		for _, declaration := range value.Symbol().Declarations {
			if c.IsLibSymbolForHoverVerbosity(&ast.Symbol{Declarations: []*ast.Node{declaration}}) {
				return true
			}
		}
	}
	return false
}
