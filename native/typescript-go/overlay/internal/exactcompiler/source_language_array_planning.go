package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strconv"
)

// arrayExpression shares recursive value recipes and shape handles with objects.
// Omitted nodes advance length without own creation. Trailing commas are metadata.
func (p *storageBuilder) arrayExpression(node *ast.Node) (storageOperand, bool) {
	if !p.ownedArray || node.AsArrayLiteralExpression().Elements == nil {
		return storageOperand{}, false
	}
	p.recipe.hasArray = true
	domain := p.objectDomain()
	if !p.validDomain(domain) {
		return storageOperand{}, false
	}
	domain.object.array = true
	if !p.insertDomain(domain, "length", p.primitiveDomain()) {
		return storageOperand{}, false
	}
	property := domain.object.fields["length"]
	property.enumerable = false
	domain.object.fields["length"] = property
	reg := p.event(storageEvent{kind: "AllocateArray", node: node})
	for i, child := range node.AsArrayLiteralExpression().Elements.Nodes {
		if !p.discover() || uint64(i) >= 4294967295 {
			return storageOperand{}, false
		}
		domain.object.length = uint32(i + 1)
		if child.Kind == ast.KindOmittedExpression {
			p.event(storageEvent{kind: "ArrayLength", node: node, a: reg, length: uint32(i + 1)})
			continue
		}
		v, ok := p.expression(child)
		if !ok || !p.validDomain(v.domain) || !p.discover() {
			return storageOperand{}, false
		}
		key := strconv.FormatUint(uint64(i), 10)
		if !p.insertDomain(domain, key, v.domain) {
			return storageOperand{}, false
		}
		p.event(storageEvent{kind: "DefineArraySlot", node: child, a: reg, b: v.register, key: languageStringKey(key)})
	}
	p.event(storageEvent{kind: "ArrayComplete", node: node, a: reg})
	return storageOperand{register: reg, domain: domain}, !p.exhausted
}

// authoredArrayLength requires the exact reviewed raw decimal spelling. Generic
// numeric literal forwarding elsewhere remains unchanged. No synthetic node enters.
func (p *storageBuilder) authoredArrayLength(node *ast.Node) (uint32, bool) {
	if !p.discover() || node == nil || node.Kind != ast.KindNumericLiteral || node.AsNumericLiteral().TokenFlags&ast.TokenFlagsNumericLiteralFlags != 0 {
		return 0, false
	}
	source := ast.GetSourceFileOfNode(node)
	if source == nil || source != ast.GetSourceFileOfNode(p.recipe.body) || node.Pos() < 0 || node.End() > len(source.Text()) || node.End() < node.Pos() {
		return 0, false
	}
	raw := sourceText(source, node)
	start, end := 0, len(raw)
	space := func(c byte) bool { return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\v' || c == '\f' }
	for start < end {
		if !p.discover() {
			return 0, false
		}
		if !space(raw[start]) {
			break
		}
		start++
	}
	for end > start {
		if !p.discover() {
			return 0, false
		}
		if !space(raw[end-1]) {
			break
		}
		end--
	}
	raw = raw[start:end]
	if len(raw) == 0 || len(raw) != len(node.Text()) {
		return 0, false
	}
	var n uint64
	for i := 0; i < len(raw); i++ {
		if !p.discover() {
			return 0, false
		}
		c := raw[i]
		if c < '0' || c > '9' || c != node.Text()[i] || i > 0 && raw[0] == '0' {
			return 0, false
		}
		n = n*10 + uint64(c-'0')
		if n > 4294967295 {
			return 0, false
		}
	}
	return uint32(n), true
}

// planArrayLength edits the one shared alias shape after all RHS qualification.
func (p *storageBuilder) planArrayLength(shape *storageShape, n uint32) bool {
	for key := range shape.fields {
		if !p.discover() {
			return false
		}
		if index, ok := arrayIndex(key); ok && index >= uint64(n) {
			if !p.discover() {
				return false
			}
			delete(shape.fields, key)
		}
	}
	shape.length = n
	return true
}
