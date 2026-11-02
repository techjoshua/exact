package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceSymbolCase preserves one native MAY hypothesis across exact key roles.
// Source facts and recipe are immutable at entry. input is installed once before
// any semantic event. No active query, frame, evaluator or KEY vector is retained.
type sourceSymbolCase struct {
	authority                    sourceNormalAuthority
	recipe                       *storageRecipe
	facts                        sourceSymbolNativeFacts
	firstPC, lastPC              int
	input                        languageBranch
	proofUsed, allocationReserve int
}

// bindingSymbolWrite recognizes only the complete immutable two-KEY binding
// shape. It grants no alias purity, native identity or execution authority.
// Both preparation and source inventory classification consume this same tuple.
func bindingSymbolWrite(r *storageRecipe) (first, last, put int, ok bool) {
	first, last, put = -1, -1, -1
	if r == nil || r.binding == nil || !r.binding.valid(r) || r.choiceSlots != 0 || r.registers != len(r.events) {
		return
	}
	for pc, e := range r.events {
		if e.out != pc || e.node == nil {
			return first, last, put, false
		}
		if e.kind == "SourceWellKnownIteratorKey" {
			if first < 0 {
				first = pc
			} else if last < 0 {
				last = pc
			} else {
				return first, last, put, false
			}
		}
		if e.kind == "PutValue" {
			if put >= 0 {
				return first, last, put, false
			}
			put = pc
		}
	}
	if first < 0 || last <= first || put != last+3 || put >= r.binding.first.member || !ast.IsComputedPropertyName(r.events[first].node.Parent) || last+2 >= len(r.events) {
		return first, last, put, false
	}
	write := r.events[put]
	if !ast.IsBinaryExpression(write.node) || write.node.Parent == nil || !storageAssignmentStatement(write.node.Parent) {
		return first, last, put, false
	}
	b := write.node.AsBinaryExpression()
	if !ast.IsElementAccessExpression(b.Left) || b.Left.AsElementAccessExpression().ArgumentExpression != r.events[last].node || write.a != last+1 || write.b != last+2 {
		return first, last, put, false
	}
	member, rhs := r.events[last+1], r.events[last+2]
	if member.kind != "Member" || member.node != b.Left || member.key != languageIteratorKey() || member.keyProducerPC != last || member.a != last-1 || last < 2 || r.events[last-1].kind != "GetValue" || r.events[last-2].kind != "ResolveLexicalReference" || r.events[last-1].a != last-2 {
		return first, last, put, false
	}
	if rhs.node != b.Right || !(rhs.kind == "Literal" && b.Right.Kind == ast.KindNumericLiteral || rhs.kind == "CreateClosedCallable" && ast.IsFunctionExpression(b.Right)) {
		return first, last, put, false
	}
	return first, last, put, true
}

// sourceSymbolKeyReady pays all live validation and two standard data reads
// before setting KEY ready. This is conditional on S, not a current-global probe.
func sourceSymbolKeyReady(r *storageRecipe, pc int, b languageBranch, work *languageCopyWork) bool {
	if work == nil {
		return false
	}
	check := func(ok bool) bool { return work.spend(1) && ok }
	if !check(r != nil) || !check(r.symbolCase != nil) || !check(pc >= 0) || !check(pc < len(r.events)) {
		return false
	}
	s := r.symbolCase
	if !check(r.sourceSymbol) || !check(s.facts.first != nil) || !check(s.facts.last != nil) || !check(s.facts.source != nil) || !check(r.events[pc].kind == "SourceWellKnownIteratorKey") || !check(r.events[pc].node != nil) || !check(ast.GetSourceFileOfNode(r.events[pc].node) == s.facts.source) {
		return false
	}
	if !check(s.recipe == r) || !check(b.owner != nil) || !check(s.authority.owner != nil) || !check(s.authority.owner.language == b.owner) || !check(b.owner.live(b)) || !check(b.owner.live(s.input)) || !check(b.generation == s.input.generation) || !check(b.guard == "native Symbol standard") || !check(b.env == s.input.env) || !check(b.cursor >= s.input.cursor) || !check(s.authority.owner.program == s.authority.program) || !check(s.authority.owner.checker == s.authority.checker) || !check(s.authority.generation != nil) || !check(s.authority.generation.active) || !check(s.authority.owner.generation == s.authority.generation) {
		return false
	}
	// Persistent-state ancestry associates this paid read with the issued source
	// origin. Equal guards in another root are not execution authority.
	state := b.state
	for state != nil && state != s.input.state {
		if !work.spend(1) {
			return false
		}
		state = state.previous
	}
	if !check(state == s.input.state) {
		return false
	}
	if pc == s.firstPC {
		if !check(r.events[pc].node == s.facts.first.node) || !check(s.facts.computedName == r.events[pc].node.Parent) {
			return false
		}
	} else {
		if !check(pc == s.lastPC) || !check(s.firstPC < pc) || !check(r.events[pc].node == s.facts.last.node) {
			return false
		}
	}
	// The selected standard global read and the iterator own-data read are two
	// semantic acquisitions, paid separately from all validation comparisons.
	return work.spend(1) && work.spend(1)
}

// Optional private observers cannot grant native authority or increase fuel.
var sourceSymbolObserve func(*storageRecipe, int, int, languageAlternative, []bool, int, *languageCallTargetOrigin)

// storageAssignmentStatement classifies a finite source shape, never entry authority.
func storageAssignmentStatement(s *ast.Node) bool {
	if s == nil || !ast.IsExpressionStatement(s) || !ast.IsBinaryExpression(s.Expression()) {
		return false
	}
	b := s.Expression().AsBinaryExpression()
	if b.OperatorToken.Kind != ast.KindEqualsToken || ast.IsOptionalChain(b.Left) {
		return false
	}
	if ast.IsPropertyAccessExpression(b.Left) {
		return ast.IsIdentifier(b.Left.Expression()) && (ast.IsIdentifier(b.Right) || expressionLiteralNode(b.Right))
	}
	if !ast.IsElementAccessExpression(b.Left) || !ast.IsIdentifier(b.Left.Expression()) {
		return false
	}
	key := b.Left.AsElementAccessExpression().ArgumentExpression
	if key == nil || !ast.IsPropertyAccessExpression(key) || ast.IsOptionalChain(key) || !ast.IsIdentifier(key.Expression()) || key.Expression().Text() != "Symbol" || key.Name().Text() != "iterator" {
		return false
	}
	return b.Right.Kind == ast.KindNumericLiteral || ast.IsFunctionExpression(b.Right)
}
