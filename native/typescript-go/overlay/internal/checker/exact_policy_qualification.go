package checker

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// IsExactPolicyTypeExpanding reports the pinned checker's deeply nested type
// signal for a non-nil selected type and its active qualification ancestors.
// It uses the same repeated-origin threshold as structural type relation checks,
// including their handling of literal, anonymous, mapped and conditional types.
// This is a conservative recursion signal, not a proof of secrecy or publicness.
// Callers must retain incomplete disclosure obligations when it is true.
func (c *Checker) IsExactPolicyTypeExpanding(value *Type, ancestors []*Type) bool {
	return c.isDeeplyNestedType(value, ancestors, 3)
}

// GetExactPolicyPropertyForKey reuses native property-key identity for literal
// strings, numbers and unique symbols. Callers discharge unions and constraints
// before requesting one key. No display text or authored name establishes identity.
func (c *Checker) GetExactPolicyPropertyForKey(value, key *Type) *ast.Symbol {
	if value == nil || key == nil || !isTypeUsableAsPropertyName(key) {
		return nil
	}
	return c.GetPropertyOfType(value, getPropertyNameFromType(key))
}

// GetExactPolicyPropertyKey preserves the pinned checker's property-name
// semantics for contextual declaration contracts, including computed keys.
func (c *Checker) GetExactPolicyPropertyKey(name *ast.Node) *Type {
	if name == nil {
		return nil
	}
	return c.getLiteralTypeFromPropertyName(name)
}

// HasExactPolicyRecursionIdentity compares native recursion origins, preserving
// the pinned checker's treatment of anonymous, indexed and mapped targets.
func (c *Checker) HasExactPolicyRecursionIdentity(value, ancestor *Type) bool {
	return hasMatchingRecursionIdentity(ancestor, getRecursionIdentity(value))
}
