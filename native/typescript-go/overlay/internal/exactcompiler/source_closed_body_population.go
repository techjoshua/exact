package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// bodyOccurrence follows the existing completed index across the exact deferred
// child edge. Region alone is insufficient. Structural parameter/body donors
// are provenance, not evaluated declarations. No once flags are rewritten.
func (p *shortCircuitPopulationProof) bodyOccurrence(node *ast.Node) bool {
	c := p.candidate
	arrow := p.body.arrow
	r := p.recipe
	if !p.runtime[node] {
		return false
	}
	for current := node; current != arrow; {
		if current == nil || !p.spend() {
			return false
		}
		e := p.index.normalOccurrences[current]
		parent := current.Parent
		pe := p.index.normalOccurrences[parent]
		if e == nil || pe == nil || e.node != current || pe.node != parent || e.parent != pe || e.region != arrow || e.statement != pe.statement || e.ordinal != pe.ordinal {
			return false
		}
		expectedOwner := pe.callOwner
		if ast.IsCallExpression(parent) {
			expectedOwner = pe
		}
		if e.callOwner != expectedOwner {
			return false
		}
		expected := pe.once
		if sourceMemberOperationOwnsChild(parent, current) {
			if parent != arrow || current != arrow.Body() && !ast.IsParameterDeclaration(current) {
				return false
			}
			expected = true
		} else if pe.region != arrow {
			return false
		}
		if !sourceNormalStraightParent(parent) {
			matched := false
			if r.finally != nil && parent == r.finally.node && ast.IsTryStatement(parent) {
				t := parent.AsTryStatement()
				matched = current == t.TryBlock || current == t.FinallyBlock
			}
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
		current = parent
	}
	e := p.index.normalOccurrences[arrow]
	return e != nil && e.node == arrow && ast.GetSourceFileOfNode(arrow) == c.source && (c.history.runtime[arrow] || activationParameterProof(p.body))
}

// bodyExpressionRegion checks actual producer wiring and exact operand donors.
// It is shared by Return/Throw and ordered finalizer assignment operands.
func (p *shortCircuitPopulationProof) bodyExpressionRegion(start, end int, operand *ast.Node) bool {
	r := p.recipe
	if operand == nil || start < 0 || end <= start || end > len(r.events) {
		return false
	}
	for pc := start; pc < end; pc++ {
		e := r.events[pc]
		if !p.spend() || e.out != pc || e.node == nil || !p.runtime[e.node] || !p.within(e.node, operand) {
			return false
		}
		switch e.kind {
		case "CreateClosedCallable":
			if !p.qualifyActivationCreation(e) {
				return false
			}
		case "Literal":
			if e.value != (languageValue{node: e.node}) || !expressionLiteralNode(e.node) {
				return false
			}
		case "ReadThisValue":
			if (!ast.IsFunctionExpression(p.body.arrow) && !ast.IsGetAccessorDeclaration(p.body.arrow)) || e.node.Kind != ast.KindThisKeyword {
				return false
			}
		case "ReadCapturedCell":
			if !p.body.captureLayoutValid() || len(p.body.captureDeclarations) != 1 || e.cell != 0 || p.body.captureReferences[e.node] != 0 || !ast.IsIdentifier(e.node) {
				return false
			}
			if _, ok := p.body.captureReferences[e.node]; !ok {
				return false
			}
		case "Member":
			if p.body.empty && p.body.plan.parameters.nullDefaultMember() == e.node {
				literal := unwrapSourceCallableReference(e.node.Expression())
				if e.key != languageStringKey(e.node.Name().Text()) || e.keyProducerPC != -1 || e.a < start || e.a >= pc || r.events[e.a].kind != "Literal" || r.events[e.a].node != literal || !p.ends(e.a, pc, literal) {
					return false
				}
				break
			}
			if p.body.empty && p.body.plan.parameters.formalMember(e.node) {
				base := e.node.Expression()
				if e.key != languageStringKey(e.node.Name().Text()) || e.keyProducerPC != -1 || e.a < start || e.a >= pc || r.events[e.a].kind != "ReadCell" || r.events[e.a].cell != p.body.plan.parameters.references[base] || r.events[e.a].node != base || !p.ends(e.a, pc, base) {
					return false
				}
				break
			}
			if len(p.body.captureDeclarations) == 1 {
				base, key := accessorReceiver(e.node)
				if base == nil || !ast.IsIdentifier(base) || key == "" || key == "*" || e.key != languageStringKey(key) || e.keyProducerPC != -1 || e.a < start || e.a >= pc || r.events[e.a].kind != "ReadCapturedCell" || r.events[e.a].node != base || !p.ends(e.a, pc, base) {
					return false
				}
				break
			}
			if (!ast.IsFunctionExpression(p.body.arrow) && !ast.IsGetAccessorDeclaration(p.body.arrow)) || !ast.IsPropertyAccessExpression(e.node) || ast.IsOptionalChain(e.node) || !ast.IsIdentifier(e.node.Name()) || e.key != languageStringKey(e.node.Name().Text()) || e.a < start || e.a >= pc || r.events[e.a].kind != "ReadThisValue" || !p.ends(e.a, pc, e.node.AsPropertyAccessExpression().Expression) {
				return false
			}
		case "GetValue":
			if p.body.empty && p.body.plan.parameters.nullDefaultMember() == e.node {
				if e.a < start || e.a != pc-1 || r.events[e.a].kind != "Member" || r.events[e.a].node != e.node {
					return false
				}
				break
			}
			if p.body.empty && p.body.plan.parameters.formalMember(e.node) {
				if e.a < start || e.a != pc-1 || r.events[e.a].kind != "Member" || r.events[e.a].node != e.node {
					return false
				}
				break
			}
			if len(p.body.captureDeclarations) == 1 {
				if e.a < start || e.a != pc-1 || r.events[e.a].kind != "Member" || r.events[e.a].node != e.node {
					return false
				}
				break
			}
			if (!ast.IsFunctionExpression(p.body.arrow) && !ast.IsGetAccessorDeclaration(p.body.arrow)) || e.a < start || e.a != pc-1 || r.events[e.a].kind != "Member" || r.events[e.a].node != e.node {
				return false
			}
		case "ReadCell", "ResolveLexicalReference":
			reference, classified := p.referenceOccurrence(e.node)
			if !classified || (e.kind == "ResolveLexicalReference") != reference {
				return false
			}
			slot, ok := p.body.plan.parameters.references[e.node]
			if !ok || slot != e.cell || slot < 0 || slot >= len(r.declarations) || !ast.IsIdentifier(e.node) {
				return false
			}

		case "PutValue":
			if len(p.body.captureDeclarations) == 1 {
				if !ast.IsBinaryExpression(e.node) || e.node.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken || e.a < start || e.a >= pc || r.events[e.a].kind != "Member" || r.events[e.a].node != e.node.AsBinaryExpression().Left || !p.ends(e.b, pc, e.node.AsBinaryExpression().Right) {
					return false
				}
				break
			}
			if !ast.IsBinaryExpression(e.node) || e.node.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken || e.a < start || e.a >= pc || r.events[e.a].kind != "ResolveLexicalReference" || !p.within(r.events[e.a].node, e.node.AsBinaryExpression().Left) || !p.ends(e.b, pc, e.node.AsBinaryExpression().Right) {
				return false
			}
		case "NumberAdd", "NumberSubtract", "NumberMultiply", "NumberDivide", "NumberRemainder", "NumberLessThan", "NumberStrictEqual", "NumberGreaterThan", "NumberLessThanOrEqual", "NumberGreaterThanOrEqual", "NumberStrictNotEqual":
			if !p.numericBinaryInterval(pc) {
				return false
			}
		case "NumberNegate":
			if !p.numericNegateInterval(pc) {
				return false
			}
		case "Typeof":
			if !p.typeofInterval(pc) {
				return false
			}
		case "LogicalNot":
			if !ast.IsPrefixUnaryExpression(e.node) || e.node.AsPrefixUnaryExpression().Operator != ast.KindExclamationToken || !p.ends(e.a, pc, e.node.AsPrefixUnaryExpression().Operand) {
				return false
			}
		case "SelectAnd", "SelectOr", "SelectNullish", "SelectConditional":
			if e.end > end || !p.interval(pc) {
				return false
			}
		case "MergeShortCircuit", "MergeConditional":
			if e.b < start || e.b >= pc || !prefixChoiceSelector(r.events[e.b].kind) || r.events[e.b].node != e.node {
				return false
			}
		default:
			return false
		}
	}
	return true
}
func (p *shortCircuitPopulationProof) bodyTerminal(start, pc int, n *ast.Node, synthetic bool) bool {
	r := p.recipe
	if n == nil || pc < start || pc >= len(r.events) || !p.spend() {
		return false
	}
	e := r.events[pc]
	operand := n
	if !synthetic {
		operand = n.Expression()
		if !ast.IsReturnStatement(n) && !ast.IsThrowStatement(n) {
			return false
		}
	}
	kind := "Return"
	if ast.IsThrowStatement(n) {
		kind = "Throw"
	}
	return e.kind == kind && e.node == n && e.out == pc && p.ends(e.a, pc, operand) && p.bodyExpressionRegion(start, pc, operand)
}
func (p *shortCircuitPopulationProof) qualifyBody(f *closedCallableProof) bool {
	if f == nil || f.arrow == nil || !closedCallableNode(f.arrow) || f.arrow.Body() == nil || f.plan == nil || f.plan.parameters == nil || !f.plan.parameters.validProjection() || f.parameters != len(f.plan.parameters.declarations) || f.entry == nil || f.plan == nil || f.plan.recipe != f.entry || f.plan.parameters == nil || f.plan.parameters.arrow != f.arrow {
		return false
	}
	// Prove the arrow under the unchanged prefix law, then cross only its
	// actual deferred children. The arrow itself does not own its own region.
	p.recipe, p.runtime, p.body = p.candidate.history.recipe, p.candidate.history.runtime, nil
	if !activationParameterProof(f) && !p.occurrence(f.arrow) {
		return false
	}
	for n := f.arrow; n != p.candidate.source.AsNode(); n = n.Parent {
		if !p.spend() {
			return false
		}
		e := p.index.normalOccurrences[n]
		pe := p.index.normalOccurrences[n.Parent]
		if e == nil || pe == nil {
			return false
		}
		expected := pe.callOwner
		if ast.IsCallExpression(pe.node) {
			expected = pe
		}
		if e.callOwner != expected {
			return false
		}
	}
	if !f.captureLayoutValid() || len(f.captureDeclarations) > 0 && p.candidate.history.recipe.binding != nil {
		return false
	}
	for node, slot := range f.captureReferences {
		if !p.spend() || slot != 0 || !p.within(node, f.arrow.Body()) || !ast.IsIdentifier(node) {
			return false
		}
		symbol := p.candidate.checker.GetSymbolAtLocation(node)
		if symbol == nil || len(symbol.Declarations) != 1 || symbol.ValueDeclaration != f.captureDeclarations[0] {
			return false
		}
	}
	for _, d := range f.captureDeclarations {
		if activationParameterProof(f) {
			if !p.spend() || d.Parent == nil || !moduleActivationCaptureCreator(d.Parent) || d != d.Parent.Parameters()[0] {
				return false
			}
			continue
		}
		found := false
		for i, decl := range p.candidate.history.recipe.declarations {
			if !p.spend() {
				return false
			}
			if decl == d {
				found = i < len(p.candidate.history.recipe.constants) && p.candidate.history.recipe.constants[i]
			}
		}
		if !found || !ast.IsVariableDeclaration(d) || (!moduleFunctionDeclaration(f.arrow) && d.End() > f.arrow.Pos()) || ast.GetSourceFileOfNode(d) != p.candidate.source {
			return false
		}
	}
	r := f.entry
	mapping := f.plan.parameters
	if r.prefix || !r.callBody || r.body != f.arrow || r.locals != f.parameters || len(r.declarations) != f.parameters || len(mapping.declarations) != f.parameters || r.registers != len(r.events) || r.locals > len(r.events)/2 {
		return false
	}
	p.recipe, p.runtime, p.body = r, f.plan.runtime, f
	if ast.IsFunctionExpression(f.arrow) {
		d := mapping.erasedThis
		if !p.spend() || !p.runtime[d] || !p.runtime[d.Name()] || !p.bodyOccurrence(d) || !p.bodyOccurrence(d.Name()) {
			return false
		}
		if strictFunctionNumberThrowFinally(f.arrow, mapping) {
			if r.finally == nil {
				return false
			}
		} else {
			body := f.arrow.Body()
			if !ast.IsBlock(body) || len(body.AsBlock().Statements.Nodes) != 1 || !ast.IsReturnStatement(body.AsBlock().Statements.Nodes[0]) || r.finally != nil {
				return false
			}
			operand := body.AsBlock().Statements.Nodes[0].Expression()
			for operand != nil && ast.IsParenthesizedExpression(operand) {
				if !p.spend() {
					return false
				}
				operand = operand.Expression()
			}
			if operand == nil {
				return false
			}
			if ast.IsPropertyAccessExpression(operand) && !ast.IsOptionalChain(operand) && ast.IsIdentifier(operand.Name()) {
				operand = operand.AsPropertyAccessExpression().Expression
				for ast.IsParenthesizedExpression(operand) {
					if !p.spend() {
						return false
					}
					operand = operand.Expression()
				}
			}
			if operand.Kind != ast.KindThisKeyword {
				return false
			}
		}
	}
	if ast.IsGetAccessorDeclaration(f.arrow) && r.finally != nil {
		terminal, _ := literalEmptyFinallyTerminal(f.arrow.Body())
		if terminal == nil || mapping.erasedThis != nil || len(mapping.physical) != 0 || len(mapping.declarations) != 0 {
			return false
		}
	} else if ast.IsGetAccessorDeclaration(f.arrow) {
		body := f.arrow.Body()
		if mapping.erasedThis != nil || len(mapping.physical) != 0 || len(mapping.declarations) != 0 || !ast.IsBlock(body) || len(body.AsBlock().Statements.Nodes) != 1 || !ast.IsReturnStatement(body.AsBlock().Statements.Nodes[0]) || r.finally != nil {
			return false
		}
		operand := body.AsBlock().Statements.Nodes[0].Expression()
		for operand != nil && ast.IsParenthesizedExpression(operand) {
			if !p.spend() {
				return false
			}
			operand = operand.Expression()
		}
		if operand == nil {
			return false
		}
		if !expressionLiteralNode(operand) {
			if !ast.IsPropertyAccessExpression(operand) || ast.IsOptionalChain(operand) || !ast.IsIdentifier(operand.Name()) {
				return false
			}
			base := operand.Expression()
			for ast.IsParenthesizedExpression(base) {
				if !p.spend() {
					return false
				}
				base = base.Expression()
			}
			if base.Kind != ast.KindThisKeyword {
				return false
			}
		}
	}
	prologueEnd := 0
	for i, d := range r.declarations {
		if !p.spend() || mapping.declarations[i] != d || !p.runtime[d] || !p.runtime[d.Name()] || prologueEnd >= len(r.events) {
			return false
		}
		inputPC := prologueEnd
		a := r.events[inputPC]
		if a.kind != "ReadAcquiredArgument" || a.node != d || a.cell != i || a.out != inputPC {
			return false
		}
		prologueEnd++
		selected := inputPC
		if d.Initializer() != nil {
			if mapping.defaultParameter(i) != d || !f.empty || !p.defaultInterval(prologueEnd) {
				return false
			}
			choice, _, ok := defaultChoiceLayout(r, prologueEnd)
			if !ok || choice.a != inputPC || choice.end >= len(r.events) {
				return false
			}
			selected = choice.out
			prologueEnd = choice.end
		}
		if prologueEnd >= len(r.events) {
			return false
		}
		b := r.events[prologueEnd]
		if b.kind != "InitializeCell" || b.node != d || b.cell != i || b.a != selected || b.out != prologueEnd {
			return false
		}
		prologueEnd++
	}

	for node, slot := range mapping.references {
		inBody := node != nil && p.within(node, f.arrow.Body())
		earlierRead := mapping.earlierDefaultRead()
		inEarlierDefault := earlierRead != nil && node == earlierRead && slot == 0
		if !p.spend() || node == nil || !p.runtime[node] || slot < 0 || slot >= len(r.declarations) || !inBody && !inEarlierDefault {
			return false
		}
		symbol := p.candidate.checker.GetSymbolAtLocation(node)
		if symbol == nil || symbol.ValueDeclaration != r.declarations[slot] || len(symbol.Declarations) != 1 {
			return false
		}
	}
	for node, slot := range mapping.references {
		expected := "ReadCell"
		reference, classified := p.referenceOccurrence(node)
		if !classified {
			return false
		}
		if reference {
			expected = "ResolveLexicalReference"
		}
		count := 0
		for _, event := range r.events {
			if !p.spend() {
				return false
			}
			if event.node == node && event.kind == expected && event.cell == slot {
				count++
			}
		}
		if count != 1 {
			return false
		}
	}
	for node := range p.runtime {
		if !p.emittedExpressionOccurrence(node) {
			return false
		}
		if !p.bodyOccurrence(node) {
			return false
		}
	}
	start := prologueEnd
	body := f.arrow.Body()
	if !ast.IsBlock(body) {
		return r.finally == nil && p.bodyTerminal(start, len(r.events)-1, body, true)
	}
	statements := body.AsBlock().Statements.Nodes
	if len(f.captureDeclarations) == 1 {
		if len(statements) == 0 || r.finally != nil {
			return false
		}
		for i, n := range statements {
			if i == len(statements)-1 {
				return ast.IsReturnStatement(n) && p.bodyTerminal(start, len(r.events)-1, n, false)
			}
			if !ast.IsExpressionStatement(n) || !ast.IsBinaryExpression(n.Expression()) || n.Expression().AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
				return false
			}
			end := -1
			for pc := start; pc < len(r.events); pc++ {
				if !p.spend() {
					return false
				}
				if r.events[pc].kind == "PutValue" && r.events[pc].node == n.Expression() {
					end = pc + 1
					break
				}
			}
			if end < 0 || !p.bodyExpressionRegion(start, end, n.Expression()) {
				return false
			}
			start = end
		}
		return false
	}
	if len(statements) != 1 {
		return false
	}
	if r.finally == nil {
		return ast.IsReturnStatement(statements[0]) && p.bodyTerminal(start, len(r.events)-1, statements[0], false)
	}
	plan := r.finally
	if !plan.valid(r) || !ast.IsTryStatement(plan.node) || statements[0] != plan.node || r.events[plan.park].node != plan.node || r.events[plan.route].node != plan.node {
		return false
	}
	t := plan.node.AsTryStatement()
	if t.CatchClause != nil || t.FinallyBlock == nil || len(t.TryBlock.AsBlock().Statements.Nodes) != 1 || !p.bodyTerminal(start, plan.park-1, t.TryBlock.AsBlock().Statements.Nodes[0], false) {
		return false
	}
	start = plan.park + 1
	for i, n := range t.FinallyBlock.AsBlock().Statements.Nodes {
		if !p.spend() {
			return false
		}
		if ast.IsReturnStatement(n) || ast.IsThrowStatement(n) {
			if i != len(t.FinallyBlock.AsBlock().Statements.Nodes)-1 || !p.bodyTerminal(start, plan.route-1, n, false) {
				return false
			}
			start = plan.route
			continue
		}
		if !ast.IsExpressionStatement(n) || !ast.IsBinaryExpression(n.Expression()) || n.Expression().AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
			return false
		}
		end := -1
		for pc := start; pc < plan.route; pc++ {
			if !p.spend() {
				return false
			}
			if r.events[pc].kind == "PutValue" && r.events[pc].node == n.Expression() {
				end = pc + 1
				break
			}
		}
		if end < 0 || !p.bodyExpressionRegion(start, end, n.Expression()) {
			return false
		}
		start = end
	}
	return start == plan.route
}

