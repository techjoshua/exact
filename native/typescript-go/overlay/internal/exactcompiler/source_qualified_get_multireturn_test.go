package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// Same receiver binding does not collapse two original return-site endpoints.
// The existing single-return control remains the separate eligible positive.
func TestOriginalQualifiedGetDistinctReturnSiteRefusal(t *testing.T) {
	const original = "function receiver(){events.push('receiver');return box}"
	if strings.Count(nestedReceiverOriginalSource, original) != 1 {
		t.Fatal("original receiver fixture changed")
	}
	source := strings.Replace(nestedReceiverOriginalSource, original, "function receiver(){events.push('receiver');if(fail)return box;return box}", 1)
	withOriginalSetEffectsCollector(t, source, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		o := work.assignmentObserved[root.producer]
		if o == nil || o.effects == nil || o.disposition == nil || o.local || o.effects.generation != work.operationGeneration {
			t.Fatal("ENTRY: original incomplete Set supplier population absent")
		}
		plan := o.effects.inputPlan
		if len(plan.branches) != 2 || plan.operation != root.use.AsBinaryExpression().Left.Expression() {
			t.Fatal("ENTRY: original two-return SOURCE plan absent")
		}
		first, second := plan.branches[0], plan.branches[1]
		if first.pending || second.pending || first.binding == nil || first.binding != second.binding || first.returning == second.returning || sameOperationEndpoint(first.endpoint, second.endpoint) {
			t.Fatal("ENTRY: two nonpending original same-binding/distinct-endpoint branches absent")
		}
		for _, branch := range plan.branches {
			supplied := false
			for _, supplier := range o.effects.suppliers {
				supplied = supplied || supplier.sourceInputsReady && supplier.receiverBinding == branch.binding && sameOperationEndpoint(supplier.receiver, branch.endpoint) && supplier.declaration.Parent == branch.binding.Initializer()
			}
			if !supplied {
				t.Fatal("ENTRY: actual original branch supplier absent")
			}
		}
		coverage := false
		for _, required := range o.disposition.required {
			member := work.operationRecipes[required.producer].memberSource
			if member != nil && member.coverage != nil && member.coverage.origin == first.binding.Initializer() && member.parent.producer.operation == stagedAssignmentTarget(root.use) && member.coverage.generation == work.operationGeneration {
				id := work.operationIDs[required.producer]
				if id.index != 0 && id.epoch == work.operationEpoch {
					state := &work.operations[id.index]
					sub := state.subscribers[sourceStagedOperationConsumer{required.consumer, required.edge}]
					coverage = coverage || state.memberCoverageObserved && state.delta.extracted && sub != nil && sameOperationRequest(sub.request, required) && !sub.blocked && sub.applied == state.revision && state.revision != 0
				}
			}
		}
		if !coverage || !o.effects.inputPopulationReady {
			t.Fatal("ENTRY: original member SOURCE coverage/population incomplete")
		}
		found := false
		for _, recipe := range work.operationRecipes {
			s := recipe.callResult
			if s == nil || s.getResult == nil || s.getResult.role != "effects" || !sameOperationRequest(s.getResult.sourceInput.parent, root) || sourceText(file, s.request.use) != "this.tag" {
				continue
			}
			found = true
			input := s.getResult.sourceInput
			if input.access.binding != first.binding || input.access.reference != s.request.use {
				t.Fatal("ENTRY: original branch argument association absent")
			}
			if work.qualifiedGetSourceInputsCurrent(input) {
				t.Fatal("distinct original return endpoints collapsed into one input quorum")
			}
			if recipe.delta.extracted {
				t.Fatal("refused multi-return input granted full Get ACK")
			}
			if !operationContainsRequest(input.access.required, stagedDeclarationCallEffectsRequest(plan.operation, root.consumer)) {
				t.Fatal("argument lost actual receiver Call debt")
			}
			value := work.operationRecipes[stagedGetResultRequest(s.request.use, s.declaration, "value", nil).producer]
			if value.delta.extracted || len(value.delta.exposures) != 0 {
				t.Fatal("refused input granted normal Get DATA")
			}
			for _, call := range facts[work.memberNodes[s.declaration]].staged.calls {
				if call.invocation.operation == s.request.use && call.inputs != nil && call.inputs.delivered {
					t.Fatal("refused input granted getter binding")
				}
			}
			for _, child := range work.operationRecipes {
				if c := child.callResult; c != nil && c.getResult != nil && c.getResult.role == "body" && c.request.use == s.request.use {
					t.Fatal("refused input granted BODY DATA producer")
				}
			}
		}
		if !found {
			t.Fatal("ENTRY: actual original argument input request absent")
		}
		if work.operationRecipes[root.producer].delta.extracted {
			t.Fatal("multi-return refusal erased full Set debt")
		}
	})
}
