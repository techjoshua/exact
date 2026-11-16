package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"maps"
)

// sourceMemberReceiverPreparation is issued inline by the original lexical
// visitor. It lends receiver DATA registration only, before any physical Get
// exists. It never enters a source recipe, cache, clone or observation snapshot.
type sourceMemberReceiverPreparation struct {
	issuer      *sourceValueQuery
	borrower    *sourceStagedMemberBorrow
	reference   *sourceGetReference
	read        *sourceMemberWriterReadCut
	publisher   *sourcePendingMemberPublisher
	parent      sourceStagedOperationRequest
	cut         sourceRelativeCut // exact original physical parent/read cut for RD/resumption
	queryCut    sourceRelativeCut // unchanged declaration-relative query observation
	bindingCall *ast.Node
}

// Eligibility does not issue a preparation. The sole issuer is the actual
// sourceAccessorOperationCandidates stack with its just-created reference.
func (q *sourceValueQuery) memberReceiverPreparationEligible(reference *sourceGetReference, path []string, name string, mode accessorTraversal) bool {
	if q == nil || reference == nil || mode != accessorRead || !reference.matches(path, name) || q.owner == nil || q.owner.program == nil || q.executable == nil || q.executable.project == nil || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || q.returnObservation != nil || q.stagedNativeGet != nil {
		return false
	}
	b := q.stagedMember
	if b == nil || b.issuer != q || b.owner != q.owner || b.generation == nil || b.generation != q.owner.generation || !b.generation.active || q.executable.project.activeGeneration != b.generation || b.receiverDataOwner == nil || b.returnResult == nil || b.publish == nil || b.finish == nil || b.installedMember != nil || b.installedCallSelection != nil || b.get != nil || b.read != nil || b.coverage != nil || b.publishing || b.projectingReturn != nil {
		return false
	}
	p := reference.operation
	if p == nil || !ast.IsPropertyAccessExpression(p) || q.protectedMember != p || q.reading != p || b.request.producer.operation != p || b.request.producer.selector != (sourceStagedOperationSelector{}) || b.request.consumer != q.effectOwner || !validStagedMemberParent(b.request) || !memberReceiverCutsCorrespond(b.request, q.relativeInputCut(p), b.request.cut) {
		return false
	}
	file := ast.GetSourceFileOfNode(p)
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	return file != nil && q.owner.program.GetSourceFile(file.FileName()) == file && publisher != nil && publisher.live && publisher.workRegistrar != nil && publisher.fact != nil && publisher.fact.node == q.effectOwner && publisher.fact.sourceFile == file && publisher.fact.normalInputs == nil && b.receiverDataOwner(reference)
}

// lendStagedMemberReceiverRead receives the actual visitor's read cut. A copied
// reference or a nested lookup cannot attach itself to the original preparation.
func (q *sourceValueQuery) lendStagedMemberReceiverRead(reference *sourceGetReference, read *sourceMemberWriterReadCut, path []string, name string, mode accessorTraversal) func() {
	p := q.memberReceiverPreparation
	if p == nil || p.read != nil || !q.memberReceiverPreparationEligible(reference, path, name, mode) || !q.memberReceiverPreparationReadMatches(reference, read, path, name, mode) {
		return func() {}
	}
	p.read = read
	return func() {
		if p.read == read {
			p.read = nil
		}
	}
}

// memberReceiverPreparationReadMatches checks only the live visitor/read
// association. It does not install a cut or confer DATA/Get completion.
func (q *sourceValueQuery) memberReceiverPreparationReadMatches(reference *sourceGetReference, read *sourceMemberWriterReadCut, path []string, name string, mode accessorTraversal) bool {
	if q == nil {
		return false
	}
	p := q.memberReceiverPreparation
	return p != nil && p.issuer == q && p.borrower == q.stagedMember && p.reference == reference && reference != nil && read != nil && (p.read == nil || p.read == read) && mode == accessorRead && reference.matches(path, name) && read.operation == reference.operation && read.use == q.reading && maps.Equal(read.scope.creators, q.creators) && p.queryCut == q.relativeInputCut(reference.operation) && memberReceiverCutsCorrespond(p.parent, p.queryCut, p.cut) && p.bindingCall == q.normalBindingCall
}

// liveStagedMemberReceiverPreparation authenticates the actual original Call
// receiver while that same visitor/read/binding interval is on the stack. It
// neither constructs sourceGetInputs nor weakens liveStagedMemberSource.
func (q *sourceValueQuery) liveStagedMemberReceiverPreparation(call *ast.Node) bool {
	if q == nil || q.owner == nil || call == nil || !ast.IsCallExpression(call) {
		return false
	}
	p := q.memberReceiverPreparation
	if p == nil || p.issuer != q || p.borrower != q.stagedMember || p.reference == nil || p.read == nil || p.reference.operation != q.protectedMember || unwrapSourceCallableReference(p.reference.receiver) != call || p.bindingCall != q.normalBindingCall {
		return false
	}
	b := p.borrower
	if b == nil || b.issuer != q || b.owner != q.owner || b.generation != q.owner.generation || b.get != nil || b.read != nil || b.coverage != nil || b.publishing || b.installedMember != nil || b.installedCallSelection != nil || b.receiverDataOwner == nil || b.returnResult == nil || b.publish == nil || b.finish == nil {
		return false
	}
	if !sameOperationRequest(p.parent, b.request) || p.queryCut != q.relativeInputCut(p.reference.operation) || !memberReceiverCutsCorrespond(p.parent, p.queryCut, p.cut) || p.read.operation != p.reference.operation || p.read.use != q.reading || !maps.Equal(p.read.scope.creators, q.creators) || q.reading != p.reference.operation || q.inputs != nil || q.operation != nil || q.returnObservation != nil || q.stagedNativeGet != nil || !q.dependenciesOnly {
		return false
	}
	if q.owner == nil || q.owner.generation == nil || !q.owner.generation.active || q.executable == nil || q.executable.project == nil || q.executable.project.activeGeneration != q.owner.generation || p.publisher == nil || !p.publisher.live || q.executable.pendingMemberPublishers[q.effectOwner] != p.publisher {
		return false
	}
	file := ast.GetSourceFileOfNode(call)
	return ast.IsPropertyAccessExpression(p.reference.operation) && p.reference.matches(nil, p.reference.operation.Name().Text()) && p.parent.producer.selector == (sourceStagedOperationSelector{}) && p.parent.consumer == q.effectOwner && p.publisher.fact != nil && p.publisher.fact.node == q.effectOwner && p.publisher.fact.sourceFile == file && p.publisher.fact.normalInputs == nil && file != nil && q.owner.program.GetSourceFile(file.FileName()) == file
}

