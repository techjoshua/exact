package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
	"testing"
)

// Object entries reuse the original target-composition workload. Reflect entries
// exercise the same target operand with Reflect's own boolean return contract.
const stagedNativeCreateTargetSource = stagedNativeTargetCompositionSource + `
export function reflectDirect(prototype:object|null){return Reflect.defineProperty(Object.create(prototype),'callback',{value:()=>window.name,enumerable:true})}
export function reflectSaved(prototype:object|null){const target=Object.create(prototype);return Reflect.defineProperty(target,'callback',{value:()=>document.title,enumerable:true})}
`

func TestStagedNativeCreateTargetOriginalConsumer(t *testing.T) {
	checkNativeCreateTargetConsumer(t, false)
}

// The same actual consumer must supply a natural pending callee event; a
// descriptive targetPending flag or forced graph timing cannot satisfy this.
func TestStagedNativeCreateTargetPendingOriginalConsumer(t *testing.T) {
	checkNativeCreateTargetConsumer(t, true)
}

func checkNativeCreateTargetConsumer(t *testing.T, requirePending bool) {
	t.Helper()
	const file = "/virtual/native-create-target-source.ts"
	request := Request{Kind: "analyze", ID: file, Source: stagedNativeCreateTargetSource, Diagnostics: "semantic", stagedReplacement: true}
	reached := make(map[string]bool)
	pending := false
	var expired []*sourceStagedNativeEffectsIssuer
	withActiveModuleSourceWorkSetup(t, request, map[string]string{file: stagedNativeCreateTargetSource}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, p := range owner.pendingMemberPublishers {
			if p.workRegistrar == nil || p.workRegistrar.writerScopeSource == nil {
				continue
			}
			original := p.workRegistrar.writerScopeSource
			p.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
				original(q, r)
				if q.stagedNativeGet == nil {
					return
				}
				issuer := q.stagedNativeGet.effectsIssuer
				if issuer == nil || work.nativeCreateTargetTaskSource(issuer.task) == nil {
					return
				}
				if !issuer.live() || issuer.work != work || issuer.owner != owner || issuer.fact.node != q.effectOwner || !work.liveNativeEffectsExecution(issuer.task, owner, issuer.fact) {
					t.Fatal("real target dispatch issuer refused")
				}
				name := issuer.fact.summary.Name
				reached[name] = true
				expired = append(expired, issuer)
				source := work.nativeCreateTargetTaskSource(issuer.task)
				if name == "direct" {
					// The real Create source interval must run while its Freeze caller is
					// waiting, with the selected original target task claimed.
					declaration := issuer.fact.node.Body().AsBlock().Statements.Nodes[0].AsReturnStatement().Expression
					parentID := work.operationIDs[sourceStagedOperationKey{declaration: issuer.fact.node, operation: declaration, kind: relativeDemandEffects}]
					if parentID.epoch != work.operationEpoch || parentID.index == 0 || !work.operations[parentID.index].writerSourceRunning {
						t.Fatal("original target source did not bootstrap its waiting Freeze")
					}
					claimed := false
					for _, queued := range work.extractionQueue[work.extractionHead:] {
						if queued.delivery || queued.nativeInputRevision != 0 || queued.nativeTargetRevision != 0 {
							continue
						}
						if queued.operation == issuer.task {
							claimed = queued.operationDone
						}
					}
					if !claimed {
						t.Fatal("target bootstrap did not claim its original task")
					}
					// The target's real execution frame cannot impersonate its waiting parent.
					queue := slices.Clone(work.extractionQueue)
					work.bootstrapNativeCreateTarget(facts, parentID, source, owner)
					if !slices.Equal(queue, work.extractionQueue) {
						t.Fatal("target frame borrowed parent bootstrap authority")
					}

				}

				call, binding := nativeReflectiveTargetCall(source, owner)
				if call != issuer.call || call == nil || !ast.IsCallExpression(call) || source.installation.target.expression != nativeEagerTargetRequest(source).producer.selector.occurrence {
					t.Fatal("original target tuple lost")
				}
				saved := name == "saved" || name == "reflectSaved"
				if saved != (binding != nil) || saved && source.installation.target.expression == call {
					t.Fatal("saved operand and initializer conflated")
				}
				if issuer.request.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || q.relativeInputCut(call).reading != call {
					t.Fatal("target SOURCE cut replaced by outer operand cut")
				}
				copy := *issuer
				if copy.live() {
					t.Fatal("copied issuer acquired target scope")
				}
				copy.self = &copy
				copy.request.edge += ":foreign"
				if copy.live() {
					t.Fatal("foreign target request acquired scope")
				}
				copy = *issuer
				copy.self = &copy
				copy.generation = nil
				if copy.live() {
					t.Fatal("stale generation acquired target scope")
				}
				copy = *issuer
				copy.self = &copy
				copy.task.epoch = nil
				if copy.live() {
					t.Fatal("foreign graph epoch acquired target scope")
				}
				copy = *issuer
				copy.self = &copy
				copy.request.cut.initializing = call
				if copy.live() {
					t.Fatal("foreign child semantic cut acquired target scope")
				}
				otherOwner := *owner
				copy = *issuer
				copy.self = &copy
				copy.owner = &otherOwner
				if copy.live() {
					t.Fatal("foreign execution owner acquired target scope")
				}
				copy = *issuer
				copy.self = &copy
				copy.call = source.request.use
				if copy.live() {
					t.Fatal("parent invocation substituted for own target scope")
				}
				if len(issuer.pending)+len(issuer.scopePending) > 0 {
					pending = true
					state := &work.operations[issuer.task.index]
					if state.delta.extracted || state.nativeTarget != nil {
						t.Fatal("pending target published a current target result")
					}
				}
			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		dispatched := make(map[string]bool)
		closed := work.closedOperationDependencies()
		if requirePending && (!pending || len(reached) == 0) {
			t.Fatal("natural pending target callee SOURCE event UNREACHED")
		}
		for _, issuer := range expired {
			if issuer.live() {
				t.Fatal("target issuer survived original dispatch")
			}
		}
		for _, state := range work.operations {
			source := work.operationRecipes[state.key].nativeGet
			if source == nil || !source.createTarget || state.key != nativeEagerTargetRequest(source).producer {
				continue
			}
			caller := work.memberNodes[source.request.consumer]
			name := facts[caller].summary.Name
			if state.writerSourceRevisions == nil {
				t.Fatalf("actual %s target dispatcher UNREACHED", name)
			}
			dispatched[name] = true
			if source.targetSource.producer.operation == nil {
				t.Fatal("dispatched target omitted its full original child debt")
			}
			if !validNativeTargetSource(source) || len(work.operationRecipes[state.key].delta.required) != 1 {
				t.Fatal("target child request or binding lost")
			}
			if !state.delta.extracted || !work.nativeOrdinaryTargetResult(source.targetSource) {
				t.Fatal("original target consumer did not reach current result")
			}
			id := work.operationIDs[state.key]
			childID := work.operationIDs[source.targetSource.producer]
			child := &work.operations[childID.index]
			sub := child.subscribers[sourceStagedOperationConsumer{source.targetSource.consumer, source.targetSource.edge}]
			if sub == nil || sub.blocked || !sameOperationRequest(sub.request, source.targetSource) || child.revision == 0 || sub.consumed != child.revision || sub.applied != child.revision {
				t.Fatal("target full child receipt not consumed/APPLIED")
			}
			if !closed[id.index] {
				t.Fatal("original target consumer required closure remains pending")
			}
			if source.kind == sourceNativeObjectDefineProperty {
				for _, parent := range work.operations {
					parentID := work.operationIDs[parent.key]
					parentSource := work.nativeEffectsTaskSource(parentID)
					if parentSource == nil || parentSource.kind != sourceNativeObjectFreeze || parent.key != parentSource.request.producer || parentSource.request.consumer != source.request.consumer {
						continue
					}
					for _, d := range work.nativeCreateTargetDependencies(id) {
						subscriber := work.operations[d.producer.index].subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
						if subscriber == nil || !slices.Contains(subscriber.writerSourceParents, parentID) {
							t.Fatal("waiting Freeze omitted its target's actual Get/dependency wake")
						}
					}
				}
			}

		}
		for _, name := range []string{"direct", "saved", "reflectDirect", "reflectSaved"} {
			if !dispatched[name] {
				t.Fatalf("actual %s target dispatcher consumer UNREACHED", name)
			}
		}

		beforeGets := len(expired)
		identities := make(map[sourceStagedOperationKey]sourceStagedOperationID)
		for _, state := range work.operations {
			source := work.operationRecipes[state.key].nativeGet
			if source != nil && source.createTarget && state.key == nativeEagerTargetRequest(source).producer {
				identities[state.key] = work.operationIDs[state.key]
			}
		}
		work.prepareOperationUses(facts, owner)
		if len(expired) != beforeGets {
			t.Fatal("target delivery reopened an associated original Create Get")
		}
		for key, id := range identities {
			if work.operationIDs[key] != id {
				t.Fatal("target delivery replaced canonical task identity")
			}
		}
		// A revoked extraction cannot claim a queued task, even with its old source.
		queue := slices.Clone(work.extractionQueue)
		for _, state := range work.operations {
			source := work.operationRecipes[state.key].nativeGet
			if source == nil || source.kind != sourceNativeObjectFreeze || state.key != source.request.producer {
				continue
			}
			algorithm := work.nativeEffectsInputSource(source)
			if algorithm != nil && validStagedNativeInputSource(algorithm) {
				child := work.operationRecipes[algorithm.inputSource.producer].nativeGet
				work.bootstrapNativeCreateTarget(facts, work.operationIDs[state.key], child, owner)
			}
		}
		if !slices.Equal(queue, work.extractionQueue) {
			t.Fatal("revoked parent bootstrap changed the extraction queue")
		}
		if work.nativeEffectsExecution != nil {
			t.Fatal("target execution frame survived dispatch")
		}
		clonedFacts := make([]callableFacts, len(facts))
		for i, fact := range facts {
			clonedFacts[i] = cloneProjectCallableFact(fact)
		}
		clone := registerCallableEffectWork(clonedFacts)
		for _, issuer := range expired {
			if clone.nativeCreateTargetTaskSource(issuer.task) != nil {
				t.Fatal("clone inherited target execution authority")
			}
		}
	}, activeModuleCompleteAnalysis)
}

