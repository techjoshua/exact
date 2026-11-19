package exactcompiler

import (
	"math"
	"regexp"
	"unsafe"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/jsnum"
)

// numberPayload is comparable semantic content. Presence separates an unavailable
// value from +0, and integer bits keep NaN reflexive for structural association.
// JavaScript numeric equality is separately owned by acquiredNumberComparison.
// Only paid literal ingress and the single numeric issuer create this payload.
// External bit-observable Number producers are not admitted by this contract.
type numberPayload struct {
	bits    uint64
	present bool
}

const canonicalNumberNaN uint64 = 0x7ff8000000000000

func numberPayloadOf(n jsnum.Number) numberPayload {
	bits := math.Float64bits(float64(n))
	if n.IsNaN() {
		bits = canonicalNumberNaN
	}
	return numberPayload{bits: bits, present: true}
}
func (p numberPayload) value() (jsnum.Number, bool) {
	if !p.present {
		return 0, false
	}
	n := jsnum.Number(math.Float64frombits(p.bits))
	if n.IsNaN() && p.bits != canonicalNumberNaN {
		return 0, false
	}
	return n, true
}

// numericArtifactCost remains the advisory artifact estimate at its existing
// owner. It neither certifies allocation nor restricts the Number domain.
func (o *languageOwner) numericArtifactCost() int {
	bytes := 512*int(unsafe.Sizeof(ast.NumericLiteral{})) + 8192
	if o.numericFactory == nil {
		bytes += int(unsafe.Sizeof(ast.NodeFactory{}))
	}
	return (bytes+255)/256 + 16
}

// numberPayloadText gates actual normalized unsigned finite source literal Text,
// not source spelling, output renderer trees, or a later acquired value. jsnum is
// the only conversion owner. Source nonfinite literals remain unadmitted.
var numberPayloadText = regexp.MustCompile(`^(?:(?:0|[1-9][0-9]*)(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$`)

func finiteNonnegativeNumber(n jsnum.Number) bool {
	return !n.IsNaN() && !n.IsInf() && !math.Signbit(float64(n))
}

// acquireLiteralValue is called by the existing paid Literal register boundary
// or the already acquired legacy literal-output adapter. Discovery does not call
// it. Complete VALUE transfers never repeat parsing or reinstall authority.
func acquireLiteralValue(v languageValue) (languageValue, bool) {
	if v.number.present {
		_, known := numericNumberPayload(v)
		return v, known
	}
	if v.number != (numberPayload{}) {
		return languageValue{}, false
	}
	if v.node == nil || v.node.Kind != ast.KindNumericLiteral {
		return v, true
	}
	if v.text != "" || v.undefined || v.object != nil || v.callable != nil || v.node.AsNumericLiteral().TokenFlags&(ast.TokenFlagsIsInvalid|ast.TokenFlagsUnterminated) != 0 || !numberPayloadText.MatchString(v.node.Text()) {
		return languageValue{}, false
	}
	n := jsnum.FromString(v.node.Text())
	if !finiteNonnegativeNumber(n) {
		return languageValue{}, false
	}
	v.number = numberPayloadOf(n)
	return v, true
}

// numericNumberPayload consumes only acquired semantic content. A source/render
// node is retained identity, never a fallback evaluator when presence is missing.
func numericNumberPayload(v languageValue) (jsnum.Number, bool) {
	if v.text != "" || v.undefined || v.object != nil || v.callable != nil || !numericValueNode(v.node) {
		return 0, false
	}
	return v.number.value()
}

// numericValueNode checks only carrier category, never renderer semantics. Signed
// and special trees can only be issued unparented output. Their bits originate
// at the private paired issuer, not by evaluating this tree or trusting a type.
func numericValueNode(node *ast.Node) bool {
	if node == nil {
		return false
	}
	if node.Kind == ast.KindNumericLiteral {
		return true
	}
	if node.Parent != nil {
		return false
	}
	if ast.IsPrefixUnaryExpression(node) {
		return node.AsPrefixUnaryExpression().Operator == ast.KindMinusToken
	}
	return ast.IsParenthesizedExpression(node) && ast.IsBinaryExpression(node.Expression()) && node.Expression().AsBinaryExpression().OperatorToken.Kind == ast.KindSlashToken
}

