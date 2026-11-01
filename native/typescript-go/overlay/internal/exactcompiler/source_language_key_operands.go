package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// storageKeyRegister names only the existing recipe's KEY role, not a VALUE.
func storageKeyRegister(r *storageRecipe, reg int) bool {
	return r != nil && reg >= 0 && reg < len(r.events) && (r.events[reg].kind == "StaticWellKnownIteratorKey" || r.events[reg].kind == "SourceWellKnownIteratorKey")
}

// storageKeyOperand consumes a direct String or a paid preceding KEY in this
// invocation. It neither evaluates source nor supplies intrinsic source authority.
func storageKeyOperand(r *storageRecipe, pc int, e storageEvent, ready []bool) (languagePropertyKey, bool) {
	if r == nil || pc < 0 || pc >= len(r.events) || e.out != pc || r.events[pc].node != e.node || r.events[pc].kind != e.kind || !e.key.valid() {
		return languagePropertyKey{}, false
	}
	current := r.events[pc]
	if current.out != e.out || current.a != e.a || current.b != e.b || current.key != e.key || current.keyProducerPC != e.keyProducerPC {
		return languagePropertyKey{}, false
	}
	if e.keyProducerPC == -1 {
		return e.key, e.key.kind == languageStringKeyKind
	}
	reg := e.keyProducerPC
	if reg < 0 || reg >= pc || reg >= len(ready) || !ready[reg] || !storageKeyRegister(r, reg) || e.key != languageIteratorKey() {
		return languagePropertyKey{}, false
	}
	producer := r.events[reg]
	if producer.out != reg || producer.keyProducerPC != -1 || producer.key != languageIteratorKey() || !producer.key.valid() || producer.node == nil {
		return languagePropertyKey{}, false
	}

	if r.binding != nil && r.binding.valid(r) && pc == r.binding.first.member {
		return producer.key, e.kind == "Member" && e.node == r.binding.declaration && reg == pc-1 && producer.kind == "StaticWellKnownIteratorKey" && producer.node == r.binding.declaration
	}
	var operand *ast.Node
	if e.node != nil && e.kind == "Member" && ast.IsElementAccessExpression(e.node) {
		operand = e.node.AsElementAccessExpression().ArgumentExpression
	}
	if e.node != nil && ((e.kind == "DefineSlot" || e.kind == "DefineArraySlot") && ast.IsPropertyAssignment(e.node) || e.kind == "DefineAccessorSlot" && ast.IsGetAccessorDeclaration(e.node)) && e.node.Name() != nil && ast.IsComputedPropertyName(e.node.Name()) {
		operand = e.node.Name().AsComputedPropertyName().Expression
	}
	for operand != nil && ast.IsParenthesizedExpression(operand) {
		operand = operand.Expression()
	}
	return producer.key, operand == producer.node
}

// typedStringKeys preserves the old discovery domain and reserves conversion
// allocation/writes before creating the semantic exclusion vector.
func (p *storageBuilder) typedStringKeys(in []string) ([]languagePropertyKey, bool) {
	if !p.discover() {
		return nil, false
	}
	for range in {
		if !p.discover() || !p.discover() {
			return nil, false
		}
	}
	out := make([]languagePropertyKey, len(in))
	for i, key := range in {
		out[i] = languageStringKey(key)
	}
	return out, true
}

// storageComputedGetterDefinition authenticates the emitted computed-name KEY,
// construction and installation tuple. It does not issue source Symbol trust,
// execute the Getter, or authorize a Get consumer.
func storageComputedGetterDefinition(r *storageRecipe, pc int) bool {
	if r == nil || pc < 0 || pc >= len(r.events) {
		return false
	}
	d := r.events[pc]
	if d.kind != "DefineAccessorSlot" || d.out != pc || d.node == nil || !ast.IsGetAccessorDeclaration(d.node) || d.node.Name() == nil || !ast.IsComputedPropertyName(d.node.Name()) || d.key != languageIteratorKey() || d.a < 0 || d.a >= pc || d.b != pc-1 || d.keyProducerPC != pc-2 || d.keyProducerPC < 0 {
		return false
	}
	object, birth, key := r.events[d.a], r.events[d.b], r.events[d.keyProducerPC]
	return object.out == d.a && object.kind == "AllocateObject" && object.node == d.node.Parent && birth.out == d.b && birth.kind == "CreateClosedCallable" && birth.node == d.node && birth.callable != nil && birth.callable.arrow == d.node && key.out == d.keyProducerPC && key.kind == "SourceWellKnownIteratorKey" && key.keyProducerPC == -1 && key.key == d.key && key.node == d.node.Name().AsComputedPropertyName().Expression
}
