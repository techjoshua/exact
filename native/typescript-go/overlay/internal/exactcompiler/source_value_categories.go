package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceValuesNoncallable recognizes represented primitive, object and array
// alternatives. Missing values and source callable forms remain unclassified.
// Callers retain acquisition uncertainty separately. This category supplies no
// normal invocation, descriptor, lifetime or returned-value authority.
func sourceValuesNoncallable(values []sourceValue) bool {
	if len(values) == 0 {
		return false
	}
	for _, value := range values {
		if value.undefined || value.copied != nil || value.rest != nil {
			continue
		}
		if value.node == nil || len(value.path) != 0 || !sourcePrimitiveValue(value.node) && !ast.IsObjectLiteralExpression(value.node) && !ast.IsArrayLiteralExpression(value.node) {
			return false
		}
	}
	return true
}
