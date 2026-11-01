package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// shortCircuitPopulationProof is temporary bounded qualification work, not an
// execution index or a rewritten once flag. Existing AST/index/recipe identities
// remain authoritative. It is discarded before source execution.
type shortCircuitPopulationProof struct {
	candidate *closedPrefixCandidate
	index     sourceValueIndex
	remaining int
	recipe    *storageRecipe
	runtime   map[*ast.Node]bool
	body      *closedCallableProof
}

func (p *shortCircuitPopulationProof) spend() bool {

	p.remaining--
	p.candidate.owner.indexWork++
	return true
}
func (p *shortCircuitPopulationProof) within(n, root *ast.Node) bool {
	for n != nil {
		if !p.spend() {
			return false
		}
		if n == root {
			return true
		}
		if n == p.candidate.source.AsNode() {
			return false
		}
		n = n.Parent
	}
	return false
}

// interval validates each logical or conditional selector, its terminators and
// the event donors in its operand regions. Each producer ends at its consuming
// boundary, including nested choices whose destinations precede their merges.
func (p *shortCircuitPopulationProof) interval(pc int) bool {
	r := p.recipe
	if !p.spend() || pc < 0 || pc >= len(r.events) {
		return false
	}
	e := r.events[pc]
	if e.kind == "SelectDefault" {
		return p.defaultInterval(pc)
	}
	if e.kind == "SelectConditional" {
		return p.conditionalInterval(pc)
	}
	if !ast.IsBinaryExpression(e.node) || !p.runtime[e.node] {
		return false
	}
	b := e.node.AsBinaryExpression()
	op := shortCircuitOperator(e.kind)
	if op == ast.KindUnknown || b.OperatorToken.Kind != op || e.out != pc || e.a < 0 || e.a >= pc || e.entry != pc+1 || e.entry >= e.merge || e.merge >= len(r.events) || e.end != e.merge+1 {
		return false
	}
	merge := r.events[e.merge]
	if merge.kind != "MergeShortCircuit" || merge.node != e.node || merge.b != e.out || !p.ends(e.a, pc, b.Left) || !p.ends(merge.a, e.merge, b.Right) {
		return false
	}
	for i, child := range r.events {
		if !p.spend() {
			return false
		}
		inside := i >= e.entry && i < e.merge
		// Parent traversal is bounded. A right donor cannot appear outside its region,
		// and a foreign donor cannot be smuggled inside the contiguous right region.
		rhs := p.within(child.node, b.Right)
		if inside != rhs {
			return false
		}
	}
	return true
}
func (p *shortCircuitPopulationProof) ends(reg, end int, operand *ast.Node) bool {
	r := p.recipe
	if !p.spend() || reg < 0 || reg >= len(r.events) {
		return false
	}
	producer := r.events[reg]
	if !expressionValueProducer(producer.kind) {
		return false
	}
	// Parentheses and comma are the only transparent producer origins. Other
	// operators must own their result, not borrow an arbitrary child register.
	for operand != nil {
		if !p.spend() {
			return false
		}
		if ast.IsParenthesizedExpression(operand) {
			operand = operand.Expression()
			continue
		}
		if ast.IsBinaryExpression(operand) && operand.AsBinaryExpression().OperatorToken.Kind == ast.KindCommaToken {
			operand = operand.AsBinaryExpression().Right
			continue
		}
		break
	}
	if producer.node != operand {
		return false
	}
	if !p.within(producer.node, operand) {
		return false
	}
	if prefixChoiceSelector(producer.kind) {
		return producer.end == end
	}
	return reg == end-1
}