// finalizedBodyProof validates the immutable result association only. The live
// source/candidate handoff is separate and cannot be reconstructed from it.
func (f *closedCallableProof) finalizedBodyProof(o *languageOwner) bool {
	if f == nil || !f.captureLayoutValid() || f.arrow == nil || !closedCallableNode(f.arrow) || f.plan == nil || f.plan.parameters == nil || !f.plan.parameters.validProjection() || f.parameters != len(f.plan.parameters.declarations) || o == nil || f.namespace != o || f.generation != o.generation || o.disposed || f.source == nil || f.plan == nil || f.plan.recipe != f.entry || f.plan.parameters == nil || f.plan.parameters.arrow != f.arrow || f.mapping != f.plan.parameters || ast.GetSourceFileOfNode(f.arrow) != f.source || f.entry == nil || f.entry.body != f.arrow || f.parameters != len(f.plan.parameters.declarations) || f.parameters != len(f.entry.declarations) {
		return false
	}
	for i, d := range f.entry.declarations {
		if f.plan.parameters.declarations[i] != d {
			return false
		}
	}
	return true
}

func expressionLiteralNode(n *ast.Node) bool {
	if n == nil {
		return false
	}
	switch n.Kind {
	case ast.KindNumericLiteral, ast.KindStringLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return true
	}
	return false
}

