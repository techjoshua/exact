package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"path/filepath"
	"testing"
)

// The same original SOURCE field journey used by the current-transport test
// supplies the actual purpose, selected prefix and issuer. No test calls a Get,
// selects a callee, publishes a receipt or seeds a graph to reach discovery.
func TestStagedFreezePrefixSynchronousOriginalConsumer(t *testing.T) {
	const id = "/virtual/member-input-owner-causal.ts"
	const source = `const identity=Symbol.for('@test/identity');
const inputGeneration=Symbol.for('@test/input-generation');
const metadata=Symbol.for('@test/metadata');
const empty=Object.freeze(Object.defineProperties({},{[identity]:{value:true},[inputGeneration]:{value:1}}));
const domainOperationPrototypes=new WeakMap<object,WeakMap<object,object>>();
function domainOperationPrototype(prototype:object,domain:object):object{
 let domains=domainOperationPrototypes.get(prototype);
 if(!domains)domainOperationPrototypes.set(prototype,(domains=new WeakMap<object,object>()));
 let owned=domains.get(domain);
 if(!owned){
  const descriptors:object=Object.create(prototype);
  owned=Object.freeze(Object.defineProperty(descriptors,metadata,{value:Object.freeze({domain})}));
  domains.set(domain,owned);
 }
 return owned;
}
export function invoke(){return domainOperationPrototype({},{});}`
	request := Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}
	checkFreezePrefixOriginalEntry(t, request, map[string]string{id: source}, nil, false)
}

// The preparation consumer reuses the unchanged original Generic fixture and
// setup. Its selected terminal assertions remain in the original owning test.
func TestStagedFreezePrefixPreparationOriginalConsumer(t *testing.T) {
	fixture := newStagedOriginalCacheFixture(t)
	request := fixture.request("analyze", "component-abi/opaque-operation.ts")

	sources := make(map[string]string, len(fixture.files))
	for name, source := range fixture.files {
		sources[filepath.Join(fixture.root, name)] = source
	}
	imports := []string{filepath.Join(fixture.root, "component/contract-versions.ts")}
	checkFreezePrefixOriginalEntry(t, request, sources, imports, true)
}