// occurrence checks every inherited false edge back to this source root. Only
// exact recipe-owned logical operands or conditional condition/arm edges may
// explain lost unconditional once.
// It neither grants global once nor relaxes the installed Call's separate guard.
func (p *shortCircuitPopulationProof) occurrence(node *ast.Node) bool {
	if p.body != nil {
		return p.bodyOccurrence(node)
	}
	c := p.candidate
	r := p.recipe
	if !p.runtime[node] {
		return false
	}
	current := node
	for current != c.source.AsNode() {
		if current == nil || !p.spend() {
			return false
		}
		e := p.index.normalOccurrences[current]
		parent := current.Parent
		pe := p.index.normalOccurrences[parent]
		if e == nil || e.node != current || e.region != nil || parent == nil || pe == nil || pe.node != parent || pe.region != nil || e.parent != pe {
			return false
		}
		expected := pe.once
		if sourceMemberOperationOwnsChild(parent, current) {
			return false
		}
		if !sourceNormalStraightParent(parent) {
			matched := false
			for _, event := range r.events {
				if !p.spend() {
					return false
				}
				if prefixChoiceOwnsEdge(event, parent, current) {
					if matched {
						return false
					}
					matched = true
				}
			}
			if !matched {
				return false
			}
			expected = false
		}

		if e.once != expected {
			return false
		}
		if parent == c.source.AsNode() {
			if e.statement != current {
				return false
			}
		} else if e.statement != pe.statement || e.ordinal != pe.ordinal {
			return false
		}
		current = parent
	}
	root := p.index.normalOccurrences[current]
	return root != nil && root.node == current && root.once && root.region == nil
}

// shortCircuitIndexedPopulation proves only the frozen, fully discovered prefix
// recipe against the completed current index. Nil/foreign/partial domains refuse.
func shortCircuitIndexedPopulation(c *closedPrefixCandidate, index sourceValueIndex) bool {
	proof := shortCircuitPopulationProof{candidate: c, index: index, remaining: 4096}
	return qualifyPrefixPopulation(c, index, &proof)
}

// prefixPopulationContext is shared by choice and standard-undefined role
// checks. It authenticates only their common current source/index association.
func prefixPopulationContext(c *closedPrefixCandidate, index sourceValueIndex) bool {
	return c != nil && c.owner != nil && c.source != nil && c.history != nil && c.history.source == c.source && c.history.recipe != nil && index.normalOccurrences != nil && !index.incomplete && !index.normalDynamicScope && !index.normalExportUnknown && c.owner.program == c.program && c.owner.checker == c.checker && c.owner.generation == c.generation && c.checker != nil && c.generation != nil && c.generation.active
}

