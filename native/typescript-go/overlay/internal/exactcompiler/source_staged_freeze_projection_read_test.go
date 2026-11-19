package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// This entry experiment preserves the causal fixture and original collector.
// Its wrapper records the existing callback once; it neither drives a query nor
// supplies a Get, binder, currentness stamp, receipt or synthetic graph state.
// A prior strict failure stays a failure; absent entry is explicitly UNREACHED.
// This remains an entry experiment until canonical finishing and the natural
// endpoint are observed. Broader lifecycle/order controls are a separate owning
// API qualification once this unchanged production entry can complete.
func TestStagedFreezeProjectionOriginalConsumer(t *testing.T) {
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
	wrapped := make(map[*sourceStagedMemberBorrow]bool)
	var loans []*sourceStagedFreezeProjectionLoan
	observed := 0
	withActiveModuleSourceWorkSetup(t, request, map[string]string{id: source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
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
				returnOriginal := b.returnResult
				b.returnResult = func(call *ast.Node, interest sourceCallResultInterest) sourceStagedCallResultTransfer {
					transfer := returnOriginal(call, interest)
					if call == nil || ast.GetSourceFileOfNode(call) == nil || ast.GetSourceFileOfNode(call).FileName() != id || call.Pos() != 731 || interest.purpose != resultSourceProjection || b.getPreparation != nil || transfer.source == nil {
						return transfer
					}
					observed++
					read := transfer.source
					l := read.projection
					if l == nil || !l.live(q) || !work.freezeReturnReadMatches(read) || !validFreezeProjection(work.operationRecipes[l.description.reading.producer].callResult, l.description) {
						t.Fatal("actual original SOURCE transport lacks current reader/input/finishing/APPLIED")
					}
					// This is an actual current SOURCE transfer, not a manufactured graph.
					// Re-enrollment must preserve the attempted flag and coalesce
					// onto existing work even when semantic delivery is still new.
					callee := work.operationIDs[nativeRootDebtRequest(work.operationRecipes[read.source.root.producer].nativeGet, "callee-get").producer]
					if callee.epoch != work.operationEpoch || callee.index == 0 {
						t.Fatal("actual canonical SOURCE owner not adopted")
					}
					producer := work.operationRecipes[l.description.reading.producer].callResult
					root := work.operationRecipes[read.source.root.producer].nativeGet
					demands := work.nativeProjectionGetDemands(root)
					if len(demands) == 0 || producer == nil || work.nativeScopeGetTaskSource(callee) == nil {
						t.Fatal("actual k1 canonical SOURCE service UNREACHED")
					}
					requested := work.operations[callee.index].calleeSourceRequested
					work.enrollNativeProjectionGet(facts, l.description.reading.producer)
					afterFirst := len(work.extractionQueue)
					work.enrollNativeProjectionGet(facts, l.description.reading.producer)
					if len(work.extractionQueue) != afterFirst || work.operations[callee.index].calleeSourceRequested != requested {
						t.Fatal("duplicate demand polled or reset attempted flag")
					}
					if work.operations[callee.index].nativeCallee == nil || work.operations[work.operationIDs[l.description.reading.producer].index].freezeReturnObserved == nil {
						t.Fatal("canonical finishing SOURCE observation missing")
					}
					foreign := *work
					foreign.operationEpoch = nil
					if len(foreign.nativeProjectionGetDemands(root)) != 0 {
						t.Fatal("foreign epoch inherited scheduling demand")
					}
					foreign = *work
					foreign.operationGeneration = nil
					if len(foreign.nativeProjectionGetDemands(root)) != 0 {
						t.Fatal("foreign generation inherited scheduling demand")
					}
					receipt, ok := work.stagedCallResultData(l.description.reading)
					if !ok || receipt.revision == 0 || !receipt.delta.extracted {
						t.Fatal("actual DATA receipt missing")
					}
					copied := *q
					if l.live(&copied) {
						t.Fatal("copied query inherited loan")
					}
					bad := *l
					bad.epoch = nil
					if bad.live(q) {
						t.Fatal("foreign work epoch accepted")
					}
					bad = *l
					bad.generation = nil
					if bad.live(q) {
						t.Fatal("foreign generation accepted")
					}
					bad = *l
					bad.description.physical.initializing = nil
					if bad.description.physical != l.description.physical && bad.live(q) {
						t.Fatal("foreign physical cut accepted")
					}
					bad = *l
					bad.description.reading.edge += ":foreign"
					if bad.live(q) {
						t.Fatal("foreign DATA receipt accepted")
					}
					bad = *l
					bad.get = nil
					if bad.live(q) {
						t.Fatal("absent actual Get accepted")
					}
					loans = append(loans, l)
					return transfer
				}
			}
		}
	}, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		if observed == 0 {
			t.Fatal("original nonpreparation Freeze SOURCE consumer UNREACHED")
		}
		for _, l := range loans {
			if l.live(l.query) {
				t.Fatal("original loan survived traversal revocation")
			}
		}
	}, activeModuleCompleteAnalysis)
}
