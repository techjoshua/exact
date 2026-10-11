package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// Resource ownership follows aliases, wrappers, explicit release and escaping
// closures. Paired controls distinguish cleanup discovery from unsafe escape.
func TestTaskSubsystemResourceSources(t *testing.T) {
	for _, c := range []struct {
		name, definitions, body, disposal string
		escape                            bool
	}{
		{"awaited-disposable", "async function acquire(){return new Resource();}", "const resource=await acquire();void resource.value;", "", false},
		{"awaited-annotation", "/** @exact own */ async function acquire(){return new Resource();}", "const resource=await acquire();void resource.value;", "dispose", false},
		{"awaited-wrapped-annotation", "/** @exact own */ async function acquire(){return new Resource();}", "const resource=await (acquire());void resource.value;", "dispose", false},
		{"awaited-wrapped-cleanup", "/** @exact cleanup=dispose */ async function acquire(){return new Resource();}", "const resource=await (acquire());void resource.value;", "dispose", false},
		{"awaited-subscription", "declare const store:{subscribe():Promise<{unsubscribe():void;value:number}>};", "const resource=await store.subscribe();void resource.value;", "unsubscribe", false},
		{"wrapped-returned-closure", "", "const resource=new Resource();return ((()=>resource.value));", "", true},
		{"asserted-returned-closure", "", "const resource=new Resource();return (()=>resource.value) as ()=>number;", "", true},
		{"non-null-returned-closure", "", "const resource=new Resource();return (()=>resource.value)!;", "", true},
		{"direct-resource-member", "", "void new Resource().value;", "dispose", false},
		{"wrapped-return", "", "const resource=new Resource();const read=()=>((resource));void read().value;", "dispose", false},
		{"asserted-return", "", "const resource=new Resource();const read=()=>resource as Resource;void read().value;", "dispose", false},
		{"non-null-return", "", "const resource=new Resource();const read=()=>resource!;void read().value;", "dispose", false},
		{"indexed-helper-escape", "", "const resource=new Resource();const readers={read:()=>resource};publish(readers['read']);", "", true},
		{"wrapped-helper-escape", "", "const resource=new Resource();const readers={read:()=>resource};publish((readers.read));", "", true},
		{"satisfies-helper-escape", "", "const resource=new Resource();const readers={read:()=>resource};publish(readers.read satisfies ()=>Resource);", "", true},
		{"helper-return-alias-escape", "", "const resource=new Resource();const read=()=>resource;const alias=read;publish(alias);", "", true},
		{"template-cleanup", "", "const resource=new Resource();resource[`dispose`]();", "dispose", false},
		{"dynamic-cleanup-control", "", "const resource=new Resource();const key:string='dispose';void resource[key as 'dispose'];", "dispose", false},
		{"annotated-method", "class Marked{value=1;/** @exact cleanup */ release(){}}/** @exact own */ function acquire(){return new Marked();}", "const resource=acquire();void resource.value;", "release", false},
		{"unusable-annotation", "/** @exact own */ function acquire(){return 1;}", "const resource=acquire();void resource;", "", false},
		{"annotated-function", "/** @exact own */ function acquire(){return ()=>{};}", "const resource=acquire();resource();", "call", false},
		{"direct-cleanup-function", "declare const store:{subscribe():()=>void};", "store.subscribe()();", "", true},
		{"own-template-context", "", "const resource=new Resource();task[`own`](resource as unknown as Disposable);", "dispose", false},
		{"release-unrelated-frame", "", "const handle=requestAnimationFrame(()=>{});cancelIdleCallback(handle);", "", true},
		{"release-unrelated-idle", "", "const handle=requestIdleCallback(()=>{});cancelAnimationFrame(handle);", "", true},
		{"release-unrelated-timer", "", "const handle=setTimeout(()=>{},1);cancelAnimationFrame(handle);", "", true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", ID: "task-subsystem-resource.tsx", Target: target, Source: `/// <reference lib="esnext.disposable" />
import {TaskContext} from '@exactjs/core';declare function publish(value:unknown):void;class Resource{value=1;dispose(){}}` + c.definitions + `export function Page(){async function run(task:TaskContext=TaskContext.client()){` + c.body + `}run();return()=> <output/>;}`})
				if r.Error != "" || len(r.Analysis.Tasks) != 1 {
					t.Fatalf("resource owner lost: %s %#v", r.Error, r.Diagnostics)
				}
				task := r.Analysis.Tasks[0]
				if strings.HasPrefix(c.name, "awaited-") && c.disposal != "" && len(task.Resources) != 1 {
					t.Fatalf("resolved resource registered repeatedly: %#v", task.Resources)
				}

				escaped := strings.Contains(strings.Join(task.Diagnostics, "\n"), "escapes its task generation")
				if escaped != c.escape {
					t.Fatalf("escape=%t expected=%t: %#v %#v", escaped, c.escape, task.Resources, r.Diagnostics)
				}
				if !c.escape && len(r.Diagnostics) != 0 {
					t.Fatalf("valid ownership rejected: %#v", r.Diagnostics)
				}
				if c.disposal != "" && !containsTaskResource(task.Resources, "owned", c.disposal) {
					t.Fatalf("cleanup lost: %#v", task.Resources)
				}
			})
		}
	}
}

// Invoked server work retains resource and signal plans independently of setup
// activation. Selected native calls, explicit release and annotated async values
// use the existing runtime ownership contract on both compiler targets.
func TestTaskSubsystemInvokedResourceSources(t *testing.T) {
	for _, body := range []string{
		`const resource=await acquire();void resource.value;`,
		`const resource=await (acquire());resource.dispose();`,
		`const read=async()=>{const resource=await acquire();void resource.value;};await read();`,
		`const resource=await acquire();resource.dispose?.();`,
		`const handle=setTimeout(()=>{},1);clearTimeout(handle);`,
		`const response=await fetch('/data');void response;`,
		`await custom();`,
		`const resource=await acquire();task.cleanup(()=>resource.dispose());`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", body, target), func(t *testing.T) {
				r := NewSession().Execute(Request{Kind: "compile", Target: target, Diagnostics: "semantic", ID: "invoked-resource.tsx", Source: `import {TaskContext} from '@exactjs/core';class Resource{value=1;dispose(){}}/** @exact cleanup=dispose */ async function acquire(){return new Resource();}declare function custom(signal?:AbortSignal):Promise<void>;export function Page(){const run=async(task:TaskContext=TaskContext.server().blocking())=>{` + body + `};return()=> <button onClick={()=>run()}>Run</button>;}`})
				if r.Error != "" || len(r.Diagnostics) != 0 || len(r.Analysis.Tasks) != 1 || !r.Analysis.Tasks[0].Invoked {
					t.Fatalf("invoked ownership rejected: %s %#v", r.Error, r.Diagnostics)
				}
			})
		}
	}
}