// transferPreparedMemberReceiverData consumes only this actual visitor's loan.
// Enrollment and waiting are not source membership. Ordinary transfer needs
// CLOSED DATA; only the running original-P producer can lend its distinct
// conditional SOURCE-enumeration interval from exact locally APPLIED DATA.
func (work *callableEffectWork) transferPreparedMemberReceiverData(facts []callableFacts, q *sourceValueQuery, call *ast.Node) sourceStagedCallResultTransfer {
	if !q.liveStagedMemberReceiverPreparation(call) || !work.memberReceiverPreparationOwner(facts, q, q.memberReceiverPreparation.reference) {
		return sourceStagedCallResultTransfer{}
	}
	p := q.memberReceiverPreparation
	caller, owned := work.memberNodes[p.parent.consumer]
	if !owned || caller < 0 || caller >= len(facts) || len(facts) != len(work.operationFacts) || &facts[caller] != &work.operationFacts[caller] || p.publisher.fact != &facts[caller] || q.executable.values == nil || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker || q.owner.generation != work.operationGeneration || q.executable.project.activeGeneration != work.operationGeneration {
		return sourceStagedCallResultTransfer{}
	}
	source, eligible := work.describeStagedCallResultSource(facts, caller, call, q.executable)
	if !eligible || source == nil || source.generation != work.operationGeneration || (source.frameworkView == nil && source.nativeDescriptor == nil) {
		return sourceStagedCallResultTransfer{}
	}
	reading := source.request
	reading.consumer, reading.reading = p.parent.consumer, p.parent.producer
	reading.edge = fmt.Sprintf("%s:call-return:%d:read:%d:%d", p.parent.edge, call.Pos(), p.cut.operation.Pos(), p.cut.operation.End())
	if !validStagedCallResultReading(reading, p.parent, p.cut) || !work.enrollFrameworkGetResumption(facts, p.parent, p.cut, source, reading) {
		return sourceStagedCallResultTransfer{}
	}
	// Discovery is passive; only an actual field DATA requirement adopts this debt.
	work.registerPreparedOriginalGetMutationInterest(facts, q, source, reading)
	recipe := work.operationRecipes[source.request.producer]
	transfer := sourceStagedCallResultTransfer{accepted: true, required: reading}
	if source.nativeDescriptor != nil {
		var represented bool
		transfer.descriptorViews, represented = work.descriptorViewsForSourceReading(q, recipe, reading, p.parent, p.cut)
		if !represented {
			transfer.sourcePending = true
			p.borrower.represented = false
		}
	} else {
		transfer.views = work.currentFrameworkResultViewsAtReading(recipe, reading, p.parent, p.cut)
	}
	// An accepted pending relationship cannot be a complete empty source set.
	// A later real Get owns membership/record/prototype observation separately.
	if len(transfer.descriptorViews)+len(transfer.views) == 0 {
		transfer.sourcePending = true
		p.borrower.represented = false
	}
	return transfer
}

// memberReceiverPreparationOwner ties issuance to the existing work registry,
// current publisher and original lexical member factory, before any DATA work.
func (work *callableEffectWork) memberReceiverPreparationOwner(facts []callableFacts, q *sourceValueQuery, reference *sourceGetReference) bool {
	if q == nil || reference == nil || q.stagedMember == nil || q.owner == nil || q.executable == nil || q.executable.values == nil || q.executable.project == nil || q.owner.generation != work.operationGeneration || q.executable.project.activeGeneration != work.operationGeneration || q.owner.program != q.executable.values.program || q.owner.checker != q.executable.checker {
		return false
	}
	caller, owned := work.memberNodes[q.effectOwner]
	if !owned || caller < 0 || caller >= len(facts) || len(facts) != len(work.operationFacts) || &facts[caller] != &work.operationFacts[caller] {
		return false
	}
	publisher := q.executable.pendingMemberPublishers[q.effectOwner]
	if publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].normalInputs != nil || facts[caller].sourceFile == nil || q.owner.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile || ast.GetSourceFileOfNode(reference.operation) != facts[caller].sourceFile {
		return false
	}
	request, issued := stagedMemberGetSourceRequest(&facts[caller], reference.operation)
	return issued && sameOperationRequest(request, q.stagedMember.request)
}
