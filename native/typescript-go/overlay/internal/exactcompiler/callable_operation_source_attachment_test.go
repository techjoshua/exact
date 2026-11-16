package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
	"testing"
)

// Actual selected algorithms may attach their finite required sources before
// adoption. An empty graph is not a missing semantic prerequisite. Fresh Get
// receipts, exact requests and required closure remain independently necessary.
func TestStagedOperationSourceAttachmentBeforeAdoption(t *testing.T) {
	withSourceCalleeWriteQuery(t, `export function invoke(){return Object.defineProperty({},'run',{})}`, func(query *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(query)
		declaration := enclosingCallableNode(call)
		request := sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: restrictedInvocationArguments(call.AsCallExpression())[2], request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: declaration, operation: call, kind: relativeDemandEffects}, consumer: declaration, edge: "attach-before-adoption", use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
		work := callableEffectWork{extracting: -1}
		observe := func() *sourceStagedNativeOccurrence {
			occurrence := &sourceStagedNativeOccurrence{}
			issued := request
			issued.occurrence = occurrence
			revoke, ok := query.beginStagedNativeGetSource(&work, facts, issued, consumeStagedNativeDescriptorAlgorithm)
			if !ok {
				t.Fatal("original source issuer refused")
			}
			query.receiverCandidates(call, nil)
			revoke()
			return occurrence
		}
		first := observe()
		if first.source == nil {
			t.Fatal("original selected source missing")
		}
		algorithm := work.operationRecipes[nativeRootDebtRequest(first.source, "algorithm").producer]
		if algorithm.nativeGet == nil || algorithm.nativeGet.descriptorGet != request.descriptorGet || len(algorithm.delta.required) != 6 {
			t.Fatal("source attachment required an adopted consumer")
		}
		if len(work.operationIDs) != 0 || len(facts[work.memberNodes[declaration]].staged.operationUses) != 0 {
			t.Fatal("passive source attachment activated consumer")
		}
		for _, field := range algorithm.delta.required {
			if _, exists := work.operationRecipes[field.producer]; !exists {
				t.Fatal("field source membership missing before adoption")
			}
		}
		// An unchanged source description can be re-observed without replacing its
		// refined envelope by empty debts. Only this new live Get supplies its receipt.
		second := observe()
		if first.callee == nil || second.callee == nil || first.callee == second.callee {
			t.Fatal("missing fresh original Get receipt")
		}
		if !work.adoptNativeInputOccurrence(facts, second) {
			t.Fatal("registered original source could not be adopted")
		}
		root := work.operationIDs[request.request.producer]
		if root.index == 0 || work.closedOperationDependencies()[root.index] {
			t.Fatal("adoption paid pending field obligations")
		}
	})
}

// Exercise the attachment contract only after the original selected source and
// Has/Get/algorithm dispatchers have produced otherwise eligible graph receipts.
// Copying their unchanged source metadata supplies no new semantic authority.
func TestStagedDescriptorBlueprintAttachmentPreservesOriginalReceipts(t *testing.T) {
	for _, fixture := range []string{
		`export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`,
		`export function invoke(){return Reflect.defineProperty({},'run',{value:()=>document.title})}`,
	} {
		const file = "/virtual/callee-write-inventory.ts"
		request := Request{Kind: "analyze", ID: file, Source: fixture, Diagnostics: "semantic"}
		// Inspect the normal collector before its generation's deferred release.
		// Pending public contribution publication is not a local receipt premise.
		withActiveModuleSourceWork(t, request, map[string]string{file: fixture}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
			generation := owner.values.generation
			if generation == nil || !generation.active || owner.project.activeGeneration != generation || work.operationGeneration != generation || owner.values.language == nil || owner.values.language.disposed {
				t.Fatal("original live source generation UNREACHED")
			}
			var selected *sourceStagedNativeGetSource
			for _, recipe := range work.operationRecipes {
				source := recipe.nativeGet
				if source == nil || !reflectiveNative(source.kind) || source.descriptorGet == nil || recipe.key.kind != relativeDemandEffects || recipe.key.selector.field != "algorithm" || recipe.key.selector.occurrence != source.get {
					continue
				}
				if selected != nil && !sameNativeGetSource(selected, source) {
					t.Fatal("ambiguous original descriptor algorithm source")
				}
				selected = source
			}
			if selected == nil {
				t.Fatal("original descriptor algorithm source UNREACHED")
			}
			actuals := restrictedInvocationArguments(selected.request.producer.operation.AsCallExpression())
			if len(actuals) != 3 || selected.descriptorGet != actuals[2] {
				t.Fatal("original descriptor source operand lost")
			}
			checkStagedDescriptorBlueprintReceipts(t, facts, work, selected, true)
		}, activeModuleCompleteAnalysis)
	}
}

