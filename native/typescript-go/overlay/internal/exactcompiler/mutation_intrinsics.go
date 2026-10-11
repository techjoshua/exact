package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/checker"

// reusableMutationIntrinsic admits only unnamed primitive types whose printed form cannot
// depend on lexical scope. Alias, unique-symbol, generic, object and composite types retain
// their authored-site construction. The cache belongs to one acquired authored checker.
func reusableMutationIntrinsic(value *checker.Type) bool {
	if value.Alias() != nil || value.Symbol() != nil {
		return false
	}
	switch value.Flags() {
	case checker.TypeFlagsAny, checker.TypeFlagsUnknown, checker.TypeFlagsString,
		checker.TypeFlagsNumber, checker.TypeFlagsBoolean, checker.TypeFlagsBigInt,
		checker.TypeFlagsESSymbol, checker.TypeFlagsVoid, checker.TypeFlagsUndefined,
		checker.TypeFlagsNull, checker.TypeFlagsNever:
		return true
	}
	return false
}
