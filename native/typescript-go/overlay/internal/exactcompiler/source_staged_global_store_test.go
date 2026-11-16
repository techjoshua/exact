package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// G4 keeps the original imports, module prefix and store body byte-for-byte.
// The independent G2 function definitions and metadata type belong to G5's
// later combined acceptance, not this declaration partition.
func stagedOriginalGlobalStoreSource(t *testing.T) string {
	t.Helper()
	functions := strings.Index(writerInputOpaqueComposition, "/** Shares immutable dispatch descriptors")
	store := strings.Index(writerInputOpaqueComposition, "/** Returns one private redemption table")
	driver := strings.Index(writerInputOpaqueComposition, "\n\nexport function invoke()")
	if functions < 0 || store <= functions || driver <= store {
		t.Fatal("original G4 declaration boundaries missing")
	}
	prefix := writerInputOpaqueComposition[:functions]
	body := writerInputOpaqueComposition[store:driver]
	if !strings.Contains(prefix, "import type { ComponentDomain }") || !strings.Contains(prefix, "const domainOperationPrototypes = new WeakMap") || !strings.Contains(body, "const existing = scope[key];") || !strings.Contains(body, "scope[key] = store;") || strings.Contains(body, "function domainOperationPrototype") {
		t.Fatal("original G4 partition anchors changed")
	}
	return prefix + body + `
export function invoke(){return sharedOpaqueOperationStore('fixture')}
`
}

func newStagedGlobalStoreFixture(t *testing.T) *executableFixture {
	t.Helper()
	f := newExecutableFixture(t, map[string]string{"entry.ts": `export {invoke} from './component-abi/opaque-operation.js';`})
	for name, source := range map[string]string{
		"component-abi/opaque-operation.ts": stagedOriginalGlobalStoreSource(t),
		"component/contract-versions.ts":    `export const componentContractVersion=6;`,
		"component/contracts.ts":            `export type ComponentDomain={readonly executionRoot:string};`,
	} {
		path := filepath.Join(f.root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		f.files[name] = source
	}
	return f
}

func TestStagedGlobalStoreOriginalSessionAndArtifacts(t *testing.T) {
	f := newStagedGlobalStoreFixture(t)
	for _, target := range []Target{TargetClient, TargetServer} {
		request := f.request("compile", "component-abi/opaque-operation.ts")
		request.Target, request.stagedReplacement = target, true
		response := f.session.Execute(request)
		t.Logf("original Session target=%s error=%q diagnostics=%v codeBytes=%d", target, response.Error, response.Diagnostics, len(response.Code))
		assertGlobalStoreSessionPopulation(t, f.session)
		assertGlobalStoreSessionHasFreshTargets(t, f.session)
		assertGlobalStoreSessionNativePopulation(t, f.session)
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(target, response.Error, response.Diagnostics)
		}
		unknown := false
		for _, effect := range executableSummary(t, response, "invoke").EffectSources {
			if effect.provenanceIncomplete {
				t.Fatal("compiler coverage debt published as runtime unknown", effect)
			}
			unknown = unknown || effect.Environment == "unknown"
		}
		if !unknown {
			t.Fatal("external realm getter/setter and prototype protocols lost")
		}
		root := t.TempDir()
		module := filepath.Join(root, "component-abi", "opaque-operation.mts")
		version := filepath.Join(root, "component", "contract-versions.js")
		for path, source := range map[string]string{module: response.Code, version: `export const componentContractVersion=6;`} {
			if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", stagedGlobalStoreRuntime, module).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s original global store artifact: %v %s", target, err, output)
		}
	}
}

const stagedGlobalStoreRuntime = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const realm=globalThis,events=[],m=await import(pathToFileURL(process.argv[1]).href);
const key=name=>Symbol.for('@exactjs/opaque-target-operation-store/'+name);
const first=m.invoke();assert(first instanceof WeakMap);assert.equal(m.invoke(),first);
const object={},payload=()=>{throw 'dormant'};first.set(object,payload);assert.equal(m.invoke().get(object),payload);
const existing=new WeakMap();realm[key('existing')]=existing;assert.equal(m.sharedOpaqueOperationStore('existing'),existing);
const name={toString(){events.push('name');return 'existing'}};assert.equal(m.sharedOpaqueOperationStore(name),existing);assert.deepEqual(events,['name']);events.length=0;
const nameThrow={};assert.throws(()=>m.sharedOpaqueOperationStore({toString(){throw nameThrow}}),e=>e===nameThrow);assert.deepEqual(events,[]);
Object.defineProperty(realm,key('getter'),{configurable:true,get(){events.push('get');return existing}});
assert.equal(m.sharedOpaqueOperationStore('getter'),existing);assert.deepEqual(events,['get']);events.length=0;
const proxy=new Proxy(existing,{getPrototypeOf(){events.push('prototype');return WeakMap.prototype}});
Object.defineProperty(realm,key('proxy'),{configurable:true,get(){events.push('get');return proxy}});
assert.equal(m.sharedOpaqueOperationStore('proxy'),proxy);assert.deepEqual(events,['get','prototype']);events.length=0;
let stored;Object.defineProperty(realm,key('setter'),{configurable:true,get(){events.push('get');return undefined},set(value){events.push('set');stored=value}});
const cold=m.sharedOpaqueOperationStore('setter');assert.equal(cold,stored);assert(cold instanceof WeakMap);assert.deepEqual(events,['get','set']);events.length=0;
for(const phase of ['get','prototype','set']){const sentinel={phase};Object.defineProperty(realm,key(phase+'Throw'),{configurable:true,get(){events.push('get');if(phase==='get')throw sentinel;return phase==='prototype'?new Proxy({}, {getPrototypeOf(){events.push('prototype');throw sentinel}}):undefined},set(){events.push('set');throw sentinel}});assert.throws(()=>m.sharedOpaqueOperationStore(phase+'Throw'),e=>e===sentinel);assert.deepEqual(events,phase==='get'?['get']:['get',phase]);events.length=0;}
const original=Object.getOwnPropertyDescriptor(realm,'globalThis');Object.defineProperty(realm,'globalThis',{configurable:true,get(){events.push('realm');return realm}});try{assert.equal(m.sharedOpaqueOperationStore('existing'),existing);assert.deepEqual(events,['realm'])}finally{Object.defineProperty(realm,'globalThis',original)}
`

// Inspect the genuine project Session's retained role, rather than requiring a
// weaker population to exist in the separate source-only kernel. This checks
// accepted source refinement; cached descriptions alone prove no current Get.
func assertGlobalStoreSessionPopulation(t *testing.T, session *Session) {
	t.Helper()
	found := false
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		for _, fact := range project.callableCache.merged.facts {
			for _, recipe := range fact.staged.operationRecipes {
				s := recipe.memberSource
				if s == nil || s.call == nil || recipe.key.operation == nil || recipe.key.operation.Pos() != 745 || !runtimeModuleEvaluation(recipe.key.declaration) {
					continue
				}
				found = true
				if !validStagedMemberCallRecipe(recipe) || !s.call.complete || !recipe.delta.extracted {
					t.Fatal("actual Session retained native population was not refined")
				}
			}
		}
	}
	if !found {
		t.Fatal("actual Session retained native population missing")
	}
}
