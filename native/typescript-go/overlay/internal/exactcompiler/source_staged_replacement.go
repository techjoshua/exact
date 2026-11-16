package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// stagedReplacementGap unwinds only internal replacement analysis. Session
// discards the interrupted program's facts and returns its existing error-only
// response. No missing producer becomes an opaque runtime alternative.
type stagedReplacementGap struct {
	project    *projectState
	operation  *ast.Node
	consumer   *ast.Node
	parent     sourceStagedOperationRequest
	demand     string
	transition string
}

func (gap stagedReplacementGap) Error() string {
	file, position := stagedPendingLocation(gap.operation)
	consumerFile, consumerPosition := stagedPendingLocation(gap.consumer)
	return fmt.Sprintf("Compiler analysis coverage gap: not yet implemented: %s at %s:%d (attempted operation %s@%d, parent consumer %s:%d, parent source operation %s@%d, demand %d, attempted legacy transition %s)", gap.demand, file, position, gap.operation.Kind, gap.operation.Pos(), consumerFile, consumerPosition, gap.parent.producer.operation.Kind, gap.parent.producer.operation.Pos(), gap.parent.producer.kind, gap.transition)
}

// requireStagedReplacement owns aborting an intended source migration route.
// Dispatch sites supply the unmet demand before entering its old producer.
func (project *projectState) requireStagedReplacement(gap stagedReplacementGap) {
	if project != nil && project.stagedReplacement {
		gap.project = project
		panic(gap)
	}
}

// requireStagedNativeEffectsConsumer handles an actual ordinary collector's
// failed source handoff before accessor recovery. The ephemeral occurrence
// retains a genuine original native publisher, not a method name, cached recipe
// or type-based candidate. DATA preparation never calls this fallback gate.
func (work *callableEffectWork) requireStagedNativeEffectsConsumer(occurrence *sourceStagedNativeOccurrence, owner *executableBodyOwner) {
	if owner == nil || owner.project == nil || !owner.project.stagedReplacement || owner.values == nil || occurrence == nil || occurrence.work != work || occurrence.generation != owner.values.generation || occurrence.generation != work.operationGeneration || occurrence.source == nil {
		return
	}
	source := occurrence.source
	recipe := work.operationRecipes[source.request.producer]
	if !validNativeGetRecipe(recipe) || !sameNativeGetSource(recipe.nativeGet, source) || source.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(source.method)) || source.request.producer.kind != relativeDemandEffects {
		return
	}
	owner.project.requireStagedReplacement(stagedReplacementGap{operation: source.request.producer.operation, consumer: source.request.consumer, parent: source.request, demand: "native Call Effects input/source delivery", transition: "appendAccessorEffects"})
}

// requireStagedInvocationConsumer is the owning transition into recursive
// invocation recovery. The internal gate covers member writer-input and return
// DATA recovery from an original source Effects publisher or a typed member
// loan. Actual normal frames and
// unrelated strong selection/identity owners keep their existing route.
// A successful staged handoff returns before reaching this boundary.
func (q *sourceValueQuery) requireStagedInvocationConsumer(node *ast.Node, consumer sourceInvocationConsumer) {
	if q == nil || q.executable == nil || q.executable.project == nil || !q.executable.project.stagedReplacement || !q.dependenciesOnly || q.inputs != nil || q.operation != nil {
		return
	}
	var parent sourceStagedOperationRequest
	b := q.stagedMember
	if b != nil && b.issuer == q && b.owner == q.owner && q.owner != nil && b.generation == q.owner.generation && b.get != nil && b.read != nil {
		parent = b.request
	} else if constructed := q.stagedConstructedMember; constructed != nil && constructed.live && constructed.owner == q && q.owner != nil && constructed.generation == q.owner.generation && constructed.issued != nil {
		parent = constructed.request
	}
	if parent.producer.operation == nil {
		// Raw writer discovery also runs at original source Effects entries
		// without a typed member loan. Its live publisher authenticates only
		// this diagnostic boundary, never a method or result contribution.
		fact := q.currentPendingInvocationSource(node)
		if fact == nil {
			return
		}
		var described bool
		parent, described = sourceStagedOccurrenceRequest(fact, node, relativeDemandEffects, "pending-writer-source-gap")
		if !described {
			return
		}
	}
	demand := ""
	if q.pendingMemberRequest != nil {
		demand = "member writer input/source delivery"
	} else if consumer.sourceReturn != nil || consumer.sourceView != nil {
		demand = "returned DATA source delivery"
	}
	if demand != "" {
		q.executable.project.requireStagedReplacement(stagedReplacementGap{operation: node, consumer: parent.consumer, parent: parent, demand: demand, transition: "consumeInvocation"})
	}
}

// currentPendingInvocationSource authenticates the original live writer ticket.
// It supplies source ownership only, never an invocation or result receipt.
func (q *sourceValueQuery) currentPendingInvocationSource(node *ast.Node) *callableFacts {
	r := q.pendingMemberRequest
	if r == nil || !r.live || r.issuer != q || r.call != node || r.consumer != q.effectOwner || r.use != q.effectUse() || q.reading != r.original[0] || q.initializing != node || q.returning != r.original[2] || q.invoking != r.original[3] || r.member == nil || q.owner == nil || q.owner.generation == nil || q.executable == nil || q.executable.values == nil || q.executable.project == nil || q.owner.generation != q.executable.values.generation || q.owner.generation != q.executable.project.activeGeneration || q.owner.program == nil || q.owner.program != q.executable.values.program || r.graph != q.executable.writerInputFacts[q.effectOwner] {
		return nil
	}
	publisher, ticket := q.executable.pendingMemberPublishers[q.effectOwner], r.member
	if publisher == nil || publisher != ticket.publisher || !publisher.live || publisher.fact == nil || ticket.phase == memberRevoked || ticket.demand == nil {
		return nil
	}
	fact, source := publisher.fact, ticket.demand
	if fact.node != q.effectOwner || fact.writerInputs != r.graph || fact.normalInputs != nil || fact.sourceFile == nil || q.owner.program.GetSourceFile(fact.sourceFile.FileName()) != fact.sourceFile || ast.GetSourceFileOfNode(node) != fact.sourceFile || fact.pendingMembers == nil || fact.pendingMembers.sites[node] != source || source.declaration != q.effectOwner || source.call != node || source.get != unwrapSourceCallableReference(node.Expression()) {
		return nil
	}
	return fact
}
