package exactcompiler

// languageCallValueOrigin is issued by the paid common acquire event from its
// ready VALUE register. It has no Reference/Get producer and cannot supply this.
// No source adapter emits this constructor-only terminal callee category yet.
type languageCallValueOrigin struct {
	recipe             *storageRecipe
	valuePC, acquirePC int
	input, output      languageBranch
	value              languageValue
}

func sameCallValueOrigin(a, b *languageCallValueOrigin) bool {
	return a == b || a != nil && b != nil && *a == *b
}
func valueTargetProducer(r *storageRecipe, pc, reg int) bool {
	if r == nil || pc < 0 || pc >= len(r.events) || reg < 0 || reg >= pc {
		return false
	}
	e := r.events[pc]
	p := r.events[reg]
	return e.kind == "AcquireValueCallCallee" && e.out == pc && e.a == reg && e.b == -1 && p.out == reg && expressionValueProducer(p.kind)
}

// validCallValueTarget authenticates the actual issuer's recipe/value/branch
// association without consulting a Reference, re-Get, or current descriptor.
func validCallValueTarget(o *languageOwner, in *languageCallInputs) bool {
	if o == nil || in == nil || in.category != callValueTarget || in.valueOrigin == nil || in.targetOrigin != nil || in.reference != (languageReference{}) || in.receiver != (languageValue{undefined: true}) {
		return false
	}
	v := in.valueOrigin
	return valueTargetProducer(v.recipe, v.acquirePC, v.valuePC) && v.recipe.events[v.acquirePC].node == in.call && o.live(v.input) && o.live(v.output) && v.input == v.output && v.output == in.calleeBranch && v.value == in.callee
}

// expressionValueProducer classifies shared VALUE events without granting source entry.
func expressionValueProducer(kind string) bool {
	if prefixChoiceSelector(kind) {
		return true
	}
	switch kind {
	case "Typeof", "InvokeAcquiredCall", "NumberNegate", "NumberAdd", "NumberSubtract", "NumberMultiply", "NumberDivide", "NumberRemainder", "NumberLessThan", "NumberStrictEqual", "NumberGreaterThan", "NumberLessThanOrEqual", "NumberGreaterThanOrEqual", "NumberStrictNotEqual", "ReadThisValue", "Literal", "ReadCell", "ReadCapturedCell", "GetValue", "PutValue", "LogicalNot", "CreateClosedCallable", "AllocateObject":
		return true
	}
	return false
}
