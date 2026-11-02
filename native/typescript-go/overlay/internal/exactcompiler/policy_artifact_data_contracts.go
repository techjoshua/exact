package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// secretArtifactOwnDataQualified follows owned qualification through native
// payload containers, indexed storage and declared stored properties. Callable
// result contracts belong to whole-value disclosure. They do not by themselves label a function definition
// as embedded private data. User generic arguments do not imply runtime fields.
func secretArtifactOwnDataQualified(value *checker.Type, c *checker.Checker, seen map[checker.TypeId]bool) bool {
	return secretArtifactOwnDataWithin(value, c, seen, nil)
}

func secretArtifactOwnDataWithin(value *checker.Type, c *checker.Checker, seen map[checker.TypeId]bool, active []*checker.Type) bool {
	if value == nil || seen[value.Id()] {
		return false
	}
	if checkerTypeIsSecret(value, c, make(map[checker.TypeId]bool)) {
		return true
	}
	if c.IsExactPolicyTypeExpanding(value, active) {
		// An authored generic body can carry an unresolved template rather than
		// a selected runtime payload. Defer that branch to selected-use policy.
		// This is no public proof: closed expansion still refuses containment,
		// and independent stored siblings continue to contribute secret evidence.
		return !secretArtifactOpenExpansion(value, active, c)
	}
	seen[value.Id()] = true
	active = append(active, value)
	if value.Flags()&checker.TypeFlagsUnionOrIntersection != 0 {
		for _, member := range value.Types() {
			if secretArtifactOwnDataWithin(member, c, seen, active) {
				return true
			}
		}
		return false
	}
	if value.Flags()&checker.TypeFlagsTypeParameter != 0 {
		return secretArtifactOwnDataWithin(c.GetBaseConstraintOfType(value), c, seen, active)
	}
	// Index and native payload contracts describe stored values. The recursive
	// query keeps its current obligation stack across record/container boundaries.
	for _, index := range c.GetIndexInfosOfType(value) {
		item := index.ValueType()
		if secretArtifactOwnDataWithin(item, c, seen, active) {
			return true
		}
	}
	nativeCarrier := policyNativeDataCarrier(value, c)
	if nativeCarrier && value.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		for _, argument := range c.GetTypeArguments(value) {
			if secretArtifactOwnDataWithin(argument, c, seen, active) {
				return true
			}
		}
	}
	// Native API members are not payloads. Application augmentations remain
	// independent stored-data obligations beside the native payload contract.
	for _, property := range c.GetPropertiesOfType(value) {
		if nativeCarrier && policyStandardLibraryProperty(property, c) {
			continue
		}
		if !secretArtifactStoredProperty(property) {
			continue
		}
		if checkerPropertyHasSecretPolicy(property) || secretArtifactOwnDataWithin(c.GetTypeOfSymbol(property), c, seen, active) {
			return true
		}
	}
	return false
}

// secretArtifactStoredProperty distinguishes declared storage from deferred
// accessor/method results and the checker's synthetic constructor prototype.
// A mapped stored property may have no original declaration. User properties
// named prototype remain ordinary storage and are not excluded by spelling.
func secretArtifactStoredProperty(property *ast.Symbol) bool {
	if property.Flags&ast.SymbolFlagsPrototype != 0 {
		return false
	}
	for _, declaration := range property.Declarations {
		if ast.IsPropertyDeclaration(declaration) || declaration.Kind == ast.KindPropertySignature || ast.IsPropertyAssignment(declaration) || ast.IsShorthandPropertyAssignment(declaration) || ast.IsVariableDeclaration(declaration) || ast.IsBindingElement(declaration) {
			return true
		}
		if ast.IsParameterDeclaration(declaration) && declaration.Parent != nil && ast.IsParameterPropertyDeclaration(declaration, declaration.Parent) {
			return true
		}
	}
	return len(property.Declarations) == 0 && property.Flags&ast.SymbolFlagsProperty != 0 && property.Flags&(ast.SymbolFlagsMethod|ast.SymbolFlagsAccessor) == 0
}

// secretArtifactOpenExpansion defers only recursive changes whose values are
// still instantiable templates. An unchanged free argument cannot excuse a
// closed growing argument. Structural containers retain obligations even when
// their elements mention a free parameter, since their shape may already select
// a private conditional branch at a later depth.
func secretArtifactOpenExpansion(value *checker.Type, active []*checker.Type, c *checker.Checker) bool {
	if value.ObjectFlags()&checker.ObjectFlagsReference == 0 {
		return false
	}
	arguments := c.GetTypeArguments(value)
	for i := len(active) - 1; i >= 0; i-- {
		ancestor := active[i]
		if ancestor.ObjectFlags()&checker.ObjectFlagsReference == 0 || !c.HasExactPolicyRecursionIdentity(value, ancestor) {
			continue
		}
		previous := c.GetTypeArguments(ancestor)
		if len(previous) != len(arguments) {
			return false
		}
		changed := false
		for j, argument := range arguments {
			if argument == previous[j] {
				continue
			}
			changed = true
			if argument.Flags()&checker.TypeFlagsInstantiable == 0 || !secretArtifactArgumentTemplate(argument, c) {
				return false
			}
		}
		return changed
	}
	return false
}

// secretArtifactArgumentTemplate requires complete dependency inspection before
// an argument can defer containment. No partial recursive result is public proof.
func secretArtifactArgumentTemplate(value *checker.Type, c *checker.Checker) bool {
	obligation := newPolicyQualificationObligation()
	dependent := secretArtifactTemplateDependent(value, c, obligation)
	return dependent && !obligation.incomplete
}

// secretArtifactTemplateDependent inspects actual type dependencies, not unused
// generic parameters or all properties of a type. It distinguishes an open
// template obligation from a closed expanding payload at the recursion boundary.
func secretArtifactTemplateDependent(value *checker.Type, c *checker.Checker, obligation *policyQualificationObligation) bool {
	if value == nil || obligation.seen[value.Id()] {
		return false
	}
	// Dependency inspection has its own finite obligation. An expanding
	// dependency cannot justify deferring the outer containment requirement.
	if c.IsExactPolicyTypeExpanding(value, obligation.active) {
		obligation.incomplete = true
		return false
	}
	obligation.seen[value.Id()] = true
	obligation.active = append(obligation.active, value)
	defer func() { obligation.active = obligation.active[:len(obligation.active)-1] }()
	if value.Flags()&checker.TypeFlagsTypeParameter != 0 {
		return true
	}
	var dependencies []*checker.Type
	if alias := value.Alias(); alias != nil {
		dependencies = append(dependencies, alias.TypeArguments()...)
	}
	if value.Flags()&checker.TypeFlagsUnionOrIntersection != 0 {
		dependencies = append(dependencies, value.Types()...)
	}
	if value.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		dependencies = append(dependencies, c.GetTypeArguments(value)...)
	}
	if value.Flags()&checker.TypeFlagsIndexedAccess != 0 {
		indexed := value.AsIndexedAccessType()
		dependencies = append(dependencies, indexed.ObjectType(), indexed.IndexType())
	}
	if value.Flags()&checker.TypeFlagsConditional != 0 {
		conditional := value.AsConditionalType()
		dependencies = append(dependencies, conditional.CheckType(), conditional.ExtendsType())
	}
	dependent := false
	for _, dependency := range dependencies {
		dependent = secretArtifactTemplateDependent(dependency, c, obligation) || dependent
	}
	return dependent
}
