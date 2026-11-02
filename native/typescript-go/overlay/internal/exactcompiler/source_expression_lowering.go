package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// standardUndefinedSymbol is shared discovery classification, not a paid value
// or permission to resolve another global. Callers retain their local-first path.
func standardUndefinedSymbol(c *checker.Checker, node *ast.Node, symbol *ast.Symbol) bool {
	return c != nil && node != nil && ast.IsIdentifier(node) && node.Text() == "undefined" && symbol != nil && c.GetUndefinedSymbol() != nil && symbol == c.GetUndefinedSymbol()
}

// closedParameterMap is frozen after capture auditing. Its identity connects
// exact parameter occurrences to the detached recipe, never to runtime values.
type closedParameterMap struct {
	arrow        *ast.Node
	physical     []*ast.Node
	erasedThis   *ast.Node
	declarations []*ast.Node
	references   map[*ast.Node]int
}

// expressionContext carries normal parameter, capture and receiver domains.
// Builders/query capabilities are borrowed during discovery and never retained
// in the returned recipe or a semantic receipt.
type expressionContext struct {
	captures       *closedCallableProof
	parameters     *closedParameterMap
	runtime        map[*ast.Node]bool
	receiverBody   bool
	receiverMember *ast.Node
}
type expressionLowerer struct {
	*storageBuilder
	context expressionContext
}

func (p *expressionLowerer) mark(n *ast.Node) bool {
	if n == nil || !p.discover() {
		return false
	}
	p.context.runtime[n] = true
	return true
}
func (p *expressionLowerer) binding(n *ast.Node) (int, bool) {
	if !ast.IsIdentifier(n) {
		return 0, false
	}
	if m := p.context.parameters; m != nil {
		if m.arrow == nil || len(m.declarations) != p.recipe.locals {
			return 0, false
		}
		slot, ok := m.references[n]
		if !ok || slot < 0 || slot >= len(m.declarations) || !m.validProjection() {
			return 0, false
		}
		return slot, true
	}
	return 0, false
}

// scalarDefaultParameter classifies the finite numeric-default/direct-return
// shapes. The second default may only read the original earlier formal. Checker
// mapping, completed population and actual inputs separately authenticate entry.
func (m *closedParameterMap) scalarDefaultParameter(slot int) *ast.Node {
	if m == nil || !m.validProjection() || !ast.IsArrowFunction(m.arrow) || len(m.declarations) < 1 || len(m.declarations) > 2 || slot < 0 || slot >= len(m.declarations) {
		return nil
	}
	body := unwrapSourceCallableReference(m.arrow.Body())
	if body == nil || !ast.IsIdentifier(body) {
		return nil
	}
	for i, d := range m.declarations {
		if d.Type() == nil || d.Type().Kind != ast.KindNumberKeyword || d.Initializer() == nil || d.QuestionToken() != nil || d.AsParameterDeclaration().DotDotDotToken != nil || ast.HasDecorators(d) {
			return nil
		}
		if i == 0 && !ast.IsNumericLiteral(d.Initializer()) && m.nullDefaultMember() == nil || i == 1 && !ast.IsIdentifier(d.Initializer()) {
			return nil
		}
	}
	return m.declarations[slot]
}

// defaultParameter is finite source admission. Actual acquired arguments,
// selected default execution and current property descriptors remain separate.
func (m *closedParameterMap) defaultParameter(slot int) *ast.Node {
	if member := m.objectDefaultMember(); member != nil && slot == 1 {
		return m.declarations[1]
	}
	return m.scalarDefaultParameter(slot)
}

