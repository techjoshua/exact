package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/stringutil"
	"unicode/utf8"
)

// Comparison uses existing acquired payloads, native Number semantics and Boolean issuance.
// This normalized work estimate is advisory and does not count CPU instructions.
const numberComparisonWork = 26

func numberBinaryKind(operator ast.Kind) string {
	switch operator {
	case ast.KindMinusToken:
		return "NumberSubtract"
	case ast.KindAsteriskToken:
		return "NumberMultiply"
	case ast.KindSlashToken:
		return "NumberDivide"
	case ast.KindPercentToken:
		return "NumberRemainder"
	case ast.KindPlusToken:
		return "NumberAdd"
	case ast.KindLessThanToken:
		return "NumberLessThan"
	case ast.KindEqualsEqualsEqualsToken:
		return "NumberStrictEqual"
	case ast.KindGreaterThanToken:
		return "NumberGreaterThan"
	case ast.KindLessThanEqualsToken:
		return "NumberLessThanOrEqual"
	case ast.KindGreaterThanEqualsToken:
		return "NumberGreaterThanOrEqual"
	case ast.KindExclamationEqualsEqualsToken:
		return "NumberStrictNotEqual"
	}
	return ""
}
func numberBinaryOperator(kind string) ast.Kind {
	switch kind {
	case "NumberSubtract":
		return ast.KindMinusToken
	case "NumberMultiply":
		return ast.KindAsteriskToken
	case "NumberDivide":
		return ast.KindSlashToken
	case "NumberRemainder":
		return ast.KindPercentToken
	case "NumberAdd":
		return ast.KindPlusToken
	case "NumberLessThan":
		return ast.KindLessThanToken
	case "NumberStrictEqual":
		return ast.KindEqualsEqualsEqualsToken
	case "NumberGreaterThan":
		return ast.KindGreaterThanToken
	case "NumberLessThanOrEqual":
		return ast.KindLessThanEqualsToken
	case "NumberGreaterThanOrEqual":
		return ast.KindGreaterThanEqualsToken
	case "NumberStrictNotEqual":
		return ast.KindExclamationEqualsEqualsToken
	}
	return ast.KindUnknown
}

// numberComparisonOperator recognizes the existing comparison events. Ordered
// operators require Number payloads. Strict equality refines admitted actual values.
func numberComparisonOperator(operator ast.Kind) bool {
	switch operator {
	case ast.KindLessThanToken, ast.KindEqualsEqualsEqualsToken,
		ast.KindGreaterThanToken, ast.KindLessThanEqualsToken,
		ast.KindGreaterThanEqualsToken, ast.KindExclamationEqualsEqualsToken:
		return true
	}
	return false
}

// acquiredStrictCategory refines existing Boolean shape knowledge for equality.
// Both operands must pass the complete refinement before a type-difference answer.
// ast.Kind values here are transient category tags, never TypeScript type facts.
func acquiredStrictCategory(b languageBranch, v languageValue, work *languageCopyWork) (ast.Kind, bool) {
	if work == nil {
		return ast.KindUnknown, false
	}
	if _, known := acquiredBoolean(b, v); !known {
		return ast.KindUnknown, false
	}
	switch {
	case v.number != (numberPayload{}):
		return ast.KindNumericLiteral, true
	case v.undefined:
		return ast.KindUndefinedKeyword, true
	case v.object != nil:
		if !v.object.unique || !allocatedLanguageObject(b, v.object, work) {
			return ast.KindUnknown, false
		}
		return ast.KindObjectKeyword, true
	case v.callable != nil:
		f := v.callable
		// Accessor descriptor callables are an implicit Get target, not JS data.
		if !ast.IsArrowFunction(f.proof.arrow) && !ast.IsFunctionExpression(f.proof.arrow) {
			return ast.KindUnknown, false
		}
		// Creation occurrence is supplied by the authenticated producer/transfer chain.
		// Finalized proof is a local generation/source association, not Call permission.
		if f.proof.entry == nil {
			return ast.KindUnknown, false
		}
		work.spend(1)
		for range f.proof.entry.declarations {
			work.spend(1)
		}
		if !f.proof.finalizedBodyProof(b.owner) {
			return ast.KindUnknown, false
		}
		return ast.KindObjectKeyword, true
	}
	switch v.node.Kind {
	case ast.KindTrueKeyword, ast.KindFalseKeyword:
		return ast.KindBooleanKeyword, true
	case ast.KindNullKeyword:
		return ast.KindNullKeyword, true
	case ast.KindStringLiteral:
		flags := v.node.AsStringLiteral().TokenFlags
		if flags&(ast.TokenFlagsIsInvalid|ast.TokenFlagsUnterminated) != 0 || !strictStringValid(v.node.Text(), work) {
			return ast.KindUnknown, false
		}
		return ast.KindStringLiteral, true
	}
	return ast.KindUnknown, false
}

