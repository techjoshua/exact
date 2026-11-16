package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The original writer may consume authentic conditional effects before complete
// source/BODY accounting. A retained prefix must not authorize nested inputs.
func TestOriginalSetEffectPrefixAuthority(t *testing.T) {
	withOriginalSetEffectsCollector(t, nestedReceiverOriginalSource, func(owner *executableBodyOwner, file *ast.SourceFile, facts []callableFacts, work *callableEffectWork) {
		root := originalSetEffectsRoot(t, file, work)
		id, issued := work.operationIDs[root.producer]
		if !issued {
			t.Fatal("ENTRY: original writer Set root absent")
		}
		state := &work.operations[id.index]
		subscriber := state.subscribers[sourceStagedOperationConsumer{root.consumer, root.edge}]
		observation := work.assignmentObserved[root.producer]
		if subscriber == nil || subscriber.blocked || subscriber.applied != state.revision || len(subscriber.readWrites) == 0 || observation == nil || observation.effects == nil {
			t.Fatal("original writer did not consume issued SOURCE prefix")
		}
		if observation.local || work.passiveAssignmentSourceReady(work.operationRecipes[root.producer]) || work.assignmentSourceEffectsCurrent(observation.effects) || work.closedOperationDependencies()[id.index] {
			t.Fatal("conditional prefix granted complete source/BODY closure")
		}
		nested := false
		for _, recipe := range work.operationRecipes {
			if recipe.assignment == nil || !sameOperationRequest(recipe.assignment.sourceInput.parent, root) {
				continue
			}
			nested = true
			if work.assignmentEffectsInputCurrent(recipe.assignment.sourceInput) {
				t.Fatal("prefix granted nested executable SOURCE input authority")
			}
		}
		if !nested {
			t.Fatal("ENTRY: original nested write input description absent")
		}
		// These are the actual already-consumed atoms, not seeded graph metadata.
		values := subscriber.readWrites
		use := sourceStagedOperationUse{request: root}
		if !work.applySetReadWrites(use, values) {
			t.Fatal("authentic current prefix rejected")
		}
		before := len(subscriber.readWrites)
		rejects := func(name string) {
			t.Helper()
			if work.applySetReadWrites(use, values) || len(subscriber.readWrites) != before {
				t.Fatal("invalid prefix accepted or changed consumer", name)
			}
		}
		originalRoot := observation.effects.root
		observation.effects.root.use = root.consumer
		rejects("wrong root")
		observation.effects.root = originalRoot
		originalCut := observation.disposition.cut
		observation.disposition.cut.reading = root.use
		rejects("wrong cut")
		observation.disposition.cut = originalCut
		originalIssuer := observation.effects.issuer
		copiedIssuer := *originalIssuer
		observation.effects.issuer = &copiedIssuer
		rejects("copied issuer")
		observation.effects.issuer = originalIssuer
		originalGeneration := observation.effects.generation
		observation.effects.generation = nil
		rejects("wrong generation")
		observation.effects.generation = originalGeneration
		copiedObservation := *observation
		work.assignmentObserved[root.producer] = &copiedObservation
		rejects("detached observation")
		work.assignmentObserved[root.producer] = observation
		// Snapshot compatibility is checked in addition to supplier membership.
		originalSnapshot := observation.root
		observation.root = cloneOperationDelta(originalSnapshot)
		observation.root.readWrites = append(observation.root.readWrites, values[0])
		rejects("foreign snapshot")
		observation.root = originalSnapshot
		if !work.applySetReadWrites(use, values) {
			t.Fatal("restored genuine original prefix rejected")
		}
		// Revocation is terminal for this graph; no expired or cached receipt is revived.
		delete(work.assignmentObserved, root.producer)
		rejects("revoked original receipt")
	})
}
