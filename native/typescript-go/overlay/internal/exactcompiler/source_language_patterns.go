package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// declareBinding discovers only closed static object patterns and simple leaves.
// It creates no semantic cells. Both passes spend discovery before each element.
func (p *storageBuilder) declareBinding(name *ast.Node) bool {
	if !p.discover() || name == nil {
		return false
	}
	if ast.IsIdentifier(name) {
		if !p.discover() {
			return false
		}
		sym := p.query.owner.checker.GetSymbolAtLocation(name)
		if sym == nil {
			return false
		}
		id := ast.GetSymbolId(sym)
		if !p.discover() {
			return false
		}
		if _, exists := p.locals[id]; exists {
			return false
		}
		if !p.discover() {
			return false
		}
		p.locals[id] = storageBinding{cell: p.recipe.locals}
		p.recipe.locals++
		return true
	}
	if !ast.IsObjectBindingPattern(name) {
		return false
	}
	elements := name.AsBindingPattern().Elements.Nodes
	for i, node := range elements {
		if !p.discover() || !ast.IsBindingElement(node) {
			return false
		}
		e := node.AsBindingElement()
		if !ast.IsIdentifier(e.Name()) && !ast.IsObjectBindingPattern(e.Name()) {
			return false
		}
		if e.DotDotDotToken != nil {
			if !ast.IsIdentifier(e.Name()) || i != len(elements)-1 || e.PropertyName != nil || e.Initializer != nil {
				return false
			}
		} else if _, ok := storageBindingKey(node); !ok {
			return false
		}
		if !p.declareBinding(e.Name()) {
			return false
		}
	}
	return true
}
func storageBindingKey(node *ast.Node) (string, bool) {
	e := node.AsBindingElement()
	key := e.PropertyName
	if key == nil {
		key = e.Name()
	}
	if ast.IsIdentifier(key) || key.Kind == ast.KindStringLiteral {
		return key.Text(), true
	}
	return "", false
}

// initializeLeaf transfers a positive admission domain to one reserved cell.
func (p *storageBuilder) initializeLeaf(name *ast.Node, v storageOperand) bool {
	if !p.validDomain(v.domain) || !p.discover() {
		return false
	}
	if !p.discover() {
		return false
	}
	sym := p.query.owner.checker.GetSymbolAtLocation(name)
	if sym == nil {
		return false
	}
	id := ast.GetSymbolId(sym)
	b, ok := p.locals[id]
	if !ok || !p.discover() {
		return false
	}
	b.domain = v.domain
	p.locals[id] = b
	p.event(storageEvent{kind: "InitializeCell", node: name, a: v.register, cell: b.cell})
	return !p.exhausted
}

// initializeBinding lowers each acquired RHS into the same flat operations.
// Every level owns its exclusions and finishes its child before its next sibling.
func (p *storageBuilder) initializeBinding(name *ast.Node, v storageOperand) bool {
	if !p.discover() || !p.validDomain(v.domain) {
		return false
	}
	if ast.IsIdentifier(name) {
		return p.initializeLeaf(name, v)
	}
	if !ast.IsObjectBindingPattern(name) || v.domain.kind != storageObjectDomain {
		return false
	}
	p.event(storageEvent{kind: "RequireObjectCoercible", node: name, a: v.register})
	excluded := []string{}
	for _, node := range name.AsBindingPattern().Elements.Nodes {
		if !p.discover() {
			return false
		}
		e := node.AsBindingElement()
		if e.DotDotDotToken != nil {
			domain, ok := p.restDomain(v.domain, excluded)
			if !ok {
				return false
			}
			target := p.event(storageEvent{kind: "AllocateObject", node: node})
			typedExcluded, valid := p.typedStringKeys(excluded)
			if !valid {
				return false
			}
			p.event(storageEvent{kind: "CopyDataProperties", node: node, a: target, b: v.register, excluded: typedExcluded})
			if !p.initializeLeaf(e.Name(), storageOperand{register: target, domain: domain}) {
				return false
			}
		} else {
			key, ok := storageBindingKey(node)
			if !ok {
				return false
			}
			domain, ok := p.fieldDomain(v.domain, key)
			if !ok || !p.discover() {
				return false
			}
			excluded = append(excluded, key)
			ref := p.event(storageEvent{kind: "Member", node: node, a: v.register, key: languageStringKey(key), keyProducerPC: -1})
			value := p.event(storageEvent{kind: "GetValue", node: node, a: ref})
			operand := storageOperand{register: value, domain: domain}
			if e.Initializer != nil {
				if !p.isPrimitive(domain) {
					return false
				}
				operand, ok = p.defaultOperand(e.Initializer, value, nil)
				if !ok {
					return false
				}
			}
			if !p.initializeBinding(e.Name(), operand) {
				return false
			}
		}
	}
	return !p.exhausted
}