func checkFreezePrefixOriginalEntry(t *testing.T, request Request, sources map[string]string, imports []string, requirePreparation bool) {
	wrapped := make(map[*sourceStagedMemberBorrow]bool)
	pendingFields, physical, preparation := 0, 0, 0
	checked := false
	var expired func() bool
	withActiveModuleSourceWorkSetup(t, request, sources, imports, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		for _, publisher := range owner.pendingMemberPublishers {
			if publisher.workRegistrar == nil || publisher.workRegistrar.writerScopeSource == nil {
				continue
			}
			original := publisher.workRegistrar.writerScopeSource
			publisher.workRegistrar.writerScopeSource = func(q *sourceValueQuery, r *sourceWriterInputRequest) {
				original(q, r)
				b := q.stagedMember
				if b == nil || b.returnResult == nil || wrapped[b] {
					return
				}
				wrapped[b] = true
				issue := b.returnResult
				b.returnResult = func(call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
					visit := interest.discover
					discovered := false
					if visit != nil {
						if interest.purpose != resultSourceProjection {
							t.Fatal("field callback escaped SOURCE purpose")
						}
						interest.discover = func(prefix *sourceStagedFreezeReturnSource) bool {
							if b.projectingReturn != call || b.issuer != q || prefix.root.producer.operation != call {
								t.Fatal("discovery outside original issuer")
							}
							pending := prefix.calleePending
							if !checked {
								checkFreezePrefixRefusals(t, work, q, call, prefix)
								checked = true
							}
							delivered := visit(prefix)
							if delivered {
								discovered = true
								if b.getPreparation != nil {
									preparation++
									if !b.getPreparation.dataPending {
										t.Fatal("discovery completed preparation DATA")
									}
								} else {
									physical++
									if b.represented {
										t.Fatal("discovery sealed source membership")
									}
								}
								if pending {
									pendingFields++
								}
								if expired == nil {
									expired = func() bool { return visit(prefix) }
								}
							}
							return delivered
						}
					}
					transfer := issue(call, interest)
					if discovered && transfer.source != nil {
						t.Fatal("pending discovery became current transport")
					}
					return transfer
				}
			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if pendingFields == 0 || !checked {
			t.Fatal("original pending Freeze SOURCE field consumer UNREACHED")
		}
		if expired != nil && expired() {
			t.Fatal("descriptive callback survived original issuer revocation")
		}
		if requirePreparation && preparation == 0 {
			t.Fatal("original preparation SOURCE discovery UNREACHED")
		}
		if !requirePreparation && physical == 0 {
			t.Fatal("original physical SOURCE discovery UNREACHED")
		}
		t.Logf("original pending fields=%d physical=%d preparation=%d", pendingFields, physical, preparation)
	}, activeModuleCompleteAnalysis)
}

// Refusers use the actual issued prefix/read, then perturb one boundary at a
// time. The counter callback performs no original source/selection evaluation.
func checkFreezePrefixRefusals(t *testing.T, work *callableEffectWork, q *sourceValueQuery, call *ast.Node, prefix *sourceStagedFreezeReturnSource) {
	b := q.stagedMember
	recipe := work.operationRecipes[stagedResultSourceRequest(call, prefix.declaration, nil).producer]
	var reading sourceStagedOperationRequest
	if b.getPreparation != nil {
		for _, data := range recipe.callResult.preparationData {
			if q.getPreparationDataContextMatches(data) {
				reading = data.reading
				break
			}
		}
	} else {
		p, ok := work.originalFreezeProjection(q, call)
		if ok {
			reading = p.reading
		}
	}
	if reading.producer.operation == nil {
		t.Fatal("actual prefix has no original purpose-bound reader")
	}
	count := 0
	interest := sourceCallResultInterest{purpose: resultSourceProjection, discover: func(*sourceStagedFreezeReturnSource) bool { count++; return true }}
	work.discoverFreezeReturnPrefix(q, reading, interest)
	if count != 1 {
		t.Fatal("original discovery refuser baseline UNREACHED")
	}
	refuse := func(name string, w *callableEffectWork, query *sourceValueQuery, r sourceStagedOperationRequest, i sourceCallResultInterest) {
		before := count
		w.discoverFreezeReturnPrefix(query, r, i)
		if count != before {
			t.Fatal(name + " borrowed SOURCE discovery")
		}
	}
	for _, purpose := range []sourceCallResultPurpose{resultCallableExposure, resultConstructedReceiver, resultWriterValue, resultReflectiveTarget} {
		bad := interest
		bad.purpose = purpose
		if purpose == resultReflectiveTarget {
			bad.operation = call
		}
		refuse("wrong purpose", work, q, reading, bad)
	}
	copied := *q
	refuse("copied query", work, &copied, reading, interest)
	foreign := *work
	foreign.operationEpoch = &sourceStagedOperationEpoch{}
	refuse("foreign epoch", &foreign, q, reading, interest)
	foreign = *work
	foreign.operationGeneration = &projectGeneration{}
	refuse("foreign generation", &foreign, q, reading, interest)
	badRead := reading
	badRead.edge += ":foreign"
	refuse("wrong subscriber edge", work, q, badRead, interest)
	badRead = reading
	badRead.consumer = call
	refuse("wrong consumer", work, q, badRead, interest)
	badRead = reading
	badRead.cut.initializing = call
	if badRead != reading {
		refuse("producer versus physical cut", work, q, badRead, interest)
	}
	id := work.operationIDs[reading.producer]
	state := &work.operations[id.index]
	sub := state.subscribers[sourceStagedOperationConsumer{reading.consumer, reading.edge}]
	priorBlocked := sub.blocked
	sub.blocked = true
	refuse("blocked reader", work, q, reading, interest)
	sub.blocked = priorBlocked
	priorInvalid := state.invalid
	state.invalid = true
	refuse("invalidated DATA owner", work, q, reading, interest)
	state.invalid = priorInvalid
	priorGet := b.get
	b.get = nil
	refuse("missing original Get", work, q, reading, interest)
	b.get = priorGet
	priorObservation := b.observation
	b.observation.initializing = call
	if b.observation != priorObservation {
		refuse("changed physical cut", work, q, reading, interest)
	}
	b.observation = priorObservation
	priorRead := b.read
	if priorRead != nil {
		b.read = nil
		refuse("missing physical reader", work, q, reading, interest)
		b.read = priorRead
	}
	// A description in a clone is not independently issuable through an expired
	// or copied issuer. The real query must be live for every synchronous visit.
	priorIssuer := b.issuer
	b.issuer = nil
	refuse("revoked issuer", work, q, reading, interest)
	b.issuer = priorIssuer
	candidate := accessorCandidates{}
	called := false
	visit := func(*ast.Node, []string, bool) { called = true }
	if q.projectFreezeReturnPrefix(prefix, nil, "", accessorAcquire, nil, &candidate, visit) || called {
		t.Fatal("whole returned object escaped")
	}
	wrong := *prefix
	wrong.generation = nil
	if q.projectFreezeReturnPrefix(&wrong, nil, "field", accessorAcquire, nil, &candidate, visit) || called {
		t.Fatal("foreign prefix generation escaped")
	}
	var symbol ast.SymbolId
	if q.projectFreezeReturnPrefix(prefix, nil, "field", accessorAcquire, sourceValueBindings{symbol: []sourceValue{{}}}, &candidate, visit) || called {
		t.Fatal("bound scope became descriptive source")
	}
	// This positive checks pending accounting only. The real field visitor is
	// exercised by the unmodified consumer callback immediately after this test.
	if !q.projectFreezeReturnPrefix(prefix, nil, "field", accessorAcquire, nil, &candidate, visit) || !called || !candidate.valueIncomplete {
		t.Fatal("known descriptive field lost pending accounting")
	}
}
