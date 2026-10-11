package exactcompiler

import (
	"strings"
	"testing"
)

// Equivalent escape syntax must not bypass task-generation ownership diagnostics.
func TestTaskResourceEscapeReferences(t *testing.T) {
	for _, c := range []struct {
		name, body string
		escape     bool
	}{
		{"nested-helper-argument", `const value=publishResource(new WebSocket('/nested'));void value;void socket.readyState;`, true},
		{"returned-aliased-cleanup", `const close=()=>socket.close();const alias=close;return {alias};`, true},
		{"returned-read-closure", `return ()=>socket.readyState;`, true},
		{"returned-cleanup-closure", `return ()=>socket.close();`, true},
		{"registered-cleanup-closure", `task.cleanup(()=>socket.close());`, false},
		{"local-read", `void socket.readyState;`, false},
		{"named-property", `publish({socket:socket});`, true},
		{"shorthand-property", `publish({socket});`, true},
		{"returned-shorthand", `return {socket};`, true},
		{"array", `publish([socket]);`, true},
		{"alias", `const alias=socket;publish(alias);`, true},
		{"local-alias-read", `const alias=socket;void alias.readyState;`, false},
		{"nested-alias", `const first=socket;const second=first;publish({second});`, true},
		{"shadowed-alias", `const alias=socket;function other(){const alias=1;publish(alias);}void alias.readyState;`, false},
		{"computed-member", `void socket["readyState"];`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "resource.tsx", Target: TargetClient, Source: `import {TaskContext} from '@exactjs/core';declare function publish(value:unknown):void;declare function publishResource(value:WebSocket):number;export function Page(){function run(task:TaskContext=TaskContext.client()){const socket=new WebSocket('/events');` + c.body + `}run();return()=> <output/>;}`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if len(response.Analysis.Tasks) != 1 {
				t.Fatalf("missing task: %#v", response.Analysis.Tasks)
			}
			task := response.Analysis.Tasks[0]
			escaped := strings.Contains(strings.Join(task.Diagnostics, "\n"), "escapes its task generation")
			if escaped != c.escape {
				t.Fatalf("escape=%t want %t: %#v", escaped, c.escape, task)
			}
		})
	}
}

// DOM event options permit a Boolean capture flag on every EventTarget receiver.
func TestTaskEventTargetOptionOwnership(t *testing.T) {
	for _, c := range []struct{ name, declaration, receiver string }{
		{"window", ``, "window"},
		{"document", ``, "document"},
		{"element", `declare const target:HTMLElement;`, "target"},
		{"event-target", `declare const target:EventTarget;`, "target"},
	} {
		t.Run(c.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "listener.tsx", Target: TargetClient, Source: `import {TaskContext} from '@exactjs/core';` + c.declaration + `export function Page(){function run(task:TaskContext=TaskContext.client()){` + c.receiver + `.addEventListener('change',()=>{},true);}run();return()=> <output/>;}`})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("listener rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if len(response.Analysis.Tasks) != 1 || len(response.Analysis.Tasks[0].SignalCalls) != 1 || !response.Analysis.Tasks[0].SignalCalls[0].EventOptions {
				t.Fatalf("event capture ownership lost: %#v", response.Analysis.Tasks)
			}
		})
	}
}

// Method names alone cannot authorize rewriting an unrelated API or unselected overload.
func TestTaskSignalSignatureSelection(t *testing.T) {
	for _, c := range []struct {
		name, declaration, call string
		signal                  bool
	}{
		{"custom-non-signal", `declare const target:{addEventListener(name:string,cb:()=>void,options?:number):void;removeEventListener():void};`, `target.addEventListener('change',()=>{},7);`, false},
		{"shadowed-window", `declare const window:{addEventListener(name:string,cb:()=>void,options?:number):void;removeEventListener():void};`, `window.addEventListener('change',()=>{},7);`, false},
		{"selected-plain-overload", `declare function api(value:string,options?:{signal?:AbortSignal}):void;declare function api(value:number,options?:{mode:string}):void;`, `api(1,{mode:'plain'});`, false},
		{"selected-signal-overload", `declare function api(value:string,options?:{signal?:AbortSignal}):void;declare function api(value:number,options?:{mode:string}):void;`, `api('one');`, true},
		{"required-missing-signal", `declare function api(value:string,signal:AbortSignal):void;`, `api('one');`, false},
		{"typed-custom-options", `declare const target:{addEventListener(name:string,cb:()=>void,options?:{signal?:AbortSignal}):void};`, `target.addEventListener('change',()=>{});`, true},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "signal-selection.tsx", Target: TargetClient, Source: `import {TaskContext} from '@exactjs/core';` + c.declaration + `export function Page(){function run(task:TaskContext=TaskContext.client()){` + c.call + `}run();return()=> <output/>;}`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if len(r.Analysis.Tasks) != 1 {
				t.Fatalf("missing task: %#v", r.Analysis.Tasks)
			}
			if (len(r.Analysis.Tasks[0].SignalCalls) > 0) != c.signal {
				t.Fatalf("signal selection changed: %#v", r.Analysis.Tasks[0].SignalCalls)
			}
		})
	}
}

