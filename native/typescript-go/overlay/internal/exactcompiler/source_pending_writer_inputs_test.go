package exactcompiler

import "testing"

// The natural source walk produces both the Get and the unrelated writer.
// The consumer retires actual scope discovery, rather than merely recording an
// edge while performing the same recursive caller search.
func TestPendingWriterCaptureSourceCycle(t *testing.T) {
	const source = `const table=new WeakMap<object,object>();function publish(name:string){const scope=globalThis as Record<PropertyKey,unknown>;scope[name]=new WeakMap()}export function invoke(key:object){return table.get(key)}`
	s := NewSession()
	r := s.Execute(Request{Kind: "analyze", ID: "/virtual/writer-capture.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	registered, retired, mapped, admission := uint64(0), uint64(0), uint64(0), uint64(0)
	for _, project := range s.projects {
		for _, analysis := range project.callableCache.bySource {
			for _, fact := range analysis.facts {
				if fact.summary.Name != "invoke" || fact.pendingMembers == nil {
					continue
				}
				stats := fact.pendingMembers.stats
				registered += stats.WriterInputsRegistered
				retired += stats.WriterInputScopesRetired
				mapped += stats.WriterInputMappedDeliveries
				admission += stats.WriterAdmissionRetired
				for _, relation := range fact.pendingMembers.writerCaptures {
					if consumeWriterCapture(relation, sourceWriterCapturePublication{}) || consumeWriterCapture(relation, sourceWriterCapturePublication{complete: true, matches: true}) {
						t.Fatal("unknown or matching publication consumed")
					}
				}
				clone := clonePendingMemberLedger(fact.pendingMembers)
				for key, relation := range clone.writerCaptures {
					relation.formals = nil
					if len(fact.pendingMembers.writerCaptures[key].formals) != 1 {
						t.Fatal("clone shares formal roles")
					}
				}
			}
		}
	}
	if registered == 0 || retired == 0 || mapped == 0 || admission == 0 {
		t.Fatal("capture registration did not reach admission/scope retirement and fact consumption", registered, retired, mapped, admission)
	}
}

// Matching receivers and formal-dependent captures retain original mapping.
// An independent global writer cannot erase a known own writer or activate a
// dormant callback. Rest alternatives remain distinct at their original calls.
func TestPendingWriterCaptureIndependentDonors(t *testing.T) {
	global := `function publish(name:string){const scope=globalThis as Record<PropertyKey,unknown>;scope[name]=new WeakMap()}`
	for _, row := range []struct {
		name, setup string
		browser     bool
	}{
		{"late-writer", `function install(){table.get=function(key:object){document.title;return key}}install();`, true},
		{"dormant", `function install(){table.get=function(key:object){document.title;return key}}`, false},
		{"rest-quiet-first", `function quiet(key:object){return key}function writer(key:object){document.title;return key}function install(...callbacks:((key:object)=>object)[]){table.get=callbacks[0]!}install(quiet,writer);`, false},
		{"rest-writer-first", `function quiet(key:object){return key}function writer(key:object){document.title;return key}function install(...callbacks:((key:object)=>object)[]){table.get=callbacks[0]!}install(writer,quiet);`, true},
		{"captured-setter", `const target={set value(callback:(key:object)=>object){table.get=callback}};function install(){target.value=function(key:object){document.title;return key}}install();`, true},
		{"dormant-setter", `const target={set value(callback:(key:object)=>object){table.get=callback}};function install(){target.value=function(key:object){document.title;return key}}`, false},
		{"dead-setter-write", `const target={set value(callback:(key:object)=>object){if(false)table.get=callback}};function install(){target.value=function(key:object){document.title;return key}}install();`, false},
		{"merely-passed-setter", `const target={set value(callback:(key:object)=>object){table.get=callback}};function install(){target.value=function(key:object){document.title;return key}}function keep(callback:()=>void){return callback}keep(install);`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			pendingConstructionSummary(t, `const table=new WeakMap<object,object>();`+global+row.setup+`export function invoke(key:object){return table.get(key)}`, row.browser, true)
		})
	}
}

// Producer order changes fact delivery, not callback activation or query lifetime.
func TestPendingWriterSetterLateDelivery(t *testing.T) {
	const source = `const table=new WeakMap<object,object>();export function invoke(key:object){return table.get(key)}const target={set value(callback:(key:object)=>object){table.get=callback}};function install(){target.value=function(key:object){document.title;return key}}install();`
	pendingConstructionSummary(t, source, true, true)
}

// Settling a write's unrelated receiver does not settle its original invocation.
// The reached source producer still owns its eager work and independent effects.
func TestPendingWriterAdmissionRetainsReachedProducer(t *testing.T) {
	const source = `const table=new WeakMap<object,object>();function publish(name:string){document.title;const scope=globalThis as Record<PropertyKey,unknown>;scope[name]=new WeakMap()}export function invoke(key:object){publish('fixture');return table.get(key)}`
	checkPendingConstructionTask(t, source, true, false)
}
