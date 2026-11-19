package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const stagedNativeEagerSymbolChildSource = `const metadata=Symbol.for('metadata');export function invoke(domain:object){return Object.defineProperty({},metadata,{value:Object.freeze({domain})})}export function use(){return invoke({})}export function idle(){return 1}export function separate(){return {value:idle()}}`

// This is the first ordinary collection/resolution of original source. The
// module Symbol event, its exact eager reader and the child Get are independent
// observations. Never bootstrap current rights by resolving returned cache facts.
func TestStagedNativeEagerSymbolChildOriginalSource(t *testing.T) {
	const id = "/virtual/eager-wait-scope.ts"
	const source = stagedNativeEagerSymbolChildSource
	request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}
	withActiveModuleSourceWork(t, request, map[string]string{id: source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		file := owner.values.program.GetSourceFile(id)
		var child, define, formalRead *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) {
				if n.Expression().Name().Text() == "defineProperty" {
					define = n
				}
				args := restrictedInvocationArguments(n.AsCallExpression())
				if n.Expression().Name().Text() == "freeze" && len(args) == 1 && ast.IsObjectLiteralExpression(args[0]) {
					child = n
				}
			}
			if ast.IsShorthandPropertyAssignment(n) && n.Name().Text() == "domain" {
				formalRead = n.Name()
			}
			return true
		})
		if child == nil || define == nil || formalRead == nil {
			t.Fatal("original key/child/formal sites missing")
		}
		// Match the production entry order: compatibility classification runs
		// before module revision initialization. Only a real owned wait can
		// preserve this Call, and it supplies no current result association.
		work.prepareOperationUses(facts, owner)
		before := make([][]sourceStagedDeclarationCall, len(facts))
		for i := range facts {
			before[i] = append([]sourceStagedDeclarationCall(nil), facts[i].staged.calls...)
			for _, call := range before[i] {
				if call.inputConsumerWait != nil {
					t.Fatal("no-waits control already had a deferred decision")
				}
			}
		}
		work.refreshSourceInputConsumerWaits(facts, owner)
		for i := range facts {
			for j, call := range facts[i].staged.calls {
				old := before[i][j]
				if call.inputs != old.inputs || call.sourceInputs != old.sourceInputs || call.legacyInputs != old.legacyInputs || call.inputConsumerWait != nil {
					t.Fatal("late notification classified a Call with no owned wait")
				}
			}
		}
		work.prepareSourceInputConsumers(facts, owner)
		var waitingCaller, waitingCall int
		foundWait := false
		for i := range facts {
			for j, call := range facts[i].staged.calls {
				if call.invocation.declaration == enclosingCallableNode(define) {
					waitingCaller, waitingCall, foundWait = i, j, true
					// Preserve the original disjunction and its short-circuit: CURRENT
					// is not queried when legacy or missing-wait already decides it.
					currentChecked := !call.legacyInputs && call.inputConsumerWait != nil
					current := false
					if currentChecked {
						current = work.inputConsumerWaitCurrent(facts, call)
					}
					if call.legacyInputs || call.inputConsumerWait == nil || current {
						t.Fatalf("original pending eager consumer was not DEFER-only: caller=%d call=%d operation=%p declaration=%p sourceInputs=%t legacy=%t wait=%t currentChecked=%t current=%t", i, j, call.invocation.operation, call.invocation.declaration, call.sourceInputs != nil, call.legacyInputs, call.inputConsumerWait != nil, currentChecked, current)
					}
					result := &sourceStagedCallResultSource{request: stagedCallResultRequest(call.invocation.operation, facts[i].node), association: call, generation: work.operationGeneration}
					if work.currentStagedResultAssociation(facts, result) {
						t.Fatal("DEFER supplied normal DATA association")
					}
				}
			}
		}
		if !foundWait {
			t.Fatal("original caller source association was not collected")
		}
		work.refreshOperationPublication(facts)
		if !facts[waitingCaller].staged.operationsPending {
			t.Fatal("owned input wait did not block publication")
		}
		// Pending ownership requires this exact future module wake, not merely
		// a Symbol description or a revision-array boundary.
		wait := facts[waitingCaller].staged.calls[waitingCall].inputConsumerWait
		phaseSource := work.operationRecipes[wait.required[0].phase.producer].nativeGet
		keyReading := stagedKeySourceRequest(phaseSource, phaseSource.keySources[0])
		depKey := sourceStagedDependencyKey{consumer: work.memberNodes[keyReading.consumer], edge: keyReading.edge + ":module"}
		dependency := work.stagedRequired[depKey]
		member := work.memberModuleMemberships[depKey]
		delete(work.memberModuleMemberships, depKey)
		if _, owned := work.nativeEagerInputConsumerPending(&facts[work.memberNodes[wait.required[0].owner]], formalRead); owned {
			t.Fatal("missing module membership gained an input wait")
		}
		work.memberModuleMemberships[depKey] = member
		savedCut := dependency.cut
		dependency.cut.reading = formalRead
		if _, owned := work.nativeEagerInputConsumerPending(&facts[work.memberNodes[wait.required[0].owner]], formalRead); owned {
			t.Fatal("wrong module cut gained an input wait")
		}
		dependency.cut = savedCut
		unrelated := 0
		for i := range facts {
			before[i] = append(before[i][:0], facts[i].staged.calls...)
			for _, call := range before[i] {
				if call.sourceInputs != nil && call.inputConsumerWait == nil {
					unrelated++
				}
			}
		}
		if unrelated == 0 {
			t.Fatal("unrelated original Call control was not reached")
		}
		// A pending wake revalidates only the owned wait, not other Calls.
		work.refreshSourceInputConsumerWaits(facts, owner)
		for i := range facts {
			for j, call := range facts[i].staged.calls {
				old := before[i][j]
				if old.inputConsumerWait == nil && (call.inputs != old.inputs || call.sourceInputs != old.sourceInputs || call.legacyInputs != old.legacyInputs || call.inputConsumerWait != nil) {
					t.Fatal("owned-wait refresh changed an unrelated original Call")
				}
			}
		}
		pendingCall := facts[waitingCaller].staged.calls[waitingCall]
		if pendingCall.inputConsumerWait == nil || pendingCall.legacyInputs || work.inputConsumerWaitCurrent(facts, pendingCall) {
			t.Fatal("pending wake retired the original wait before CURRENT coverage")
		}
		// Actual normal initialization and existing queue, not a fabricated ACK.
		work.initializePropagation(facts)
		work.prepareOperationUses(facts, owner)
		if !work.inputDataChanged {
			t.Fatal("actual eager/module revision lost input-phase wake")
		}
		work.inputDataChanged = false
		work.refreshSourceInputConsumerWaits(facts, owner)
		call := facts[waitingCaller].staged.calls[waitingCall]
		if call.legacyInputs || call.inputConsumerWait != nil {
			t.Fatal("actual CURRENT coverage did not resume the same original Call")
		}
		for i := range facts {
			for j, actual := range facts[i].staged.calls {
				old := before[i][j]
				if old.inputConsumerWait == nil && (actual.inputs != old.inputs || actual.sourceInputs != old.sourceInputs || actual.legacyInputs != old.legacyInputs || actual.inputConsumerWait != nil) {
					t.Fatal("CURRENT wait refresh changed an unrelated original Call")
				}
			}
		}
		consumer := work.memberNodes[enclosingCallableNode(define)]
		parentRequest, _ := stagedNativeInputOccurrenceRequest(&facts[consumer], define)
		root := work.operationRecipes[parentRequest.producer].nativeGet
		if root == nil {
			t.Fatal("original selected reflective source missing")
		}
		eagerRequest := nativeRootDebtRequest(root, "eager-inputs")
		recipe := work.operationRecipes[eagerRequest.producer]
		source := recipe.nativeGet
		id := work.operationIDs[eagerRequest.producer]
		if source == nil || source.eager == nil || len(source.keySources) != 1 || len(source.eager.operations) != 1 || len(source.eagerSources) != 1 || id.index == 0 || !work.nativeEagerKeyCurrent(source) || !work.nativeEagerSourcesCurrent(source) || !work.operations[id.index].delta.extracted {
			t.Fatalf("original Symbol/key/child phase unavailable: source=%v key=%v operations=%v children=%v id=%v", source != nil, source != nil && work.nativeEagerKeyCurrent(source), source != nil && source.eager != nil, source != nil && len(source.eagerSources) == 1, id)
		}
		key := stagedKeySourceRequest(source, source.keySources[0])
		childRequest := source.eagerSources[0]
		if childRequest.use != child || !operationContainsRequest(recipe.delta.required, key) || !operationContainsRequest(recipe.delta.required, childRequest) || !work.nativeEagerRequiredChild(eagerRequest, childRequest) || !work.sourceInputConsumerCovered(&facts[consumer], formalRead) {
			t.Fatal("actual original key/child graph did not cover the formal read with all Effects retained")
		}
		get := work.operationRecipes[nativeRootDebtRequest(root, "callee-get").producer]
		if operationContainsRequest(get.delta.required, childRequest) {
			t.Fatal("eager child Effects leaked onto parent Get")
		}
		for _, use := range facts[consumer].staged.operationUses {
			if use.request.producer == childRequest.producer {
				t.Fatal("eager source task created ordinary child use")
			}
		}
		revision := work.operations[id.index].revision
		work.prepareOperationUses(facts, owner)
		if !work.nativeEagerSourcesCurrent(source) || work.operations[id.index].revision != revision {
			t.Fatal("same current source vector was not idempotent")
		}
		// Description-only clones and a missing/wrong reader have no category
		// rights. Restore each operand so other independent refusers are reached.
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		fresh.operationGeneration = work.operationGeneration
		if fresh.nativeEagerKeyCurrent(source) || fresh.nativeEagerSourcesCurrent(source) {
			t.Fatal("clone inherited eager current rights")
		}
		keyID := work.operationIDs[key.producer]
		subKey := sourceStagedOperationConsumer{key.consumer, key.edge}
		subscriber := work.operations[keyID.index].subscribers[subKey]
		delete(work.operations[keyID.index].subscribers, subKey)
		if work.nativeEagerKeyCurrent(source) {
			t.Fatal("missing exact key reader gained eager current rights")
		}
		work.operations[keyID.index].subscribers[subKey] = subscriber
		copySource := *source
		copySource.keySources = append([]sourceStagedKeySource(nil), source.keySources...)
		copySource.keySources[0].producer.cut.reading = define
		if work.nativeEagerKeyCurrent(&copySource) {
			t.Fatal("wrong key producer cut gained eager current rights")
		}
		generation := work.operationGeneration
		work.operationGeneration = &projectGeneration{}
		if work.nativeEagerSourcesCurrent(source) {
			t.Fatal("wrong generation gained eager current rights")
		}
		work.operationGeneration = generation
		if work.nativeEagerExecution != nil {
			t.Fatal("eager dispatcher interval escaped")
		}
	}, activeModuleBeforeResolution)
}

