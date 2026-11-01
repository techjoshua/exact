package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// ownedGetAssociation is an issued immutable identity. Detached values retain
// only this token and immutable receipt populations, never the live request.
type ownedGetAssociation struct{ serial int }

// ownedGetPopulation retains rowless completions independently of value loops.
// prefix is evidence, not another successful alternative of receipt.
type ownedGetPopulation struct {
	association *ownedGetAssociation
	components  []*ownedGetContribution
	receipt     *languageReceipt
	prefix      *ownedGetPopulation
	boundary    *ast.Node
}
type ownedGetRow struct {
	population *ownedGetPopulation
	position   int
}

// ownedGetRequest belongs exclusively to the actual caller's I slot. G borrows
// it only during admission/execution. Release freezes postentry disposition.
type ownedGetRequest struct {
	association       *ownedGetAssociation
	proof             *closedOwnGetterProof
	recipe            *storageRecipe
	caller            *sourceValueInputs
	inner             *sourceNormalOperation
	entered, released bool
	population        *ownedGetPopulation
	outer             *sourceNormalOperation
}

func mergeOwnedGets(dst *[]*ownedGetPopulation, src []*ownedGetPopulation) {
	for _, p := range src {
		found := false
		for _, old := range *dst {
			found = found || old == p
		}
		if !found {
			*dst = append(*dst, p)
		}
	}
}
func projectOwnedGet(p *ownedGetPopulation) sourceResultObservation {
	out := sourceResultObservation{owned: p.receipt, ownedGets: []*ownedGetPopulation{p}, effects: sourceEffectsAccounted}
	if p == nil || p.receipt == nil {
		return out
	}
	rows, ok := p.receipt.project()
	if !ok {
		out.incomplete = true
		return out
	}
	for i, a := range rows {
		if a.completion == languageNormal || a.completion == languageReturn {
			out.values = append(out.values, sourceObservedValue{value: sourceValue{number: a.value.number, node: a.value.node, undefined: a.value.undefined, forwarded: languagePrimitiveForwarding(a.value), ownedGetRow: &ownedGetRow{population: p, position: i}}})
		} else if a.completion == languageResidual {
			out.incomplete = true
		}
	}
	return out
}

// viewGetterReturn consumes only this installed getter's Return at its boundary.
// It preserves the historical receipt and every nonnormal completion and history.
func viewGetterReturn(p *ownedGetPopulation, body *ast.Node) ([]languageAlternative, bool) {
	if p == nil || p.receipt == nil {
		return nil, false
	}
	rows, ok := p.receipt.project()
	if !ok || p.boundary != body {
		return nil, false
	}
	out := append([]languageAlternative(nil), rows...)
	for i := range out {
		if out[i].completion == languageReturn {
			out[i].completion = languageNormal
		}
	}
	return out, true
}

// tryOwnedGet is the actual-slot adapter. Preentry refusal returns whole legacy
// ownership. Once entered, all exits are represented and never restart traversal.
func (q *sourceValueQuery) tryOwnedGet(n *ast.Node, s *sourceNormalOperation) (accessorCandidates, bool) {
	if q.inputs == nil {
		return accessorCandidates{}, false
	}
	if ast.IsPropertyAccessExpression(n) || ast.IsElementAccessExpression(n) {
		if prior := q.inputs.operations[n.Expression()]; prior != nil && prior.ownedRequest != nil {
			return q.consumeOwnedOuter(n, s, prior.ownedRequest), true
		}
	}
	proof, ok := q.discoverClosedOwnGetter(n, s)
	if !ok {
		return accessorCandidates{}, false
	}
	r := &ownedGetRequest{association: &ownedGetAssociation{serial: 1}, proof: proof, caller: q.inputs, inner: s}
	get := &sourceGetInputs{operation: n, receiver: sourceValue{node: proof.literal}, propertyKey: proof.innerKey, ownedRequest: r}
	// Recipe validation is nonexecuting and precedes the sole entered transition.
	validation := &sourceValueInputs{declaration: proof.getter, get: get}
	recipe, ok := q.storageBodyRecipe(proof.getter, validation)
	if !ok {
		return accessorCandidates{}, false
	}
	r.recipe = recipe
	s.ownedRequest = r
	r.entered = true
	result := accessorCandidates{}
	observed := q.acquireGetResult(proof.getter, get, acquiredCallableScope{}, &result)
	if len(observed.ownedGets) == 0 {
		// An entered operation cannot return to legacy even if its producer refused.
		branch := q.owner.language.root()
		receipt := q.owner.language.receipt(branch, []languageAlternative{storageResidual(branch, "owned getter producer missing")})
		observed = projectOwnedGet(&ownedGetPopulation{association: r.association, receipt: receipt, boundary: proof.getter})
	}
	r.population = observed.ownedGets[0]
	result.ownedGets = observed.ownedGets
	result.values = nil
	result.callableScopes = nil
	for _, v := range observed.values {
		result.values = append(result.values, v.value)
	}
	result.valueIncomplete = result.valueIncomplete || observed.incomplete
	sealOwnedGetContribution(q.inputs.ownedFact, &result)
	return result, true
}

