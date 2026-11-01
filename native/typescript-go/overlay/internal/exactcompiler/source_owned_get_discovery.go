package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// closedOwnGetterProof is generation-owned structural evidence. It contains no
// evaluated value, borrowed frame or execution authority. Each actual entry must
// authenticate its own pending slot separately.
type closedOwnGetterProof struct {
	authority                                             sourceNormalAuthority
	source                                                *ast.SourceFile
	inner, outer, statement, declaration, literal, getter *ast.Node
	symbol                                                *ast.Symbol
	innerKey, outerKey                                    string
	nodes, lookups, references, members                   int
}

// ownGetterAudit meters before every structural visit and binder/classification
// operation. Exhaustion never seals a partial proof or debits semantic events.
type ownGetterAudit struct {
	remaining int
	proof     *closedOwnGetterProof
	refused   bool
}

func (a *ownGetterAudit) charge() bool {
	if a.refused {
		a.refused = true
		return false
	}
	a.remaining--
	return true
}
func ownGetStaticKey(n *ast.Node) (string, bool) {
	if n == nil {
		return "", false
	}
	if ast.IsPropertyAccessExpression(n) && ast.IsIdentifier(n.Name()) {
		return n.Name().Text(), true
	}
	if ast.IsElementAccessExpression(n) {
		k := n.AsElementAccessExpression().ArgumentExpression
		if k != nil && k.Kind == ast.KindStringLiteral {
			return k.Text(), true
		}
	}
	return "", false
}
func (a *ownGetterAudit) primitive(n *ast.Node) bool {
	if !a.charge() || n == nil {
		return false
	}
	switch n.Kind {
	case ast.KindNumericLiteral, ast.KindStringLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return true
	}
	return false
}

// eagerLiteral checks every eager child. Static callable definitions install
// descriptors without visiting their deferred bodies. Coercions are not inferred.
func (a *ownGetterAudit) eagerLiteral(n *ast.Node) bool {
	if !a.charge() || n == nil {
		return false
	}
	if !ast.IsObjectLiteralExpression(n) {
		return a.primitive(n)
	}
	seen := map[string]bool{}
	for _, m := range n.AsObjectLiteralExpression().Properties.Nodes {
		if !a.charge() || ast.HasDecorators(m) || m.Name() == nil || ast.IsComputedPropertyName(m.Name()) {
			return false
		}
		name := m.Name()
		if !ast.IsIdentifier(name) && name.Kind != ast.KindStringLiteral {
			return false
		}
		key := name.Text()
		if !a.charge() || key == "__proto__" || seen[key] {
			return false
		}
		seen[key] = true
		if ast.IsPropertyAssignment(m) {
			if !a.eagerLiteral(m.Initializer()) {
				return false
			}
		} else if !ast.IsGetAccessorDeclaration(m) && !ast.IsMethodDeclaration(m) {
			return false
		}
	}
	return true
}

