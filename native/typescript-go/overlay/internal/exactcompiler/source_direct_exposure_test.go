package exactcompiler

import (
	"encoding/json"
	"testing"
)

// This is an original source cycle, not a manually supplied result category.
// Category consumption must release collection and allow original effects to
// publish before either category or descriptor disposition can settle.
func TestDirectExposureSourceBoundary(t *testing.T) {
	const source = `const metadataKey=Symbol.for('tag');const table=new WeakMap<object,object>();const domain={};function publish(name:string){const scope=globalThis as Record<PropertyKey,unknown>;scope[name]=new WeakMap()}publish('fixture');export function read(prototype:object){const before=table.get(prototype);const descriptors=Object.create(prototype);Object.defineProperty(descriptors,metadataKey,{value:Object.freeze({domain})});return before}`
	s := NewSession()
	r := s.Execute(Request{Kind: "analyze", ID: "/virtual/direct-exposure-source.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	registered, consumed, settled := uint64(0), uint64(0), uint64(0)
	kinds := map[sourceNativeKind]bool{}
	for _, p := range s.projects {
		for _, a := range p.callableCache.bySource {
			for _, f := range a.facts {
				if f.summary.Name != "read" || f.pendingMembers == nil {
					continue
				}
				z := f.pendingMembers.stats
				registered += z.DirectExposureRegistered
				consumed += z.DirectExposureConsumed
				settled += z.DirectExposureSettled
				for _, row := range f.pendingMembers.directExposures {
					if row.argument == nil || row.acquired == nil || row.cuts[0] != row.consumer || row.cuts[1] != row.consumer {
						t.Fatal("lost original argument/acquisition cut", row)
					}
					kinds[row.kind] = true
					if !row.settled {
						t.Fatal("category paid pending eager effects", row)
					}
				}
			}
		}
	}
	t.Logf("native category registered=%d consumed=%d original effects settled=%d kinds=%v", registered, consumed, settled, kinds)
	if consumed == 0 || settled == 0 || !kinds[sourceNativeObjectCreateExposure] || !kinds[sourceNativeSymbolForExposure] {
		t.Fatal("actual source did not consume both native categories", registered, consumed, settled, kinds)
	}
	unknown := false
	for _, e := range findCallable(t, r.Analysis.Callables, "read").EffectSources {
		unknown = unknown || e.Environment == "unknown"
	}
	if !unknown {
		t.Fatal("category closed independent Get uncertainty")
	}
	repeat := s.Execute(Request{Kind: "analyze", ID: "/virtual/direct-exposure-source.ts", Source: source, Diagnostics: "semantic"})
	if repeat.Error != "" || hasErrorDiagnostic(repeat.Diagnostics) {
		t.Fatal(repeat.Error, repeat.Diagnostics)
	}
	before, _ := json.Marshal(findCallable(t, r.Analysis.Callables, "read"))
	after, _ := json.Marshal(findCallable(t, repeat.Analysis.Callables, "read"))
	if string(before) != string(after) {
		t.Fatal("cached original effect publications changed summary", string(before), string(after))
	}

}

// Separate directions prevent a mixed result from hiding retargeting of the
// saved native acquisition after an ordinary container member is replaced.
func TestDirectExposureSavedAcquisitionDirections(t *testing.T) {
	for _, row := range []struct {
		name, selectValue string
		browser           bool
	}{
		{"saved", `saved(null)`, false}, {"fresh", `box.make(null)`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}const box:{make:(value:object|null)=>unknown}={make:Object.create};export function invoke(key:object){const saved=box.make;box.make=(_)=>writer;install(` + row.selectValue + `);return table.get(key)}`
			s := NewSession()
			r := s.Execute(Request{Kind: "analyze", ID: "/virtual/direct-exposure-saved.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			browser, unknown := false, false
			for _, e := range findCallable(t, r.Analysis.Callables, "invoke").EffectSources {
				browser = browser || e.Environment == "browser"
				unknown = unknown || e.Environment == "unknown"
			}
			if browser != row.browser || !unknown {
				t.Fatal("original acquisition retargeted", browser, unknown, r.Analysis.Callables)
			}
		})
	}
}

// An authored value or a library-shaped type cannot acquire the standard
// operation's category. Source return donors still travel through the binder.
func TestDirectExposureProvenanceNegatives(t *testing.T) {
	for _, row := range []struct {
		name, setup, expression string
		browser                 bool
	}{
		{"shadow-symbol", `const Symbol={for(_key:string){return writer}};`, `Symbol.for('tag')`, true},
		{"custom-for", `const custom={for(_key:string){return writer}};`, `custom.for('tag')`, true},
		{"type-only", `declare const custom:typeof Symbol;`, `custom.for('tag')`, false},
		{"shadow-object", `const Object={create(_prototype:object|null){return writer}};`, `Object.create(null)`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `const table=new WeakMap<object,object>();function writer(key:object){document.title;return key}function install(value:unknown){if(typeof value==='function')table.get=value as typeof table.get}` + row.setup + `export function invoke(key:object){install(` + row.expression + `);return table.get(key)}`
			s := NewSession()
			r := s.Execute(Request{Kind: "analyze", ID: "/virtual/direct-exposure-provenance.ts", Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			for _, p := range s.projects {
				for _, a := range p.callableCache.bySource {
					for _, f := range a.facts {
						if f.pendingMembers != nil && f.pendingMembers.stats.DirectExposureConsumed != 0 {
							t.Fatal("authored/type-only value acquired native category", f.pendingMembers.stats)
						}
					}
				}
			}
			browser, unknown := false, false
			for _, e := range findCallable(t, r.Analysis.Callables, "invoke").EffectSources {
				browser = browser || e.Environment == "browser"
				unknown = unknown || e.Environment == "unknown"
			}
			if browser != row.browser || !unknown {
				t.Fatal("authored donor/unknown lost", browser, unknown, r.Analysis.Callables)
			}
		})
	}
}
