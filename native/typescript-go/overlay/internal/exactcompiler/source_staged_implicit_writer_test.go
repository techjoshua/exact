package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This is the original function producer->binding DATA->Freeze caller. The
// positive requires the actual raw reflective candidate to be accounted, not a
// count of descriptions, an input-only receipt or whole-function NoUser law.
func TestOriginalFunctionImplicitWriterConnected(t *testing.T) {
	const source = `export function invoke(){const value=Object.defineProperties({}, {x:{value:1}});return Object.freeze(value)}`
	const id = "/virtual/function-implicit-writer.ts"
	request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic", stagedReplacement: true}
	withActiveModuleSourceWork(t, request, map[string]string{id: source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		current := 0
		for key, recipe := range work.operationRecipes {
			member := recipe.memberSource
			if member == nil || member.nativeWriter == nil || member.nativeWriter.provenance != nativeWriterEmptyImplicitSources {
				continue
			}
			input := work.implicitNativeSource(member.nativeWriter.source)
			if input == nil {
				t.Fatal("original selected source missing")
			}
			// Preserve semantic short circuit and report the actual failed owner.
			// The source renewal control uses a separate real work; its currentness
			// must not be inferred for this original active collector interval.
			if !work.nativeEagerPrimitiveCurrent(input) {
				owner, _ := nativeEagerReceiptRequest(input)
				receipt := work.entryLawReceipts[owner.producer]
				t.Logf("raw original primitive source=%+v inputKind=%d Get=%p method=%p owner=%+v receipt=%p", input.request, input.kind, input.get, input.method, owner, receipt)
				if receipt != nil {
					t.Logf("raw receipt source=%p slotOwner=%+v generation=%p graphGeneration=%p cut=%+v", receipt.source, receipt.nativeEagerOwner, receipt.generation, work.operationGeneration, receipt.cut)
					if receipt.issuer != nil {
						t.Logf("raw receipt self=%p epoch=%p graphEpoch=%p", receipt.issuer.proof, receipt.issuer.epoch, work.operationEpoch)
					}
					if w := receipt.nativeEager; w != nil {
						t.Logf("raw original witness=%p self=%p admitted=%t delivered=%t pendingSource=%t GetID=%+v proof=%+v originalVector=%v", w, w.issuer, w.admitted, w.delivered, w.needsSourceAdmission, w.get, w.proof, w.vector)
					}
				}
				t.Fatal("FIRSTFALSE primitive input receipt; aggregate/candidate UNREACHED")
			}
			if !work.implicitDefinitionSourcesCurrent(input) {
				t.Logf("raw original aggregate source=%+v algorithm=%+v descriptorMap=%t inputEffects=%t", input.request, member.nativeWriter.accounting, input.descriptorMap != nil, input.inputEffects)
				if plan := input.descriptorMap; plan != nil {
					pid := work.operationIDs[plan.protocol.producer]
					t.Logf("raw map protocol=%+v ID=%+v argumentSource=%t", plan.protocol, pid, plan.argumentSource != nil)
					if pid.epoch == work.operationEpoch && pid.index != 0 && int(pid.index) < len(work.operations) {
						p := &work.operations[pid.index]
						t.Logf("raw map state invalid=%t deps=%t X=%t rev=%d observation=%p", p.invalid, p.dependenciesRegistered, p.delta.extracted, p.revision, p.implicitMap)
					}
				}
				t.Fatal("FIRSTFALSE complete implicit-source aggregate; candidate UNREACHED")
			}
			if !work.implicitWriterCapabilityCurrent(recipe) {
				t.Logf("raw original candidate=%+v parent=%+v coverage=%+v generation=%p observationGeneration=%p requiredCount=%d", recipe.memberSource.request, member.parent, member.nativeWriter.coverage, member.generation, work.memberCoverageObserved[recipe.key], len(recipe.delta.required))
				t.Fatal("FIRSTFALSE original candidate accounting")
			}
			state := &work.operations[work.operationIDs[key].index]
			if !state.delta.extracted || !operationContainsRequest(recipe.delta.required, input.request) || !operationContainsRequest(recipe.delta.required, nativeRootDebtRequest(input, "algorithm")) {
				t.Fatal("candidate failed to retain full Call/algorithm debt")
			}
			if work.nativeEagerWitnessCurrent(input) {
				t.Fatal("function primitive input borrowed module-law wrapper")
			}
			law, _ := nativeEagerLawRequest(input)
			if validStagedEntryLawRecipe(work.operationRecipes[law.producer]) {
				t.Fatal("function obtained module algorithm-law factory")
			}
			current++
			assertOriginalImplicitLookupSources(t, work, input)
			assertOriginalCurrentNativeEagerReceipt(t, work, input, work.nativeEagerPrimitiveCurrent)
			assertOriginalNativeWriterCapability(t, work, facts, owner)
			// Wrong physical cut is a copied description, never a producer mutation.
			wrong := recipe
			copyMember := *member
			payload := *member.nativeWriter
			payload.coverage.cut.operation = nil
			if payload.coverage.cut == member.nativeWriter.coverage.cut {
				t.Fatal("wrong-cut control unchanged")
			}
			copyMember.nativeWriter = &payload
			wrong.memberSource = &copyMember
			if work.implicitWriterCapabilityCurrent(wrong) || work.nativeWriterRefinementAllowed(recipe, wrong) {
				t.Fatal("wrong C cut borrowed implicit accounting")
			}
			clone := make([]callableFacts, len(facts))
			for i := range facts {
				clone[i] = cloneProjectCallableFact(facts[i])
			}
			fresh := registerCallableEffectWork(clone)
			for i := range fresh.operations {
				if fresh.operations[i].implicitField != nil || fresh.operations[i].implicitMap != nil || fresh.operations[i].fieldDisposition != nil {
					t.Fatal("clone retained original semantic observations")
				}
			}
			if len(fresh.entryLawReceipts) != 0 || len(fresh.memberCoverageObserved) != 0 {
				t.Fatal("clone retained primitive/candidate currency")
			}
		}
		if current == 0 {
			t.Fatal("UNREACHED original function raw candidate; no positive claimed")
		}
	}, activeModuleCompleteAnalysis)
}

