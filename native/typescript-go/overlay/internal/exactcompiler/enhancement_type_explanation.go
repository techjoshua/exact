package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"sort"
	"strconv"
	"strings"
)

// enhancementTypeExplanation preserves union alternatives rather than suggesting
// that individually valid props from incompatible variants can be combined.
func enhancementTypeExplanation(component enhancementComponent, values map[string]enhancementProvidedValue, typeChecker *checker.Checker) string {
	var variants []string
	for index, variant := range component.variants {
		var reasons []string
		for prop, value := range values {
			expected, exists := variant[prop]
			if !exists {
				reasons = append(reasons, prop+" is not accepted")
				continue
			}
			if !enhancementValueAssignable(value, expected.valueType, typeChecker) {
				actual := typeChecker.TypeToString(value.valueType)
				if value.stringValue != nil {
					actual = strconv.Quote(*value.stringValue)
				}
				reasons = append(reasons, prop+" has type "+actual+", expected "+typeChecker.TypeToString(expected.valueType))
			}
		}
		for prop, expected := range variant {
			if _, provided := values[prop]; !provided && !expected.optional {
				reasons = append(reasons, "missing "+prop+" ("+typeChecker.TypeToString(expected.valueType)+")")
			}
		}
		sort.Strings(reasons)
		variants = append(variants, fmt.Sprintf("Variant %d: %s", index+1, strings.Join(reasons, ", ")))
	}
	return strings.Join(variants, ". ")
}
