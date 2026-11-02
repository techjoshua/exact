package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"unsafe"
)

// acquiredTypeof observes an already acquired VALUE. It neither reads object
// properties nor invokes a callable. Primitive/object categories come from the
// existing acquired-category owner, never a type or source-literal prediction.
// Callable construction proof is distinct from permission to invoke its body.
func acquiredTypeof(b languageBranch, v languageValue, work *languageCopyWork) (string, bool) {
	if b.owner == nil || !b.owner.live(b) || work == nil || !work.spend(1) || v.text != "" {
		return "", false
	}
	if v.callable != nil {
		f := v.callable
		if v.number != (numberPayload{}) || v.undefined || v.object != nil || !issuedBooleanIdentity(b.owner, f.id) || f.proof == nil || f.proof.arrow == nil || (!ast.IsArrowFunction(f.proof.arrow) && !ast.IsFunctionExpression(f.proof.arrow) && !moduleFunctionDeclaration(f.proof.arrow)) || (v.node != nil && v.node != f.proof.arrow) || f.captures == nil || !issuedBooleanIdentity(b.owner, f.captures.id) {
			return "", false
		}
		return "function", f.proof.finalizedCallableCategory(b.owner, work)
	}
	category, known := acquiredStrictCategory(b, v, work)
	if !known {
		return "", false
	}
	switch category {
	case ast.KindNumericLiteral:
		return "number", true
	case ast.KindUndefinedKeyword:
		return "undefined", true
	case ast.KindObjectKeyword, ast.KindNullKeyword:
		return "object", true
	case ast.KindBooleanKeyword:
		return "boolean", true
	case ast.KindStringLiteral:
		return "string", true
	}
	return "", false
}

// typeofReady excludes References, KEYs and unready/control registers. Completed
// population separately binds the exact source operand interval before entry.
func typeofReady(r *storageRecipe, pc int, ready []bool) bool {
	if r == nil || pc < 0 || pc >= len(r.events) {
		return false
	}
	e := r.events[pc]
	return e.kind == "Typeof" && e.out == pc && pc < len(ready) && e.node != nil && ast.IsTypeOfExpression(e.node) && e.a >= 0 && e.a < pc && e.a < len(ready) && ready[e.a] && expressionValueProducer(r.events[e.a].kind) && !storageKeyRegister(r, e.a)
}

// typeofSuccessor leaves abrupt/residual operands untouched. Sequence owns paid
// effects once. A Normal conversion preserves every header/history association.
func typeofSuccessor(prior languageAlternative, operand languageValue, origin *ast.Node, work *languageCopyWork, disposition *expressionSelectionDisposition) languageAlternative {
	if prior.completion != languageNormal {
		return prior
	}
	if !shortCircuitCanonical(prior) {
		return shortCircuitCut(prior, "typeof invalid Normal pending metadata", operand)
	}
	name, known := acquiredTypeof(prior.branch, operand, work)
	if !known {
		if disposition != nil {
			*disposition = expressionPredicateUnavailable
		}
		return shortCircuitCut(prior, "typeof represented VALUE unavailable", operand)
	}
	o := prior.branch.owner
	// Reserve the same bounded factory slab as other scalar issuers, plus the
	// maximum typeof string payload. This estimate never controls eligibility.
	cost := (512*int(unsafe.Sizeof(ast.StringLiteral{}))+8192+int(unsafe.Sizeof(languageSourceTrace{}))+255)/256 + 16
	if o.numericFactory == nil {
		cost += (int(unsafe.Sizeof(ast.NodeFactory{})) + 255) / 256
	}
	if !work.spend(cost) {
		return shortCircuitCut(prior, "typeof artifact budget", operand)
	}
	if o.numericFactory == nil {
		o.numericFactory = ast.NewNodeFactory(ast.NodeFactoryHooks{})
	}
	out := prior
	out.objects, out.effects, out.obligations = nil, nil, nil
	out.value = languageValue{node: o.numericFactory.NewStringLiteral(name, ast.TokenFlagsNone), trace: &languageSourceTrace{node: origin}}
	return out
}

// finalizedCallableCategory distinguishes construction from body entry. The
// ordinary proof retains its existing validation. A creation-only inner arrow
// instead uses its original finalized source/generation/free-set association.
// Neither alternative authorizes invocation or inspects captured values.
func (p *closedCallableProof) finalizedCallableCategory(o *languageOwner, work *languageCopyWork) bool {
	if p == nil || o == nil || o.disposed || work == nil {
		return false
	}
	if p.entry != nil {
		work.spend(len(p.entry.declarations) + 1)
		return p.finalizedBodyProof(o)
	}
	work.spend(len(p.captureDeclarations) + len(p.captureReferences) + 1)
	if p.namespace != o || p.generation != o.generation || p.source == nil || p.arrow == nil || ast.GetSourceFileOfNode(p.arrow) != p.source || len(p.captureDeclarations) != 1 || p.captureDeclarations[0] == nil || !ast.IsParameterDeclaration(p.captureDeclarations[0]) {
		return false
	}
	return activationCaptureLayout(p, p.captureDeclarations[0].Parent)
}
