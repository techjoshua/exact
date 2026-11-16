package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

const stagedEagerCallWitness = `declare function foreign():void;function makeValue(){window.name;foreign();return()=>document.title}export function invoke(){return Object.defineProperty({},'run',{value:makeValue()})}`

func TestStagedNativeEagerCallSession(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/eager-source-call.ts", Source: stagedEagerCallWitness, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("compile %s: %s %#v", target, response.Error, response.Diagnostics)
		}
		known, unknown := false, false
		for _, effect := range executableSummary(t, response, "invoke").EffectSources {
			known = known || effect.Environment == "browser" && effect.Description == "window"
			unknown = unknown || effect.Environment == "unknown"
			if effect.Environment == "browser" && effect.Description == "document" {
				t.Fatal("returned stored callback became eager")
			}
		}
		if !known || !unknown {
			t.Fatalf("eager donors known=%t unknown=%t", known, unknown)
		}
		issued := false
		for _, fact := range stagedDeclarationFacts(session) {
			if fact.summary.Name != "invoke" {
				continue
			}
			for _, use := range fact.staged.operationUses {
				issued = issued || use.request.producer.selector == (sourceStagedOperationSelector{}) && fact.staged.settled && !fact.staged.operationsPending
			}
		}
		if !issued {
			t.Fatal("eager initializer Call did not yield through original binder/summary graph")
		}
		file := filepath.Join(t.TempDir(), "eager.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];globalThis.window={get name(){events.push('eager');return 'name'}};globalThis.document={get title(){events.push('callback');return 'title'}};globalThis.foreign=()=>events.push('foreign');const m=await import(pathToFileURL(process.argv[1]).href);const saved=m.invoke().run;assert.deepEqual(events,['eager','foreign']);assert.equal(saved(),'title');assert.deepEqual(events,['eager','foreign','callback']);const failure=new Error('foreign');globalThis.foreign=()=>{events.push('throw');throw failure};assert.throws(()=>m.invoke(),error=>error===failure);assert.deepEqual(events,['eager','foreign','callback','eager','throw']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("runtime %s: %v %s", target, err, output)
		}
	}
}

// A real source template is reconstructed in a fresh graph. The original B
// association is required even while its queued summary has not delivered yet.
func TestStagedNativeEagerCallBinderAndLateSummary(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/eager-binding.ts", Source: stagedEagerCallWitness, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	facts := stagedDeclarationFacts(session)
	var owner *executableBodyOwner
	for _, project := range session.projects {
		if project.callableCache != nil {
			owner = project.callableCache.owner
		}
	}
	if owner == nil {
		t.Fatal("missing source owner")
	}
	target := -1
	for index := range facts {
		facts[index] = cloneProjectCallableFact(facts[index])
		if facts[index].summary.Name == "makeValue" {
			target = index
		}
	}
	if target < 0 {
		t.Fatal("missing actual initializer declaration")
	}
	facts[target].staged.ready = false
	work := callableEffectWork{extracting: -1}
	work.prepareOperationUses(facts, owner)
	var eager sourceStagedOperationID
	for key, id := range work.operationIDs {
		if key.selector.field == "eager-inputs" {
			eager = id
		}
	}
	if eager.index == 0 {
		t.Fatal("no eager source role")
	}
	state := &work.operations[eager.index]
	if !state.delta.extracted || len(state.eagerCalls) != 1 || state.eagerCalls[0].inputs == nil || state.eagerCalls[0].ready || state.eagerCalls[0].transferred || work.closedOperationDependencies()[eager.index] {
		t.Fatal("local transfer was mistaken for delivered summary closure")
	}
	requirement := state.eagerCalls[0]
	inputs := requirement.inputs
	original := requirement.call.invocation.operation
	outer := work.operationRecipes[state.key].nativeGet.request.producer.operation
	if !inputs.delivered || inputs.request.operation != original || inputs.bound.operation != original || inputs.bound.cut.operation != original || inputs.bound.cut.reading != original || inputs.bound.cut.initializing != nil || inputs.bound.cut != inputs.request.cut || inputs.bound.cut.operation == outer {
		t.Fatal("original initializer B was retargeted to outer Get/use")
	}
	membership := work.stagedRequired[sourceStagedDependencyKey{consumer: work.memberNodes[work.operationRecipes[state.key].nativeGet.request.consumer], edge: requirement.edge}]
	if membership == nil || membership.operation != original || membership.cut != requirement.call.invocation.cut {
		t.Fatal("original summary demand was not independently registered")
	}
	sourceRecipe := work.operationRecipes[state.key].nativeGet
	valueKey := sourceRecipe.request.producer
	valueKey.kind = relativeDemandDirectExposure
	valueKey.selector = sourceStagedOperationSelector{occurrence: sourceRecipe.descriptorGet, field: "value"}
	if value := work.operationRecipes[valueKey]; value.delta.extracted || len(value.delta.exposures) != 0 {
		t.Fatal("eager body delivery manufactured returned value/exposure authority")
	}
	before := owner.values.work
	facts[target].staged.ready = true
	work.prepareOperationUses(facts, owner)
	if !work.closedOperationDependencies()[eager.index] || !work.operations[eager.index].eagerCalls[0].transferred || work.operations[eager.index].eagerCalls[0].inputs != inputs || owner.values.work != before {
		t.Fatal("late source summary re-acquired inputs or failed to settle")
	}
}

func TestStagedNativeEagerCallPropertyOrder(t *testing.T) {
	const source = `function flag(){window.innerWidth;return true}function value(){window.name;return()=>document.title}export function invoke(){return Object.defineProperty({},'run',{enumerable:flag(),value:value()})}`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/eager-order.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(response.Error, response.Diagnostics)
		}
		file := filepath.Join(t.TempDir(), "order.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];let fail=false;const failure=new Error('flag');globalThis.window={get innerWidth(){events.push('flag');if(fail)throw failure;return 1},get name(){events.push('value');return'name'}};globalThis.document={get title(){events.push('callback');return'title'}};const m=await import(pathToFileURL(process.argv[1]).href);const result=m.invoke();assert.deepEqual(Object.keys(result),['run']);assert.deepEqual(events,['flag','value']);assert.equal(result.run(),'title');assert.deepEqual(events,['flag','value','callback']);fail=true;assert.throws(()=>m.invoke(),error=>error===failure);assert.deepEqual(events,['flag','value','callback','flag']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("order %s: %v %s", target, err, output)
		}
	}
}