// Use the original selected map/work entry while its generation is live. The
// entry producer supplies its descriptor; no graph, entry Get or field X is seeded.
func TestStagedMapFieldBlueprintAttachmentPreservesOriginalReceipts(t *testing.T) {
	const fixture = `export function invoke(){return Object.defineProperties({},{run:{value:1}})}`
	const file = "/virtual/callee-write-inventory.ts"
	request := Request{Kind: "analyze", ID: file, Source: fixture, Diagnostics: "semantic"}
	withActiveModuleSourceWork(t, request, map[string]string{file: fixture}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		generation := owner.values.generation
		if generation == nil || !generation.active || owner.project.activeGeneration != generation || work.operationGeneration != generation || owner.values.language == nil || owner.values.language.disposed {
			t.Fatal("original live map source generation UNREACHED")
		}
		var source *sourceStagedNativeGetSource
		for _, recipe := range work.operationRecipes {
			selected := recipe.nativeGet
			if selected == nil || selected.kind != sourceNativeObjectDefineProperties || selected.descriptorMap == nil || selected.descriptorEntry != nil || recipe.key != selected.descriptorMap.algorithm.producer {
				continue
			}
			if source != nil && !sameNativeGetSource(source, selected) {
				t.Fatal("ambiguous original map source")
			}
			source = selected
		}
		if source == nil {
			t.Fatal("original selected map source UNREACHED")
		}
		protocol := work.operationRecipes[source.descriptorMap.protocol.producer].mapProtocol
		if protocol == nil || len(protocol.entries) != 1 {
			t.Fatal("original map entry pipeline UNREACHED")
		}
		request, valid := stagedMapEntryRequest(source, protocol.entries[0])
		entry := work.operationRecipes[request.producer].mapEntry
		if !valid || entry == nil || entry.read == nil || entry.read.getter != nil || entry.read.accounting != sourceEffectsAccounted {
			t.Fatal("original DATA entry receipt UNREACHED")
		}
		field := stagedMapEntryFieldRequest(entry, "value")
		selected := work.operationRecipes[field.producer].nativeGet
		if selected == nil || selected.descriptorEntry != entry {
			t.Fatal("original map field association lost")
		}
		checkStagedDescriptorBlueprintReceipts(t, facts, work, selected, false)
	}, activeModuleCompleteAnalysis)
}

// Inspect real graph/subscriber receipts around description attachment. This
// checks local extraction and exact dependency retention, not full closure.
func checkStagedDescriptorBlueprintReceipts(t *testing.T, facts []callableFacts, work *callableEffectWork, source *sourceStagedNativeGetSource, algorithm bool) {
	t.Helper()
	requests := make([]sourceStagedOperationRequest, 0, len(reflectiveDescriptorKeys)+1)
	for _, field := range reflectiveDescriptorKeys {
		requests = append(requests, nativeDescriptorFieldRequest(source, field))
	}
	if algorithm {
		requests = append(requests, nativeRootDebtRequest(source, "algorithm"))
	}
	checkStagedBlueprintReceiptRequests(t, facts, work, source, requests)
}