// consumeOwnedOuter authenticates the exact actual caller, I slot, receiver edge,
// O slot, key and generation before consuming terminal B_out. Mismatch retains a
// paid prefix and an O-local residual. No literal reconstruction is possible.
func (q *sourceValueQuery) consumeOwnedOuter(n *ast.Node, s *sourceNormalOperation, r *ownedGetRequest) accessorCandidates {
	if r.outer != nil && r.outer != s {
		return accessorCandidates{ownedGets: []*ownedGetPopulation{r.population}, opaque: true, valueIncomplete: true}
	}
	p := r.population
	key, static := ownGetStaticKey(n)
	valid := !r.released && r.entered && r.caller == q.inputs && r.caller.operationLifetime != nil && r.caller.operations[r.proof.inner] == r.inner && q.inputs.operations[n] == s && q.operation != nil && !q.operation.outputOnly && q.operation.node == n && n == r.proof.outer && n.Expression() == r.proof.inner && static && key == r.proof.outerKey && r.proof.authority.valid(q) && p != nil && p.association == r.association
	rows, ok := viewGetterReturn(p, r.proof.getter)
	if !ok {
		rows = nil
	}
	if len(rows) == 0 {
		b := q.owner.language.root()
		rows = []languageAlternative{storageResidual(b, "owned getter population unavailable")}
	}
	local := accessorCandidates{}
	out := languageSequence(rows, func(a languageAlternative) []languageAlternative {
		if !valid {
			local.opaque, local.valueIncomplete = true, true
			local.ownedLocalCauses = append(local.ownedLocalCauses, "owned Get association")
			return []languageAlternative{storageResidual(a.branch, "owned Get association")}
		}
		if !q.charge(&local, n) {
			return []languageAlternative{storageResidual(a.branch, "owned Get budget")}
		}
		o := a.branch.owner
		work := languageCopyWork{remaining: q.remaining}
		child := o.getCopyReference(a.branch, o.member(a.branch, a.value, languageStringKey(key)), &work)
		q.remaining -= work.used
		// The shared Get may return an object. This frontend currently publishes
		// only scalars, so retain the paid value/state as pending projection.
		if child.completion == languageNormal && child.value.object != nil {
			child.completion = languageResidual
			child.pending = languageNormal
			child.pendingValue = child.value
			child.pendingReturnBoundary = child.returnBoundary
			child.returnBoundary = languageID{}
			child.value = languageValue{}
			child.remaining = "owned scalar output projection"
			child.obligations = append(child.obligations, child.remaining)
		}
		if child.completion == languageResidual {
			local.opaque, local.valueIncomplete = true, true
			local.ownedLocalCauses = append(local.ownedLocalCauses, "owned outer residual")
		}
		return []languageAlternative{child}
	})
	receipt := q.owner.language.receipt(p.receipt.input, out)
	suffix := &ownedGetPopulation{association: r.association, receipt: receipt, prefix: p, boundary: r.proof.getter}
	r.outer = s
	observed := projectOwnedGet(suffix)
	result := normalOutputCandidates(observed)
	result.ownedGets = observed.ownedGets
	result.ownedLocalCauses = local.ownedLocalCauses
	for _, a := range out {
		if a.completion == languageResidual {
			result.opaque = true
		}
	}
	// Effective uncertainty includes the prefix. Only locally executed work is pending.
	sealOwnedGetDelta(q.inputs.ownedFact, &result, &local)
	return result
}
