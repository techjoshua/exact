package exactcompiler

import "testing"

// These original producers exercise source binding, native acquisition, donor
// transport and the later invocation. Unsupported coercion/descriptor cases
// assert rejection only. Their pre-existing effect precision is not qualified.
func TestDirectExposureSourceDonorControls(t *testing.T) {
	for _, row := range []struct {
		name, source         string
		browser, unsupported bool
	}{
		{name: "native-object-with-callable-prototype", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}export function invoke(key:object){const value=Object.create(writer);install(value);return table.get(key)}`, browser: false, unsupported: false},
		{name: "native-symbol-result", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}export function invoke(key:object){const value=Symbol.for('tag');install(value);return table.get(key)}`, browser: false, unsupported: false},
		{name: "known-returned-writer-beside-native", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}export function invoke(key:object){const make=choose?Symbol.for:(_key:string)=>writer;const value=make('tag');install(value);return table.get(key)}`, browser: true, unsupported: false},
		{name: "unknown-beside-native-and-known", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}export function invoke(key:object){const value=choose?Object.create(null):choose?writer:foreignValue;install(value);return table.get(key)}`, browser: true, unsupported: false},
		{name: "saved-versus-fresh-acquisition", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}const box:{make:(value:object|null)=>unknown}={make:Object.create};export function invoke(key:object){const saved=box.make;box.make=(_)=>writer;const first=saved(null);const second=box.make(null);install(choose?first:second);return table.get(key)}`, browser: true, unsupported: false},
		{name: "member-projection-is-not-direct-exposure", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}export function invoke(key:object){const base=choose?Object.create(null):{callback:writer};install(base.callback);return table.get(key)}`, browser: true, unsupported: false},
		{name: "eager-getter-producing-noncallable", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}export function invoke(key:object){const box={get value(){document.title;return Symbol.for('tag')}};install(box.value);return table.get(key)}`, browser: true, unsupported: false},
		{name: "captured-symbol-coercion", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}function makeInput(read:()=>string){return{[Symbol.toPrimitive](){return read()}}}export function invoke(key:object){const captured=()=>document.title;const input=makeInput(captured);const value=Symbol.for(input as unknown as string);install(value);return table.get(key)}`, browser: false, unsupported: true},
		{name: "descriptor-getter-stored-callback", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}export function invoke(key:object){const value=Object.create(null,{callback:{get value(){document.title;return writer}}});install(value);return table.get(key)}`, browser: false, unsupported: true},
		{name: "proxy-descriptor-input", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}export function invoke(key:object){const descriptors=new Proxy({callback:{value:writer}},{ownKeys(target){document.title;return Reflect.ownKeys(target)},get(target,key,receiver){document.cookie;return Reflect.get(target,key,receiver)}});const value=Object.create(null,descriptors);install(value);return table.get(key)}`, browser: false, unsupported: true},
		{name: "ordered-rest-native-first", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}function apply(...values:unknown[]){install(values[0])}export function invoke(key:object){apply(Object.create(null),writer);return table.get(key)}`, browser: false, unsupported: false},
		{name: "ordered-rest-writer-first", source: `declare const choose:boolean;declare const foreignValue:unknown;const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}function apply(...values:unknown[]){install(values[0])}export function invoke(key:object){apply(writer,Object.create(null));return table.get(key)}`, browser: true, unsupported: false},
	} {
		t.Run(row.name, func(t *testing.T) {
			s := NewSession()
			r := s.Execute(Request{Kind: "analyze", ID: "/virtual/direct-exposure-donor.ts", Source: row.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			consumed := uint64(0)
			for _, p := range s.projects {
				for _, a := range p.callableCache.bySource {
					for _, f := range a.facts {
						if f.pendingMembers != nil {
							consumed += f.pendingMembers.stats.DirectExposureConsumed
						}
					}
				}
			}
			if row.unsupported {
				if consumed != 0 {
					t.Fatal("unsupported eager protocol received category consumption", consumed)
				}
				return
			}
			browser, unknown := false, false
			for _, e := range findCallable(t, r.Analysis.Callables, "invoke").EffectSources {
				browser = browser || e.Environment == "browser"
				unknown = unknown || e.Environment == "unknown"
			}
			if browser != row.browser || !unknown {
				t.Fatal("known/unknown source donor contract", browser, unknown, r.Analysis.Callables)
			}
		})
	}
}