// objectDefaultMember names only the earlier required formal's direct read.
// The type annotation bounds syntax, never proves a DATA property or a value.
func (m *closedParameterMap) objectDefaultMember() *ast.Node {
	if m == nil || !m.validProjection() || !ast.IsArrowFunction(m.arrow) || len(m.declarations) != 2 {
		return nil
	}
	input, output := m.declarations[0], m.declarations[1]
	body := unwrapSourceCallableReference(m.arrow.Body())
	if input.Initializer() != nil || input.QuestionToken() != nil || input.AsParameterDeclaration().DotDotDotToken != nil || ast.HasDecorators(input) || input.Type() == nil || !ast.IsTypeLiteralNode(input.Type()) || output.Type() == nil || output.Type().Kind != ast.KindNumberKeyword || output.QuestionToken() != nil || output.AsParameterDeclaration().DotDotDotToken != nil || ast.HasDecorators(output) || body == nil || !ast.IsIdentifier(body) || body.Text() != output.Name().Text() {
		return nil
	}
	fields := input.Type().AsTypeLiteralNode().Members.Nodes
	if len(fields) != 1 || !ast.IsPropertySignatureDeclaration(fields[0]) || !ast.IsIdentifier(fields[0].Name()) || fields[0].Name().Text() != "value" || fields[0].Type() == nil || fields[0].QuestionToken() != nil {
		return nil
	}
	n := output.Initializer()
	if n == nil {
		return nil
	}
	// This finite syntax union is admission only. The actual Get payload and
	// canonical nullish selector separately prove the selected runtime branch.
	if ast.IsBinaryExpression(n) && n.AsBinaryExpression().OperatorToken.Kind == ast.KindQuestionQuestionToken {
		binary := n.AsBinaryExpression()
		if !ast.IsNumericLiteral(binary.Right) || binary.Right.Text() != "7" || !ast.IsUnionTypeNode(fields[0].Type()) {
			return nil
		}
		members := fields[0].Type().AsUnionTypeNode().Types.Nodes
		if len(members) != 3 {
			return nil
		}
		kinds := 0
		for _, member := range members {
			bit := 0
			switch member.Kind {
			case ast.KindNumberKeyword:
				bit = 1
			case ast.KindUndefinedKeyword:
				bit = 2
			case ast.KindLiteralType:
				if member.AsLiteralTypeNode().Literal.Kind == ast.KindNullKeyword {
					bit = 4
				}
			}
			if bit == 0 || kinds&bit != 0 {
				return nil
			}
			kinds |= bit
		}
		if kinds != 7 {
			return nil
		}
		n = binary.Left
	} else if fields[0].Type().Kind != ast.KindNumberKeyword {
		return nil
	}
	if n == nil || !ast.IsPropertyAccessExpression(n) || ast.IsOptionalChain(n) || !ast.IsIdentifier(n.Name()) || n.Name().Text() != "value" || !ast.IsIdentifier(n.Expression()) || n.Expression().Text() != input.Name().Text() {
		return nil
	}
	return n
}

// earlierDefaultRead is the exact ReadLocal donor, not an argument substitution.
func (m *closedParameterMap) earlierDefaultRead() *ast.Node {
	if member := m.objectDefaultMember(); member != nil {
		return member.Expression()
	}
	if d := m.scalarDefaultParameter(1); d != nil {
		return d.Initializer()
	}
	return nil
}

// formalMember admits only the two selected capture-free formal read roles.
func (m *closedParameterMap) formalMember(n *ast.Node) bool {
	return m.conditionalMember(n) || n != nil && m.objectDefaultMember() == n
}

// nullDefaultMember names the one erased null receiver/default Get role. The
// assertion is syntax only. Actual Literal/Reference/Get issuance proves failure.
func (m *closedParameterMap) nullDefaultMember() *ast.Node {
	if m == nil || !m.validProjection() || !ast.IsArrowFunction(m.arrow) || len(m.declarations) != 1 {
		return nil
	}
	d := m.declarations[0]
	n := d.Initializer()
	if n == nil || !ast.IsPropertyAccessExpression(n) || ast.IsOptionalChain(n) || !ast.IsIdentifier(n.Name()) || n.Name().Text() != "value" {
		return nil
	}
	base := n.Expression()
	if !ast.IsParenthesizedExpression(base) {
		return nil
	}
	assertion := base.Expression()
	if !ast.IsAsExpression(assertion) || assertion.AsAsExpression().Type == nil || assertion.AsAsExpression().Type.Kind != ast.KindAnyKeyword || assertion.Expression().Kind != ast.KindNullKeyword {
		return nil
	}
	return n
}

