package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The real writer consumes effect payloads, not just a formal's SOURCE ticket.
// This protects substitution identity together with the actual read dependency
// produced by the reducer. Other BODY/Get/Set debts are deliberately not waived.
func TestOriginalSetReadWritePayloadConsumer(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		id, issued := work.operationIDs[root.producer]
		if !issued {
			t.Fatal("ENTRY: actual original writer did not enroll its Set root")
		}
		state := &work.operations[id.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{root.consumer, root.edge}]
		if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision {
			t.Fatal("original writer has not locally consumed the substituted Effects payload")
		}
		store, increment, field := false, false, false
		var stored sourceQualifiedReadWrite
		for _, access := range subscriber.readWrites {
			if access.generation != work.operationGeneration || access.owner != root.consumer || enclosingCallableNode(access.declaration.Parent) != root.consumer || access.cut != (sourceRelativeCut{operation: root.use, reading: access.reference}) {
				t.Fatal("consumed effect lost original owner/generation/physical use")
			}
			switch sourceText(file, access.operation) {
			case "selected=next":
				store, stored = true, access
				if !access.write || access.read || access.receiver != nil || access.binding == nil || access.binding.Name().Text() != "selected" || access.target.expression != access.reference || access.writtenFrom.expression != root.use.AsBinaryExpression().Right || access.writtenFrom.producer != root.use || sourceText(file, access.writtenFrom.get) != "next" || access.writtenFrom.cut != (sourceRelativeCut{operation: root.use, reading: root.use.AsBinaryExpression().Left}) {
					t.Fatal("original lexical write did not consume next as original RHS Get SOURCE")
				}
				mapped := false
				for _, required := range access.required {
					mapped = mapped || sameOperationRequest(required, stagedAssignmentRequest(root, "rhs"))
				}
				if !mapped {
					t.Fatal("stored original RHS source lost its Effects prerequisite")
				}
			case "++captured.count":
				increment = true
				if !access.read || !access.write || access.binding == nil || access.binding.Name().Text() != "captured" || access.target.producer != access.binding {
					t.Fatal("checked numeric update lost original captured read/write facets")
				}
				read := false
				for _, required := range access.required {
					read = read || sameOperationRequest(required, stagedGetResultRequest(access.reference, access.declaration, "effects", nil))
				}
				if !read {
					t.Fatal("numeric update lacks its actual original Get Effects producer")
				}
			case "this.field=++captured.count":
				field = true
				if !access.write || access.read || access.binding == nil || access.binding.Name().Text() != "box" || access.receiver != root.use.AsBinaryExpression().Left.Expression() || access.target.producer != access.binding || sourceText(file, access.writtenFrom.expression) != "++captured.count" {
					t.Fatal("setter receiver write was mapped to getter/callback this or a caller formal")
				}
			}
		}
		if !store || !increment || !field {
			t.Fatalf("writer did not consume original read/write Effects: store=%t increment=%t field=%t", store, increment, field)
		}
		// A wrong store source is rejected at the actual consumer after real
		// entry. The test changes no recipe, graph receipt or operation state.
		misrouted := cloneQualifiedReadWrites([]sourceQualifiedReadWrite{stored})
		misrouted[0].writtenFrom.expression = root.use.AsBinaryExpression().Left
		before := len(subscriber.readWrites)
		if work.applySetReadWrites(sourceStagedOperationUse{request: root}, misrouted) || len(subscriber.readWrites) != before {
			t.Fatal("writer accepted a misrouted original RHS substitution")
		}
		for _, fact := range facts {
			for _, call := range fact.staged.calls {
				if call.invocation.operation == root.use && call.inputs != nil && call.inputs.delivered {
					t.Fatal("private effect substitution fabricated selected setter B")
				}
			}
		}
		value := work.operationRecipes[stagedGetResultRequest(root.use.AsBinaryExpression().Right, root.consumer, "value", nil).producer]
		if value.delta.extracted || len(value.delta.exposures) != 0 {
			t.Fatal("conditional store effect supplied normal RHS Get output")
		}
	})
}

func TestOriginalSetReadWritePayloadLifetime(t *testing.T) {
	var expired func() bool
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		delta := work.operationRecipes[root.producer].delta
		if len(delta.readWrites) == 0 {
			t.Fatal("ENTRY: original read/write effect payload absent")
		}
		cloned := cloneOperationDelta(delta)
		cloned.readWrites[0].reference = nil
		if delta.readWrites[0].reference == nil || operationDeltaPrefix(delta, cloned) {
			t.Fatal("cloned effect description shares mutable storage or loses identity")
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		if len(fresh.operationIDs) != 0 || fresh.applySetReadWrites(sourceStagedOperationUse{request: root}, delta.readWrites) {
			t.Fatal("fresh graph inherited original source coverage or consumed effects")
		}
		expired = func() bool { return work.applySetReadWrites(sourceStagedOperationUse{request: root}, delta.readWrites) }
	})
	if expired == nil || expired() {
		t.Fatal("expired Program retained source-qualified effect delivery authority")
	}
}
