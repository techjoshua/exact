package checker

// IsExactPolicyTypeExpanding reports the pinned checker's deeply nested type
// signal for a non-nil selected type and its active qualification ancestors.
// It uses the same repeated-origin threshold as structural type relation checks,
// including their handling of literal, anonymous, mapped and conditional types.
// This is a conservative recursion signal, not a proof of secrecy or publicness.
// Callers must retain incomplete disclosure obligations when it is true.
func (c *Checker) IsExactPolicyTypeExpanding(value *Type, ancestors []*Type) bool {
	return c.isDeeplyNestedType(value, ancestors, 3)
}