// Local target extraction and exact delivery are independent of full child
// Effects closure. The original full-closure consumer above remains unchanged.
func TestStagedNativeCreateTargetLocalSourceHandoff(t *testing.T) {
	const file = "/virtual/native-create-target-source.ts"
	request := Request{Kind: "analyze", ID: file, Source: stagedNativeCreateTargetSource, Diagnostics: "semantic", stagedReplacement: true}
	type path struct {
		kind  sourceNativeKind
		saved bool
	}
	expected := map[string]path{
		"direct": {sourceNativeObjectDefineProperty, false}, "saved": {sourceNativeObjectDefineProperty, true},
		"reflectDirect": {sourceNativeReflectDefineProperty, false}, "reflectSaved": {sourceNativeReflectDefineProperty, true},
	}
	type freshSource struct {
		id     sourceStagedOperationID
		issuer *sourceStagedNativeEffectsIssuer
	}
	fresh := make(map[string]freshSource) // At most the four original paths, no attempt history.
	withActiveModuleSourceWorkSetup(t, request, map[string]string{file: stagedNativeCreateTargetSource}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, publisher := range owner.pendingMemberPublishers {
			if publisher.workRegistrar == nil || publisher.workRegistrar.writerScopeSource == nil {
				continue
			}
			original := publisher.workRegistrar.writerScopeSource
			publisher.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
				original(q, r)
				if q.stagedNativeGet == nil {
					return
				}
				issuer := q.stagedNativeGet.effectsIssuer
				if issuer == nil {
					return
				}
				source := work.nativeCreateTargetTaskSource(issuer.task)
				if source == nil {
					return
				}
				if !issuer.live() || issuer.work != work || issuer.owner != owner || issuer.fact == nil || issuer.fact.node != q.effectOwner || !work.liveNativeEffectsExecution(issuer.task, owner, issuer.fact) {
					t.Fatal("local handoff fresh target issuer lacks original execution")
				}
				name := issuer.fact.summary.Name
				want, known := expected[name]
				call, binding := nativeReflectiveTargetCall(source, owner)
				if !known || source.kind != want.kind || call == nil || call != issuer.call || (binding != nil) != want.saved || issuer.request.producer.operation != call || issuer.request.consumer != issuer.fact.node || issuer.request.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || q.relativeInputCut(call).reading != call {
					t.Fatal("local handoff fresh target request/operand/cut mismatch", name)
				}
				if prior, seen := fresh[name]; seen && (prior.id != issuer.task || prior.issuer != issuer && prior.issuer.live()) {
					t.Fatal("local handoff fresh target identity or prior issuer lifetime changed", name)
				}
				fresh[name] = freshSource{issuer.task, issuer}
			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if work.operationGeneration == nil || work.operationGeneration != owner.values.generation || work.operationGeneration != owner.project.activeGeneration {
			t.Fatal("local handoff generation mismatch")
		}
		handed := make(map[string]bool)
		for index := 1; index < len(work.operations); index++ {
			state := &work.operations[index]
			id, canonical := work.operationIDs[state.key]
			source := work.nativeCreateTargetTaskSource(id)
			if source == nil {
				continue
			}
			caller, known := work.memberNodes[source.request.consumer]
			if !known || caller < 0 || caller >= len(facts) {
				t.Fatal("local handoff original consumer missing")
			}
			name := facts[caller].summary.Name
			want, expectedPath := expected[name]
			if !expectedPath || handed[name] || !canonical || id.index != uint32(index) || id.epoch != work.operationEpoch || source.kind != want.kind {
				t.Fatal("local handoff target identity/kind duplicated or foreign", name)
			}
			targetRequest := nativeEagerTargetRequest(source)
			call, binding := nativeReflectiveTargetCall(source, owner)
			recipe := work.operationRecipes[state.key]
			if state.key != targetRequest.producer || call == nil || (binding != nil) != want.saved || source.targetBinding != binding || source.targetSource.producer.operation != call || want.saved && source.installation.target.expression == call || !validNativeTargetSource(source) {
				t.Fatal("local handoff original target association/initializer/cut lost", name)
			}
			if len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], source.targetSource) {
				t.Fatal("local handoff full Create Effects requirement lost", name)
			}
			childID, childKnown := work.operationIDs[source.targetSource.producer]
			if !childKnown || childID.epoch != work.operationEpoch || childID.index == 0 || int(childID.index) >= len(work.operations) {
				t.Fatal("local handoff full child identity missing", name)
			}
			child := &work.operations[childID.index]
			childSource := work.operationRecipes[child.key].nativeGet
			if child.key != source.targetSource.producer || childSource == nil || childSource.kind != sourceNativeObjectCreate || !sameOperationRequest(childSource.request, source.targetSource) {
				t.Fatal("local handoff substituted full Create source", name)
			}
			memberships := 0
			for _, d := range state.dependencies {
				if d.producer == childID && sameOperationRequest(d.request, source.targetSource) {
					memberships++
				}
			}
			if memberships != 1 || state.invalid || !state.dependenciesRegistered || state.revision == 0 || !state.delta.extracted || state.writerSourceRunning || state.writerSourceRevisions == nil || !work.nativeOrdinaryTargetResult(source.targetSource) {
				t.Fatal("local handoff original target consumer has no current extracted ordinary result", name)
			}
			targetSub := state.subscribers[sourceStagedOperationConsumer{targetRequest.consumer, targetRequest.edge}]
			childSub := child.subscribers[sourceStagedOperationConsumer{source.targetSource.consumer, source.targetSource.edge}]
			if targetSub == nil || targetSub.blocked || !sameOperationRequest(targetSub.request, targetRequest) || targetSub.consumed != state.revision || targetSub.applied != state.revision {
				t.Fatal("local handoff target receipt not exact consumed/APPLIED", name)
			}
			if childSub == nil || childSub.blocked || !sameOperationRequest(childSub.request, source.targetSource) || child.revision == 0 || childSub.consumed != child.revision || childSub.applied != child.revision {
				t.Fatal("local handoff full child receipt not exact consumed/APPLIED", name)
			}
			if event, seen := fresh[name]; seen && (event.id != id || event.issuer.live() || !sameOperationRequest(event.issuer.request, source.targetSource)) {
				t.Fatal("local handoff fresh issuer request/lifetime lost", name)
			}
			handed[name] = true
		}
		for _, name := range []string{"direct", "saved", "reflectDirect", "reflectSaved"} {
			if !handed[name] {
				t.Fatal("original local target handoff UNREACHED", name)
			}
			if _, seen := fresh[name]; seen {
				t.Log(name, "local handoff and fresh issuer/revocation reached; full Effects closure UNQUALIFIED")
			} else {
				t.Log(name, "local handoff reached; fresh issuer UNREACHED (current receipt reuse permitted); full Effects closure UNQUALIFIED")
			}
		}
		if work.nativeEffectsExecution != nil {
			t.Fatal("local handoff execution frame survived collection")
		}
	}, activeModuleCompleteAnalysis)
}

