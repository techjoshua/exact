package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// policyQualificationObligation tracks a single selected type query. Incomplete
// inspection retains protection but is never cached as a completed secret/public fact.
type policyQualificationObligation struct {
	seen       map[checker.TypeId]bool
	active     []*checker.Type
	incomplete bool
}

func newPolicyQualificationObligation() *policyQualificationObligation {
	return &policyQualificationObligation{seen: make(map[checker.TypeId]bool)}
}

// policyFromCheckerType recognizes resolved secret qualification and protected data containers.
// Formatting, authored alias names and callable result display text never confer qualification.
func policyFromCheckerType(
	value *checker.Type,
	typeChecker *checker.Checker,
) (DataPolicy, bool) {
	if value == nil {
		return DataPolicy{}, false
	}
	if checkerTypeContainsSecret(value, typeChecker, newPolicyQualificationObligation()) {
		return dataPolicy("secret"), true
	}
	return DataPolicy{}, false
}

// Completed qualification facts belong to one checker in an unchanged program.
// A successful recursive search publishes only its root. A complete negative search
// proves every visited type negative, without preserving partial cycle observations.
// Cache reads occur only at query roots. Reusing a completed subtree would change
// which active recursive family dependencies a cold query must discharge.
func cachedPolicyFromCheckerType(value *checker.Type, c *checker.Checker, completed map[checker.TypeId]bool) (DataPolicy, bool) {
	if value == nil {
		return DataPolicy{}, false
	}
	if qualified, exists := completed[value.Id()]; exists {
		if qualified {
			return dataPolicy("secret"), true
		}
		return DataPolicy{}, false
	}
	obligation := newPolicyQualificationObligation()
	if checkerTypeContainsSecret(value, c, obligation) {
		if !obligation.incomplete {
			completed[value.Id()] = true
		}
		return dataPolicy("secret"), true
	}
	for id := range obligation.seen {
		completed[id] = false
	}
	return DataPolicy{}, false
}

// checkerTypeContainsSecret protects disclosure of complete records and indexed collections.
// Deferred members carry disclosure obligations too. Cycles are visited once per type query.
func checkerTypeContainsSecret(value *checker.Type, typeChecker *checker.Checker, obligation *policyQualificationObligation) bool {
	if value == nil {
		return false
	}
	if obligation.seen[value.Id()] {
		return false
	}
	// Reuse the pinned checker's origin-sensitive recursion signal. It does not
	// count finite record width or grant publicness on a recursive edge.
	if typeChecker.IsExactPolicyTypeExpanding(value, obligation.active) {
		obligation.incomplete = true
		return true
	}
	obligation.active = append(obligation.active, value)
	defer func() { obligation.active = obligation.active[:len(obligation.active)-1] }()
	obligation.seen[value.Id()] = true
	if checkerTypeHasSecretDeclaration(value) {
		return true
	}
	if value.Flags()&checker.TypeFlagsUnionOrIntersection != 0 {
		for _, member := range value.Types() {
			if checkerTypeContainsSecret(member, typeChecker, obligation) {
				return true
			}
		}
		return false
	}
	if value.Flags()&checker.TypeFlagsTypeParameter != 0 {
		return checkerTypeContainsSecret(typeChecker.GetBaseConstraintOfType(value), typeChecker, obligation)
	}
	if checkerTypeIsSecret(value, typeChecker, make(map[checker.TypeId]bool)) {
		return true
	}
	if value.Flags()&checker.TypeFlagsObject == 0 {
		return false
	}
	for _, kind := range []checker.SignatureKind{checker.SignatureKindCall, checker.SignatureKindConstruct} {
		for _, signature := range typeChecker.GetSignaturesOfType(value, kind) {
			if checkerTypeContainsSecret(typeChecker.GetReturnTypeOfSignature(signature), typeChecker, obligation) {
				return true
			}
		}
	}
	for _, index := range typeChecker.GetIndexInfosOfType(value) {
		if checkerTypeContainsSecret(index.ValueType(), typeChecker, obligation) {
			return true
		}
	}
	nativeCarrier := policyNativeDataCarrier(value, typeChecker)
	nativeAPI := value.ObjectFlags()&checker.ObjectFlagsMapped == 0 && typeChecker.IsLibSymbolForHoverVerbosity(value.Symbol())
	if nativeCarrier || nativeAPI {
		if value.ObjectFlags()&checker.ObjectFlagsReference != 0 {
			for _, argument := range typeChecker.GetTypeArguments(value) {
				if checkerTypeContainsSecret(argument, typeChecker, obligation) {
					return true
				}
			}
		}
		if !nativeCarrier && policyStandardLibraryType(value, typeChecker) {
			return false
		}
	}

	for _, property := range typeChecker.GetPropertiesOfType(value) {
		// A compatibility augmentation should not make a standard API's method
		// families structural data. Inspect stored fields and authored overloads.
		if (nativeCarrier || nativeAPI && property.Flags&ast.SymbolFlagsMethod != 0) && policyStandardLibraryProperty(property, typeChecker) {
			continue
		}
		if checkerPropertyHasSecretPolicy(property) {
			return true
		}
		if checkerTypeContainsSecret(typeChecker.GetTypeOfSymbol(property), typeChecker, obligation) {
			return true
		}
	}
	return false
}

