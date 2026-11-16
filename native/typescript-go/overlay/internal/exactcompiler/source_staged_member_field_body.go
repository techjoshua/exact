package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// These descriptions retain the original factory's purpose across query expiry.
// They confer neither an invocation nor a field value, Get, currentness or APPLIED.
type sourceStagedDescriptorBodySource struct {
	field                    string
	descriptor, body, member *ast.Node
	stored                   bool
}
type sourceStagedFieldBodyTransfer struct {
	request           sourceStagedOperationRequest
	relation          sourceStagedDescriptorBodySource
	operation, region *ast.Node
}
type sourceStagedMemberFieldBody struct {
	request, parent   sourceStagedOperationRequest
	relation          sourceStagedDescriptorBodySource
	operation, region *ast.Node
	cut, physicalCut  sourceRelativeCut
	generation        *projectGeneration
	installation      *sourceNativeInstallationMutationSource
}

func (work *callableEffectWork) describeStagedMemberFieldBody(q *sourceValueQuery, t sourceStagedFieldBodyTransfer) sourceStagedMemberFieldBody {
	b := q.stagedMember
	d := sourceStagedMemberFieldBody{request: t.request, parent: b.request, relation: t.relation, operation: t.operation, region: t.region, cut: b.observation, physicalCut: b.observation, generation: b.generation}
	d.physicalCut.operation, d.physicalCut.use = b.read.operation, b.read.use
	// Only the selected direct inert literal domain can discharge discovery.
	// Other factory relationships retain their debt and keep SOURCE pending.
	n := work.operationRecipes[b.get.stagedEffects.request.producer].nativeGet
	if header, current := work.nativeInstallationMutationSourceFor(n); current && t.relation.stored && t.relation.descriptor == header.installation.descriptor.expression {
		d.installation = header
	}
	return d
}
func validStagedMemberFieldBody(d sourceStagedMemberFieldBody, parent sourceStagedOperationRequest, cut sourceRelativeCut, generation *projectGeneration) bool {
	field, _, contextual := stagedFieldMemberParent(parent)
	if !contextual || generation == nil || d.generation != generation || !sameOperationRequest(d.parent, parent) || d.cut != cut || d.operation == nil || d.region == nil || d.relation.descriptor == nil || !ast.IsObjectLiteralExpression(d.relation.descriptor) || !nodeInside(d.operation, d.region) || stagedDescriptorFieldIndex(d.relation.field) < 0 || d.request.producer.kind != relativeDemandEffects || d.request.producer.selector.field != d.relation.field || d.request.producer.selector.occurrence != d.relation.descriptor || d.request.consumer != parent.consumer || d.request.cut != parent.cut || d.request.inputs != nil || d.physicalCut.operation != cut.operation || d.physicalCut.reading != cut.reading || d.physicalCut.initializing != cut.initializing || d.physicalCut.returning != cut.returning || d.physicalCut.invoking != cut.invoking {
		return false
	}
	if d.physicalCut.use != cut.use && !(cut.use == nil && d.physicalCut.use == cut.operation && ast.IsFunctionLike(parent.consumer)) {
		return false
	}
	if d.installation == nil {
		return true
	}
	h := d.installation
	r := d.relation
	return validNativeInstallationMutationSource(h) && h.generation == generation && field.producer.operation == h.request.producer.operation && field.producer.declaration == h.request.producer.declaration && field.consumer == h.request.consumer && field.producer.selector.occurrence == h.installation.descriptor.expression && r.stored && r.descriptor == h.installation.descriptor.expression && r.body != nil && r.member != nil && ast.IsPropertyAssignment(r.member) && r.member.Parent == r.descriptor && r.member.AsPropertyAssignment().Initializer == r.body && !ast.IsComputedPropertyName(r.member.Name()) && callableNameText(r.member.Name()) == r.field && (ast.IsFunctionExpression(r.body) || ast.IsArrowFunction(r.body)) && nodeInside(d.region, r.body) && sameOperationRequest(nativeDescriptorFieldRequest(&sourceStagedNativeGetSource{request: h.request, descriptorGet: r.descriptor}, r.field), d.request)
}

func sameStagedMemberFieldBody(a, b sourceStagedMemberFieldBody) bool {
	return sameOperationRequest(a.request, b.request) && sameOperationRequest(a.parent, b.parent) && a.relation == b.relation && a.operation == b.operation && a.region == b.region && a.cut == b.cut && a.physicalCut == b.physicalCut && a.generation == b.generation && sameNativeInstallationMutationSource(a.installation, b.installation)
}
func cloneStagedMemberFieldBodies(in []sourceStagedMemberFieldBody) []sourceStagedMemberFieldBody {
	out := append([]sourceStagedMemberFieldBody(nil), in...)
	for i := range out {
		out[i].installation = cloneNativeInstallationMutationSource(out[i].installation)
	}
	return out
}
func appendStagedMemberFieldBody(in []sourceStagedMemberFieldBody, d sourceStagedMemberFieldBody) []sourceStagedMemberFieldBody {
	for _, prior := range in {
		if sameStagedMemberFieldBody(prior, d) {
			return in
		}
	}
	return append(in, d)
}
func sameStagedMemberFieldBodies(a, b []sourceStagedMemberFieldBody) bool {
	return len(a) == len(b) && operationPrefix(a, b, sameStagedMemberFieldBody)
}
func validStagedMemberFieldBodies(in []sourceStagedMemberFieldBody, parent sourceStagedOperationRequest, cut sourceRelativeCut, generation *projectGeneration, required []sourceStagedOperationRequest) bool {
	for _, d := range in {
		if !validStagedMemberFieldBody(d, parent, cut, generation) || !operationContainsRequest(required, d.request) {
			return false
		}
	}
	return true
}
func stagedMemberFieldBodyRequired(in []sourceStagedMemberFieldBody, r sourceStagedOperationRequest) bool {
	for _, d := range in {
		if sameOperationRequest(d.request, r) {
			return true
		}
	}
	return false
}

// stagedMemberFieldBodySourceOwned authenticates original producer ownership.
// It deliberately does not require or grant local X, closure, current Get or APPLIED.
func (work *callableEffectWork) stagedMemberFieldBodySourceOwned(c *sourceStagedMemberCoverage, r sourceStagedOperationRequest) bool {
	if c == nil || c.generation != work.operationGeneration || !c.generation.active || !validNativeGetRequest(work.operationRecipes[r.producer], r) {
		return false
	}
	for _, d := range c.fieldBodies {
		if sameOperationRequest(d.request, r) && (!validStagedMemberFieldBody(d, d.parent, c.cut, c.generation) || d.installation != nil && !work.nativeInstallationMutationCurrent(d.installation)) {
			return false
		}
	}
	return stagedMemberFieldBodyRequired(c.fieldBodies, r)
}
func stagedMemberCoverageBodyRefinement(a, b *sourceStagedMemberCoverage) bool {
	if a == nil || b == nil {
		return true // Preserve the existing noncoverage refinement contract.
	}
	return operationPrefix(a.fieldBodies, b.fieldBodies, sameStagedMemberFieldBody) && (!a.extracted || sameStagedMemberFieldBodies(a.fieldBodies, b.fieldBodies))
}
