package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This whole-fixture witness uses existing APIs on the semantic parent too.
// A legacy MAY write or a registered Call alone cannot satisfy the writer.
func TestOriginalNativePushSetWriterConsumer(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		var native *sourceStagedNativeGetSource
		for _, recipe := range work.operationRecipes {
			s := recipe.nativeGet
			if s != nil && recipe.key == s.request.producer && s.kind == sourceNativeArrayPush && ast.IsSetAccessorDeclaration(s.request.consumer) && sourceText(file, s.request.use) == "events.push('set:'+this.tag)" {
				if native != nil {
					t.Fatal("ambiguous original push Call source")
				}
				native = s
			}
		}
		if native == nil || native.effectsSource == nil || native.effectsSource.generation != work.operationGeneration || !sameOperationRequest(native.effectsSource.request, native.request) {
			t.Fatal("original acquired push Call Effects prefix absent")
		}
		if native.method == nil || !standardLibrarySource(ast.GetSourceFileOfNode(native.method)) || native.get != native.request.use.Expression() {
			t.Fatal("push prefix lost authentic standard method or original callee")
		}
		callID, enrolled := work.operationIDs[native.request.producer]
		if !enrolled || work.operations[callID.index].revision == 0 {
			t.Fatal("original native Call prefix not delivered")
		}
		call := &work.operations[callID.index]
		if call.delta.extracted || work.nativeEffectsSourceCurrent(work.operationRecipes[native.request.producer]) {
			t.Fatal("MAY mutation granted full Call/current Effects")
		}
		for _, role := range []string{"callee-get", "eager-inputs", "algorithm"} {
			request := nativeRootDebtRequest(native, role)
			found := false
			for _, dependency := range call.dependencies {
				found = found || sameOperationRequest(dependency.request, request)
			}
			if !found {
				t.Fatal("native Call lost required original role", role)
			}
		}
		protocol := false
		for key, recipe := range work.operationRecipes {
			if recipe.memberSource == nil || recipe.memberSource.protocolSource == nil || !sameOperationRequest(recipe.memberSource.protocolSource.required, native.request) {
				continue
			}
			id, adopted := work.operationIDs[key]
			if !adopted {
				continue
			}
			for _, d := range work.operations[id.index].dependencies {
				if d.producer != callID || !sameOperationRequest(d.request, native.request) {
					continue
				}
				sub := call.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
				protocol = protocol || sub != nil && !sub.blocked && sub.consumed == call.revision && sub.applied == call.revision
			}
		}
		if !protocol {
			t.Fatal("original protocol consumer has not consumed native push prefix")
		}
		rootID, enrolled := work.operationIDs[root.producer]
		if !enrolled {
			t.Fatal("original Set writer not enrolled")
		}
		state := &work.operations[rootID.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{root.consumer, root.edge}]
		if subscriber == nil || subscriber.blocked || subscriber.consumed != state.revision || subscriber.applied != state.revision {
			t.Fatal("original writer did not consume current Effects prefix")
		}
		var mutation *sourceQualifiedReadWrite
		for i := range subscriber.readWrites {
			a := &subscriber.readWrites[i]
			if a.operation == native.request.use && a.write && !a.read {
				if mutation != nil {
					t.Fatal("duplicate original array mutation")
				}
				mutation = a
			}
		}
		if mutation == nil || mutation.binding == nil || mutation.binding.Name().Text() != "events" || mutation.reference != native.get.Expression() || mutation.owner != root.consumer || mutation.target.producer != mutation.binding || mutation.generation != work.operationGeneration || mutation.cut != (sourceRelativeCut{operation: root.use, reading: mutation.reference}) {
			t.Fatal("writer did not consume original events push mutation")
		}
		for _, r := range []sourceStagedOperationRequest{native.request, nativeRootDebtRequest(native, "callee-get"), nativeRootDebtRequest(native, "eager-inputs"), stagedBindingResultRequest(mutation.reference, mutation.declaration)} {
			if !operationContainsRequest(mutation.required, r) {
				t.Fatal("consumed mutation lost real Call/receiver/argument role")
			}
			found := false
			for _, d := range state.dependencies {
				found = found || sameOperationRequest(d.request, r)
			}
			if !found {
				t.Fatal("writer did not enroll a consumed mutation requirement")
			}
		}
		arg := restrictedInvocationArguments(native.request.use.AsCallExpression())[0].AsBinaryExpression().Right
		argument := false
		for _, r := range mutation.required {
			if r.use != arg {
				continue
			}
			producer := work.operationRecipes[r.producer].callResult
			if producer == nil || producer.getResult == nil || producer.getResult.role != "effects" {
				continue
			}
			input := producer.getResult.sourceInput
			argument = sameOperationRequest(input.parent, root) && input.access.reference == arg && input.access.receiver == root.use.AsBinaryExpression().Left.Expression() && input.access.binding != nil && input.access.binding.Name().Text() == "box"
		}
		if !argument {
			t.Fatal("native mutation did not consume original Set-relative argument Get")
		}
		// Missing or misrouted actual arguments must fail the same live writer,
		// after genuine entry. These detached negatives manufacture no receipt.
		for _, mode := range []string{"argument omission", "receiver misroute"} {
			bad := cloneQualifiedReadWrites([]sourceQualifiedReadWrite{*mutation})
			if mode == "argument omission" {
				bad[0].required = nil
				for _, r := range mutation.required {
					if r.use != arg {
						bad[0].required = append(bad[0].required, r)
					}
				}
			} else {
				bad[0].target.expression = root.use.AsBinaryExpression().Right
			}
			before := len(subscriber.readWrites)
			if work.applySetReadWrites(sourceStagedOperationUse{request: root}, bad) || len(subscriber.readWrites) != before {
				t.Fatal("writer accepted invalid native mutation", mode)
			}
		}
		closed := work.closedOperationDependencies()
		algorithm := work.operationIDs[nativeRootDebtRequest(native, "algorithm").producer]
		if closed[callID.index] || algorithm.index == 0 || closed[algorithm.index] {
			t.Fatal("prefix paid unsupported index/length setter or abrupt algorithm work")
		}
	})
}