// A visible cleanup contract must select a callable method on the actual result.
func TestTaskResourceDisposalContracts(t *testing.T) {
	for _, c := range []struct {
		name, declaration, expression, disposal string
		owned                                   bool
	}{
		{"constructor-symbol", `declare class LocalResource {[Symbol.dispose]():void}`, `new LocalResource()`, "", true},
		{"constructor-shadowed-native-name", `declare class Worker {dispose():void}`, `new Worker()`, "dispose", true},
		{"constructor-wrapped-expression", `declare class Resource {dispose():void}declare function select():typeof Resource;`, `new (select())()`, "dispose", true},
		{"constructor-symbol-and-named", `declare class Resource {dispose():void;[Symbol.asyncDispose]():Promise<void>}`, `new Resource()`, "", true},
		{"constructor-async-symbol", `declare class LocalResource {[Symbol.asyncDispose]():Promise<void>}`, `new LocalResource()`, "", true},
		{"constructor-symbol-alias", `declare const key:typeof Symbol.dispose;declare class LocalResource {[key]():void}`, `new LocalResource()`, "", true},
		{"constructor-symbol-noncallable", `declare class LocalResource {[Symbol.dispose]:number}`, `new LocalResource()`, "", false},
		{"constructor-unrelated-symbol", `declare const key:unique symbol;declare class LocalResource {[key]():void}`, `new LocalResource()`, "", false},
		{"annotated-symbol", `declare function open(): /** @exact own */ {[Symbol.dispose]():void};`, `open()`, "", true},
		{"constructor-misleading-name", `declare class DisposableCounter {value:number}`, `new DisposableCounter()`, "", false},
		{"constructor-construct-only", `declare class LocalResource {dispose:new()=>object}`, `new LocalResource()`, "", false},
		{"subscription-construct-only", `declare const store:{subscribe():new()=>object};`, `store.subscribe()`, "", false},
		{"constructor-named", `declare class LocalResource {dispose():void}`, `new LocalResource()`, "dispose", true},
		{"constructor-async-named", `declare class LocalResource {asyncDispose():Promise<void>}`, `new LocalResource()`, "asyncDispose", true},
		{"subscription-named", `declare const store:{subscribe():{dispose():void}};`, `store.subscribe()`, "dispose", true},
		{"subscription-noncallable", `declare const store:{subscribe():{dispose:number}};`, `store.subscribe()`, "", false},
		{"annotated-named", `declare function open(): /** @exact own */ {dispose():void};`, `open()`, "dispose", true},
		{"annotated-cleanup", `declare function open(): /** @exact cleanup close */ {close():void};`, `open()`, "close", true},
		{"annotated-function", `declare function open(): /** @exact own */ (()=>void);`, `open()`, "call", true},
		{"unselected-annotated-cleanup", `declare function open(value:string): /** @exact cleanup close */ {close():void};declare function open(value:number):number;`, `open(1)`, "", false},
		{"selected-unowned", `declare function open(value:string): /** @exact own */ {dispose():void};declare function open(value:number):number;`, `open(1)`, "", false},
		{"selected-owned", `declare function open(value:string): /** @exact own */ {dispose():void};declare function open(value:number):number;`, `open('one')`, "dispose", true},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "disposal-contract.tsx", Target: TargetClient, Source: `/// <reference lib="esnext.disposable" />
import {TaskContext} from '@exactjs/core';` + c.declaration + `export function Page(){function run(task:TaskContext=TaskContext.client()){const resource=` + c.expression + `;void resource;}run();return()=> <output/>;}`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if len(r.Analysis.Tasks) != 1 {
				t.Fatalf("missing task: %#v", r.Analysis.Tasks)
			}
			resources := r.Analysis.Tasks[0].Resources
			if strings.HasPrefix(c.name, "unrelated-") && len(resources) != 0 && len(resources[0].ReleaseCalls) != 0 {
				t.Fatalf("unrelated method suppressed fallback: %#v", resources)
			}
			if (len(resources) > 0) != c.owned || (c.owned && resources[0].Disposal != c.disposal) {
				t.Fatalf("disposal contract changed: %#v", resources)
			}
		})
	}
}