// Side-effect fixtures retain their original source operations and every known
// body/dependency. A typed normal coverage refusal is reported as upstream
// UNREACHED, never as downstream semantic-negative qualification.
func TestOriginalFunctionImplicitWriterBoundaries(t *testing.T) {
	for _, row := range []struct {
		name, source string
		getter       bool
	}{
		{"descriptor getter", `export function invoke(){const value=Object.defineProperties({}, {x:{get value(){Object.defineProperty(Object,'freeze',{value:()=>1});return 1}}});return Object.freeze(value)}`, true},
		{"unknown sibling", `declare const descriptor:PropertyDescriptor;export function invoke(){const value=Object.defineProperties({}, {x:{value:1},y:descriptor});return Object.freeze(value)}`, false},
		{"mixed callee", `declare const flag:boolean;function authored(a:object,b:PropertyDescriptorMap){Object.defineProperty(Object,'freeze',{value:()=>1});return a}export function invoke(){const define=flag?Object.defineProperties:authored;const value=define({}, {x:{value:1}});return Object.freeze(value)}`, false},
		{"computed key coercion", `const key={ [Symbol.toPrimitive](){Object.defineProperty(Object,'freeze',{value:()=>1});return 'x'}};export function invoke(){const value=Object.defineProperties({}, {[key as unknown as string]:{value:1}});return Object.freeze(value)}`, false},
		{"Proxy target", `export function invoke(){const target=new Proxy({}, {defineProperty(){Object.defineProperty(Object,'freeze',{value:()=>1});return true}});const value=Object.defineProperties(target,{x:{value:1}});return Object.freeze(value)}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			const id = "/virtual/function-implicit-boundary.ts"
			request := Request{Kind: "analyze", ID: id, Source: row.source, Diagnostics: "semantic", stagedReplacement: true}
			reached := false
			defer func() {
				if value := recover(); value != nil {
					if _, supported := value.(stagedReplacementGap); supported {
						t.Skipf("UNREACHED downstream source owner: %v", value)
					}
					panic(value)
				}
			}()
			withActiveModuleSourceWork(t, request, map[string]string{id: row.source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
				reached = true
				knownBody := false
				for key, recipe := range work.operationRecipes {
					if member := recipe.memberSource; member != nil && member.nativeWriter != nil && member.nativeWriter.provenance == nativeWriterEmptyImplicitSources && work.nativeWriterCapabilityCurrent(recipe) {
						t.Fatal("unsafe implicit writer became CURRENT", key.selector.field)
					}
					id := work.operationIDs[key]
					if id.index == 0 || id.epoch != work.operationEpoch {
						continue
					}
					state := &work.operations[id.index]
					if state.fieldDisposition == nil {
						continue
					}
					for _, invoked := range state.fieldDisposition.invoked {
						for _, required := range state.getters {
							if required.declaration == invoked.declaration && required.demand.request.producer.operation == invoked.operation {
								knownBody = true
							}
						}
					}
				}
				if row.getter && !knownBody {
					t.Fatal("UNREACHED original getter body dependency; no debt-retention claim")
				}
				_ = facts
				_ = owner
			}, activeModuleCompleteAnalysis)
			if !reached {
				t.Fatal("original live source owner unavailable")
			}
		})
	}
}

// A function's primitive input event precedes adoption and has no module-law
// authority. Two original observations may describe identical factories; only
// the exact newest occurrence can complete its own pending receipt slot.
func TestOriginalFunctionNativeInputReceiptBeforeAdoption(t *testing.T) {
	const source = `export function invoke(){const value=Object.defineProperties({}, {x:{value:1}});return Object.freeze(value)}`
	withReflectiveRelevanceSource(t, source, func(owner *executableBodyOwner, file *ast.SourceFile) {
		facts := stagedReturnSourceFacts(file)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		var call *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) && n.Expression().Name().Text() == "defineProperties" {
				call = n
			}
			return true
		})
		if call == nil {
			t.Fatal("original selected function call missing")
		}
		work := registerCallableEffectWork(facts)
		consumer, owned := work.memberNodes[enclosingCallableNode(call)]
		if !owned {
			t.Fatal("original function fact missing")
		}
		original, described := stagedNativeInputOccurrenceRequest(&facts[consumer], call)
		if !described {
			t.Fatal("original occurrence description refused")
		}
		request := sourceStagedNativeRequest{request: original, call: call, get: call.Expression(), algorithmKind: sourceNativeObjectDefineProperties}
		observe := func() *sourceStagedNativeOccurrence {
			result, visited := work.observeSelectedNativeGetSource(facts, consumer, request, owner)
			if !visited || result == nil || result.source == nil || result.callee == nil || result.eagerIssuer != result || result.eagerWitness == nil {
				t.Fatal("UNREACHED genuine complete function input/Get event")
			}
			return result
		}
		first := observe()
		key, valid := nativeEagerReceiptRequest(first.source)
		receipt := work.entryLawReceipts[key.producer]
		if !valid || receipt == nil || receipt.source != nil || receipt.nativeEager != first.eagerWitness || !sameOperationRequest(receipt.nativeEagerOwner, key) || first.eagerWitness.admitted || work.nativeEagerPrimitiveCurrent(first.source) {
			t.Fatal("pending primitive event lost its owner or gained currentness")
		}
		get := nativeRootDebtRequest(first.source, "callee-get")
		if id := work.operationIDs[get.producer]; id.index != 0 {
			t.Fatal("before-adoption fixture already adopted the original Get")
		}
		second := observe()
		if first.eagerWitness == second.eagerWitness || receipt.nativeEager != second.eagerWitness || first.callee == second.callee {
			t.Fatal("fresh selected event reused old event identity")
		}
		if work.completeNativeEagerOccurrence(first) {
			t.Fatal("old occurrence consumed newer pending slot")
		}
		copied := *second
		if work.completeNativeEagerOccurrence(&copied) {
			t.Fatal("copied occurrence consumed original receipt")
		}
		if !work.adoptNativeInputSourceRequirements(facts, second) {
			t.Fatal("actual function source occurrence adoption refused")
		}
		// Completion can legitimately wait for C/ACK. Adoption is not a current grant.
		if receipt.nativeEager != second.eagerWitness || work.nativeEagerWitnessCurrent(second.source) {
			t.Fatal("ordinary function adoption borrowed/replaced module-law rights")
		}
		clones := make([]callableFacts, len(facts))
		for i := range facts {
			clones[i] = cloneProjectCallableFact(facts[i])
		}
		fresh := registerCallableEffectWork(clones)
		if len(fresh.entryLawReceipts) != 0 || fresh.completeNativeEagerOccurrence(second) {
			t.Fatal("clone inherited pending event/admission rights")
		}
	})
}

func TestOriginalFunctionNativeInputReceiptRenewal(t *testing.T) {
	const source = `export function invoke(){const value=Object.defineProperties({}, {x:{value:1}});return Object.freeze(value)}`
	assertNativeInputReceiptRenewal(t, source, func(t *testing.T, work *callableEffectWork) *sourceStagedNativeGetSource {
		t.Helper()
		for _, recipe := range work.operationRecipes {
			s := recipe.nativeGet
			if s != nil && s.kind == sourceNativeObjectDefineProperties && recipe.key == s.request.producer && ast.IsFunctionLike(s.request.consumer) {
				return s
			}
		}
		return nil
	}, func(work *callableEffectWork, source *sourceStagedNativeGetSource) bool {
		return work.nativeEagerPrimitiveCurrent(source)
	})
}

// A real current C must exercise the actual protocol->Get handoff before its
// copied Call/phase/cut/request controls can claim meaningful refusal coverage.
func assertOriginalImplicitLookupSources(t *testing.T, work *callableEffectWork, source *sourceStagedNativeGetSource) {
	t.Helper()
	id := work.operationIDs[source.descriptorMap.protocol.producer]
	phase := work.operations[id.index].implicitMap
	if phase == nil {
		t.Fatal("original Enum C UNREACHED")
	}
	coverage := work.operationRecipes[phase.coverage.producer]
	found := 0
	for _, request := range coverage.delta.required {
		recipe := work.operationRecipes[request.producer]
		if recipe.memberSource == nil || recipe.memberSource.protocolSource == nil {
			continue
		}
		if !work.implicitLookupSourceCurrent(recipe, coverage, request) {
			continue
		}
		found++
		p := recipe.memberSource.protocolSource
		lookup := work.operationRecipes[p.required.producer].nativeGet
		if lookup == nil {
			t.Fatal("current lookup lost native Get factory")
		}
		for _, wrong := range []sourceStagedOperationRequest{lookup.request, nativeRootDebtRequest(lookup, "algorithm"), nativeRootDebtRequest(lookup, "eager-inputs")} {
			copyRecipe := recipe
			member := *recipe.memberSource
			protocol := *p
			protocol.required = wrong
			member.protocolSource = &protocol
			copyRecipe.memberSource = &member
			copyRecipe.delta = cloneOperationDelta(recipe.delta)
			copyRecipe.delta.required = []sourceStagedOperationRequest{wrong}
			if work.implicitLookupSourceCurrent(copyRecipe, coverage, request) {
				t.Fatal("Call/adjacent phase paid lookup-only source")
			}
		}
		wrong := request
		wrong.edge += ":foreign"
		if work.implicitLookupSourceCurrent(recipe, coverage, wrong) {
			t.Fatal("foreign reader borrowed lookup source")
		}
		copyCoverage := coverage
		member := *coverage.memberSource
		set := *member.coverage
		set.cut = sourceRelativeCut{}
		member.coverage = &set
		copyCoverage.memberSource = &member
		if set.cut == coverage.memberSource.coverage.cut {
			t.Fatal("wrong C cut control unchanged")
		}
		if work.implicitLookupSourceCurrent(recipe, copyCoverage, request) {
			t.Fatal("wrong C cut borrowed lookup source")
		}
	}
	if found == 0 {
		t.Fatal("genuine current typed lookup wrapper UNREACHED")
	}
}