// conditionalMember names only the exact formal read in one closed arrow.
// This syntax map grants no object identity, descriptor or selected execution.
func (m *closedParameterMap) conditionalMember(n *ast.Node) bool {
	if m == nil || !m.validProjection() || !ast.IsArrowFunction(m.arrow) || len(m.declarations) != 2 || n == nil || !ast.IsPropertyAccessExpression(n) || ast.IsOptionalChain(n) || !ast.IsIdentifier(n.Name()) {
		return false
	}
	body := unwrapSourceCallableReference(m.arrow.Body())
	if body == nil || !ast.IsConditionalExpression(body) {
		return false
	}
	branch := body.AsConditionalExpression()
	if branch.WhenTrue != n || !expressionLiteralNode(branch.WhenFalse) || !ast.IsIdentifier(branch.Condition) || !ast.IsIdentifier(n.Expression()) {
		return false
	}
	predicate, hasPredicate := m.references[branch.Condition]
	receiver, hasReceiver := m.references[n.Expression()]
	return hasPredicate && predicate == 0 && hasReceiver && receiver == 1
}

func (p *expressionLowerer) reference(n *ast.Node) (int, bool) {
	if !p.mark(n) {
		return 0, false
	}
	if ast.IsParenthesizedExpression(n) {
		return p.reference(n.Expression())
	}
	if (p.context.captures != nil && len(p.context.captures.captureDeclarations) == 1 || p.context.receiverBody && n == p.context.receiverMember || p.context.captures != nil && p.context.captures.empty && (p.context.parameters.formalMember(n) || p.context.parameters.nullDefaultMember() == n)) && (ast.IsPropertyAccessExpression(n) || ast.IsElementAccessExpression(n)) {
		var base *ast.Node
		key := ""
		keyNode := (*ast.Node)(nil)
		if ast.IsOptionalChain(n) {
			return 0, false
		}
		if ast.IsPropertyAccessExpression(n) {
			m := n.AsPropertyAccessExpression()
			base = m.Expression
			key = m.Name().Text()
			if (p.context.receiverBody || p.context.captures != nil && len(p.context.captures.captureDeclarations) == 1) && !p.mark(m.Name()) {
				return 0, false
			}
		} else {
			m := n.AsElementAccessExpression()
			base = m.Expression
			if m.ArgumentExpression == nil {
				return 0, false
			}
			if m.ArgumentExpression.Kind == ast.KindStringLiteral {
				if p.context.captures != nil && len(p.context.captures.captureDeclarations) == 1 && !p.mark(m.ArgumentExpression) {
					return 0, false
				}
				key = m.ArgumentExpression.Text()
			} else {
				keyNode = m.ArgumentExpression
			}
		}
		v, ok := p.value(base)
		if !ok {
			return 0, false
		}
		if keyNode != nil {
			return 0, false
		}

		return p.event(storageEvent{kind: "Member", node: n, a: v, key: languageStringKey(key), keyProducerPC: -1}), !p.exhausted
	}
	if !ast.IsIdentifier(n) {
		return 0, false
	}
	position, ok := p.binding(n)
	if !ok {
		return 0, false
	}
	return p.event(storageEvent{kind: "ResolveLexicalReference", node: n, cell: position}), !p.exhausted
}

