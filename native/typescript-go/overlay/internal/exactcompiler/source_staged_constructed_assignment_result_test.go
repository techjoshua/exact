package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// An original source-API reader demands the first Get's conditional stored DATA
// after canonical collection. It must publish the real assignment/New relation
// and close actual subscribers before any mutation refusal below is exercised.
// The unchanged original G2 Session test owns production-entry acceptance.
func TestStagedConstructedAssignmentResultOriginalSource(t *testing.T) {
	const id = "/virtual/g2-assignment.ts"
	const source = `const stores=new WeakMap<object,WeakMap<object,unknown>>();export function invoke(key:object,item:object){let inner=stores.get(key);if(!inner)stores.set(key,(inner=new WeakMap<object,unknown>()));return inner.get(item)}`
	var releasedWork *callableEffectWork
	var releasedRecipe, releasedLookup, releasedGet, releasedReceiverRoot sourceStagedOperationRecipe
	var releasedUpstream *ast.Node
	request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic", stagedReplacement: true}
	withActiveModuleSourceWork(t, request, map[string]string{id: source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		// A source result is demand-driven. Ask its ordinary semantic factory
		// for this actual Get, after real collection; no result subscription is
		// inferred merely because an export contains the Call.
		var read, downstream *ast.Node
		file := owner.values.program.GetSourceFile(id)
		if file == nil {
			t.Fatal("original selected source absent")
		}
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) {
				receiver, name := accessorReceiver(node.Expression())
				if name == "get" && ast.IsIdentifier(receiver) && receiver.Text() == "stores" {
					read = node
				}
				if name == "get" && ast.IsIdentifier(receiver) && receiver.Text() == "inner" {
					downstream = node
				}
			}
			return true
		})
		if read == nil || downstream == nil {
			t.Fatal("original source Get absent")
		}
		caller, known := work.memberNodes[enclosingCallableNode(read)]
		if !known {
			t.Fatal("original source owner absent")
		}
		root, represented := work.prepareConstructedResultSource(facts, caller, read, owner)
		if !represented {
			t.Fatal("original Get source factory unavailable; currentness UNREACHED")
		}
		members := work.operationRecipes[root.producer].constructedGroup
		if len(members) != 1 {
			t.Fatal("original source Get has incomplete/mixed receiver group")
		}
		result := constructedMemberRequest(&members[0], "member-result")
		if _, registered := work.requireOperation(facts, result); !registered {
			t.Fatal("original DATA reader registration refused")
		}
		ordinaryBefore := len(facts[caller].staged.constructedOccurrences)
		usesBefore := len(facts[caller].staged.operationUses)
		work.prepareOperationUses(facts, owner)
		if len(facts[caller].staged.constructedOccurrences) != ordinaryBefore || len(facts[caller].staged.operationUses) != usesBefore {
			t.Fatal("passive result service registered ordinary occurrence/use")
		}
		reached := 0
		for key, recipe := range work.operationRecipes {
			proof := recipe.constructedDisposition
			if proof == nil || len(proof.resultAssignments) == 0 {
				continue
			}
			reached++
			releasedWork, releasedRecipe = work, recipe
			operation, adopted := work.operationIDs[key]
			if !adopted {
				t.Fatal("original assignment result not adopted; currentness/refusers UNREACHED")
			}
			if !validConstructedMemberRecipe(recipe) {
				t.Fatal("original assignment result factory invalid; currentness/refusers UNREACHED")
			}
			if !recipe.delta.extracted {
				t.Fatal("original assignment result membership pending; currentness/refusers UNREACHED")
			}
			if !work.constructedAssignmentResultsCurrent(recipe) {
				t.Fatal("original assignment result source observation not CURRENT; closure/refusers UNREACHED")
			}
			relation := proof.resultAssignments[0]
			var writer *sourceStagedConstructedMember
			for i := range proof.resultSources {
				if sameOperationRequest(proof.resultSources[i].request, relation.writer) {
					writer = &proof.resultSources[i]
				}
			}
			if writer == nil || !validConstructedAssignmentResult(relation, writer) || owner.standardConstructions[relation.construction.site] != relation.construction {
				t.Fatal("original selected assignment/New association absent")
			}
			// Qualify both authentic lookup directions independently before a
			// different required exit can stop the full result closure assertion.
			var lookupSources []sourceStagedOperationRecipe
			readerLookupReached, writerLookupReached := false, false
			for childKey, child := range work.operationRecipes {
				m := child.memberSource
				if m == nil || m.protocolSource == nil || m.protocolSource.constructedLookup == nil {
					continue
				}
				reader := sameOperationRequest(m.parent, recipe.constructed.request) && m.candidate.operation == writer.request.producer.operation
				writerParent := sameOperationRequest(m.parent, writer.request) && m.candidate.operation == recipe.constructed.request.producer.operation
				if !reader && !writerParent {
					continue
				}
				if !validConstructedLookupProtocolRecipe(child) || !work.constructedLookupSourceCurrent(child) {
					t.Fatal("original Get-parent/Set-parent lookup CURRENT positive UNREACHED")
				}
				id, adopted := work.operationIDs[childKey]
				if !adopted {
					t.Fatal("original lookup contribution not adopted")
				}
				state := &work.operations[id.index]
				delivered := false
				for _, subscriber := range state.subscribers {
					delivered = delivered || !subscriber.blocked && subscriber.consumed == state.revision && subscriber.applied == state.revision
				}
				if state.invalid || state.revision == 0 || !delivered {
					t.Fatal("original lookup contribution APPLIED positive UNREACHED")
				}
				readerLookupReached = readerLookupReached || reader
				writerLookupReached = writerLookupReached || writerParent
				lookupSources = append(lookupSources, child)
			}
			if !readerLookupReached || !writerLookupReached {
				t.Fatal("genuine original Get-parent/Set-parent lookup contributions UNREACHED")
			}
			t.Log("genuine original Get-parent and Set-parent lookup CURRENT/APPLIED positives reached")
			var calleeSources []sourceStagedOperationRecipe
			readerGetReached, writerGetReached := false, false
			for childKey, child := range work.operationRecipes {
				m := child.memberSource
				if m == nil || m.protocolSource == nil || m.protocolSource.constructedLookup == nil || !m.protocolSource.constructedLookup.calleeOnly {
					continue
				}
				readerGet := sameOperationRequest(m.parent, writer.request) && m.candidate.operation == recipe.constructed.get
				writerGet := sameOperationRequest(m.parent, recipe.constructed.request) && m.candidate.operation == writer.get
				if !readerGet && !writerGet {
					continue
				}
				if !validConstructedLookupProtocolRecipe(child) || !work.constructedLookupSourceCurrent(child) {
					t.Fatal("original property Get-only CURRENT positive UNREACHED")
				}
				id, adopted := work.operationIDs[childKey]
				if !adopted {
					t.Fatal("original property Get-only source not adopted")
				}
				state := &work.operations[id.index]
				delivered := false
				for _, subscriber := range state.subscribers {
					delivered = delivered || !subscriber.blocked && subscriber.consumed == state.revision && subscriber.applied == state.revision
				}
				if state.revision == 0 || state.invalid || !delivered {
					t.Fatal("original property Get-only APPLIED positive UNREACHED")
				}
				for _, call := range m.protocolSource.constructedLookup.calls {
					getRequest := constructedMemberRequest(&call, "method-lookup")
					get := work.operationRecipes[getRequest.producer]
					releasedGet = get
					if !work.constructedMethodGetCurrent(get) {
						t.Fatal("original finishing Get event not current")
					}
					for _, required := range get.delta.required {
						if sameOperationRequest(required, call.request) || sameOperationRequest(required, constructedMemberRequest(&call, "eager-inputs")) {
							t.Fatal("method Get borrowed future invocation/eager Effects")
						}
					}
				}
				readerGetReached = readerGetReached || readerGet
				writerGetReached = writerGetReached || writerGet
				calleeSources = append(calleeSources, child)
			}
			if !readerGetReached || !writerGetReached {
				t.Fatal("original property Get-only directions UNREACHED")
			}
			t.Log("genuine original property Get-only CURRENT/APPLIED positives reached")
			// The original C demand must issue the later inner.get source once,
			// including its true upstream result reader, without an ordinary use.
			var downstreamSources []sourceStagedOperationRecipe
			downstreamCalls, downstreamGets := 0, 0
			upstreamDelivered := false
			for childKey, child := range work.operationRecipes {
				m := child.memberSource
				if m == nil || m.protocolSource == nil || m.protocolSource.constructedLookup == nil || (m.candidate.operation != downstream && m.candidate.operation != downstream.Expression()) {
					continue
				}
				if !validConstructedLookupProtocolRecipe(child) || !work.constructedLookupSourceCurrent(child) {
					t.Fatal("original coverage-demanded downstream Call/Get CURRENT UNREACHED")
				}
				id, adopted := work.operationIDs[childKey]
				if !adopted {
					t.Fatal("downstream source not enrolled")
				}
				state := &work.operations[id.index]
				delivered := false
				for _, subscriber := range state.subscribers {
					delivered = delivered || !subscriber.blocked && subscriber.applied == state.revision && subscriber.consumed == state.revision
				}
				if state.invalid || state.revision == 0 || !state.delta.extracted || !delivered {
					t.Fatal("coverage-demanded downstream Call/Get APPLIED UNREACHED")
				}
				downstreamSources = append(downstreamSources, child)
				if m.candidate.operation == downstream {
					downstreamCalls++
				} else {
					downstreamGets++
				}
				for _, input := range m.protocolSource.constructedLookup.receiverInputs {
					if input.producer.operation != read || input.reading.operation != downstream {
						continue
					}
					inputID := work.operationIDs[input.producer]
					if inputID.epoch != work.operationEpoch || inputID.index == 0 {
						t.Fatal("actual upstream DATA reader absent")
					}
					inputState := &work.operations[inputID.index]
					subscriber := inputState.subscribers[sourceStagedOperationConsumer{input.consumer, input.edge}]
					if !inputState.delta.extracted || inputState.revision == 0 || subscriber == nil || subscriber.blocked || subscriber.consumed != inputState.revision || subscriber.applied != inputState.revision || len(subscriber.returned) == 0 {
						t.Fatal("original downstream receiver DATA APPLIED UNREACHED")
					}
					ownedByC := false
					for _, source := range m.protocolSource.constructedLookup.calls {
						if source.request.producer.operation != downstream {
							continue
						}
						coverage := work.operationRecipes[stagedMemberCoverageRequest(source.request, source.construction.site, source.cut).producer]
						if !validStagedMemberCoverageRecipe(coverage) || !work.stagedMemberResultReading(input, source.request, source.cut) {
							t.Fatal("receiver DATA lost original Get C owner")
						}
						for _, required := range coverage.delta.required {
							ownedByC = ownedByC || sameOperationRequest(required, input)
						}
						root := work.operationRecipes[source.request.producer]
						if !work.constructedDeliveredReceiverPayloads(root, read) {
							t.Fatal("root extraction replaced original delivered payload evidence")
						}
						releasedReceiverRoot, releasedUpstream = root, read
					}
					if !ownedByC {
						t.Fatal("actual receiver DATA reader not required by original Get C")
					}
					upstreamDelivered = true
				}
			}
			if downstreamCalls < 2 || downstreamGets < 2 || !upstreamDelivered {
				t.Fatal("original C-demanded Call/Get/upstream DATA connection UNREACHED")
			}
			t.Log("genuine coverage-demanded downstream Call/Get CURRENT/APPLIED and upstream DATA reached")

			if !work.closedOperationDependencies()[operation.index] {
				t.Fatal("original assignment result required closure pending; refusers UNREACHED")
			}
			state := &work.operations[operation.index]
			if state.revision == 0 || state.invalid {
				t.Fatal("result source did not publish")
			}
			if !work.freshConstructedProtocolMember(*recipe.constructed) || !work.freshConstructedProtocolMember(*writer) {
				t.Fatal("actual original reader/writer Get sources not current")
			}
			// Both original Get traversals must have published their real C and
			// delivered its current revision before result mutation controls.
			for _, member := range []*sourceStagedConstructedMember{recipe.constructed, writer} {
				request := stagedMemberCoverageRequest(member.request, member.construction.site, member.cut)
				coverage := work.operationRecipes[request.producer]
				id, exists := work.operationIDs[request.producer]
				if !validStagedMemberCoverageRecipe(coverage) || !coverage.delta.extracted || work.memberCoverageObserved[request.producer] != work.operationGeneration || !exists || id.epoch != work.operationEpoch {
					t.Fatal("original reader/writer coverage publication UNREACHED")
				}
				state := &work.operations[id.index]
				delivered := false
				for _, subscriber := range state.subscribers {
					delivered = delivered || !subscriber.blocked && subscriber.applied == state.revision && subscriber.consumed == state.revision
				}
				if state.invalid || state.revision == 0 || !delivered {
					t.Fatal("original reader/writer coverage APPLIED delivery UNREACHED")
				}
			}
			assignment := writer.actuals[1].endpoint.expression
			symbol := owner.checker.GetSymbolAtLocation(assignment.AsBinaryExpression().Left)
			if symbol == nil || symbol.ValueDeclaration != relation.binding || sourceInertValueCreation(assignment) || sourceInertValueCreation(relation.construction.site) {
				t.Fatal("source relation borrowed syntax/inertness instead of original binding")
			}
			found := false
			for _, value := range recipe.delta.exposures {
				found = found || sameOperationEndpoint(value.endpoint, writer.actuals[1].endpoint)
			}
			if !found {
				t.Fatal("original assignment source was replaced by native output/other endpoint")
			}
			delivered := false
			for _, sub := range state.subscribers {
				delivered = delivered || !sub.blocked && sub.applied == state.revision && len(sub.constructed) != 0
			}
			if !delivered {
				t.Fatal("actual result DATA subscriber delivery UNREACHED")
			}
			// Full writer/constructor phases remain actual graph requirements.
			required := []sourceStagedOperationRequest{relation.writer, relation.root, stagedMemberCoverageRequest(recipe.constructed.request, recipe.constructed.construction.site, recipe.constructed.cut), stagedMemberCoverageRequest(writer.request, writer.construction.site, writer.cut)}
			for _, phase := range stagedConstructionPhases {
				required = append(required, stagedConstructionRequest(relation.root, phase))
			}
			for _, debt := range required {
				present := false
				for _, old := range recipe.delta.required {
					present = present || sameOperationRequest(old, debt)
				}
				if !present {
					t.Fatal("assignment result lost original full Call/New phase", debt.producer.selector.field)
				}
			}
			for _, child := range lookupSources {
				id := work.operationIDs[child.key]
				if !work.closedOperationDependencies()[id.index] {
					t.Fatal("original method lookup contribution closure UNREACHED")
				}
				m := child.memberSource
				releasedLookup = child
				foreign := child
				foreign.memberSource = cloneStagedMemberSource(m)
				if work.constructedLookupSourceCurrent(foreign) {
					t.Fatal("copied lookup description borrowed original publication")
				}
				foreign.memberSource.extraction.mode = accessorSet | accessorNoGet
				if validConstructedLookupProtocolRecipe(foreign) {
					t.Fatal("property Set borrowed method-lookup clause")
				}
				foreign.memberSource = cloneStagedMemberSource(m)
				foreign.memberSource.parent = constructedMemberRequest(recipe.constructed, "member-result")
				if validConstructedLookupProtocolRecipe(foreign) {
					t.Fatal("stored result borrowed property-lookup clause")
				}
				foreign.memberSource = cloneStagedMemberSource(m)
				foreign.memberSource.protocolSource.constructedLookup.calls[0].kind = sourceNativeWeakMapSourceInstance
				if validConstructedLookupProtocolRecipe(foreign) {
					t.Fatal("non-method source borrowed intrinsic lookup clause")
				}
			}
			for _, child := range calleeSources {
				if !work.closedOperationDependencies()[work.operationIDs[child.key].index] {
					t.Fatal("property Get-only required closure UNREACHED")
				}
				foreign := child
				foreign.memberSource = cloneStagedMemberSource(child.memberSource)
				if work.constructedLookupSourceCurrent(foreign) {
					t.Fatal("copied property Get-only description borrowed observation")
				}
				foreign.memberSource.protocolSource.constructedLookup.calleeOnly = false
				if validConstructedLookupProtocolRecipe(foreign) {
					t.Fatal("property Get-only source paid whole Call")
				}
				foreign.memberSource = cloneStagedMemberSource(child.memberSource)
				foreign.memberSource.candidate.cut.reading = foreign.memberSource.candidate.operation
				if validConstructedLookupProtocolRecipe(foreign) {
					t.Fatal("foreign property Get consumer cut accepted")
				}
			}
			for _, child := range downstreamSources {
				p := child.memberSource.protocolSource.constructedLookup
				foreign := child
				foreign.memberSource = cloneStagedMemberSource(child.memberSource)
				for i, input := range p.receiverInputs {
					if input.producer.operation != read || input.reading.operation != downstream {
						continue
					}
					foreign.memberSource.protocolSource.constructedLookup.receiverInputs[i].cut.reading = downstream
					if validConstructedLookupProtocolRecipe(foreign) || work.constructedLookupSourceCurrent(foreign) {
						t.Fatal("foreign Get DATA cut borrowed receiver source")
					}
					if !sameOperationRequest(p.receiverInputs[i], input) {
						t.Fatal("clone receiver readset aliases original")
					}
					for _, source := range p.calls {
						if source.request.producer.operation != downstream {
							continue
						}
						root := work.operationRecipes[source.request.producer]
						copiedRoot := root
						copiedRoot.constructedInputs = nil
						if work.constructedDeliveredReceiverPayloads(copiedRoot, read) {
							t.Fatal("root X alone paid missing payload DATA")
						}
						alreadyOwned := false
						for _, old := range root.constructedInputs {
							alreadyOwned = alreadyOwned || sameOperationRequest(old, input)
						}
						if root.delta.extracted && !alreadyOwned {
							before := append([]sourceStagedOperationRequest(nil), root.delta.required...)
							if work.registerConstructedReceiverReading(facts, source.request, input) {
								t.Fatal("sealed root grew a later Get reader")
							}
							after := work.operationRecipes[source.request.producer].delta.required
							if !operationPrefix(before, after, sameOperationRequest) || !operationPrefix(after, before, sameOperationRequest) {
								t.Fatal("rejected root association changed required prefix")
							}
						}
					}
					break
				}
			}
			if !work.completeDemandedConstructedSource(facts, key, recipe.constructed, owner) || !work.completeDemandedConstructedSource(facts, key, writer, owner) {
				t.Fatal("original demanded role source association unavailable")
			}
			beforeRevisions := make([]uint64, len(work.operations))
			for i := range work.operations {
				beforeRevisions[i] = work.operations[i].revision
			}
			work.completeDemandedConstructedSource(facts, key, recipe.constructed, owner)
			work.completeDemandedConstructedSource(facts, key, writer, owner)
			if len(work.operations) != len(beforeRevisions) {
				t.Fatal("idempotent source roles created new operations")
			}
			for i, revision := range beforeRevisions {
				if work.operations[i].revision != revision {
					t.Fatal("idempotent source roles refreshed semantic revision")
				}
			}
			if work.completeDemandedConstructedSource(facts, writer.request.producer, writer, owner) {
				t.Fatal("ordinary full Call borrowed result-demand role service")
			}
			foreignSource := cloneConstructedMemberSource(*writer)
			foreignSource.cut.reading = nil
			if work.completeDemandedConstructedSource(facts, key, &foreignSource, owner) {
				t.Fatal("foreign physical cut borrowed passive source role publisher")
			}
			copied := recipe
			copied.constructedDisposition = cloneConstructedDisposition(proof)
			if work.constructedAssignmentResultsCurrent(copied) {
				t.Fatal("copied result description borrowed registered observation")
			}
			copied.constructedDisposition.resultAssignments[0].root.cut.reading = writer.request.producer.operation
			if validConstructedMemberRecipe(copied) {
				t.Fatal("foreign construction cut accepted")
			}
			copied = recipe
			copied.constructedDisposition = cloneConstructedDisposition(proof)
			copied.constructedDisposition.resultAssignments[0].construction.selectionComplete = false
			if validConstructedMemberRecipe(copied) {
				t.Fatal("unselected construction source accepted")
			}
			copied = recipe
			copied.delta = cloneOperationDelta(recipe.delta)
			for i, debt := range copied.delta.required {
				if sameOperationRequest(debt, relation.root) {
					copied.delta.required = append(copied.delta.required[:i], copied.delta.required[i+1:]...)
					break
				}
			}
			if validConstructedMemberRecipe(copied) || work.constructedAssignmentResultsCurrent(copied) {
				t.Fatal("missing original construction requirement accepted")
			}
			copied = recipe
			copied.delta = cloneOperationDelta(recipe.delta)
			originalC := stagedMemberCoverageRequest(writer.request, writer.construction.site, writer.cut)
			for i, debt := range copied.delta.required {
				if sameOperationRequest(debt, originalC) {
					copied.delta.required = append(copied.delta.required[:i], copied.delta.required[i+1:]...)
					break
				}
			}
			if validConstructedMemberRecipe(copied) || work.constructedAssignmentResultsCurrent(copied) {
				t.Fatal("missing original writer source C accepted")
			}
			if !work.constructedAssignmentResultsCurrent(recipe) {
				t.Fatal("negative control changed original result association")
			}
		}
		if reached == 0 {
			t.Fatal("genuine original assignment/New stored result UNREACHED")
		}
	}, activeModuleCompleteAnalysis)
	if releasedWork == nil || releasedWork.constructedAssignmentResultsCurrent(releasedRecipe) || releasedWork.constructedLookupSourceCurrent(releasedLookup) || releasedWork.constructedMethodGetCurrent(releasedGet) || releasedWork.constructedDeliveredReceiverPayloads(releasedReceiverRoot, releasedUpstream) {
		t.Fatal("released original generation retained result currentness")
	}
}