// discoverClosedOwnGetter reads only the already published source index. It
// never initiates indexing, imports, origin/interference traversal or getter work.
// The complete source walk includes deferred bodies for binding-use closure.
// qualifyClosedOwnGetterPlan audits syntax and binding closure without execution authority.
func qualifyClosedOwnGetterPlan(owner *sourceValueOwner, targetStatement, inner *ast.Node, budget int) (*closedOwnGetterPlan, bool) {
	if owner == nil || owner.generation == nil || inner == nil {
		return nil, false
	}
	source := ast.GetSourceFileOfNode(inner)
	if source == nil || !ast.IsExternalModule(source) {
		return nil, false
	}
	index, present := owner.indexes[source]
	if !present || owner.indexPreparing[source] || index.incomplete {
		return nil, false
	}
	outer := inner.Parent
	ki, ok := ownGetStaticKey(inner)
	if !ok {
		return nil, false
	}
	ko, ok := ownGetStaticKey(outer)
	if !ok || outer.Expression() != inner {
		return nil, false
	}
	i, o := index.normalOccurrences[inner], index.normalOccurrences[outer]
	if i == nil || o == nil || i.statement != targetStatement || !i.once || !o.once || i.region != nil || o.region != nil || i.statement != o.statement {
		return nil, false
	}
	receiver := inner.Expression()
	if !ast.IsIdentifier(receiver) {
		return nil, false
	}
	p := &closedOwnGetterProof{source: source, inner: inner, outer: outer, statement: i.statement, innerKey: ki, outerKey: ko}
	a := ownGetterAudit{remaining: budget, proof: p}
	if !a.charge() {
		return nil, false
	}
	symbol := owner.checker.GetSymbolAtLocation(receiver)
	p.lookups++
	if symbol == nil || len(symbol.Declarations) != 1 {
		return nil, false
	}
	d := symbol.Declarations[0]
	if !ast.IsVariableDeclaration(d) || !ast.IsIdentifier(d.Name()) || enclosingCallableNode(d) != nil || ast.GetSourceFileOfNode(d) != source || d.Initializer() == nil || !ast.IsObjectLiteralExpression(d.Initializer()) || d.Parent == nil || !ast.IsVariableDeclarationList(d.Parent) || d.Parent.Flags&ast.NodeFlagsConst == 0 {
		return nil, false
	}
	statement := d.Parent.Parent
	di := index.normalOccurrences[d]
	if statement == nil || statement.Parent != source.AsNode() || di == nil || di.ordinal >= i.ordinal || ast.HasSyntacticModifier(statement, ast.ModifierFlagsExport) {
		return nil, false
	}
	p.symbol, p.declaration, p.literal = symbol, d, d.Initializer()
	if index.normalDynamicScope || index.normalExportUnknown || index.normalExported[ast.GetSymbolId(symbol)] {
		return nil, false
	}
	// Reject aliases and member interference even when an index bucket is narrower
	// than the complete binder walk below. Missing buckets are never positive proof.
	for _, write := range index.bindings[ast.GetSymbolId(symbol)] {
		if !a.charge() || write.right != p.literal {
			return nil, false
		}
	}
	var walk func(*ast.Node)
	walk = func(n *ast.Node) {
		if !a.charge() {
			return
		}
		p.nodes++
		if n.Kind == ast.KindWithStatement {
			a.refused = true
			return
		}
		if ast.IsExportSpecifier(n) {
			if !a.charge() {
				return
			}
			s := owner.checker.GetExportSpecifierLocalTargetSymbol(n)
			p.lookups++
			if s == nil || s == symbol {
				a.refused = true
				return
			}
		}
		if ast.IsIdentifier(n) {
			if !a.charge() {
				return
			}
			p.lookups++
			s := owner.checker.GetSymbolAtLocation(n)
			shorthand := n.Parent != nil && ast.IsShorthandPropertyAssignment(n.Parent)
			if shorthand {
				if !a.charge() {
					return
				}
				s = owner.checker.GetShorthandAssignmentValueSymbol(n.Parent)
				p.lookups++
			}
			if !a.charge() {
				return
			}
			if s == nil && n.Text() == receiver.Text() {
				a.refused = true
				return
			}
			if s == symbol {
				if ast.IsPartOfTypeNode(n) || checker.IsInTypeQuery(n) { // Erased references remain classified in the whole walk.
				} else if n == d.Name() {
				} else if n == receiver {
					p.references++
				} else if !shorthand && (ast.IsDeclarationName(n) || isStaticPropertyName(n)) {
				} else {
					a.refused = true
					return
				}
			}
		}
		n.ForEachChild(func(child *ast.Node) bool { walk(child); return a.refused })
	}
	walk(source.AsNode())
	if a.refused || p.references != 1 {
		return nil, false
	}
	// Every preceding declarator and eager child is classified, including siblings
	// in a terminal const statement. No whole-statement shortcut admits a call.
	reached := false
	for _, s := range source.Statements.Nodes {
		if !a.charge() {
			return nil, false
		}
		if s == p.statement {
			if ast.IsExpressionStatement(s) && s.AsExpressionStatement().Expression == outer {
				reached = true
				break
			}
			if !ast.IsVariableStatement(s) {
				return nil, false
			}
			list := s.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
			if list.Flags&ast.NodeFlagsConst == 0 {
				return nil, false
			}
			for _, decl := range list.Declarations.Nodes {
				if !a.charge() {
					return nil, false
				}
				if decl.Initializer() == outer {
					reached = true
					break
				}
				if !ast.IsIdentifier(decl.Name()) || !a.eagerLiteral(decl.Initializer()) {
					return nil, false
				}
			}
			break
		}
		if ast.IsInterfaceDeclaration(s) || ast.IsTypeAliasDeclaration(s) || ast.IsEmptyStatement(s) {
			continue
		}
		if ast.IsImportDeclaration(s) {
			c := s.AsImportDeclaration().ImportClause
			if c != nil && c.AsImportClause().IsTypeOnly() {
				continue
			}
			return nil, false
		}
		if !ast.IsVariableStatement(s) || ast.HasSyntacticModifier(s, ast.ModifierFlagsExport) {
			return nil, false
		}
		list := s.AsVariableStatement().DeclarationList.AsVariableDeclarationList()
		if list.Flags&ast.NodeFlagsConst == 0 {
			return nil, false
		}
		for _, decl := range list.Declarations.Nodes {
			if !a.charge() || !ast.IsIdentifier(decl.Name()) || !a.eagerLiteral(decl.Initializer()) {
				return nil, false
			}
		}
	}
	if !reached {
		return nil, false
	}
	seen := map[string]bool{}
	for _, m := range p.literal.AsObjectLiteralExpression().Properties.Nodes {
		if !a.charge() {
			return nil, false
		}
		p.members++
		if ast.HasDecorators(m) || m.Name() == nil || ast.IsComputedPropertyName(m.Name()) {
			return nil, false
		}
		name := m.Name()
		if !ast.IsIdentifier(name) && name.Kind != ast.KindStringLiteral {
			return nil, false
		}
		key := name.Text()
		if !a.charge() || seen[key] || key == "__proto__" {
			return nil, false
		}
		seen[key] = true
		if key == ki {
			if !ast.IsGetAccessorDeclaration(m) || m.Body() == nil || len(m.Parameters()) != 0 {
				return nil, false
			}
			p.getter = m
		} else if !ast.IsPropertyAssignment(m) || !a.primitive(m.Initializer()) {
			return nil, false
		}
	}
	if a.refused || p.getter == nil {
		return nil, false
	}
	return &closedOwnGetterPlan{proof: *p, owner: owner, entry: i}, true
}