func checkStagedBlueprintReceiptRequests(t *testing.T, facts []callableFacts, work *callableEffectWork, source *sourceStagedNativeGetSource, requests []sourceStagedOperationRequest) {
	t.Helper()
	type receipt struct {
		pointer           *sourceStagedOperationSubscriber
		request           sourceStagedOperationRequest
		consumed, applied uint64
		cursor            sourceStagedOperationCursor
		blocked           bool
	}
	snapshot := func(sub *sourceStagedOperationSubscriber) receipt {
		return receipt{sub, sub.request, sub.consumed, sub.applied, sub.cursor, sub.blocked}
	}
	for _, request := range requests {
		t.Run(request.producer.selector.field, func(t *testing.T) {
			id, found := work.operationIDs[request.producer]
			if !found || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
				t.Fatal("original required producer UNREACHED")
			}
			recipe := work.operationRecipes[request.producer]
			state := &work.operations[id.index]
			if state.key != request.producer || recipe.delta.extracted || !validOperationEnvelope(recipe) || !sameNativeGetSource(recipe.nativeGet, source) || !state.delta.extracted || state.revision == 0 || state.invalid || !state.dependenciesRegistered || len(state.subscribers) == 0 {
				t.Fatal("otherwise eligible original field/algorithm receipt UNREACHED")
			}
			if stagedDescriptorFieldIndex(request.producer.selector.field) >= 0 && state.fieldDisposition == nil {
				t.Fatal("original field publisher receipt UNREACHED")
			}
			originalDelta := cloneOperationDelta(state.delta)
			revision, disposition := state.revision, state.fieldDisposition
			dependencies := slices.Clone(state.dependencies)
			if len(dependencies) != len(recipe.delta.required) || len(dependencies) == 0 && (source.eager == nil || !sameOperationRequest(request, source.eager.request) || len(source.eager.calls) == 0) {
				t.Fatal("original full required memberships lost")
			}
			subscribers := make(map[sourceStagedOperationConsumer]receipt, len(state.subscribers))
			for key, sub := range state.subscribers {
				subscribers[key] = snapshot(sub)
			}
			children := make([]receipt, len(dependencies))
			childRevisions := make([]uint64, len(dependencies))
			for i, d := range dependencies {
				if d.producer.epoch != work.operationEpoch || d.producer.index == 0 || int(d.producer.index) >= len(work.operations) || !sameOperationRequest(d.request, recipe.delta.required[i]) {
					t.Fatal("required child identity/order lost")
				}
				child := &work.operations[d.producer.index]
				sub := child.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
				if sub == nil || !sameOperationRequest(sub.request, d.request) {
					t.Fatal("actual child subscriber missing")
				}
				children[i] = snapshot(sub)
				childRevisions[i] = child.revision
			}
			next := recipe
			description := *recipe.nativeGet
			next.nativeGet = &description
			if !work.attachOperationSource(facts, next) {
				t.Fatal("description attachment rejected original-owner extracted graph")
			}
			// The generic publisher must still reject this same unextracted blueprint.
			if work.publishOperation(id, next.delta) {
				t.Fatal("generic publication admitted extraction downgrade")
			}
			state = &work.operations[id.index]
			retained := work.operationRecipes[request.producer]
			if work.operationIDs[request.producer] != id || retained.nativeGet != &description || retained.delta.extracted || state.revision != revision || !state.delta.extracted || state.invalid || !state.dependenciesRegistered || state.fieldDisposition != disposition || !operationDeltaPrefix(originalDelta, state.delta) || !operationDeltaPrefix(state.delta, originalDelta) || !slices.Equal(state.dependencies, dependencies) || len(state.subscribers) != len(subscribers) {
				t.Fatal("attachment changed original graph receipt, description or required memberships")
			}
			for key, before := range subscribers {
				sub := state.subscribers[key]
				if sub == nil || snapshot(sub) != before {
					t.Fatal("attachment replaced or recertified original subscriber")
				}
			}
			for i, d := range dependencies {
				child := &work.operations[d.producer.index]
				sub := child.subscribers[sourceStagedOperationConsumer{d.request.consumer, d.request.edge}]
				if sub == nil || snapshot(sub) != children[i] || child.revision != childRevisions[i] {
					t.Fatal("attachment changed required child receipt/consumed/APPLIED/blocked state")
				}
			}
		})
	}
}

// The ordinary extractor owns local root X; source attachment must preserve it
// without paying any recursive child debt or recertifying a subscriber.
func TestStagedReflectiveRootBlueprintAttachmentPreservesOriginalReceipts(t *testing.T) {
	for _, fixture := range []struct{ name, source string }{
		{"Object", `export function invoke(){return Object.defineProperty({},'run',{value:()=>document.title})}`},
		{"Reflect", `export function invoke(){return Reflect.defineProperty({},'run',{value:()=>document.title})}`},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			const file = "/virtual/callee-write-inventory.ts"
			request := Request{Kind: "analyze", ID: file, Source: fixture.source, Diagnostics: "semantic"}
			withActiveModuleSourceWork(t, request, map[string]string{file: fixture.source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
				generation := owner.values.generation
				if generation == nil || !generation.active || owner.project.activeGeneration != generation || work.operationGeneration != generation || owner.values.language == nil || owner.values.language.disposed {
					t.Fatal("original live reflective root generation UNREACHED")
				}
				var selected *sourceStagedNativeGetSource
				for _, recipe := range work.operationRecipes {
					source := recipe.nativeGet
					if source == nil || !reflectiveNative(source.kind) || recipe.key != source.request.producer {
						continue
					}
					if selected != nil && !sameNativeGetSource(selected, source) {
						t.Fatal("ambiguous original reflective root source")
					}
					selected = source
				}
				if selected == nil || selected.effectsSource != nil || selected.inputInvocation != nil || selected.descriptorEntry != nil || selected.descriptorMap != nil || selected.request.producer.kind != relativeDemandEffects || selected.request.producer.selector != (sourceStagedOperationSelector{}) {
					t.Fatal("original selected-only reflective root UNREACHED")
				}
				checkStagedBlueprintReceiptRequests(t, facts, work, selected, []sourceStagedOperationRequest{selected.request})
			}, activeModuleCompleteAnalysis)
		})
	}
}