// Each unchanged original function owns an independent canonical collector work.
// These local handoff controls retain full Create Effects debt; the original
// all4 consumer and full-closure acceptance above remain mandatory.
func TestStagedNativeCreateTargetIndependentLocalSourceHandoff(t *testing.T) {
	for _, row := range []struct {
		name   string
		kind   sourceNativeKind
		saved  bool
		source string
	}{
		{"direct", sourceNativeObjectDefineProperty, false, `
export function direct(prototype:object|null){return Object.freeze(Object.defineProperty(Object.create(prototype),'callback',{value:()=>window.name,enumerable:true}))}
`},
		{"saved", sourceNativeObjectDefineProperty, true, `
export function saved(prototype:object|null){const target=Object.create(prototype);const descriptor={value:()=>document.title,enumerable:true};return Object.freeze(Object.freeze(Object.defineProperty(target,'callback',descriptor)))}
`},
		{"reflectDirect", sourceNativeReflectDefineProperty, false, `
export function reflectDirect(prototype:object|null){return Reflect.defineProperty(Object.create(prototype),'callback',{value:()=>window.name,enumerable:true})}
`},
		{"reflectSaved", sourceNativeReflectDefineProperty, true, `
export function reflectSaved(prototype:object|null){const target=Object.create(prototype);return Reflect.defineProperty(target,'callback',{value:()=>document.title,enumerable:true})}
`},
	} {
		t.Run(row.name, func(t *testing.T) {
			const file = "/virtual/native-create-target-source.ts"
			request := Request{Kind: "analyze", ID: file, Source: row.source, Diagnostics: "semantic", stagedReplacement: true}
			type path struct {
				kind  sourceNativeKind
				saved bool
			}
			expected := map[string]path{row.name: {row.kind, row.saved}}
			type freshSource struct {
				id     sourceStagedOperationID
				issuer *sourceStagedNativeEffectsIssuer
			}
			fresh := make(map[string]freshSource) // Only this original path, no attempt history.
			withActiveModuleSourceWorkSetup(t, request, map[string]string{file: row.source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
				for _, publisher := range owner.pendingMemberPublishers {
					if publisher.workRegistrar == nil || publisher.workRegistrar.writerScopeSource == nil {
						continue
					}
					original := publisher.workRegistrar.writerScopeSource
					publisher.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
						original(q, r)
						if q.stagedNativeGet == nil {
							return
						}
						issuer := q.stagedNativeGet.effectsIssuer
						if issuer == nil {
							return
						}
						source := work.nativeCreateTargetTaskSource(issuer.task)
						if source == nil {
							return
						}
						if !issuer.live() || issuer.work != work || issuer.owner != owner || issuer.fact == nil || issuer.fact.node != q.effectOwner || !work.liveNativeEffectsExecution(issuer.task, owner, issuer.fact) {
							t.Fatal("local handoff fresh target issuer lacks original execution")
						}
						name := issuer.fact.summary.Name
						want, known := expected[name]
						call, binding := nativeReflectiveTargetCall(source, owner)
						if !known || source.kind != want.kind || call == nil || call != issuer.call || (binding != nil) != want.saved || issuer.request.producer.operation != call || issuer.request.consumer != issuer.fact.node || issuer.request.cut != (sourceRelativeCut{operation: call, use: call, reading: call}) || q.relativeInputCut(call).reading != call {
							t.Fatal("local handoff fresh target request/operand/cut mismatch", name)
						}
						if prior, seen := fresh[name]; seen && (prior.id != issuer.task || prior.issuer != issuer && prior.issuer.live()) {
							t.Fatal("local handoff fresh target identity or prior issuer lifetime changed", name)
						}
						fresh[name] = freshSource{issuer.task, issuer}
					}
				}
			}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
				if work.operationGeneration == nil || work.operationGeneration != owner.values.generation || work.operationGeneration != owner.project.activeGeneration {
					t.Fatal("local handoff generation mismatch")
				}
				handed := make(map[string]bool)
				for index := 1; index < len(work.operations); index++ {
					state := &work.operations[index]
					id, canonical := work.operationIDs[state.key]
					source := work.nativeCreateTargetTaskSource(id)
					if source == nil {
						continue
					}
					caller, known := work.memberNodes[source.request.consumer]
					if !known || caller < 0 || caller >= len(facts) {
						t.Fatal("local handoff original consumer missing")
					}
					name := facts[caller].summary.Name
					want, expectedPath := expected[name]
					if !expectedPath || handed[name] || !canonical || id.index != uint32(index) || id.epoch != work.operationEpoch || source.kind != want.kind {
						t.Fatal("local handoff target identity/kind duplicated or foreign", name)
					}
					targetRequest := nativeEagerTargetRequest(source)
					call, binding := nativeReflectiveTargetCall(source, owner)
					recipe := work.operationRecipes[state.key]
					if state.key != targetRequest.producer || call == nil || (binding != nil) != want.saved || source.targetBinding != binding || source.targetSource.producer.operation != call || want.saved && source.installation.target.expression == call || !validNativeTargetSource(source) {
						t.Fatal("local handoff original target association/initializer/cut lost", name)
					}
					if len(recipe.delta.required) != 1 || !sameOperationRequest(recipe.delta.required[0], source.targetSource) {
						t.Fatal("local handoff full Create Effects requirement lost", name)
					}
					childID, childKnown := work.operationIDs[source.targetSource.producer]
					if !childKnown || childID.epoch != work.operationEpoch || childID.index == 0 || int(childID.index) >= len(work.operations) {
						t.Fatal("local handoff full child identity missing", name)
					}
					child := &work.operations[childID.index]
					childSource := work.operationRecipes[child.key].nativeGet
					if child.key != source.targetSource.producer || childSource == nil || childSource.kind != sourceNativeObjectCreate || !sameOperationRequest(childSource.request, source.targetSource) {
						t.Fatal("local handoff substituted full Create source", name)
					}
					memberships := 0
					for _, d := range state.dependencies {
						if d.producer == childID && sameOperationRequest(d.request, source.targetSource) {
							memberships++
						}
					}
					if memberships != 1 || state.invalid || !state.dependenciesRegistered || state.revision == 0 || !state.delta.extracted || state.writerSourceRunning || state.writerSourceRevisions == nil || !work.nativeOrdinaryTargetResult(source.targetSource) {
						t.Fatal("local handoff original target consumer has no current extracted ordinary result", name)
					}
					targetSub := state.subscribers[sourceStagedOperationConsumer{targetRequest.consumer, targetRequest.edge}]
					childSub := child.subscribers[sourceStagedOperationConsumer{source.targetSource.consumer, source.targetSource.edge}]
					if targetSub == nil || targetSub.blocked || !sameOperationRequest(targetSub.request, targetRequest) || targetSub.consumed != state.revision || targetSub.applied != state.revision {
						t.Fatal("local handoff target receipt not exact consumed/APPLIED", name)
					}
					if childSub == nil || childSub.blocked || !sameOperationRequest(childSub.request, source.targetSource) || child.revision == 0 || childSub.consumed != child.revision || childSub.applied != child.revision {
						t.Fatal("local handoff full child receipt not exact consumed/APPLIED", name)
					}
					if event, seen := fresh[name]; seen && (event.id != id || event.issuer.live() || !sameOperationRequest(event.issuer.request, source.targetSource)) {
						t.Fatal("local handoff fresh issuer request/lifetime lost", name)
					}
					handed[name] = true
				}
				for _, name := range []string{row.name} {
					if !handed[name] {
						t.Fatal("original local target handoff UNREACHED", name)
					}
					if _, seen := fresh[name]; seen {
						t.Log(name, "local handoff and fresh issuer/revocation reached; full Effects closure UNQUALIFIED")
					} else {
						t.Log(name, "local handoff reached; fresh issuer UNREACHED (current receipt reuse permitted); full Effects closure UNQUALIFIED")
					}
				}
				if work.nativeEffectsExecution != nil {
					t.Fatal("local handoff execution frame survived collection")
				}
			}, activeModuleCompleteAnalysis)
		})
	}
}