func (p *expressionLowerer) value(n *ast.Node) (int, bool) {
	if !p.mark(n) {
		return 0, false
	}
	if p.context.receiverBody && n.Kind != ast.KindThisKeyword && !ast.IsParenthesizedExpression(n) && n != p.context.receiverMember {
		return 0, false
	}
	if n.Kind == ast.KindThisKeyword && p.context.receiverBody {
		return p.event(storageEvent{kind: "ReadThisValue", node: n}), !p.exhausted
	}
	switch n.Kind {
	case ast.KindNumericLiteral, ast.KindStringLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return p.event(storageEvent{kind: "Literal", node: n, value: languageValue{node: n}}), !p.exhausted
	}
	if ast.IsParenthesizedExpression(n) {
		return p.value(n.Expression())
	}
	if ast.IsAsExpression(n) && p.context.parameters != nil {
		member := p.context.parameters.nullDefaultMember()
		if member != nil && member.Expression().Expression() == n {
			return p.value(n.Expression())
		}
	}
	if ast.IsTypeOfExpression(n) {
		operand, ok := p.value(n.Expression())
		if !ok {
			return 0, false
		}
		return p.event(storageEvent{kind: "Typeof", node: n, a: operand}), !p.exhausted
	}
	if ast.IsPrefixUnaryExpression(n) && (n.AsPrefixUnaryExpression().Operator == ast.KindExclamationToken || n.AsPrefixUnaryExpression().Operator == ast.KindMinusToken) {
		operand, ok := p.value(n.AsPrefixUnaryExpression().Operand)
		if !ok {
			return 0, false
		}
		kind := "LogicalNot"
		if n.AsPrefixUnaryExpression().Operator == ast.KindMinusToken {
			kind = "NumberNegate"
		}
		return p.event(storageEvent{kind: kind, node: n, a: operand}), !p.exhausted
	}
	if ast.IsIdentifier(n) {
		if f := p.context.captures; f != nil && len(f.captureDeclarations) == 1 {
			if slot, ok := f.captureReferences[n]; ok && slot == 0 {
				return p.event(storageEvent{kind: "ReadCapturedCell", node: n, cell: slot}), !p.exhausted
			}
		}
		// A closed formal VALUE is already identified by the audited slot map.
		// It has no Reference consumer. Keep reference materialization for
		// actual reference demand, including assignment before its RHS.
		if p.context.parameters != nil {
			slot, ok := p.binding(n)
			if !ok {
				return 0, false
			}
			return p.event(storageEvent{kind: "ReadCell", node: n, cell: slot}), !p.exhausted
		}
		ref, ok := p.reference(n)
		if ok {
			return p.event(storageEvent{kind: "GetValue", node: n, a: ref}), !p.exhausted
		}
		// Only prefix VALUE demand can use this existing standard-symbol law.
		// Body globals remain subject to capture/parameter authority. A local
		// named undefined has already resolved above and keeps its actual cell.
		return 0, false
	}

	if (p.context.captures != nil && len(p.context.captures.captureDeclarations) == 1 || p.context.receiverBody && n == p.context.receiverMember || p.context.captures != nil && p.context.captures.empty && (p.context.parameters.formalMember(n) || p.context.parameters.nullDefaultMember() == n)) && (ast.IsPropertyAccessExpression(n) || ast.IsElementAccessExpression(n)) {
		ref, ok := p.reference(n)
		if !ok {
			return 0, false
		}
		return p.event(storageEvent{kind: "GetValue", node: n, a: ref}), !p.exhausted
	}

	if ast.IsConditionalExpression(n) {
		return p.conditionalOperand(n)
	}
	if ast.IsBinaryExpression(n) {
		b := n.AsBinaryExpression()
		switch b.OperatorToken.Kind {
		case ast.KindAmpersandAmpersandToken, ast.KindBarBarToken, ast.KindQuestionQuestionToken:
			return p.shortCircuitOperand(n, b.OperatorToken.Kind, b.Left, b.Right)
		case ast.KindPlusToken, ast.KindMinusToken, ast.KindAsteriskToken, ast.KindSlashToken, ast.KindPercentToken, ast.KindLessThanToken, ast.KindEqualsEqualsEqualsToken, ast.KindGreaterThanToken, ast.KindLessThanEqualsToken, ast.KindGreaterThanEqualsToken, ast.KindExclamationEqualsEqualsToken:
			left, ok := p.value(b.Left)
			if !ok {
				return 0, false
			}
			right, ok := p.value(b.Right)
			if !ok {
				return 0, false
			}
			return p.event(storageEvent{kind: numberBinaryKind(b.OperatorToken.Kind), node: n, a: left, b: right}), !p.exhausted
		case ast.KindCommaToken:
			if _, ok := p.value(b.Left); !ok {
				return 0, false
			}
			return p.value(b.Right)
		case ast.KindEqualsToken:
			ref, ok := p.reference(b.Left)
			if !ok {
				return 0, false
			}
			rhs, ok := p.value(b.Right)
			if !ok {
				return 0, false
			}
			return p.event(storageEvent{kind: "PutValue", node: n, a: ref, b: rhs}), !p.exhausted
		}
	}
	return 0, false
}