// Use the original composed target fixture and original authored-call witness.
// The actual fallback owner must have extracted its graph without extracting the
// description. No ready bit, source task, binding or receipt is supplied here.
func TestStagedReflectiveEagerBlueprintAttachmentPreservesOriginalReceipts(t *testing.T) {
	for _, row := range []struct {
		name, file, source string
		callers            map[string]bool
		calls              int
	}{
		{"target_and_descriptor", "/virtual/native-create-target-source.ts", stagedNativeCreateTargetSource, map[string]bool{"saved": true, "reflectSaved": true}, 0},
		{"authored_call", "/virtual/eager-binding.ts", stagedEagerCallWitness, map[string]bool{"invoke": true}, 1},
	} {
		t.Run(row.name, func(t *testing.T) {
			request := Request{Kind: "analyze", ID: row.file, Source: row.source, Diagnostics: "semantic", stagedReplacement: true}
			withActiveModuleSourceWork(t, request, map[string]string{row.file: row.source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
				generation := owner.values.generation
				if generation == nil || !generation.active || owner.project.activeGeneration != generation || work.operationGeneration != generation || owner.values.language == nil || owner.values.language.disposed {
					t.Fatal("original live eager owner generation UNREACHED")
				}
				seen := make(map[string]bool)
				for key, recipe := range work.operationRecipes {
					source := recipe.nativeGet
					if source == nil || !reflectiveNative(source.kind) || source.eager == nil || key.selector != (sourceStagedOperationSelector{occurrence: source.get, field: "eager-inputs"}) {
						continue
					}
					caller, known := work.memberNodes[source.request.consumer]
					if !known || caller < 0 || caller >= len(facts) {
						t.Fatal("original eager consumer missing")
					}
					name := facts[caller].summary.Name
					if !row.callers[name] {
						continue
					}
					if seen[name] || key.kind != relativeDemandEffects || source.effectsSource != nil || source.inputInvocation != nil || source.descriptorEntry != nil || source.descriptorMap != nil || len(source.eager.calls) != row.calls || len(source.eager.operations) != 0 || len(source.keySources) != 0 {
						t.Fatal("original eager fallback owner identity or plan UNREACHED", name)
					}
					id, found := work.operationIDs[key]
					if !found || id.epoch != work.operationEpoch || id.index == 0 || int(id.index) >= len(work.operations) {
						t.Fatal("original eager task UNREACHED", name)
					}
					state := &work.operations[id.index]
					if len(state.eagerCalls) != row.calls {
						t.Fatal("original eager binder consumer UNREACHED", name)
					}
					for _, item := range state.eagerCalls {
						if item.inputs == nil || !item.inputs.delivered || item.inputs.request.operation != item.call.invocation.operation || item.inputs.bound.operation != item.call.invocation.operation || item.inputs.bound.cut != item.inputs.request.cut || item.inputs.bound.cut.operation != item.call.invocation.operation || item.inputs.bound.cut.reading != item.call.invocation.operation || item.inputs.bound.cut.operation == source.request.producer.operation {
							t.Fatal("authentic eager initializer binder/cut UNREACHED", name)
						}
					}
					if row.calls == 0 {
						if !source.eager.targetPending || len(recipe.delta.required) == 0 || !sameOperationRequest(recipe.delta.required[0], nativeEagerTargetRequest(source)) || (name == "saved") != (source.eager.descriptorData.producer.operation != nil) {
							t.Fatal("original target/DATA required prefix lost", name)
						}
					}
					var checkSummary func()
					if row.calls != 0 {
						item := state.eagerCalls[0]
						key := sourceStagedDependencyKey{consumer: caller, edge: item.edge}
						membership := work.stagedRequired[key]
						producer, known := work.memberNodes[item.call.invocation.declaration]
						if !known || membership == nil || membership.invalid || membership.producer != producer || membership.operation != item.call.invocation.operation || membership.cut != item.call.invocation.cut {
							t.Fatal("actual eager summary debt UNREACHED", name)
						}
						operation, cut := membership.operation, membership.cut
						checkSummary = func() {
							current := work.stagedRequired[key]
							retained := work.operations[id.index].eagerCalls[0]
							if current != membership || current.invalid || current.producer != producer || current.operation != operation || current.cut != cut || retained.inputs != item.inputs || retained.ready != item.ready || retained.transferred != item.transferred {
								t.Fatal("attachment changed original summary debt or binder delivery", name)
							}
						}
					}
					checkStagedBlueprintReceiptRequests(t, facts, work, source, []sourceStagedOperationRequest{source.eager.request})
					if checkSummary != nil {
						checkSummary()
					}
					seen[name] = true
				}
				for name := range row.callers {
					if !seen[name] {
						t.Fatal("original eager fallback receipt consumer UNREACHED", name)
					}
				}
				if work.nativeEagerExecution != nil || work.nativeEffectsExecution != nil {
					t.Fatal("original eager execution frame escaped collection")
				}
			}, activeModuleCompleteAnalysis)
		})
	}
}