// strictStringValid checks the entire parsed payload. It preserves native lone
// surrogate sentinels and distinguishes invalid bytes from a valid U+FFFD.
// Callers must finish validation before any known mismatch or different-type answer.
func strictStringValid(text string, work *languageCopyWork) bool {
	for len(text) > 0 {
		r, n := stringutil.DecodeJSStringRune(text)
		if n <= 0 || n > len(text) {
			return false
		}
		work.spend(n)
		if r == utf8.RuneError && n == 1 {
			return false
		}
		text = text[n:]
	}
	return true
}

// strictStringCursor walks already validated native Text as UTF-16 code units.
// It is local comparison state, not another stored value carrier or parser.
type strictStringCursor struct {
	text       string
	pending    uint16
	hasPending bool
}

func (c *strictStringCursor) next(work *languageCopyWork) (uint16, bool) {
	if c.hasPending {
		c.hasPending = false
		return c.pending, true
	}
	if len(c.text) == 0 {
		return 0, false
	}
	r, n := stringutil.DecodeJSStringRune(c.text)
	work.spend(n)
	c.text = c.text[n:]
	if r > 0xffff {
		high, low := stringutil.CodePointToSurrogatePair(r)
		c.pending, c.hasPending = uint16(low), true
		return uint16(high), true
	}
	return uint16(r), true
}
func strictStringEqual(left, right string, work *languageCopyWork) bool {
	l, r := strictStringCursor{text: left}, strictStringCursor{text: right}
	for {
		a, ak := l.next(work)
		b, bk := r.next(work)
		if !ak || !bk {
			return ak == bk
		}
		if a != b {
			return false
		}
	}
}

// strictObjectEqual relies on actual issued records, never origin/proof syntax.
// Callables and ordinary objects share JS Object type. Duplicate ids on distinct
// records violate producer discipline and cannot become known equality.
func strictObjectEqual(left, right languageValue) (bool, bool) {
	if left.object != nil && right.object != nil {
		if left.object.id == right.object.id && left.object != right.object {
			return false, false
		}
		return left.object == right.object, true
	}
	if left.callable != nil && right.callable != nil {
		if left.callable.id == right.callable.id && left.callable != right.callable {
			return false, false
		}
		return left.callable == right.callable, true
	}
	var object *languageObject
	var callable *languageCallable
	if left.object != nil {
		object, callable = left.object, right.callable
	} else {
		object, callable = right.object, left.callable
	}
	if object == nil || callable == nil || object.id == callable.id {
		return false, false
	}
	return false, true
}

// acquiredComparison consumes explicit paid VALUEs on the common current branch.
// Callable occurrence ancestry is a producer/transfer precondition, not inferred
// from an id bound or a finalized body proof. No callbacks or AST evaluation occur.
func acquiredComparison(b languageBranch, left, right languageValue, operator ast.Kind, work *languageCopyWork) (bool, bool) {
	if b.owner == nil || !b.owner.live(b) {
		return false, false
	}

	if operator == ast.KindEqualsEqualsEqualsToken || operator == ast.KindExclamationEqualsEqualsToken {
		lk, lok := acquiredStrictCategory(b, left, work)
		if !lok {
			return false, false
		}
		rk, rok := acquiredStrictCategory(b, right, work)
		if !rok {
			return false, false
		}
		answer := false
		if lk == rk {
			switch lk {
			case ast.KindNumericLiteral:
				l, _ := numericNumberPayload(left)
				r, _ := numericNumberPayload(right)
				answer = l == r
			case ast.KindBooleanKeyword:
				answer = left.node.Kind == right.node.Kind
			case ast.KindNullKeyword, ast.KindUndefinedKeyword:
				answer = true
			case ast.KindStringLiteral:
				answer = strictStringEqual(left.node.Text(), right.node.Text(), work)
			case ast.KindObjectKeyword:
				var known bool
				answer, known = strictObjectEqual(left, right)
				if !known {
					return false, false
				}
			default:
				return false, false
			}
		}
		if operator == ast.KindExclamationEqualsEqualsToken {
			answer = !answer
		}
		return answer, true
	}
	l, lok := numericNumberPayload(left)
	r, rok := numericNumberPayload(right)
	if !lok || !rok {
		return false, false
	}
	switch operator {
	case ast.KindLessThanToken:
		return l < r, true
	case ast.KindGreaterThanToken:
		return l > r, true
	case ast.KindLessThanEqualsToken:
		return l <= r, true
	case ast.KindGreaterThanEqualsToken:
		return l >= r, true
	}
	return false, false
}