// Platform names need their external declaration, and real disposal variants
// remain generation-owned even when the result is otherwise unused.
func TestTaskResourcePlatformAndCleanupVariants(t *testing.T) {
	for _, c := range []struct{ name, declaration, body, kind, disposal string }{
		{"compound-object-resource", `declare class Resource {[Symbol.dispose]():void}`, `const box={resource:new Resource()};void box;`, "unproven", ""},
		{"compound-object-helper", `declare class Resource {[Symbol.dispose]():void}declare function publish(value:unknown):void;`, `const box={resource:new Resource()};publish(box.resource);`, "unproven", ""},
		{"compound-array-helper", `declare class Resource {[Symbol.dispose]():void}declare function publish(value:unknown):void;`, `const box=[new Resource()];publish(box[0]);`, "unproven", ""},
		{"strict-identity-read", `declare class Resource {[Symbol.dispose]():void}`, `const resource=new Resource();const alias=resource;const same=alias===resource;void same;`, "owned", ""},
		{"strict-identity-return", `declare class Resource {[Symbol.dispose]():void}`, `const resource=new Resource();return resource===null;`, "owned", ""},
		{"strict-identity-helper-result", `declare class Resource {[Symbol.dispose]():void}declare function publish(value:unknown):void;`, `const resource=new Resource();publish((resource as Resource)===null);`, "owned", ""},
		{"strict-owned-inequality", `declare class Resource {[Symbol.dispose]():void}`, `const resource=new Resource();const owned=task.own(resource);const different=owned!==resource;void different;`, "owned", ""},
		{"identity-assignment-escape", `declare class Resource {[Symbol.dispose]():void}declare let escaped:Resource;`, `const resource=new Resource();void(resource===null);escaped=resource;`, "escape", ""},
		{"identity-then-escape", `declare class Resource {[Symbol.dispose]():void}declare function publish(value:unknown):void;`, `const resource=new Resource();void(resource===null);publish(resource);`, "escape", ""},
		{"identity-conditional-escape", `declare class Resource {[Symbol.dispose]():void}`, `const resource=new Resource();return resource===null?null:resource;`, "escape", ""},
		{"inline-context-own", `declare class Resource {[Symbol.dispose]():void}`, `task.own(new Resource());`, "", ""},
		{"bound-context-own", `declare class Resource {[Symbol.dispose]():void}`, `const resource=task.own(new Resource());void resource;`, "", ""},
		{"local-context-own-alias", `declare class Resource {[Symbol.dispose]():void}`, `const resource=new Resource();const owned=task.own(resource);void owned;`, "owned", ""},
		{"returned-context-own-alias", `declare class Resource {[Symbol.dispose]():void}`, `const resource=new Resource();const owned=task.own(resource);return owned;`, "escape", ""},
		{"indexed-context-own", `declare class Resource {[Symbol.dispose]():void}`, `const resource=task['own'](new Resource());void resource;`, "", ""},
		{"registered-context-own", `declare class Resource {[Symbol.dispose]():void}`, `const resource=new Resource();task.own(resource);`, "owned", ""},
		{"returned-context-own", `declare class Resource {[Symbol.dispose]():void}`, `return task.own(new Resource());`, "escape", ""},
		{"external-context-own", `declare const other:{own<T>(value:T):T};declare class Resource {[Symbol.dispose]():void}`, `other.own(new Resource());`, "escape", ""},
		{"explicit-symbol-disposal", `declare class Resource {[Symbol.dispose]():void}`, `const resource=new Resource();resource[Symbol.dispose]();`, "owned", ""},
		{"explicit-async-symbol-disposal", `declare class Resource {[Symbol.asyncDispose]():Promise<void>}`, `const resource=new Resource();await resource[Symbol.asyncDispose]();`, "owned", ""},
		{"explicit-symbol-alias", `declare const key:typeof Symbol.dispose;declare class Resource {[Symbol.dispose]():void}`, `const resource=new Resource();resource[key]();`, "owned", ""},
		{"unrelated-symbol-call", `declare const key:unique symbol;declare class Resource {[Symbol.dispose]():void;[key]():void}`, `const resource=new Resource();resource[key]();`, "owned", ""},
		{"unrelated-indexed-call", `declare class Resource {dispose():void;inspect():void}`, `const resource=new Resource();resource['inspect']();`, "owned", "dispose"},
		{"unrelated-cancel-call", `declare class Resource {dispose():void;cancel():void}`, `const resource=new Resource();resource.cancel();`, "owned", "dispose"},
		{"unrelated-close-call", `declare class Resource {dispose():void;close():void}`, `const resource=new Resource();resource.close();`, "owned", "dispose"},
		{"explicit-indexed-disposal", `declare class Resource {dispose():void}`, `const resource=new Resource();resource['dispose']();`, "owned", "dispose"},
		{"mutation-observer", "", `new MutationObserver(()=>{});`, "observer", ""},
		{"intersection-observer", "", `new IntersectionObserver(()=>{});`, "observer", ""},
		{"event-source", "", `new EventSource('/events');`, "owned", "close"},
		{"broadcast-channel", "", `new BroadcastChannel('events');`, "owned", "close"},
		{"explicit-clear-timeout", "", `const timer=setTimeout(()=>{},10);clearTimeout(timer);`, "timeout", ""},
		{"window-clear-timeout", "", `const timer=setTimeout(()=>{},10);window.clearTimeout(timer);`, "timeout", ""},
		{"global-clear-timeout", "", `const timer=setTimeout(()=>{},10);globalThis.clearTimeout(timer);`, "timeout", ""},
		{"wrapped-clear-timeout", "", `const timer=setTimeout(()=>{},10);clearTimeout((timer as number));`, "timeout", ""},
		{"shadowed-clear-timeout", `declare function clearTimeout(value:number):void;`, `const timer=setTimeout(()=>{},10);clearTimeout(timer);`, "escape", ""},
		{"custom-clear-timeout", `declare const target:{clearTimeout(value:number):void};`, `const timer=setTimeout(()=>{},10);target.clearTimeout(timer);`, "escape", ""},
		{"explicit-clear-interval", "", `const timer=setInterval(()=>{},10);clearInterval(timer);`, "interval", ""},
		{"cross-clear-timeout", "", `const timer=setTimeout(()=>{},10);clearInterval(timer);`, "timeout", ""},
		{"cross-clear-interval", "", `const timer=setInterval(()=>{},10);clearTimeout(timer);`, "interval", ""},
		{"registered-timer-cleanup", "", `const timer=setTimeout(()=>{},10);task.cleanup(()=>clearTimeout(timer));`, "timeout", ""},
		{"animation-clear", "", `const frame=requestAnimationFrame(()=>{});cancelAnimationFrame(frame);`, "animation-frame", ""},
		{"idle-clear", "", `const idle=requestIdleCallback(()=>{});cancelIdleCallback(idle);`, "idle-callback", ""},
		{"local-timer", `declare function setTimeout(callback:()=>void,delay:number):number;`, `setTimeout(()=>{},10);`, "", ""},
		{"local-observer", `declare class MutationObserver{constructor(callback:()=>void);}`, `new MutationObserver(()=>{});`, "", ""},
		{"local-fetch", `declare function fetch(url:string):void;`, `fetch('/items');`, "", ""},
		{"unknown-subscription", `declare const store:{subscribe():{value:number}};`, `store.subscribe();`, "", ""},
		{"cleanup-function", `declare const store:{subscribe():()=>void};`, `const close=store.subscribe();close();`, "owned", "call"},
		{"explicit-context-cleanup", `declare const store:{subscribe():()=>void};`, `task.cleanup((store.subscribe()));`, "", ""},
		{"owned-function", `declare const store:{subscribe():()=>void};`, `const close=store.subscribe();void close;`, "owned", "call"},
		{"dispose-method", `declare const store:{subscribe():{dispose():void}};`, `const item=store.subscribe();item.dispose();`, "owned", "dispose"},
	} {
		t.Run(c.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "resource-variants.tsx", Target: TargetClient, Source: `/// <reference lib="esnext.disposable" />
import {TaskContext} from '@exactjs/core';` + c.declaration + `export function Page(){async function run(task:TaskContext=TaskContext.client()){` + c.body + `}run();return()=> <output/>;}`})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			if len(r.Analysis.Tasks) != 1 {
				t.Fatalf("missing task: %#v", r.Analysis.Tasks)
			}
			resources := r.Analysis.Tasks[0].Resources
			if strings.HasPrefix(c.name, "unrelated-") && len(resources) != 0 && len(resources[0].ReleaseCalls) != 0 {
				t.Fatalf("unrelated method suppressed fallback: %#v", resources)
			}
			if c.kind == "escape" || c.kind == "unproven" {
				if len(resources) != 0 || len(r.Diagnostics) == 0 {
					t.Fatalf("opaque release lost escape: %#v %#v", resources, r.Diagnostics)
				}
				if c.kind == "unproven" && !strings.Contains(r.Diagnostics[0].Message, "unproven ownership") {
					t.Fatalf("missing uncertainty distinction: %#v", r.Diagnostics)
				}
				return
			}
			if c.kind == "" {
				if len(resources) != 0 || len(r.Diagnostics) != 0 {
					t.Fatalf("unowned API rewritten: %#v", resources)
				}
			} else if !containsTaskResource(resources, c.kind, c.disposal) {
				t.Fatalf("missing ownership: %#v", resources)
			}
		})
	}
}