// numericNumberArtifact issues the renderer and payload atomically from the same
// Number. Generated divisions are inert output, not source grammar or a decoder.
// Rendering uses no global binding, including under shadowed NaN/Infinity names.
func (o *languageOwner) numericNumberArtifact(n jsnum.Number, origin *ast.Node) (languageValue, string) {
	if o == nil || o.disposed {
		return languageValue{}, "Number artifact ownership"
	}
	payload := numberPayloadOf(n)
	n, _ = payload.value()
	if o.numericFactory == nil {
		o.numericFactory = ast.NewNodeFactory(ast.NodeFactoryHooks{})
	}
	f := o.numericFactory
	literal := func(text string) *ast.Node { return f.NewNumericLiteral(text, ast.TokenFlagsNone) }
	division := func(numerator string) *ast.Node {
		return f.NewParenthesizedExpression(f.NewBinaryExpression(nil, literal(numerator), nil, f.NewToken(ast.KindSlashToken), literal("0")))
	}
	var node *ast.Node
	switch {
	case n.IsNaN():
		node = division("0")
	case n.IsInf():
		node = division("1")
		if math.Signbit(float64(n)) {
			node = f.NewPrefixUnaryExpression(ast.KindMinusToken, node)
		}
	case math.Signbit(float64(n)):
		node = f.NewPrefixUnaryExpression(ast.KindMinusToken, literal(jsnum.Number(-n).String()))
	default:
		node = literal(n.String())
	}
	v := languageValue{number: payload, node: node}
	if origin != nil {
		v.trace = &languageSourceTrace{node: origin}
	}
	return v, ""
}

// numericUint32Artifact is the genuine array descriptor refinement. Assignment
// can return original -0 while this separately issued descriptor is canonical +0.
func (o *languageOwner) numericUint32Artifact(n uint32, origin *ast.Node) languageValue {
	v, _ := o.numericNumberArtifact(jsnum.Number(n), origin)
	return v
}

func numericNegateReady(r *storageRecipe, pc int, ready []bool) bool {
	if r == nil || pc < 0 || pc >= len(r.events) {
		return false
	}
	e := r.events[pc]
	return e.kind == "NumberNegate" && e.out == pc && e.out < len(ready) && e.node != nil && ast.IsPrefixUnaryExpression(e.node) && e.node.AsPrefixUnaryExpression().Operator == ast.KindMinusToken && e.a >= 0 && e.a < pc && e.a < len(ready) && ready[e.a] && expressionValueProducer(r.events[e.a].kind)
}

// negateSuccessor preserves all nonnormal/family metadata and consumes only its
// explicit ready VALUE. Unknown operands retain potential coercion work without
// executing ToPrimitive. Work reporting is advisory at the existing work owner.
func negateSuccessor(prior languageAlternative, operand languageValue, origin *ast.Node, work *languageCopyWork, disposition *expressionSelectionDisposition) languageAlternative {
	if prior.completion != languageNormal {
		return prior
	}
	if prior.branch.owner == nil || !prior.branch.owner.live(prior.branch) {
		return shortCircuitCut(prior, "NumberNegate ownership", languageValue{})
	}
	if !shortCircuitCanonical(prior) {
		return shortCircuitCut(prior, "NumberNegate invalid Normal pending metadata", languageValue{})
	}
	if work == nil {
		return shortCircuitCut(prior, "NumberNegate work context unavailable", languageValue{})
	}
	work.spend(1)
	n, known := numericNumberPayload(operand)
	if !known {
		if disposition != nil {
			*disposition = expressionPredicateUnavailable
		}
		return shortCircuitCut(prior, "NumberNegate numeric operand unavailable", operand)
	}
	work.spend(prior.branch.owner.numericArtifactCost())
	out := shortCircuitHeader(prior)
	out.value, _ = prior.branch.owner.numericNumberArtifact(-n, origin)
	return out
}