// The existing immutable fixture supplies a real Symbol producer, callee Get,
// key reader and native return-SOURCE consumer. This control qualifies current
// category routing after normal resolution, independently of the old transient
// pre-resolution wait experiment; neither manufactures selection or receipts.
func TestStagedNativeKeySourceRoleCurrent(t *testing.T) {
	const id = "/virtual/eager-wait-scope.ts"
	request := Request{Kind: "analyze", ID: id, Source: stagedNativeEagerSymbolChildSource, Diagnostics: "semantic"}
	withActiveModuleSourceWork(t, request, map[string]string{id: stagedNativeEagerSymbolChildSource}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		reached := 0
		for _, recipe := range work.operationRecipes {
			source := recipe.nativeGet
			if source == nil || source.eager == nil || recipe.key != nativeRootDebtRequest(source, "eager-inputs").producer {
				continue
			}
			for _, key := range source.keySources {
				if !key.symbol {
					continue
				}
				r := stagedKeySourceRequest(source, key)
				producer := work.operationRecipes[r.producer]
				if !work.nativeEagerKeyCurrent(source) || !work.nativeSymbolKeyReadingCurrent(r) {
					t.Fatal("actual ordinary key CURRENT/module-availability consumer UNREACHED")
				}
				if r.reading.selector.association != nil || r.reading.selector.field != "key-source" || work.validReflectiveKeyReading(producer, r) || !work.validStagedKeySourceReading(producer, r) {
					t.Fatal("ordinary issued key lost its disjoint source role")
				}
				reached++
				wrong := r
				wrong.reading.selector.association = source.request.use
				if work.validStagedKeySourceReading(producer, wrong) || work.nativeSymbolKeyReadingCurrent(wrong) {
					t.Fatal("unissued key association acquired category/current rights")
				}
				wrong = r
				wrong.cut.reading = source.request.use
				if wrong.cut == r.cut {
					t.Fatal("wrong-cut control did not change original key cut")
				}
				if work.nativeSymbolKeyReadingCurrent(wrong) {
					t.Fatal("wrong producer key cut acquired current rights")
				}
				id := work.operationIDs[r.producer]
				if id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
					t.Fatal("actual adopted key producer missing")
				}
				st := &work.operations[id.index]
				index := sourceStagedOperationConsumer{r.consumer, r.edge}
				sub := st.subscribers[index]
				if sub == nil || sub.applied == 0 || sub.applied != st.revision {
					t.Fatal("actual paid key subscriber UNREACHED")
				}
				delete(st.subscribers, index)
				missing := work.nativeSymbolKeyReadingCurrent(r)
				st.subscribers[index] = sub
				if missing {
					t.Fatal("missing original reader acquired current rights")
				}
				applied := sub.applied
				sub.applied = 0
				unpaid := work.nativeSymbolKeyReadingCurrent(r)
				sub.applied = applied
				if unpaid || !work.nativeSymbolKeyReadingCurrent(r) {
					t.Fatal("key category bypassed actual APPLIED or lost restored real receipt")
				}
				generation := work.operationGeneration
				work.operationGeneration = &projectGeneration{}
				expired := work.nativeSymbolKeyReadingCurrent(r)
				work.operationGeneration = generation
				if expired {
					t.Fatal("foreign generation acquired key currency")
				}
				clones := make([]callableFacts, len(facts))
				for i := range facts {
					clones[i] = cloneProjectCallableFact(facts[i])
				}
				fresh := registerCallableEffectWork(clones)
				fresh.operationGeneration = owner.values.generation
				if fresh.nativeSymbolKeyReadingCurrent(r) {
					t.Fatal("description clone inherited actual key/Get/APPLIED authority")
				}
			}
		}
		if reached == 0 {
			t.Fatal("genuine ordinary key SOURCE/current role positive UNREACHED")
		}
		t.Logf("ordinary key role/current/APPLIED/lifetime refusers reached=%d; reflective role unchanged by source proof", reached)
	}, activeModuleCompleteAnalysis)
}
