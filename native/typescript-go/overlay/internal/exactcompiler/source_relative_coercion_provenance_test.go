package exactcompiler

import "testing"

// A supported formal ToString is runtime MAY uncertainty. Its type cannot pay
// the effect, and forwarding retains the original coercion until actual input
// transfer can independently discharge it.
func TestStagedRelativeCoercionRuntimeProvenance(t *testing.T) {
	for _, source := range []string{
		"export function invoke(name:string){return Symbol.for(`registry/${name}`)}",
		"function key(name:string){return Symbol.for(`registry/${name}`)}export function invoke(name:string){return key(name)}",
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/coercion-provenance.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(target, response.Error, response.Diagnostics)
			}
			found := false
			for _, effect := range executableSummary(t, response, "invoke").EffectSources {
				if effect.relativeCoercion != nil {
					found = true
					if !effect.Opaque || effect.Environment != "unknown" || effect.provenanceIncomplete {
						t.Fatal("represented runtime ToString mislabeled as compiler coverage debt", effect)
					}
				}
			}
			if !found {
				t.Fatal("unbound formal lost its ToString obligation")
			}
			runStagedKeyModule(t, response.Code, `
assert.equal(Symbol.keyFor(m.invoke('literal')),'registry/literal');
const events=[];
assert.equal(Symbol.keyFor(m.invoke({[Symbol.toPrimitive](hint){events.push(hint);return 'custom'}})),'registry/custom');
assert.deepEqual(events,['string']);
const sentinel={};
assert.throws(()=>m.invoke({toString(){events.push('toString');throw sentinel}}),e=>e===sentinel);
assert.equal(events.at(-1),'toString');
const proxy=new Proxy({toString(){return 'proxy'}},{get(target,key,receiver){events.push(key);return Reflect.get(target,key,receiver)}});
assert.equal(Symbol.keyFor(m.invoke(proxy)),'registry/proxy');
assert.deepEqual(events.slice(-2),[Symbol.toPrimitive,'toString']);
assert.throws(()=>m.invoke(Symbol('cannot-coerce')),TypeError);
`)
		}
	}
}

// This uses the unchanged store and actual literal driver. It isolates the
// coercion classification while independent external realm protocols may still
// have compiler coverage failures owned by their own producers.
func TestStagedGlobalStoreOriginalCoercionProvenance(t *testing.T) {
	f := newStagedGlobalStoreFixture(t)
	request := f.request("compile", "component-abi/opaque-operation.ts")
	request.Target, request.stagedReplacement = TargetClient, true
	response := f.session.Execute(request)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, project := range f.session.projects {
		if project.callableCache == nil {
			continue
		}
		for _, fact := range project.callableCache.merged.facts {
			if fact.summary.Name != "sharedOpaqueOperationStore" {
				continue
			}
			for _, effect := range fact.summary.DirectEffectSources {
				if effect.relativeCoercion == nil {
					continue
				}
				found = true
				if effect.relativeCoercion.role.declaration != fact.node || effect.relativeCoercion.role.slot != 0 || !effect.Opaque || effect.provenanceIncomplete {
					t.Fatal("original store formal coercion lost runtime provenance", effect)
				}
			}
		}
	}
	if !found {
		t.Fatal("original definition MAY coercion missing")
	}
	for _, effect := range executableSummary(t, response, "invoke").EffectSources {
		if effect.relativeCoercion != nil {
			t.Fatal("literal driver failed to discharge its actual coercion", effect)
		}
	}
}