// prefixUndefinedLiterals validates the only admitted Identifier Literal. All
// other identifiers retain their Reference/Get or audited formal producer role.
func (p *shortCircuitPopulationProof) prefixUndefinedLiterals() bool {
	c := p.candidate
	if !prefixPopulationContext(c, p.index) {
		return false
	}
	r := c.history.recipe
	if !r.prefix || r.callBody || r.body != c.source.AsNode() || r.registers != len(r.events) {
		return false
	}
	p.recipe, p.runtime, p.body = r, c.history.runtime, nil
	for pc, e := range r.events {
		if !p.spend() {
			return false
		}
		if e.kind != "Literal" {
			continue
		}
		if e.node == nil {
			return false
		}
		if !ast.IsIdentifier(e.node) && !e.value.undefined {
			continue
		}
		if e.node == nil || e.node.Parent == nil || e.out != pc || e.value != (languageValue{undefined: true, node: e.node}) || !p.runtime[e.node] || ast.GetSourceFileOfNode(e.node) != c.source || ast.IsPartOfTypeNode(e.node) || ast.IsDeclarationName(e.node) || isStaticPropertyName(e.node) || !p.occurrence(e.node) || !p.spend() {
			return false
		}
		symbol := c.checker.GetSymbolAtLocation(e.node)
		if !standardUndefinedSymbol(c.checker, e.node, symbol) {
			return false
		}
		entry := p.index.normalOccurrences[e.node]
		if entry == nil || entry.structural || entry.statement == nil || entry.ordinal <= 0 {
			return false
		}
		found := false
		for ordinal, statement := range c.source.Statements.Nodes {
			if !p.spend() {
				return false
			}
			if statement == entry.statement {
				found = entry.ordinal == ordinal+1
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func qualifyPrefixPopulation(c *closedPrefixCandidate, index sourceValueIndex, work *shortCircuitPopulationProof) bool {
	if !prefixPopulationContext(c, index) {
		return false
	}
	r := c.history.recipe
	if !r.prefix || r.callBody || r.body != c.source.AsNode() || prefixEntryNode(r) != c.call || r.choiceSlots <= 0 || r.registers != len(r.events) || r.choiceSlots > len(r.events) || len(r.declarations) != r.locals {
		return false
	}
	if r.binding != nil && !r.binding.valid(r) {
		return false
	}
	work.recipe, work.runtime = c.history.recipe, c.history.runtime
	proof := work
	selectors := 0
	for pc, e := range r.events {
		if !proof.spend() || e.out != pc || e.node == nil || !c.history.runtime[e.node] || !proof.within(e.node, c.source.AsNode()) {
			return false
		}
		if prefixChoiceSelector(e.kind) {
			selectors++
			if !proof.interval(pc) {
				return false
			}
		}
		if e.kind == "InitializeCell" || e.kind == "ResolveLexicalReference" {
			if e.cell < 0 || e.cell >= len(r.declarations) || r.declarations[e.cell] == nil || !proof.spend() {
				return false
			}
			d := r.declarations[e.cell]
			if !proof.within(d, c.source.AsNode()) || !c.history.runtime[d] || !c.history.runtime[d.Name()] {
				return false
			}
			if e.kind == "InitializeCell" {
				if e.node != d {
					return false
				}
			} else {
				symbol := c.checker.GetSymbolAtLocation(e.node)
				if symbol == nil || symbol.ValueDeclaration != d || len(symbol.Declarations) != 1 {
					return false
				}
			}
		}
	}
	if selectors != r.choiceSlots {
		return false
	}
	for node := range c.history.runtime {
		if !proof.occurrence(node) {
			return false
		}
	}
	return true
}

// expressionValueProducer names the concrete lowerer's VALUE registers. Control
// merge slots and lexical References are not substitutable expression results.
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

// prefixAssignmentStatements binds the small statement adapter to the existing
// completed index and complete emitted region. It does not infer execution from
// source text or change once/region ownership for another expression family.
func (p *shortCircuitPopulationProof) prefixAssignmentStatements() bool {
	c := p.candidate
	if c == nil || c.history == nil || c.history.recipe == nil || c.source == nil {
		return false
	}
	r := c.history.recipe
	p.recipe, p.runtime = r, c.history.runtime
	assignments := 0
	for _, s := range c.source.Statements.Nodes {
		if closedPrefixAssignmentStatement(s) {
			assignments++
		}
	}
	if assignments == 0 {
		return true
	}
	if !r.prefix || r.callBody || r.registers != len(r.events) {
		return false
	}
	lastOrdinal := 0
	for pc, event := range r.events {
		if !p.spend() || event.out != pc || event.node == nil || !p.runtime[event.node] {
			return false
		}
		if event.kind == "InstantiateModuleFunction" {
			if pc != 0 || !p.moduleFunctionPrelude() {
				return false
			}
			continue // the exact prelude is not an evaluation-order donor
		}
		occurrence := p.index.normalOccurrences[event.node]
		if occurrence == nil || occurrence.region != nil || !occurrence.once || occurrence.ordinal < lastOrdinal {
			return false
		}
		lastOrdinal = occurrence.ordinal
	}
	for ordinal, s := range c.source.Statements.Nodes {
		if !closedPrefixAssignmentStatement(s) {
			continue
		}
		root := p.index.normalOccurrences[s]
		expression := s.Expression()
		expr := p.index.normalOccurrences[expression]
		if root == nil || expr == nil || !p.runtime[s] || root.node != s || root.statement != s || root.ordinal != ordinal+1 || root.region != nil || !root.once || root.parent != p.index.normalOccurrences[c.source.AsNode()] || expr.parent != root || expr.statement != s || expr.ordinal != root.ordinal || expr.region != nil || !expr.once {
			return false
		}
		start, end := -1, -1
		// Only a computed @@iterator destination needs the native Symbol entry.
		// A named own-data destination is proved by its original Member/Put rows.
		symbolDestination := ast.IsElementAccessExpression(expression.AsBinaryExpression().Left)
		keySeen := false
		for pc, event := range r.events {
			if !p.spend() {
				return false
			}
			if event.kind == "SourceWellKnownIteratorKey" {
				keySeen = true
			}
			if p.index.normalOccurrences[event.node].statement == s {
				if symbolDestination && !keySeen {
					return false
				}
				if start < 0 {
					start = pc
				}
				end = pc + 1
			}
		}
		b := expression.AsBinaryExpression()
		computed := ast.IsElementAccessExpression(b.Left)
		want := 5
		// Standard-undefined Literal uses one value producer. The full candidate
		// separately requires its symbol proof before entry. Other identifiers use Ref/Get.
		undefinedLiteral := false
		if start >= 0 && end > start && end <= len(r.events) {
			value := r.events[end-1].b
			if value >= start && value < end-1 {
				producer := r.events[value]
				undefinedLiteral = producer.kind == "Literal" && producer.node == b.Right && producer.value == (languageValue{undefined: true, node: b.Right})
			}
		}
		if computed || ast.IsIdentifier(b.Right) && !undefinedLiteral {
			want = 6
		}
		if start < 0 || end-start != want {
			return false
		}
		put := r.events[end-1]
		if put.kind != "PutValue" || put.node != expression || put.a < start || put.a >= end-1 || !p.ends(put.b, end-1, b.Right) {
			return false
		}
		ref := r.events[put.a]
		if ref.kind != "Member" || ref.node != b.Left {
			return false
		}
		baseEnd := put.a
		if computed {
			keyPC := ref.keyProducerPC
			if keyPC < start || keyPC != put.a-1 || ref.key != languageIteratorKey() {
				return false
			}
			key := r.events[keyPC]
			if key.kind != "SourceWellKnownIteratorKey" || key.node != b.Left.AsElementAccessExpression().ArgumentExpression || key.key != languageIteratorKey() || key.keyProducerPC != -1 {
				return false
			}
			baseEnd = keyPC
		} else if ref.keyProducerPC != -1 || ref.key != languageStringKey(b.Left.AsPropertyAccessExpression().Name().Text()) {
			return false
		}
		if !p.ends(ref.a, baseEnd, b.Left.Expression()) {
			return false
		}
		for pc := start; pc < end; pc++ {
			e := r.events[pc]
			if p.index.normalOccurrences[e.node].statement != s {
				return false
			}
			switch e.kind {
			case "ResolveLexicalReference":
				if !ast.IsIdentifier(e.node) || (e.node != b.Left.Expression() && e.node != b.Right) || e.cell < 0 || e.cell >= len(r.declarations) {
					return false
				}
				symbol := c.checker.GetSymbolAtLocation(e.node)
				if symbol == nil || symbol.ValueDeclaration != r.declarations[e.cell] || len(symbol.Declarations) != 1 {
					return false
				}
			case "GetValue":
				if e.a != pc-1 || e.a < start || r.events[e.a].kind != "ResolveLexicalReference" || r.events[e.a].node != e.node {
					return false
				}
			case "Literal":
				if e.node != b.Right || e.value.node != e.node || !expressionLiteralNode(e.node) && !(undefinedLiteral && e.value == (languageValue{undefined: true, node: b.Right})) {
					return false
				}
			case "SourceWellKnownIteratorKey":
				if !computed || pc != ref.keyProducerPC {
					return false
				}
			case "CreateClosedCallable":
				// Construction donor only. Shared final body proof and later Call
				// activation still authenticate this callable independently.
				if !computed || !ast.IsFunctionExpression(b.Right) || e.node != b.Right || e.callable == nil || e.callable.arrow != b.Right {
					return false
				}
			case "Member":
				if pc != put.a {
					return false
				}
			case "PutValue":
				if pc != end-1 {
					return false
				}
			default:
				return false
			}
		}
	}
	return true
}
