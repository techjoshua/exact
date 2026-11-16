package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

func TestOriginalQualifiedArgumentGetInputConsumer(t *testing.T) {
	// The entire original fixture, including RHS/getter/throw/finally work.
	assertOriginalQualifiedArgumentGetInput(t, nestedReceiverOriginalSource, false)
}

func TestOriginalQualifiedArgumentGetterSourceBoundary(t *testing.T) {
	// Keep the original workload; make the same receiver's tag an authored,
	// capture-reading, potentially throwing getter rather than a data member.
	if strings.Count(nestedReceiverOriginalSource, "tag:'box',field:0") != 1 {
		t.Fatal("original tag fixture changed")
	}
	source := strings.Replace(nestedReceiverOriginalSource, "tag:'box',field:0", "get tag(){if(captured.count)throw 9;return 'box'},field:0", 1)
	assertOriginalQualifiedArgumentGetInput(t, source, true)
}

// Inspect only original collector output. No observer, loan, supplier or quorum
// is constructed by the test. Both tests compile against the unchanged f30 API.
func assertOriginalQualifiedArgumentGetInput(t *testing.T, source string, getter bool) {
	t.Helper()
	withOriginalSetEffectsCollector(t, source, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		observation := work.assignmentObserved[root.producer]
		if observation == nil || observation.effects == nil || observation.local {
			t.Fatal("ENTRY: genuine incomplete original Set SOURCE absent")
		}
		var native *sourceStagedNativeGetSource
		for _, recipe := range work.operationRecipes {
			if n := recipe.nativeGet; n != nil && recipe.key == n.request.producer && n.kind == sourceNativeArrayPush && ast.IsSetAccessorDeclaration(n.request.consumer) && sourceText(file, n.request.use) == "events.push('set:'+this.tag)" {
				if native != nil {
					t.Fatal("ambiguous original setter push")
				}
				native = n
			}
		}
		if native == nil || native.arrayPush == nil {
			t.Fatal("ENTRY: original acquired native argument owner absent")
		}
		arg := native.request.use.AsCallExpression().Arguments.Nodes[0].AsBinaryExpression().Right
		var recipe sourceStagedOperationRecipe
		count := 0
		for _, candidate := range work.operationRecipes {
			s := candidate.callResult
			if s != nil && s.getResult != nil && s.getResult.role == "effects" && s.request.use == arg && sameOperationRequest(s.getResult.sourceInput.parent, root) {
				recipe = candidate
				count++
			}
		}
		if count != 1 {
			t.Fatal("ENTRY: exact original Set-relative argument Get absent/ambiguous", count)
		}
		s := recipe.callResult
		input := s.getResult.sourceInput
		a := input.access
		if a.binding == nil || a.binding.Name().Text() != "box" || a.receiver != root.use.AsBinaryExpression().Left.Expression() || a.reference != arg || a.generation != work.operationGeneration || a.cut != (sourceRelativeCut{operation: root.use, reading: arg}) {
			t.Fatal("argument SOURCE misrouted from box to events or wrong eager cut")
		}
		box := a.binding.Initializer()
		if box == nil || !ast.IsObjectLiteralExpression(box) {
			t.Fatal("ENTRY: actual box SOURCE absent")
		}
		receiver := qualifiedGetRequest(arg, s.declaration, "receiver", input)
		delivery, applied := work.stagedCallResultData(receiver)
		if !applied || !delivery.delta.extracted || delivery.revision == 0 {
			t.Fatal("CONSUMER: prelocal original argument receiver SOURCE not delivered")
		}
		for _, required := range a.required {
			if !operationContainsRequest(delivery.delta.required, required) {
				t.Fatal("receiver SOURCE lost original input dependency", required)
			}
		}
		id := work.operationIDs[s.request.producer]
		if id.index == 0 || id.epoch != work.operationEpoch {
			t.Fatal("CONSUMER: original qualified argument Effects not enrolled")
		}
		state := &work.operations[id.index]
		sub := state.subscribers[sourceStagedOperationConsumer{s.request.consumer, s.request.edge}]
		if state.revision == 0 || work.memberCoverageObserved[s.request.producer] != work.operationGeneration || sub == nil || !sameOperationRequest(sub.request, s.request) || sub.blocked || sub.consumed != state.revision || sub.applied != state.revision {
			t.Fatal("CONSUMER: original qualified argument Effects observation not consumed/APPLIED")
		}
		writerID := work.operationIDs[root.producer]
		if writerID.index == 0 {
			t.Fatal("original Set writer absent")
		}
		writer := work.operations[writerID.index].subscribers[sourceStagedOperationConsumer{root.consumer, root.edge}]
		owed := false
		if writer != nil {
			for _, access := range writer.readWrites {
				owed = owed || access.operation == native.request.use && operationContainsRequest(access.required, s.request) && operationContainsRequest(access.required, nativeRootDebtRequest(native, "eager-inputs"))
			}
		}
		if !owed {
			t.Fatal("original writer lost actual argument Get/eager dependency")
		}
		call := work.operationRecipes[native.request.producer]
		for _, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
			if !operationContainsRequest(call.delta.required, nativeRootDebtRequest(native, role)) {
				t.Fatal("native Call lost independent role", role)
			}
		}
		value := work.operationRecipes[stagedGetResultRequest(arg, s.declaration, "value", nil).producer]
		if value.delta.extracted || len(value.delta.exposures) != 0 {
			t.Fatal("SOURCE argument enumeration granted normal Get DATA")
		}
		for _, c := range facts[work.memberNodes[s.declaration]].staged.calls {
			if c.invocation.operation == arg && c.inputs != nil && c.inputs.delivered {
				t.Fatal("early argument SOURCE granted getter execution inputs")
			}
		}
		if !getter {
			data, paid := work.stagedCallResultData(s.request)
			if !paid || !data.delta.extracted || work.memberCoverageObserved[s.request.producer] != work.operationGeneration {
				t.Fatal("CONSUMER: original own-data argument Effects contribution unpaid")
			}
		} else {
			var body *ast.Node
			for _, member := range box.AsObjectLiteralExpression().Properties.Nodes {
				if ast.IsGetAccessorDeclaration(member) && callableNameText(member.Name()) == "tag" {
					body = member
				}
			}
			if body == nil {
				t.Fatal("ENTRY: actual authored tag getter absent")
			}
			bodySource, captureSource := false, false
			for key, dep := range work.stagedRequired {
				if key.consumer == work.memberNodes[s.declaration] && dep.producer == work.memberNodes[body] && dep.operation == arg && dep.cut == (sourceRelativeCut{operation: arg, reading: arg}) && !dep.invalid {
					bodySource = true
				}
			}
			for _, required := range recipe.delta.required {
				c := work.operationRecipes[required.producer].callResult
				if c != nil && c.capturedBinding != nil && c.capturedBinding.reader == body && c.capturedBinding.binding.Name().Text() == "captured" {
					captureSource = true
				}
			}
			if !bodySource || !captureSource {
				t.Fatalf("ENTRY: actual getter BODY/capture SOURCE absent: body=%t capture=%t", bodySource, captureSource)
			}
			bodyData := work.operationRecipes[stagedGetResultRequest(arg, s.declaration, "body", body).producer]
			if bodyData.callResult != nil || bodyData.delta.extracted || recipe.delta.extracted {
				t.Fatal("early getter SOURCE granted BODY DATA/full Get ACK")
			}
		}
		if observation.local || work.operationRecipes[root.producer].delta.extracted || call.delta.extracted {
			t.Fatal("argument SOURCE paid Set-local/full Set/native Call")
		}
	})
}