// referenceOccurrence authenticates the current scalar reference demand only.
// It does not admit a property, Call or an enclosing environment lookup.
func (p *shortCircuitPopulationProof) referenceOccurrence(n *ast.Node) (bool, bool) {
	for n != nil && n.Parent != nil && ast.IsParenthesizedExpression(n.Parent) {
		if !p.spend() {
			return false, false
		}
		n = n.Parent
	}
	return n != nil && n.Parent != nil && ast.IsBinaryExpression(n.Parent) && n.Parent.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken && n.Parent.AsBinaryExpression().Left == n, true
}
func (p *shortCircuitPopulationProof) emittedExpressionOccurrence(n *ast.Node) bool {
	expected := ""
	if ast.IsTypeOfExpression(n) {
		expected = "Typeof"
	}
	if ast.IsBinaryExpression(n) {
		expected = numberBinaryKind(n.AsBinaryExpression().OperatorToken.Kind)
	}
	if ast.IsPrefixUnaryExpression(n) && n.AsPrefixUnaryExpression().Operator == ast.KindExclamationToken {
		expected = "LogicalNot"
	}
	if ast.IsPrefixUnaryExpression(n) && n.AsPrefixUnaryExpression().Operator == ast.KindMinusToken {
		expected = "NumberNegate"
	}
	if ast.IsBinaryExpression(n) && n.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
		expected = "PutValue"
	}
	if expected == "" {
		return true
	}
	count := 0
	for _, event := range p.recipe.events {
		if !p.spend() {
			return false
		}
		if event.node == n && event.kind == expected {
			count++
		}
	}
	return count == 1
}

// unaryOperandInterval authenticates the same contiguous operand population for
// primitive unary operations. The caller retains its exact operator/node law.
func (p *shortCircuitPopulationProof) unaryOperandInterval(pc int, operand *ast.Node) bool {
	r := p.recipe
	if r == nil || pc < 0 || pc >= len(r.events) || operand == nil || !p.ends(r.events[pc].a, pc, operand) {
		return false
	}
	start, count := pc, 0
	for i, child := range r.events {
		if !p.spend() {
			return false
		}
		if p.within(child.node, operand) {
			if i >= pc {
				return false
			}
			if i < start {
				start = i
			}
			count++
		}
	}
	return count > 0 && count == pc-start
}
