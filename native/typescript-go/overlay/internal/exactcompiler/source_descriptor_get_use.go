package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceDescriptorGetUse describes the original Effects owner's use of one
// member Get. It cannot supply the Get's Effects, descriptor contents, complete
// source provenance or a normal language value. Only the live member issuer
// may lend it; detached recipe descriptions retain no query or borrow.
type sourceDescriptorGetUse struct {
	operation, consumer *ast.Node
	kind                sourceDescriptorGetUseKind
	parent              sourceStagedOperationRequest
	cut                 sourceRelativeCut
	generation          *projectGeneration
}

type sourceDescriptorGetUseKind uint8

const (
	descriptorFullSource sourceDescriptorGetUseKind = iota
	descriptorStrictComparisonEffects
	descriptorTypeofEffects
)

// descriptorNoncoercingGetUse classifies only the immediate semantic operand.
// Passing this predicate requests local Get Effects; it never accounts them.
// Assignments, aliases, returned values and every unsupported use retain the
// complete SOURCE contract even when a later operation happens to be typeof.
func descriptorNoncoercingGetUse(operation *ast.Node) (*ast.Node, sourceDescriptorGetUseKind) {
	if operation == nil || !(ast.IsPropertyAccessExpression(operation) || ast.IsElementAccessExpression(operation)) {
		return nil, descriptorFullSource
	}
	read, write := accessorEvaluationMode(operation)
	if !read || write {
		return nil, descriptorFullSource
	}
	operand := operation
	for operand.Parent != nil && unwrapSourceCallableReference(operand.Parent) == operation {
		operand = operand.Parent
	}
	consumer := operand.Parent
	if consumer == nil {
		return nil, descriptorFullSource
	}
	if ast.IsTypeOfExpression(consumer) && consumer.Expression() == operand {
		return consumer, descriptorTypeofEffects
	}
	if ast.IsBinaryExpression(consumer) {
		binary := consumer.AsBinaryExpression()
		if (binary.OperatorToken.Kind == ast.KindEqualsEqualsEqualsToken || binary.OperatorToken.Kind == ast.KindExclamationEqualsEqualsToken) && (binary.Left == operand || binary.Right == operand) {
			return consumer, descriptorStrictComparisonEffects
		}
	}
	return nil, descriptorFullSource
}

// withDescriptorGetEffectsUse is called by original source Get/effect owners,
// before the real traversal. A query with no matching live member publisher
// simply keeps the full SOURCE demand. The existing issuer's self check makes
// a copied query, nested unrelated Get or restored interval ineligible.
func (q *sourceValueQuery) withDescriptorGetEffectsUse(operation *ast.Node, evaluate func()) {
	if q == nil {
		evaluate()
		return
	}
	b := q.stagedMember
	consumer, kind := descriptorNoncoercingGetUse(operation)
	if b == nil || consumer == nil || kind == descriptorFullSource || b.issuer != q || b.owner != q.owner || q.owner == nil || q.owner.program == nil || b.generation != q.owner.generation || b.generation == nil || !b.generation.active || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || b.publish == nil || b.finish == nil || b.request.producer.operation != operation || b.request.consumer != q.effectOwner || q.reading != operation || q.owner.program.GetSourceFile(ast.GetSourceFileOfNode(operation).FileName()) != ast.GetSourceFileOfNode(operation) {
		evaluate()
		return
	}
	prior := b.descriptorUse
	b.descriptorUse = &sourceDescriptorGetUse{operation: operation, consumer: consumer, kind: kind, parent: b.request, cut: q.relativeInputCut(operation), generation: b.generation}
	defer func() { b.descriptorUse = prior }()
	evaluate()
}

func validDescriptorGetUse(use *sourceDescriptorGetUse, parent sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	if use == nil || use.generation == nil || !sameOperationRequest(use.parent, parent) || use.operation != parent.producer.operation || use.cut != cut {
		return false
	}
	consumer, kind := descriptorNoncoercingGetUse(use.operation)
	return consumer == use.consumer && kind != descriptorFullSource && kind == use.kind
}

// The same local Get Effects are needed by complete source consumers. This
// default description grants no narrower value-use interest: it only lets the
// real lexical Get retain its prototype/body children before strong provenance
// is considered. Existing native/normal Get variants remain separate.
func validDescriptorRecordGetUse(use *sourceDescriptorGetUse, parent sourceStagedOperationRequest, cut sourceRelativeCut) bool {
	if use == nil || use.kind != descriptorFullSource {
		return validDescriptorGetUse(use, parent, cut)
	}
	if use.generation == nil || !sameOperationRequest(use.parent, parent) || use.cut != cut || use.operation != parent.producer.operation || use.operation == nil {
		return false
	}
	read, write := accessorEvaluationMode(use.operation)
	return read && !write && use.consumer == use.operation.Parent
}

func (q *sourceValueQuery) descriptorRecordGetUseOwned(get *sourceGetInputs, read *sourceMemberWriterReadCut, mode accessorTraversal) (*sourceDescriptorGetUse, bool) {
	if use, narrow := q.descriptorGetEffectsUseOwned(get, read, mode); narrow {
		return use, true
	}
	if q == nil || q.owner == nil || get == nil || mode != accessorRead || !q.liveStagedMemberSource(q.stagedMember, get, read) || get.hasOnly || q.returnObservation != nil || q.operation != nil {
		return nil, false
	}
	b := q.stagedMember
	use := &sourceDescriptorGetUse{operation: get.operation, consumer: get.operation.Parent, kind: descriptorFullSource, parent: b.request, cut: b.observation, generation: q.owner.generation}
	return use, validDescriptorRecordGetUse(use, b.request, b.observation)
}

// descriptorGetEffectsUseOwned consumes only the current traversal's interest.
// Its actual descriptor DATA reading and inherited-field source work remain
// separate prerequisites of the member-get-effects contribution.
func (q *sourceValueQuery) descriptorGetEffectsUseOwned(get *sourceGetInputs, read *sourceMemberWriterReadCut, mode accessorTraversal) (*sourceDescriptorGetUse, bool) {
	if q == nil {
		return nil, false
	}
	b := q.stagedMember
	if b == nil || mode != accessorRead || get == nil || get.hasOnly || !q.liveStagedMemberSource(b, get, read) || !validDescriptorGetUse(b.descriptorUse, b.request, b.observation) || b.descriptorUse.generation != q.owner.generation || get.operation != b.descriptorUse.operation {
		return nil, false
	}
	return b.descriptorUse, true
}