// closedOwnGetterPlan is immutable structural evidence, never a pending-slot capability.
type closedOwnGetterPlan struct {
	proof closedOwnGetterProof
	owner *sourceValueOwner
	entry *sourceNormalOccurrence
}

// authenticateClosedOwnGetterPlan attaches authority only at the authentic pending I slot.
func authenticateClosedOwnGetterPlan(q *sourceValueQuery, slot *sourceNormalOperation, plan *closedOwnGetterPlan) (*closedOwnGetterProof, bool) {
	if plan == nil || q.owner != plan.owner || q.inputs == nil || q.inputs.operationLifetime == nil || q.operation == nil || q.operation.outputOnly || q.operation.inputs != q.inputs || q.operation.node != plan.proof.inner || q.inputs.operations[plan.proof.inner] != slot || slot == nil || slot.state != sourceOperationPending || !slot.authority.valid(q) {
		return nil, false
	}
	index, present := q.owner.indexes[plan.proof.source]
	if !present || index.incomplete || q.owner.indexPreparing[plan.proof.source] || index.normalOccurrences[plan.proof.inner] != plan.entry || slot.entry != plan.entry || slot.population == nil || slot.population.moduleEntry(plan.proof.inner, q.operation.owner) != plan.entry {
		return nil, false
	}
	proof := plan.proof
	proof.authority = q.normalAuthority()
	return &proof, true
}
func (q *sourceValueQuery) discoverClosedOwnGetter(inner *ast.Node, slot *sourceNormalOperation) (*closedOwnGetterProof, bool) {
	if q.inputs != nil && q.inputs.initializerCursor != nil {
		c := q.inputs.initializerCursor
		if c.plan != nil && c.plan.proof.inner == inner {
			return authenticateClosedOwnGetterPlan(q, slot, c.plan)
		}
		return nil, false
	}
	if q.owner == nil || inner == nil {
		return nil, false
	}
	source := ast.GetSourceFileOfNode(inner)
	index, present := q.owner.indexes[source]
	if !present {
		return nil, false
	}
	entry := index.normalOccurrences[inner]
	if entry == nil {
		return nil, false
	}
	plan, ok := qualifyClosedOwnGetterPlan(q.owner, entry.statement, inner, q.remaining)
	if !ok {
		return nil, false
	}
	return authenticateClosedOwnGetterPlan(q, slot, plan)
}