// shortCircuitOperand is discovery only. Both syntax arms must qualify before
// ownership. One checked scalar bounds all runtime frames, with no scratch stack.
func (p *expressionLowerer) shortCircuitOperand(node *ast.Node, operator ast.Kind, left, right *ast.Node) (int, bool) {
	kind := ""
	switch operator {
	case ast.KindAmpersandAmpersandToken:
		kind = "SelectAnd"
	case ast.KindBarBarToken:
		kind = "SelectOr"
	case ast.KindQuestionQuestionToken:
		kind = "SelectNullish"
	default:
		return 0, false
	}
	lhs, ok := p.value(left)
	if !ok {
		return 0, false
	}
	if !p.discover() || p.recipe.choiceSlots == int(^uint(0)>>1) {
		p.exhausted = true
		return 0, false
	}
	p.recipe.choiceSlots++
	for i := 0; i < 3; i++ {
		if !p.discover() {
			return 0, false
		}
	}
	selectPC := len(p.recipe.events)
	dest := p.event(storageEvent{kind: kind, node: node, a: lhs})
	entry := len(p.recipe.events)
	rhs, ok := p.value(right)
	if !ok {
		return 0, false
	}
	merge := len(p.recipe.events)
	p.event(storageEvent{kind: "MergeShortCircuit", node: node, a: rhs, b: dest})
	for i := 0; i < 3; i++ {
		if !p.discover() {
			return 0, false
		}
	}
	end := len(p.recipe.events)
	if p.exhausted || selectPC >= entry || entry >= merge || merge >= end || dest < 0 {
		return 0, false
	}
	p.recipe.events[selectPC].entry = entry
	p.recipe.events[selectPC].merge = merge
	p.recipe.events[selectPC].end = end
	return dest, true
}

// conditionalOperand closes condition and both arms before publishing a recipe.
// Labels/counts spend sticky discovery. No semantic identities or frames exist.
func (p *expressionLowerer) conditionalOperand(node *ast.Node) (int, bool) {
	if !ast.IsConditionalExpression(node) {
		return 0, false
	}
	c := node.AsConditionalExpression()
	condition, ok := p.value(c.Condition)
	if !ok {
		return 0, false
	}
	if !p.discover() || p.recipe.choiceSlots == int(^uint(0)>>1) {
		p.exhausted = true
		return 0, false
	}
	p.recipe.choiceSlots++
	for i := 0; i < 3; i++ {
		if !p.discover() {
			return 0, false
		}
	}
	s := len(p.recipe.events)
	d := p.event(storageEvent{kind: "SelectConditional", node: node, a: condition})
	entry := len(p.recipe.events)
	yes, ok := p.value(c.WhenTrue)
	if !ok {
		return 0, false
	}
	mt := len(p.recipe.events)
	p.event(storageEvent{kind: "MergeConditional", node: node, a: yes, b: d})
	no, ok := p.value(c.WhenFalse)
	if !ok {
		return 0, false
	}
	mf := len(p.recipe.events)
	p.event(storageEvent{kind: "MergeConditional", node: node, a: no, b: d})
	for i := 0; i < 3; i++ {
		if !p.discover() {
			return 0, false
		}
	}
	end := len(p.recipe.events)
	if p.exhausted || d != s || entry != s+1 || entry >= mt || mt+1 >= mf || end != mf+1 {
		return 0, false
	}
	p.recipe.events[s].entry = entry
	p.recipe.events[s].merge = mt
	p.recipe.events[s].end = end
	return d, true
}

// validProjection binds every runtime slot to one complete physical parameter
// sequence. Erased TypeScript this is structural provenance, never a cell.
func (m *closedParameterMap) validProjection() bool {
	if m == nil || !closedCallableNode(m.arrow) || len(m.physical) != len(m.arrow.Parameters()) {
		return false
	}
	if ast.IsGetAccessorDeclaration(m.arrow) {
		return len(m.physical) == 0 && len(m.declarations) == 0 && len(m.references) == 0 && m.erasedThis == nil
	}
	offset := 0
	if ast.IsFunctionExpression(m.arrow) {
		if len(m.physical) == 0 || m.erasedThis != m.physical[0] {
			return false
		}
		d := m.erasedThis
		if d == nil || d.Parent != m.arrow || !ast.IsParameterDeclaration(d) || !ast.IsIdentifier(d.Name()) || d.Name().Text() != "this" || d.Name().Parent != d || d.Type() == nil || d.Type().Parent != d || d.Initializer() != nil || d.QuestionToken() != nil || d.AsParameterDeclaration().DotDotDotToken != nil || ast.HasDecorators(d) {
			return false
		}
		offset = 1
	} else if m.erasedThis != nil {
		return false
	}
	if len(m.declarations)+offset != len(m.physical) {
		return false
	}
	for i, d := range m.physical {
		if d == nil || m.arrow.Parameters()[i] != d || d.Parent != m.arrow {
			return false
		}
		if i >= offset && (m.declarations[i-offset] != d || !ast.IsIdentifier(d.Name()) || d.Name().Text() == "this") {
			return false
		}
	}
	return true
}