// checkerTypeIsSecret follows resolved qualification declarations rather than display names.
// Aliases and mapped readonly views preserve the unique-symbol qualification property.
// Only the value's own qualification is inspected, not arbitrary nested object fields.
func checkerTypeIsSecret(value *checker.Type, typeChecker *checker.Checker, seen map[checker.TypeId]bool) bool {
	if value == nil || seen[value.Id()] {
		return false
	}
	seen[value.Id()] = true
	if checkerTypeHasSecretDeclaration(value) {
		return true
	}
	if value.Flags()&checker.TypeFlagsObject != 0 && value.ObjectFlags()&checker.ObjectFlagsMapped == 0 && policyStandardLibraryType(value, typeChecker) {
		return false
	}

	if value.Flags()&checker.TypeFlagsUnionOrIntersection != 0 {
		for _, member := range value.Types() {
			if checkerTypeIsSecret(member, typeChecker, seen) {
				return true
			}
		}
		return false
	}
	if value.Flags()&checker.TypeFlagsTypeParameter != 0 {
		return checkerTypeIsSecret(typeChecker.GetBaseConstraintOfType(value), typeChecker, seen)
	}
	if value.Flags()&checker.TypeFlagsObject == 0 {
		return false
	}
	for _, property := range typeChecker.GetPropertiesOfType(value) {
		for _, declaration := range property.Declarations {
			name := declaration.Name()
			if name == nil || !ast.IsComputedPropertyName(name) {
				continue
			}
			key := typeChecker.GetTypeAtLocation(name.AsComputedPropertyName().Expression)
			if key == nil || key.Flags()&checker.TypeFlagsUniqueESSymbol == 0 {
				continue
			}
			for owner := declaration.Parent; owner != nil; owner = owner.Parent {
				if ast.IsTypeAliasDeclaration(owner) {
					if secretQualifiedTypeDeclaration(owner) {
						return true
					}
					break
				}
			}
		}
	}
	return false
}

// checkerTypeHasSecretDeclaration checks only the value's resolved declaration qualification.
// Union and constraint traversal belongs to the caller, avoiding repeated structural queries.
func checkerTypeHasSecretDeclaration(value *checker.Type) bool {
	for _, symbol := range []*ast.Symbol{value.Alias().Symbol(), value.Symbol()} {
		if symbol == nil {
			continue
		}
		for _, declaration := range symbol.Declarations {
			if secretQualifiedTypeDeclaration(declaration) {
				return true
			}
		}
	}
	return false
}

func secretQualifiedTypeDeclaration(declaration *ast.Node) bool {
	if !ast.IsTypeAliasDeclaration(declaration) {
		return false
	}
	source := ast.GetSourceFileOfNode(declaration)
	if source == nil {
		return false
	}
	annotations := annotationsForNode(declaration, source)
	return annotations.policy != nil && annotations.policy.Secret
}

// policyStandardLibraryType requires every declaration to belong to the actual default library.
// Imported declarations and application augmentations remain subject to structural inspection.
func policyStandardLibraryType(value *checker.Type, typeChecker *checker.Checker) bool {
	symbol := value.Symbol()
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if !typeChecker.IsLibSymbolForHoverVerbosity(&ast.Symbol{Declarations: []*ast.Node{declaration}}) {
			return false
		}
	}
	return true
}

// protectedPolicyContainer keeps operations on secret-bearing collections qualified.
// A collection's size, keys and method results do not constitute public sibling projections.
func protectedPolicyContainer(value *checker.Type, typeChecker *checker.Checker) bool {
	if value == nil || value.Flags()&checker.TypeFlagsObject == 0 {
		return false
	}
	for _, index := range typeChecker.GetIndexInfosOfType(value) {
		if _, secret := policyFromCheckerType(index.ValueType(), typeChecker); secret {
			return true
		}
	}
	if (policyNativeDataCarrier(value, typeChecker) || policyStandardLibraryType(value, typeChecker)) && value.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		for _, argument := range typeChecker.GetTypeArguments(value) {
			if _, secret := policyFromCheckerType(argument, typeChecker); secret {
				return true
			}
		}
	}
	return false
}

// qualifiedDeclarationPolicy keeps explicit type qualification authoritative over placement annotations.
// A placement annotation cannot authorize release of secret data, even without an initializer.
func qualifiedDeclarationPolicy(node *ast.Node, owner *ast.SourceFile, annotated DataPolicy, analysis *policyAnalysis) DataPolicy {
	if !annotated.Secret && annotated.Residency != "server" {
		analysis.diagnostics = append(analysis.diagnostics, Diagnostic{
			source:   owner.Text(),
			FileName: owner.FileName(),
			Severity: "error",
			Code:     "EXACT3001",
			Message:  "error: declaration annotation cannot release secret-qualified data. Keep the declaration secret-qualified and expose a separate public result",
			Start:    node.Pos(),
			Length:   node.End() - node.Pos(),
		})
	}
	return dataPolicy("secret")
}

// checkerPropertyHasSecretPolicy reads the selected property's original contract,
// including inherited and mapped declarations whose ordinary value type has no brand.
func checkerPropertyHasSecretPolicy(property *ast.Symbol) bool {
	for _, declaration := range property.Declarations {
		owner := ast.GetSourceFileOfNode(declaration)
		if owner != nil {
			annotations := policyNodeAnnotations(declaration, owner)
			if annotations.policy != nil && annotations.policy.Secret {
				return true
			}
		}
	}
	return false
}