// numericBinaryReady excludes ready References and control/KEY slots. Source proof
// separately authenticates exact operator and producer intervals before entry.
func numericBinaryReady(r *storageRecipe, pc int, ready []bool) bool {
	if r == nil || pc < 0 || pc >= len(r.events) {
		return false
	}
	e := r.events[pc]
	if e.out != pc || e.out >= len(ready) || numberBinaryOperator(e.kind) == ast.KindUnknown || e.node == nil || !ast.IsBinaryExpression(e.node) || e.node.AsBinaryExpression().OperatorToken.Kind != numberBinaryOperator(e.kind) {
		return false
	}
	for _, reg := range [2]int{e.a, e.b} {
		if reg < 0 || reg >= pc || reg >= len(ready) || !ready[reg] || !expressionValueProducer(r.events[reg].kind) || storageKeyRegister(r, reg) {
			return false
		}
	}
	return true
}

// comparisonSuccessor preserves header authority, not predecessor contributions.
// Domain uncertainty uses the existing unavailable-expression disposition so the
// finalizer post-step owner cannot overwrite the actual left pending VALUE.
func comparisonSuccessor(prior languageAlternative, left, right languageValue, origin *ast.Node, operator ast.Kind, work *languageCopyWork, disposition *expressionSelectionDisposition) languageAlternative {
	if prior.completion != languageNormal {
		return prior
	}
	if !shortCircuitCanonical(prior) {
		return shortCircuitCut(prior, "Comparison invalid Normal pending metadata", languageValue{})
	}
	if !numberComparisonOperator(operator) {
		return shortCircuitCut(prior, "Comparison operator unavailable", languageValue{})
	}
	if work == nil || !work.spend(numberComparisonWork) {
		return shortCircuitCut(prior, "Comparison decision budget", languageValue{})
	}
	answer, known := acquiredComparison(prior.branch, left, right, operator, work)
	if !known {
		if disposition != nil {
			*disposition = expressionPredicateUnavailable
		}
		reason := "Comparison numeric operand unavailable"
		if operator == ast.KindEqualsEqualsEqualsToken || operator == ast.KindExclamationEqualsEqualsToken {
			reason = "Comparison strict operand unavailable"
		}
		return shortCircuitCut(prior, reason, left)
	}
	value, reason := prior.branch.owner.booleanArtifact(answer, origin, work)
	if reason != "" {
		return shortCircuitCut(prior, "Comparison artifact budget", languageValue{})
	}
	out := shortCircuitHeader(prior)
	out.value = value
	return out
}

// numericBinaryInterval extends the current bounded population proof. A selector's
// destination and exclusive end are distinct. No ready sibling is substitutable.
func (p *shortCircuitPopulationProof) numericBinaryInterval(pc int) bool {
	r := p.recipe
	if !p.spend() || r == nil || pc < 0 || pc >= len(r.events) {
		return false
	}
	e := r.events[pc]
	op := numberBinaryOperator(e.kind)
	if op == ast.KindUnknown || e.out != pc || e.node == nil || !ast.IsBinaryExpression(e.node) || !p.runtime[e.node] || e.node.AsBinaryExpression().OperatorToken.Kind != op || e.a < 0 || e.a >= pc || e.b < 0 || e.b >= pc {
		return false
	}
	b := e.node.AsBinaryExpression()
	producer := r.events[e.a]
	leftEnd := e.a + 1
	if prefixChoiceSelector(producer.kind) {
		if !p.interval(e.a) {
			return false
		}
		leftEnd = producer.end
	}
	if leftEnd <= 0 || leftEnd > pc || !p.ends(e.a, leftEnd, b.Left) || !p.ends(e.b, pc, b.Right) {
		return false
	}
	start, leftCount := leftEnd, 0
	for i, child := range r.events {
		if !p.spend() {
			return false
		}
		lhs, rhs := p.within(child.node, b.Left), p.within(child.node, b.Right)
		if rhs != (i >= leftEnd && i < pc) {
			return false
		}
		if lhs {
			if i >= leftEnd {
				return false
			}
			if i < start {
				start = i
			}
			leftCount++
		}
	}
	return leftCount > 0 && leftCount == leftEnd-start
}

// numericBinaryOccurrence is used at the existing prefix owner even without choices.
// It authenticates one emitted operator result, rather than trusting syntax alone.
func (p *shortCircuitPopulationProof) numericBinaryOccurrence(node *ast.Node) bool {
	found := -1
	for pc, e := range p.recipe.events {
		if !p.spend() {
			return false
		}
		if e.node == node && numberBinaryOperator(e.kind) != ast.KindUnknown {
			if found >= 0 {
				return false
			}
			found = pc
		}
	}
	return found >= 0 && p.numericBinaryInterval(found)
}
