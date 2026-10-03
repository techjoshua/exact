package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// policyBindingInputs permits direct public-field selection from a type-qualified record.
// Explicit kept values, nested/unknown selections and indexed collections remain protected.
func policyBindingInputs(binding, pattern, initializer *ast.Node, inputs []PolicySubject, typeChecker *checker.Checker) []PolicySubject {
	if !ast.IsObjectBindingPattern(pattern) || binding.Parent == nil || !ast.IsBindingElement(binding.Parent) || binding.Parent.Parent != pattern {
		return inputs
	}
	element := binding.Parent.AsBindingElement()
	if element.DotDotDotToken != nil || element.Initializer != nil || !ast.IsIdentifier(initializer) {
		return inputs
	}
	key := element.PropertyName
	if key == nil {
		key = element.Name()
	}
	if !ast.IsIdentifier(key) && !ast.IsStringLiteral(key) {
		return inputs
	}
	if _, qualified := policyFromCheckerType(typeChecker.GetTypeAtLocation(binding), typeChecker); qualified {
		return inputs
	}
	root := typeChecker.GetTypeAtLocation(initializer)
	if checkerTypeIsSecret(root, typeChecker, make(map[checker.TypeId]bool)) || protectedPolicyContainer(root, typeChecker) {
		return inputs
	}
	result := make([]PolicySubject, 0, len(inputs))
	for _, input := range inputs {
		if input.Source != "import" {
			result = append(result, input)
		}
	}
	return result
}
