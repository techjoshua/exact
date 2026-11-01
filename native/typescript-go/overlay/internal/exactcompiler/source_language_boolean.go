package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"unsafe"
)

// issuedBooleanIdentity checks internal producer discipline, not untrusted input.
// Paid registers provide primitive authority. No AST or identity registry is built.
func issuedBooleanIdentity(o *languageOwner, id languageID) bool {
	return id.owner == o && id.serial > 0 && id.serial <= o.next
}

// acquiredBoolean observes only a paid payload on its live predecessor branch.
// Unknown is never false. Trace is inert producer provenance, not an evaluator.
func acquiredBoolean(b languageBranch, v languageValue) (bool, bool) {
	if b.owner == nil || !b.owner.live(b) || v.text != "" {
		return false, false
	}
	if v.number != (numberPayload{}) {
		n, known := numericNumberPayload(v)
		return n != 0 && !n.IsNaN(), known
	}
	if v.undefined {
		return false, v.object == nil && v.callable == nil && (v.node == nil || ast.IsIdentifier(v.node))
	}
	if v.object != nil {
		return true, v.callable == nil && v.node == nil && issuedBooleanIdentity(b.owner, v.object.id)
	}
	if v.callable != nil {
		f := v.callable
		return true, issuedBooleanIdentity(b.owner, f.id) && f.proof != nil && f.proof.empty && f.proof.arrow != nil && closedCallableNode(f.proof.arrow) && (v.node == nil || v.node == f.proof.arrow) && f.captures != nil && issuedBooleanIdentity(b.owner, f.captures.id) && f.captures.outer == nil
	}
	if v.node == nil {
		return false, false
	}
	switch v.node.Kind {
	case ast.KindNullKeyword, ast.KindFalseKeyword:
		return false, true
	case ast.KindTrueKeyword:
		return true, true
	case ast.KindStringLiteral:
		return v.node.Text() != "", true
	case ast.KindNumericLiteral:
		n, known := numericNumberPayload(v)
		return n != 0, known
	}
	return false, false
}

// booleanArtifactCost prepays a full maximum token slab on every conversion,
// twice its bytes plus 8 KiB for allocator rounding and one trace. Arena.New caps
// requests at 256 elements. First-use factory storage is additionally reserved.
// The scheduler owns event/copy work. This allowance is settled only once.
func (o *languageOwner) booleanArtifactCost() int {
	bytes := 512*int(unsafe.Sizeof(ast.Token{})) + 8192 + int(unsafe.Sizeof(languageSourceTrace{}))
	if o.numericFactory == nil {
		bytes += int(unsafe.Sizeof(ast.NodeFactory{}))
	}
	return (bytes+255)/256 + 16
}

// logicalNot consumes the explicit ready operand, never a previous event value.
// It knows no completion schema and performs no storage transition or callback.
// A named refusal supplies no value. Reservation precedes factory/node allocation.
func (o *languageOwner) logicalNot(b languageBranch, operand languageValue, origin *ast.Node, work *languageCopyWork) (languageValue, string) {
	if o == nil || o != b.owner {
		return languageValue{}, "LogicalNot ownership"
	}
	truth, known := acquiredBoolean(b, operand)
	if !known {
		return languageValue{}, "LogicalNot:ToBoolean"
	}
	return o.booleanArtifact(!truth, origin, work)
}

// booleanArtifact owns the unchanged paid Boolean token/factory/trace allocation.
// The caller supplies a known answer only after its own operation validation.
func (o *languageOwner) booleanArtifact(answer bool, origin *ast.Node, work *languageCopyWork) (languageValue, string) {
	if work == nil || !work.spend(o.booleanArtifactCost()) {
		return languageValue{}, "LogicalNot artifact budget"
	}
	if o.numericFactory == nil {
		o.numericFactory = ast.NewNodeFactory(ast.NodeFactoryHooks{})
	}
	kind := ast.KindTrueKeyword
	if !answer {
		kind = ast.KindFalseKeyword
	}
	value := languageValue{node: o.numericFactory.NewToken(kind)}
	if origin != nil {
		value.trace = &languageSourceTrace{node: origin}
	}
	return value, ""
}
