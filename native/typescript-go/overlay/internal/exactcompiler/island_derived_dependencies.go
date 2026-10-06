package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"sort"
)

// islandDerivedDependencies bridges ordinary inputs and owned callables used by recreated
// derived declarations. Capturing only the rendered identifier omits these transitive inputs.
func islandDerivedDependencies(component *ast.Node, derived []islandDerivedCapture, values []islandValueCapture, functions []islandFunctionCapture, typeChecker *checker.Checker) ([]islandValueCapture, []islandFunctionCapture) {
	selected := make(map[ast.SymbolId]struct{})
	valueIDs := make(map[ast.SymbolId]struct{})
	functionIDs := make(map[ast.SymbolId]struct{})
	for _, capture := range derived {
		for _, name := range bindingIdentifiers(capture.declaration.Name()) {
			if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
				selected[ast.GetSymbolId(symbol)] = struct{}{}
			}
		}
	}
	for _, value := range values {
		valueIDs[value.symbol] = struct{}{}
	}
	for _, function := range functions {
		functionIDs[function.symbol] = struct{}{}
	}
	for _, capture := range derived {
		dependencyValues, dependencyFunctions := islandCaptures(component, capture.declaration, typeChecker)
		for _, value := range dependencyValues {
			if _, reconstructed := selected[value.symbol]; reconstructed {
				continue
			}
			if _, seen := valueIDs[value.symbol]; !seen {
				valueIDs[value.symbol] = struct{}{}
				values = append(values, value)
			}
		}
		for _, function := range dependencyFunctions {
			if _, seen := functionIDs[function.symbol]; !seen {
				functionIDs[function.symbol] = struct{}{}
				functions = append(functions, function)
			}
		}
	}
	sort.Slice(values, func(i, j int) bool { return values[i].start < values[j].start })
	sort.Slice(functions, func(i, j int) bool { return functions[i].start < functions[j].start })
	return values, functions
}
