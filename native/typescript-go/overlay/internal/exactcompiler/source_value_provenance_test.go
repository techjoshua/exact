package exactcompiler

import (
	"fmt"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A declaration shared by two closures cannot stand in for their creating source values.
func TestClosureSourceProvenance(t *testing.T) {
	factory := `function make(input:{value:string}){return {get value(){return input.value}}}`
	browser := `{get value(){return document.title}}`
	for _, test := range []struct{ name, source, placement string }{
		{"captured setter", `function make(input:{value:string}){return {get value(){input.value='changed';return 'safe'}}}export const value=make({set value(next:string){document.title=next}}).value;`, "client"},
		{"enumerated transitive prototype", `class Inner{get value(){return document.title}}const inner=new Inner();function make(input:Inner){return {get value(){return input.value}}}export const value=Object.values(make(inner));`, "client"},
		{"lexical write before alias", `function make(input:{value:string}){function replace(next:{value:string}){input=next}replace({get value(){return document.title}});const old=input;return {get value(){return old.value}}}export const value=make({value:'safe'}).value;`, "client"},
		{"lexical write after alias", `function make(input:{value:string}){const old=input;function replace(next:{value:string}){input=next}replace({get value(){return document.title}});return {get value(){return old.value}}}export const value=make({value:'safe'}).value;`, "isomorphic"},
		{"direct", factory + `export const value=make(` + browser + `).value;`, "client"},
		{"delayed", factory + `const box=make(` + browser + `);export const value=box.value;`, "client"},
		{"distinct", factory + `const safe=make({value:'safe'});const box=make(` + browser + `);export const safeValue=safe.value;export const value=box.value;`, "client"},
		{"reverse distinct", factory + `const box=make(` + browser + `);const safe=make({value:'safe'});export const safeValue=safe.value;export const value=box.value;`, "client"},
		{"alias", `function make(input:{value:string}){const alias=input;return {get value(){return alias.value}}}export const value=make(` + browser + `).value;`, "client"},
		{"nested", `function outer(input:{value:string}){function make(input:{value:string}){return {get value(){return input.value}}}return make(input)}export const value=outer(` + browser + `).value;`, "client"},
		{"function", `function make(input:{value:string}){return function read(){return input.value}}const read=make(` + browser + `);export const value=read();`, "client"},
		{"implicit", factory + `const box=make(` + browser + `);export const value={...box};`, "client"},
		{"live", `function make(input:{value:string}){return {get value(){return input.value},replace(next:{value:string}){input=next}}}const safe=make({value:'safe'});const box=make({value:'old'});box.replace(` + browser + `);export const safeValue=safe.value;export const value=box.value;`, "client"},
		{"live alias", `function make(input:{value:string}){let alias=input;return {get value(){return alias.value},replace(next:{value:string}){alias=next}}}const box=make({value:'safe'});box.replace(` + browser + `);export const value=box.value;`, "client"},
		{"entry alias", `function make(input:{value:string}){const old=input;return {get value(){return old.value},replace(next:{value:string}){input=next}}}const box=make({value:'safe'});box.replace(` + browser + `);export const value=box.value;`, "isomorphic"},
		{"member alias", `function make(input:{inner:{value:string}}){return {get value(){return input.inner.value}}}const input={inner:{value:'safe'}};const box=make(input);const alias=input;alias.inner=` + browser + `;export const value=box.value;`, "client"},
		{"creation", factory + `export const box=make(` + browser + `);export const value='safe';`, "isomorphic"},
		{"ignored", factory + `make(` + browser + `);export const value='safe';`, "isomorphic"},
		{"plain", `function make(input:{value:string}){return {value:'safe'}}export const value=make(` + browser + `).value;`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) {
			assertClosurePlacement(t, test.source, test.placement)
		})
	}
}

// assertClosurePlacement checks shared analysis and both target partitions.
func assertClosurePlacement(t *testing.T, source, placement string) {
	t.Helper()
	assertClosurePlacementAt(t, source, placement, "/virtual/closure.ts")
}

// assertClosurePlacementAt allows provider-dependent output to resolve workspace declarations.
func assertClosurePlacementAt(t *testing.T, source, placement, id string) {
	t.Helper()
	source += `export const stable='stable';`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("%s %#v", response.Error, response.Diagnostics)
	}
	for _, export := range response.Analysis.Exports {
		want := "isomorphic"
		if export.Name == "value" {
			want = placement
		}
		if export.Name == "value" || export.Name == "safeValue" || export.Name == "stable" {
			if export.Placement != want {
				t.Fatalf("%s want %s got %s", export.Name, want, export.Placement)
			}
		}
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		compiled := session.Execute(Request{Kind: "compile", ID: id, Source: source, Target: target, Diagnostics: "semantic"})
		if compiled.Error != "" || hasErrorDiagnostic(compiled.Diagnostics) {
			t.Fatalf("%s: %s %#v", target, compiled.Error, compiled.Diagnostics)
		}
		if !strings.Contains(compiled.Code, "stable") {
			t.Fatal("lost stable export")
		}
		if target == TargetServer && placement == "client" && strings.Contains(compiled.Code, "const value =") {
			t.Fatalf("browser value survived server partition: %s", compiled.Code)
		}
	}
}

// Alias initializers read the value at initialization. Subsequent writes belong to the
// binding they replace, while member mutation still follows the retained object origin.
func TestClosureInitializerSequencing(t *testing.T) {
	browser := `{get value(){return document.title}}`
	for _, kind := range []string{"const", "let", "var"} {
		for _, shape := range []struct{ name, before, after, placement string }{
			{"direct before", "input=" + browser + ";", "", "client"},
			{"direct after", "", "input=" + browser + ";", "isomorphic"},
			{"unrelated call", "function noop(){}noop();", "", "isomorphic"},
			{"unrelated assignment", "let count=0;count++;", "", "isomorphic"},
			{"lexical before", "function replace(next:{value:string}){input=next}replace(" + browser + ");", "", "client"},
			{"lexical after", "", "function replace(next:{value:string}){input=next}replace(" + browser + ");", "isomorphic"},
			{"sibling", "", "", "isomorphic"},
		} {
			t.Run(kind+"/"+shape.name, func(t *testing.T) {
				source := "function make(input:{value:string}){" + shape.before + kind + " old=input;" + shape.after + "return {get value(){return old.value},replace(next:{value:string}){input=next}}}const box=make({value:'safe'});box.replace(" + browser + ");export const value=box.value;"
				assertClosurePlacement(t, source, shape.placement)
			})
		}
	}
	t.Run("default entry alias", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string},old=input){input={get value(){return document.title}};return {get value(){return old.value}}}export const value=make({value:'safe'}).value;`, "isomorphic")
	})
	for _, test := range []struct{ name, body, placement string }{
		{"rebound alias", "let old=input;old=" + browser + ";return {get value(){return old.value}}", "client"},
		{"alias chain", "let first=input;input=" + browser + ";var old=first;return {get value(){return old.value}}", "isomorphic"},
		{"live parameter", "let old=input;input=" + browser + ";return {get value(){return input.value}}", "client"},
	} {
		t.Run(test.name, func(t *testing.T) {
			assertClosurePlacement(t, "function make(input:{value:string}){"+test.body+"}export const value=make({value:'safe'}).value;", test.placement)
		})
	}
}

// Local cell writes and unrelated object writes do not interfere with the input receiver.
// Opaque and transitive writers remain incomplete rather than granting a no-write proof.
func TestClosureReceiverInterference(t *testing.T) {
	for _, prelude := range []string{"let count=0;count++;", "const other={n:0};other.n=1;", "let alias=input;alias={value:'safe'};", "function noop(){}noop();", "function read(v:{value:string}){return v.value}function forward(v:{value:string}){return read(v)}forward(input);"} {
		for _, browser := range []bool{false, true} {
			t.Run(fmt.Sprint(browser)+prelude, func(t *testing.T) {
				argument, placement := `{value:'safe'}`, "isomorphic"
				if browser {
					argument, placement = `{get value(){return document.title}}`, "client"
				}
				assertClosurePlacement(t, "function make(input:{value:string}){"+prelude+"return {get value(){return input.value}}}export const value=make("+argument+").value;", placement)
			})
		}
	}
	t.Run("mutated old object", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{inner:{value:string}}){let old=input;const alias=old;alias.inner={get value(){return document.title}};input={inner:{value:'safe'}};return {get value(){return old.inner.value}}}export const value=make({inner:{value:'safe'}}).value;`, "client")
	})
	assertClosurePlacement(t, `function write(v:{inner:{value:string}}){v.inner={get value(){return document.title}}}function forward(v:{inner:{value:string}}){write(v)}function make(input:{inner:{value:string}}){forward(input);return {get value(){return input.inner.value}}}export const value=make({inner:{value:'safe'}}).value;`, "unknown")
}

func TestClosureCapturedWrites(t *testing.T) {
	source := `function make(input:{a:number,b:number}){return {get value(){input.b=2;return input.b}}}export function run(s:{a:number,b:number}){return make(s).value}export function Page(this:{state:{a:number,b:number}}){return()=>run(this.state)}`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/capture-write.ts", Source: source})
	summary := executableSummary(t, response, "run")
	found := false
	for _, write := range summary.StateWrites {
		if write.Path == "b" && write.Receiver != nil && write.Receiver.Kind == "parameter" && write.Receiver.Index == 0 && write.Confidence == "unknown" {
			found = true
		}
	}
	if !found {
		t.Fatalf("lost possible write or granted closure lowering: %#v", summary)
	}
}

// Counters describe finite source analysis, not CPU or allocation benefits. Repeated creation
// and recursion must widen without constructing invocation-context trees.
func TestClosureProvenanceBounds(t *testing.T) {
	for _, count := range []int{2, 16, 64} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			var source strings.Builder
			source.WriteString(`function make(input:{value:string}){return {get value(){return input.value}}}`)
			for i := 0; i < count; i++ {
				fmt.Fprintf(&source, "export const v%d=make({value:'safe'}).value;", i)
			}
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/fanout.ts", Source: source.String()})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, project := range session.projects {
				if project.callableCache != nil {
					owner := project.callableCache.owner.values
					logClosureProvenance(t, session, fmt.Sprint(count))
					if owner.work > count*2000 {
						t.Fatal("unexpected context expansion")
					}
				}
			}
		})
	}
	for _, source := range []string{
		`function make(input:{value:string},n:number):{value:string}{return n?make(input,n-1):{get value(){return input.value}}}export const value=make({get value(){return document.title}},2).value;`,
		`function make(input:{value:string}){return {get value(){return input.value}}}let box=make({value:'safe'});for(let i=0;i<2;i++){box=make({get value(){return document.title}})}export const value=box.value;`,
	} {
		session := NewSession()
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/widen.ts", Source: source})
		logClosureProvenance(t, session, "widen")
		for _, export := range response.Analysis.Exports {
			if export.Name == "value" && export.Placement != "unknown" {
				t.Fatalf("expected incomplete joined source, got %s", export.Placement)
			}
		}
	}
}

// Purity describes reevaluation safety, not completeness of a creating-value proof.
func TestClosureIncompleteSurvivesPurity(t *testing.T) {
	source := `function make(input:{value:string},n:number):{value:string}{return n?make(input,n-1):{get value(){return input.value}}}/** @exact pure */export function run(){return make({get value(){return document.title}},2).value}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/pure-capture.ts", Source: source})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	var summary CallableSummary
	// The source supplies a real incomplete summary. Exercise the independent solver policy
	// directly because the authored annotation does not currently set ReevaluationSafe.
	for _, project := range session.projects {
		if project.callableCache != nil {
			facts := project.callableCache.merged.facts
			for i := range facts {
				if facts[i].summary.Name == "run" {
					facts[i].summary.ReevaluationSafe = true
				}
			}
			resolveCallableEffects(facts)
			for _, fact := range facts {
				if fact.summary.Name == "run" {
					summary = fact.summary
				}
			}
		}
	}
	if !summary.ReevaluationSafe || environmentEffectFor(summary.EffectSources) == "neutral" {
		t.Fatalf("purity erased source uncertainty: %#v", summary)
	}
	incomplete := false
	for _, effect := range summary.EffectSources {
		incomplete = incomplete || effect.provenanceIncomplete
	}
	if !incomplete {
		t.Fatal("lost independent provenance incompleteness")
	}
}

func TestClosureOpaqueWriter(t *testing.T) {
	source := `declare function mutate(input:{inner:{value:string}}):void;function make(input:{inner:{value:string}}){return {get value(){return input.inner.value}}}const input={inner:{value:'safe'}};mutate(input);export const value=make(input).value;`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/opaque-capture.ts", Source: source})
	for _, export := range response.Analysis.Exports {
		if export.Name == "value" && export.Placement != "unknown" {
			t.Fatalf("opaque writer falsely portable: %s", export.Placement)
		}
	}
}

func logClosureProvenance(t *testing.T, session *Session, label string) {
	t.Helper()
	for _, project := range session.projects {
		if project.callableCache != nil {
			owner := project.callableCache.owner.values
			t.Logf("%s summaries=%d candidates=%d substitutions=%d facts=%d peakRootProduced=%d maxAlternatives=%d queryWork=%d indexWork=%d summaryWork=%d argumentOriginWork=%d interferenceWork=%d widenings=%d", label, len(owner.summaries), owner.candidates, owner.substitutions, owner.provenanceFacts, owner.peakProducedFacts, owner.maxTerms, owner.work, owner.indexWork, owner.summaryWork, owner.argumentOriginWork, owner.interferenceWork, owner.widenings)
		}
	}
}

func TestClosureUnknownCaptureReceiver(t *testing.T) {
	source := `declare function provide():{b:number};function make(input:{b:number}){return {get value(){input.b=2;return input.b}}}export function run(){return make(provide()).value}export function Page(){return()=>run()}`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/unknown-capture.ts", Source: source})
	summary := executableSummary(t, response, "run")
	found := false
	for _, write := range summary.StateWrites {
		if write.Path == "b" && write.Confidence == "unknown" && write.Receiver != nil && write.Receiver.Kind == "unknown" {
			found = true
		}
	}
	if !found || summary.Effect != "unknown" {
		t.Fatalf("incomplete receiver lost possible write or acquired authority: %#v", summary)
	}
}

// State receiver paths use a wildcard for a dynamic key. Normalized source projections must
// keep that key conservative instead of mistaking it for an absent literal property.
func TestClosureNormalizedProjection(t *testing.T) {
	for _, test := range []struct{ key, placement string }{{`"safe"`, "isomorphic"}, {`"browser"`, "client"}, {`key`, "unknown"}} {
		source := `function make(input:{value:string}){return {get value(){return input.value}}}const table:Record<string,{value:string}>={safe:{value:'safe'},browser:{get value(){return document.title}}};const key:string='browser';export const value=make(table[` + test.key + `]!).value;export function run(){return make(table[` + test.key + `]!).value}`
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/projected-capture.ts", Source: source})
		for _, export := range response.Analysis.Exports {
			if export.Name == "value" && export.Placement != test.placement {
				t.Fatalf("%s expected %s got %s", test.key, test.placement, export.Placement)
			}
		}
		if test.placement == "unknown" {
			summary := executableSummary(t, response, "run")
			browser := false
			incomplete := false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				incomplete = incomplete || effect.provenanceIncomplete
			}
			if !browser || !incomplete {
				t.Fatalf("lost known effect or completeness: %#v", summary)
			}
		}
	}
}

// Replacing a data member does not execute the replacement's getters. Uncertainty about a
// later read must not turn the ordinary assignment itself into an opaque initializer.
func TestClosureDynamicMemberWrite(t *testing.T) {
	source := `function make(input:{inner:{value:string}}){return {get value(){return input.inner.value}}}const input:{inner:{value:string};[key:string]:{value:string}}={inner:{value:'safe'}};const key:string='inner';input[key]={get value(){return document.title}};export const value=make(input).value;export const stable='safe';`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", Target: target, ID: "/virtual/dynamic-write.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("assignment gained a rejection: %s %#v", response.Error, response.Diagnostics)
		}
		for _, export := range response.Analysis.Exports {
			if export.Name == "value" && export.Placement != "unknown" {
				t.Fatalf("lost conservative later-read provenance: %s", export.Placement)
			}
		}
	}
}

// Array projections preserve native index positions and reuse finite member origins.
// Unproved iterator or method identity cannot turn a missing element origin into neutrality.
func TestClosureArrayProjection(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"direct-browser", `function make(input:{value:string}){return {get value(){return input.value}}}const box=make({get value(){return document.title}});export const value=box.value;`, "client"},
		{"object-slot", `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({get value(){return document.title}})};export const value=xs.item.value;`, "client"},
		{"array constructor", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=new Array(make({get value(){return document.title}}));export const value=xs[0]!.value;`, "unknown"},
		{"array static factory", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=Array.of(make({get value(){return document.title}}));export const value=xs[0]!.value;`, "unknown"},
		{"spread prefix", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({value:'safe'}),...[make({get value(){return document.title}})]];export const value=xs[0]!.value;`, "isomorphic"},
		{"array acquired before replacement", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({value:'safe'})];const old=xs[0]!;xs[0]=make({get value(){return document.title}});export const value=old.value;`, "isomorphic"},
		{"object acquired before replacement", `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({value:'safe'})};const old=xs.item;xs.item=make({get value(){return document.title}});export const value=old.value;`, "isomorphic"},
		{"array acquired after replacement", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({value:'safe'})];xs[0]=make({get value(){return document.title}});const old=xs[0]!;export const value=old.value;`, "client"},
		{"array sibling incomplete", `function make(input:{value:string}){return {get value(){return input.value},replace(next:{value:string}){input=next}}}const xs=[make({value:'safe'})];xs[0]!.replace({get value(){return document.title}});export const value=xs[0]!.value;`, "client"},
		{"sibling method replaced", `function make(input:{value:string}){return {get value(){return input.value},replace(next:{value:string}){input=next}}}const xs=[make({value:"safe"})];xs[0]!.replace=()=>{};xs[0]!.replace({get value(){return document.title}});export const value=xs[0]!.value;`, "isomorphic"},
		{"literal", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({get value(){return document.title}})];export const value=xs[0]!.value;`, "client"},
		{"sparse", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[,make({get value(){return document.title}})];export const value=xs[1]!.value;`, "client"},
		{"hole", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[,make({get value(){return document.title}})];export const value=xs[0]?.value??"safe";`, "isomorphic"},
		{"numeric-string", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({get value(){return document.title}})];export const value=xs["0"]!.value;`, "client"},
		{"hex-number", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({get value(){return document.title}})];export const value=xs[0x0]!.value;`, "client"},
		{"named-key", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({get value(){return document.title}})];export const value=(xs as typeof xs & {"01"?:{value:string}})["01"]?.value??"safe";`, "isomorphic"},
		{"dynamic", `function make(input:{value:string}){return {get value(){return input.value}}}const key=Number("0");const xs=[make({get value(){return document.title}})];export const value=xs[key]!.value;`, "unknown"},
		{"computed-write", `function make(input:{value:string}){return {get value(){return input.value}}}const key=Number("0");const xs=[make({value:"safe"})];xs[key]=make({get value(){return document.title}});export const value=xs[0]!.value;`, "unknown"},
		{"indexed", `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[]=[];xs[0]=make({get value(){return document.title}});export const value=xs[0]!.value;`, "client"},
		{"alias-write", `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[]=[];const alias=xs;alias[0]=make({get value(){return document.title}});export const value=xs[0]!.value;`, "client"},
		{"named-write", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[] as {value:string}[] & {slot?:{value:string}};xs.slot=make({get value(){return document.title}});export const value=xs.slot!.value;`, "client"},
		{"nested", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[[{item:make({get value(){return document.title}})}]];export const value=xs[0]![0]!.item.value;`, "client"},
		{"object-array", `function make(input:{value:string}){return {get value(){return input.value}}}const obj={xs:[make({get value(){return document.title}})]};export const value=obj.xs[0]!.value;`, "client"},
		{"nested-write", `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[][]=[[]];xs[0]![0]=make({get value(){return document.title}});export const value=xs[0]![0]!.value;`, "client"},
		{"independent", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({value:"safe"}),make({get value(){return document.title}})];export const safeValue=xs[0]!.value;export const value=xs[1]!.value;`, "client"},
		{"alias-entry", `function make(input:{value:string}){return {get value(){return input.value}}}let xs=[make({value:"safe"})];const old=xs;xs=[make({get value(){return document.title}})];export const safeValue=old[0]!.value;export const value=xs[0]!.value;`, "client"},
		{"spread", `function make(input:{value:string}){return {get value(){return input.value}}}const src=[make({get value(){return document.title}})];const xs=[...src];export const value=xs[0]!.value;`, "unknown"},
		{"spread-suffix", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[...[],make({get value(){return document.title}})];export const value=xs[0]!.value;`, "unknown"},
		{"push", `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[]=[];xs.push(make({get value(){return document.title}}));export const value=xs[0]!.value;`, "unknown"},
		{"custom-push", `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[]=[];xs.push=(v)=>{xs[0]=v;return 1};xs.push(make({get value(){return document.title}}));export const value=xs[0]!.value;`, "unknown"},
		{"custom-elsewhere", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({value:"safe"})];const elsewhere:{value:string}[]=[];xs.push=(v)=>{elsewhere[0]=v;return 1};xs.push(make({get value(){return document.title}}));export const value=xs[0]!.value;`, "isomorphic"},
		{"push-call", `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[]=[];Array.prototype.push.call(xs,make({get value(){return document.title}}));export const value=xs[0]!.value;`, "unknown"},
		{"repeated-site", `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[]=[];for(let i=0;i<2;i++){xs[i]=make({get value(){return document.title}})}export const value=xs[0]!.value;`, "unknown"},
		{"raw", `const xs=[{get value(){return document.title}}];export const value=xs[0]!.value;`, "client"},
		{"safe", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({value:"safe"})];export const value=xs[0]!.value;`, "isomorphic"},
		{"plain", `function make(input:{value:string}){return {value:"safe"}}const xs=[make({get value(){return document.title}})];export const value=xs[0]!.value;`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}

// A last captured value follows performed call order across writer declarations.
// Incomplete receiver selection must not erase the browser-valued alternative.
func TestClosureSiblingBindingWriteOrder(t *testing.T) {
	base := `function make(input:{value:string}){return {get value(){return input.value},replace(next:{value:string}){input=next},reset(next:{value:string}){input=next}}}`
	for _, test := range []struct{ name, source, placement string }{
		{"reverse-unsafe", `const a=make({value:"safe"});a.reset({value:"safe"});a.replace({get value(){return document.title}});export const value=a.value;`, "client"},
		{"reverse-methods", `const a=make({value:"safe"});a.reset({get value(){return document.title}});a.replace({value:"safe"});export const value=a.value;`, "isomorphic"},
		{"forward-methods", `const a=make({value:"safe"});a.replace({get value(){return document.title}});a.reset({value:"safe"});export const value=a.value;`, "isomorphic"},
		{"single", `const a=make({get value(){return document.title}});a.replace({value:"safe"});export const value=a.value;`, "isomorphic"},
		{"ambiguous", `declare const flag:boolean;const a=make({get value(){return document.title}}),b=make({value:"safe"});const r=flag?a:b;r.replace({value:"safe"});export const value=a.value;`, "client"},
		{"different-instance", `const a=make({get value(){return document.title}}),b=make({value:"safe"});b.replace({value:"safe"});export const value=a.value;`, "client"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, base+test.source, test.placement) })
	}
	for _, test := range []struct{ name, source, placement string }{
		{"one-body-last-browser", `function make(input:{value:string}){return {get value(){return input.value},replace(next:{value:string}){input={value:"safe"};input=next}}}const a=make({value:"safe"});a.replace({get value(){return document.title}});export const value=a.value;`, "client"},
		{"one-body-last-safe", `function make(input:{value:string}){return {get value(){return input.value},replace(next:{value:string}){input=next;input={value:"safe"}}}}const a=make({value:"safe"});a.replace({get value(){return document.title}});export const value=a.value;`, "isomorphic"},
		{"nested-last-browser", `function make(input:{value:string}){return {get value(){return input.value},replace(){input=(input={value:"safe"},{get value(){return document.title}})}}}const a=make({value:"initial"});a.replace();export const value=a.value;`, "client"},
		{"nested-last-safe", `function make(input:{value:string}){return {get value(){return input.value},replace(){input=(input={get value(){return document.title}},{value:"safe"})}}}const a=make({value:"initial"});a.replace();export const value=a.value;`, "isomorphic"},
		{"comma-last-browser", `function make(input:{value:string}){return {get value(){return input.value},replace(){input={value:"safe"},input={get value(){return document.title}}}}}const a=make({value:"initial"});a.replace();export const value=a.value;`, "client"},
		{"comma-last-safe", `function make(input:{value:string}){return {get value(){return input.value},replace(){input={get value(){return document.title}},input={value:"safe"}}}}const a=make({value:"initial"});a.replace();export const value=a.value;`, "isomorphic"},
		{"nested-eager-RHS", `function make(input:{value:string}){return {get value(){return input.value},replace(){input=(input={value:document.title},{value:"safe"})}}}const a=make({value:"initial"});a.replace();export const value=a.value;`, "client"},
		{"nested-own-method-browser", `function make(){return {read(){return "initial"}}}const a=make();a.read=(a.read=()=>"safe",()=>document.title);export const value=a.read();`, "client"},
		{"nested-own-method-safe", `function make(){return {read(){return "initial"}}}const a=make();a.read=(a.read=()=>document.title,()=>"safe");export const value=a.read();`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}

// Acquiring and calling a generator method does not certify that its deferred
// assignment completed. This checks refusal, not general iterator execution.
func TestClosureGeneratorBindingDoesNotProvePerformedReplacement(t *testing.T) {
	source := `function make(input:{value:string}){return {get value(){return input.value},*replace(next:{value:string}){input=next}}}const xs=[make({value:"safe"})];xs[0]!.replace({get value(){return document.title}});export const value=xs[0]!.value;`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "generator-binding.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("%s %#v", response.Error, response.Diagnostics)
	}
	for _, item := range response.Analysis.Exports {
		if item.Name == "value" {
			if item.Placement != "unknown" {
				t.Fatalf("deferred body gained performed replacement authority: %#v", item)
			}
			return
		}
	}
	t.Fatal("missing value export")
}

// Only source-traceable capture receivers enter possible writes, with lowering blocked.
func TestClosureArrayCapturedWrites(t *testing.T) {
	for _, body := range []string{
		`const xs=[make(s)];return xs[0]!.value;`,
		`const xs:{value:number}[]=[];const alias=xs;alias[0]=make(s);return xs[0]!.value;`,
		`const xs=[[make(s)]];return xs[0]![0]!.value;`,
	} {
		source := `function make(input:{b:number}){return {get value(){input.b=2;return input.b}}}export function run(s:{b:number}){` + body + `}`
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/array-write.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("%s %#v", response.Error, response.Diagnostics)
		}
		summary := executableSummary(t, response, "run")
		found := false
		for _, write := range summary.StateWrites {
			found = found || (write.Path == "b" && write.Confidence == "unknown" && write.Receiver != nil && write.Receiver.Kind == "parameter" && write.Receiver.Index == 0)
		}
		if !found {
			t.Fatalf("lost possible write or granted closure authority: %#v", summary)
		}
	}
}

// Fanout shares the existing query budget. These counts are work witnesses, not timing claims.
func TestClosureArrayProjectionBounds(t *testing.T) {
	for _, count := range []int{2, 16, 64} {
		for _, shape := range []string{"individual", "alias", "shared"} {
			var source strings.Builder
			source.WriteString(`function make(input:{value:string}){return {get value(){return input.value}}}`)
			if shape == "shared" {
				source.WriteString("const xs=[")
				for i := 0; i < count; i++ {
					source.WriteString("make({value:'safe'}),")
				}
				source.WriteString("];")
			}
			for i := 0; i < count; i++ {
				if shape == "shared" {
					fmt.Fprintf(&source, "export const v%d=xs[%d]!.value;", i, i)
					continue
				}
				fmt.Fprintf(&source, "const xs%d=[make({value:'safe'})];", i)
				root := fmt.Sprintf("xs%d", i)
				if shape == "alias" {
					fmt.Fprintf(&source, "const alias%d=xs%d;", i, i)
					root = fmt.Sprintf("alias%d", i)
				}
				fmt.Fprintf(&source, "export const v%d=%s[0]!.value;", i, root)
			}
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/array-fanout.ts", Source: source.String()})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("%s %#v", response.Error, response.Diagnostics)
			}
			logClosureProvenance(t, session, fmt.Sprintf("array/%d/%s", count, shape))
			for _, export := range response.Analysis.Exports {
				if export.Placement != "isomorphic" {
					t.Fatalf("lost finite safe projection: %#v", export)
				}
			}
		}
	}
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/array-loop.ts", Source: `function make(input:{value:string}){return {get value(){return input.value}}}const xs:{value:string}[]=[];for(let i=0;i<2;i++){xs[i]=make({get value(){return document.title}})}export const value=xs[0]!.value;`})
	logClosureProvenance(t, session, "array/repeated-site")
	for _, export := range response.Analysis.Exports {
		if export.Name == "value" && export.Placement != "unknown" {
			t.Fatalf("lost repeated-site uncertainty: %#v", export)
		}
	}
	for _, project := range session.projects {
		if project.callableCache != nil {
			owner := project.callableCache.owner.values
			if owner.substitutions == 0 || owner.widenings == 0 {
				t.Fatal("projection never reached creating edge")
			}
		}
	}
}

// Acquisition retains the value, while relevant writes retain its shared identity.
// Calls after the read and calls on unrelated receivers cannot revoke known placement.
func TestClosureOrderedProjectionAcquisition(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"getter and setter call order", `const log:string[]=[];const xs={get item(){log.push("get");return {value:"safe"}},set item(v:{value:string}){log.push("set")}};const old=xs.item;xs.item={value:"other"};export const value=old.value;export const order=log.join(",");`, "isomorphic"},
		{"raw-own-noop", `const xs=[{get value(){return document.title}}];xs.push=()=>1;xs.push();export const value=xs[0]!.value;`, "client"},
		{"raw-own-elsewhere", `const xs=[{get value(){return document.title}}];const elsewhere:number[]=[];xs.push=()=>{elsewhere[0]=1;return 1};xs.push();export const value=xs[0]!.value;`, "client"},
		{"raw-later-call", `const xs=[{get value(){return document.title}}];export const value=xs[0]!.value;xs.slice();`, "client"},
		{"raw-other-slot-call", `const xs=[{get value(){return document.title}},{value:"safe",noop(){}}];xs[1]!.value.toString();export const value=xs[0]!.value;`, "client"},
		{"raw-safe-call", `const xs=[{value:"safe"}];xs.slice();export const value=xs[0]!.value;`, "isomorphic"},
		{"acquire-object-let", `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({get value(){return document.title}})};let old=xs.item;xs.item=make({value:"safe"});export const value=old.value;`, "client"},
		{"acquire-nested-browser", `function make(input:{value:string}){return {get value(){return input.value}}}const xs={inner:{item:make({get value(){return document.title}})}};const old=xs.inner.item;xs.inner={item:make({value:"safe"})};export const value=old.value;`, "client"},
		{"acquire-object-safe", `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({value:"safe"})};const old=xs.item;xs.item=make({get value(){return document.title}});export const value=old.value;`, "isomorphic"},
		{"acquire-safe-safe", `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({value:"safe"})};const old=xs.item;xs.item=make({value:"safe"});export const value=old.value;`, "isomorphic"},
		{"acquire-member-mutation", `const xs={item:{inner:{value:"safe"}}};const old=xs.item;xs.item.inner={get value(){return document.title}};export const value=old.inner.value;`, "client"},
		{"acquire-old-mutation", `const xs={item:{inner:{value:"safe"}}};const old=xs.item;xs.item={inner:{value:"safe"}};old.inner={get value(){return document.title}};export const value=old.inner.value;`, "client"},
		{"acquire-shared-alias", `const xs={item:{inner:{value:"safe"}}};const alias=xs.item;const old=xs.item;alias.inner={get value(){return document.title}};export const value=old.inner.value;`, "client"},
		{"acquire-prefix-replacement", `const xs={nested:{item:{inner:{value:"safe"}}}};const old=xs.nested.item;xs.nested={item:{inner:{get value(){return document.title}}}};export const value=old.inner.value;`, "isomorphic"},
		{"own-this-unrelated", `const xs={item:{inner:{get value(){return document.title}},other:0,change(){this.other=1}}};const old=xs.item;old.change();export const value=old.inner.value;`, "client"},
		{"browser-replaced-before", `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({get value(){return document.title}})};xs.item=make({value:"safe"});const old=xs.item;export const value=old.value;`, "isomorphic"},
		{"multiple-replacements", `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({get value(){return document.title}})};xs.item=make({get value(){return document.title}});xs.item=make({value:"safe"});const old=xs.item;export const value=old.value;`, "isomorphic"},
		{"conditional-replacement", `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({get value(){return document.title}})};if(Number("0"))xs.item=make({value:"safe"});const old=xs.item;export const value=old.value;`, "client"},
		{"raw-slice", `const xs=[{get value(){return document.title}}];xs.slice();export const value=xs[0]!.value;`, "client"},
		{"acquire-browser", `function make(input:{value:string}){return {get value(){return input.value}}}const xs=[make({get value(){return document.title}})];const old=xs[0]!;xs[0]=make({value:"safe"});export const value=old.value;`, "client"},
		{"object-acquire-browser", `function make(input:{value:string}){return {get value(){return input.value}}}const xs={item:make({get value(){return document.title}})};const old=xs.item;xs.item=make({value:"safe"});export const value=old.value;`, "client"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}

// Acquiring concrete elements must not consume symbolic caller or component projections.
// These are possible writes, with unknown confidence and no private-entry authority.
func TestClosureSymbolicProjectionWrites(t *testing.T) {
	for _, shape := range []struct{ name, elements, index string }{
		{"literal", "make(VALUE)", "0"},
		{"dynamic", "make(VALUE)", `Number("0")`},
		{"budget", strings.Repeat("make(VALUE),", 900), `Number("0")`},
	} {
		t.Run(shape.name, func(t *testing.T) {
			body := "const xs=[" + shape.elements + "];return xs[" + shape.index + "]!.value;"
			f := newExecutableFixture(t, map[string]string{
				"entry.ts":  `import {TaskContext,type Component} from '@exactjs/core';import {make} from './helper.js';export function run(s:{inner:{b:number}}){` + strings.ReplaceAll(body, "VALUE", "s.inner") + `}export function Page(this:Component<{b:number}>){this.state.b=0;function save(task:TaskContext=TaskContext.server().blocking()){` + strings.ReplaceAll(body, "VALUE", "this.state") + `}save();return()=>this.state.b;}`,
				"helper.ts": `export function make(input:{b:number}){return {value:0}}`,
				"helper.js": `export function make(input){return {get value(){input.b=2;return input.b}}}`,
			})
			if r := f.synchronize([]ExecutableEdge{{"entry.ts", 1, "./helper.js", "import", "helper.js"}}); r.Error != "" {
				t.Fatal(r.Error)
			}
			r := f.session.Execute(f.request("analyze", "entry.ts"))
			if hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Diagnostics)
			}
			run := executableSummary(t, r, "run")
			if len(run.StateWrites) != 1 || run.StateWrites[0].Path != "inner.b" || run.StateWrites[0].Confidence != "unknown" {
				t.Fatalf("lost symbolic caller write: %#v", run)
			}
			if len(r.Analysis.Continuations) == 0 {
				t.Fatal("missing continuation")
			}
			for _, continuation := range r.Analysis.Continuations {
				writes := continuation.Effects.StateWrites
				if len(writes) != 1 || writes[0].Path != "b" || writes[0].Confidence != "unknown" || writes[0].Receiver == nil || writes[0].Receiver.Kind != "component" {
					t.Fatalf("lost symbolic component write: %#v", writes)
				}
			}
			compiled := f.session.Execute(f.request("compile", "entry.ts"))
			if compiled.Error != "" || hasErrorDiagnostic(compiled.Diagnostics) {
				t.Fatalf("supported task input view rejected: %s %#v", compiled.Error, compiled.Diagnostics)
			}
			if !strings.Contains(compiled.Code, ".helper(make)") || !strings.Contains(compiled.Code, "__exactCreateTaskState(") {
				t.Fatalf("symbolic capture lost its task view or acquired scalar private authority:\n%s", compiled.Code)
			}
		})
	}
}

// Every possible receiver value participates in completeness. A may write cannot
// make an overwritten initializer a certain environment dependency.
func TestClosureReceiverAlternatives(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"mixed-reverse-safe", `const xs:{value:string}[]=[{get value(){return document.title}},{value:"safe"}];const native=xs.reverse;xs.reverse=Number("1")?native:function(this:{value:string}[]){return this};xs.reverse();export const value=xs[0]!.value;`, "unknown"},
		{"mixed-reverse-browser", `const xs:{value:string}[]=[{value:"safe"},{get value(){return document.title}}];const native=xs.reverse;xs.reverse=Number("1")?native:function(this:{value:string}[]){return this};xs.reverse();export const value=xs[0]!.value;`, "unknown"},
		{"mixed-fill-safe", `const xs:{value:string}[]=[{get value(){return document.title}}];const native=xs.fill;xs.fill=Number("1")?native:function(this:{value:string}[]){return this};xs.fill({value:"safe"});export const value=xs[0]!.value;`, "unknown"},
		{"mixed-fill-browser", `const xs:{value:string}[]=[{value:"safe"}];const native=xs.fill;xs.fill=Number("1")?native:function(this:{value:string}[]){return this};xs.fill({get value(){return document.title}});export const value=xs[0]!.value;`, "unknown"},
		{"native-only", `const xs=[{get value(){return document.title}},{value:"safe"}];xs.reverse();export const value=xs[0]!.value;`, "unknown"},
		{"authored-only", `const xs=[{get value(){return document.title}},{value:"safe"}];xs.reverse=function(this:{value:string}[]){return this};xs.reverse();export const value=xs[0]!.value;`, "client"},
		{"two-authored", `const xs=[{get value(){return document.title}}];xs.reverse=Number("1")?function(this:{value:string}[]){return this}:function(this:{value:string}[]){return this};xs.reverse();export const value=xs[0]!.value;`, "client"},
		{"literal-skipped-bodyless", `const xs=[{get value(){return document.title}}];declare function foreign(this:{value:string}[]):{value:string}[];xs.slice=Number("0")?foreign:()=>[];xs.slice();export const value=xs[0]!.value;`, "client"},
		{"overloaded-authored-noop", `const xs=[{get value(){return document.title}}];function noop(this:{value:string}[]):{value:string}[];function noop(this:{value:string}[],unused?:number){return this}xs.reverse=noop;xs.reverse();export const value=xs[0]!.value;`, "client"},
		{"comma-native-alternative", `const xs=[{get value(){return document.title}},{value:"safe"}];const native=xs.reverse;xs.reverse=Number("1")?(Number("0"),native):function(this:{value:string}[]){return this};xs.reverse();export const value=xs[0]!.value;`, "unknown"},
		{"assignment-native-alternative", `const xs=[{get value(){return document.title}},{value:"safe"}];const native=xs.reverse;let alias=native;xs.reverse=Number("1")?(alias=native):function(this:{value:string}[]){return this};xs.reverse();export const value=xs[0]!.value;`, "unknown"},
		{"comma-readonly-alternative", `const xs=[{get value(){return document.title}}];const native=xs.slice;xs.slice=Number("1")?(Number("0"),native):()=>[];xs.slice();export const value=xs[0]!.value;`, "client"},
		{"mixed-readonly", `const xs=[{get value(){return document.title}}];const native=xs.slice;xs.slice=Number("1")?native:()=>[];xs.slice();export const value=xs[0]!.value;`, "client"},
		{"conditional-override", `const xs=[{get value(){return document.title}},{value:"safe"}];if(Number("0"))xs.reverse=function(this:{value:string}[]){return this};xs.reverse();export const value=xs[0]!.value;`, "unknown"},
		{"relevant-safe", `const xs=[{get value(){return document.title}}];xs.reverse=function(this:{value:string}[]){xs[0]={value:"safe"};return this};xs.reverse();export const value=xs[0]!.value;`, "unknown"},
		{"relevant-browser", `const xs:{value:string}[]=[{value:"safe"}];xs.reverse=function(this:{value:string}[]){xs[0]={get value(){return document.title}};return this};xs.reverse();export const value=xs[0]!.value;`, "unknown"},
		{"acquired-writer", `const xs=[{inner:{get value(){return document.title}}}];const old=xs[0]!;xs.reverse=function(this:{inner:{value:string}}[]){old.inner={value:"safe"};return this};xs.reverse();export const value=old.inner.value;`, "unknown"},
		{"acquired-late", `const xs=[{inner:{get value(){return document.title}}}];const old=xs[0]!;xs.reverse=function(this:{inner:{value:string}}[]){old.inner={value:"safe"};return this};export const value=old.inner.value;xs.reverse();`, "client"},
		{"acquired-disjoint", `const xs=[{inner:{get value(){return document.title}},other:{value:"safe"}}];const old=xs[0]!;xs.reverse=function(this:{inner:{value:string},other:{value:string}}[]){old.other={value:"safe"};return this};xs.reverse();export const value=old.inner.value;`, "client"},
		{"source-and-opaque", `declare const foreign:()=>void;const xs={item:{get value(){return document.title}},op:foreign};xs.op=Number("1")?foreign:()=>{};xs.op();export const value=xs.item.value;`, "unknown"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}

// An opacity-only lookup may stop, but every relevant RHS must still contribute
// its possible effects, independently of the order in which writers appear.
func TestClosureWriterSearchKeepsAlternatives(t *testing.T) {
	first := `old.inner={get value(){s.a=1;return "safe"}};`
	second := `old.inner={get value(){s.b=2;return document.title}};`
	for _, writes := range []string{first + second, second + first} {
		source := `export function run(s:{a:number,b:number}){const xs=[{inner:{value:"safe"}}];const old=xs[0]!;xs.reverse=function(this:{inner:{value:string}}[]){` + writes + `return this};xs.reverse();return old.inner.value;}`
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/writer-alternatives.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("%s %#v", response.Error, response.Diagnostics)
		}
		summary := executableSummary(t, response, "run")
		for _, path := range []string{"a", "b"} {
			found := false
			for _, write := range summary.StateWrites {
				found = found || write.Path == path && write.Confidence == "unknown"
			}
			if !found {
				t.Fatalf("lost possible %s write: %#v", path, summary.StateWrites)
			}
		}
		browser, incomplete := false, false
		for _, effect := range summary.EffectSources {
			browser = browser || effect.Environment == "browser"
			incomplete = incomplete || effect.provenanceIncomplete
		}
		if !browser || !incomplete {
			t.Fatalf("lost known effect, completeness or lowering boundary: %#v", summary)
		}
	}
}

// Projected calls compose actual invocation inputs with the creating capture bindings.
// A may-callee summary must neither lose possible writes nor authorize scalar lowering.
func TestClosureProjectedInvocation(t *testing.T) {
	assertClosurePlacement(t, `function read(input:{value:string}={get value(){return document.title}}){return input.value}export const value=read.apply(undefined);`, "client")
	assertClosurePlacement(t, `function read(input:{value:string}={get value(){return document.title}}){return input.value}export const value=read.apply(undefined,[]);`, "client")
	t.Run("array", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({get value(){return document.title}})];export const value=xs[0]!();`, "client")
	})
	t.Run("array-safe", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({value:"safe"})];export const value=xs[0]!();`, "isomorphic")
	})
	t.Run("object", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return function read(){return input.value}}const xs={read:make({get value(){return document.title}})};export const value=xs.read();`, "client")
	})
	t.Run("nested", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return function read(){return input.value}}const xs={inner:[make({get value(){return document.title}})]};export const value=xs.inner[0]!();`, "client")
	})
	t.Run("independent", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({value:"safe"}),make({get value(){return document.title}})];export const safe=xs[0]!();export const value=xs[1]!();`, "client")
	})
	t.Run("arguments", func(t *testing.T) {
		assertClosurePlacement(t, `function make(){return function read(input:{value:string}){return input.value}}const xs=[make()];export const value=xs[0]!({get value(){return document.title}});`, "client")
	})
	t.Run("default", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return function read(value=input){return value.value}}const xs=[make({get value(){return document.title}})];export const value=xs[0]!();`, "client")
	})
	t.Run("undefined-default", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return function read(value=input){return value.value}}const xs=[make({get value(){return document.title}})];export const value=xs[0]!(undefined);`, "client")
	})
	t.Run("rest", func(t *testing.T) {
		assertClosurePlacement(t, `function make(){return function read(...inputs:{value:string}[]){return inputs[1]!.value}}const xs=[make()];export const value=xs[0]!({value:"safe"},{get value(){return document.title}});`, "client")
	})
	t.Run("method-this", func(t *testing.T) {
		assertClosurePlacement(t, `function make(){return function read(this:{value:string}){return this.value}}const xs={read:make(),get value(){return document.title}};export const value=xs.read();`, "client")
	})
	t.Run("arrow-this", func(t *testing.T) {
		assertClosurePlacement(t, `function make(this:{value:string}){return ()=>this.value}const obj={make,get value(){return document.title}};const xs={read:obj.make(),value:"safe"};export const value=xs.read();`, "client")
	})
	t.Run("optional", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({get value(){return document.title}})];export const value=xs[0]?.();`, "client")
	})
	t.Run("acquired-browser", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({get value(){return document.title}})];const old=xs[0]!;xs[0]=make({value:"safe"});export const value=old();`, "client")
	})
	t.Run("acquired-safe", func(t *testing.T) {
		assertClosurePlacement(t, `function make(input:{value:string}){return function read(){return input.value}}const xs=[make({value:"safe"})];const old=xs[0]!;xs[0]=make({get value(){return document.title}});export const value=old();`, "isomorphic")
	})
	for _, source := range []string{
		`function make(input:{b:number}){return function write(){input.b++;return input.b}}export function run(s:{b:number}){const xs=[make(s)];return xs[0]!()}export const value=run({b:1});`,
		`function make(){return function write(input:{b:number}){input.b++;return input.b}}export function run(s:{b:number}){const xs=[make()];return xs[0]!(s)}export const value=run({b:1});`,
		`function make(){return function write(...inputs:{b:number}[]){inputs[1]!.b++;return inputs[1]!.b}}export function run(s:{b:number}){const xs=[make()];return xs[0]!({b:100},s)}export const value=run({b:1});`,
	} {
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/projected-write.ts", Source: source})
		summary := executableSummary(t, response, "run")
		found := false
		for _, write := range summary.StateWrites {
			found = found || write.Path == "b" && write.Confidence == "unknown" && write.Receiver != nil && write.Receiver.Kind == "parameter" && write.Receiver.Index == 0
		}
		if !found {
			t.Fatalf("lost possible write or granted closure lowering: %#v", summary)
		}
	}
}

// Executable bodies and authored signatures remain separate through projected invocation.
func TestClosureProjectedSelectedInvocation(t *testing.T) {
	for _, browser := range []bool{false, true} {
		t.Run(fmt.Sprint(browser), func(t *testing.T) {
			typed := `export function make(input:{value:string}){return ()=>input.value}`
			runtime := `export function make(input){return ()=>"safe"}`
			want := "isomorphic"
			if browser {
				typed = `export function make(input:{value:string}){return ()=>"safe"}`
				runtime = `export function make(input){return ()=>input.value}`
				want = "client"
			}
			f := newExecutableFixture(t, map[string]string{
				"entry.ts":  `import {make} from './helper.js';const xs=[make({get value(){return document.title}})];export const value=xs[0]!();export function run(){return xs[0]!()}`,
				"helper.ts": typed, "helper.js": runtime,
			})
			if r := f.synchronize([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}); r.Error != "" {
				t.Fatal(r.Error)
			}
			response := f.session.Execute(f.request("analyze", "entry.ts"))
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("valid projected source rejected: %#v", response)
			}
			for _, export := range response.Analysis.Exports {
				if export.Name == "value" && export.Placement != want {
					t.Fatalf("placement %s want %s", export.Placement, want)
				}
			}
			summary := executableSummary(t, response, "run")
			found := false
			for _, effect := range summary.EffectSources {
				found = found || effect.Environment == "browser"
			}
			if found != browser {
				t.Fatalf("wrong executable effect sources: %#v", summary)
			}
		})
	}
}

// Known effects survive incomplete projected alternatives. Counts retain the cost frontier
// without treating a root budget as a whole-generation complexity guarantee.
func TestClosureProjectedBounds(t *testing.T) {
	assertClosurePlacement(t, `function read(input:{value:string}={get value(){return document.title}}){return input.value}const args={length:1,0:{value:"safe"}};export const value=read.apply(undefined,args as unknown as [{value:string}]);`, "unknown")
	assertClosurePlacement(t, `function make(){return (first:{value:string},second:{value:string},...rest:{value:string}[])=>second.value}const args:[{value:string},{value:string}]=[{value:"safe"},{value:"safe"}];const xs=[make()];export const value=xs[0]!(...args,{get value(){return document.title}});`, "unknown")
	for _, choice := range []string{`Number("0")`, `Number("1")`} {
		source := `declare function foreign():()=>string;function make(input:{b:number}){return ()=>{input.b++;return document.title}}export function run(s:{b:number}){const xs=[make(s),foreign()];return xs[` + choice + `]!()}`
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/projected-incomplete.ts", Source: source})
		summary := executableSummary(t, response, "run")
		browser, incomplete, write := false, false, false
		for _, effect := range summary.EffectSources {
			browser = browser || effect.Environment == "browser"
			incomplete = incomplete || effect.provenanceIncomplete
		}
		for _, effect := range summary.StateWrites {
			write = write || effect.Path == "b" && effect.Confidence == "unknown"
		}
		if !browser || !incomplete || !write {
			t.Fatalf("lost known effects or incomplete authority: %#v", summary)
		}
	}
	for _, count := range []int{2, 16, 64} {
		var source strings.Builder
		source.WriteString(`function make(input:{value:string}){return ()=>input.value}const xs=[`)
		for i := 0; i < count; i++ {
			source.WriteString(`make({value:"safe"}),`)
		}
		source.WriteString("];")
		for i := 0; i < count; i++ {
			fmt.Fprintf(&source, "export const v%d=xs[%d]!();", i, i)
		}
		session := NewSession()
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/projected-fanout.ts", Source: source.String()})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("valid source rejected: %s %#v", response.Error, response.Diagnostics)
		}
		logClosureProvenance(t, session, fmt.Sprintf("invocation/%d", count))
	}
}

// Resolving returned callables must not reinterpret a source wrapper's native apply call.
func TestClosureProjectedPreservesNativeWrapper(t *testing.T) {
	source := `const xs=[{get value(){return document.title}}];const native=xs.slice;xs.slice=function(this:{value:string}[],...args:[start?:number,end?:number]){return native.apply(this,args)};xs.slice();export const value=xs[0]!.value;`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/native-wrapper.ts", Source: source, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("ordinary native wrapper rejected: %s %#v", response.Error, response.Diagnostics)
		}
		for _, export := range response.Analysis.Exports {
			if export.Name == "value" && export.Placement != "client" {
				t.Fatalf("native nonwriter lost browser placement: %#v", export)
			}
		}
	}
}

// Ordinary calls retain their established validation, regardless of unused input shapes.
func TestClosureProjectedPreservesOrdinaryInputs(t *testing.T) {
	for _, source := range []string{
		`function noop(input:unknown){return "safe"}function read(input:{value:string}={get value(){return document.title}}){return noop(input)}const args={length:1,0:{value:"safe"}};read.apply(undefined,args as unknown as [{value:string}]);export const value="safe";`,
		`function make(){return (...inputs:{value:string}[])=>inputs[0]!.value}const args=[{get value(){return document.title}}];const xs=[make()];export const value=xs[0]!({value:"safe"},...args);`,
		`function read({value}:{value:string}){return value}read({value:"safe"});export const value="safe";`,
		`function noop(...values:unknown[]){return "safe"}noop(...[]);export const value="safe";`,
		`function make(){return (...inputs:{value:string}[])=>inputs[1]!.value}let input={value:"safe"};input={get value(){return document.title}};const xs=[make()];export const value=xs[0]!(input,{value:"safe"});`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/ordinary-input.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("ordinary input rejected: %s %#v", response.Error, response.Diagnostics)
			}
			for _, export := range response.Analysis.Exports {
				if export.Name == "value" && export.Placement != "isomorphic" {
					t.Fatalf("unused input lost portability: %#v", export)
				}
			}
		}
	}
}

// A performed producer constrains its consumer. A dormant body or a later storage
// replacement cannot change a value that module initialization has already acquired.
func TestModuleWriteProducerDependencies(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"binding", `let input="safe";input=document.title;export const value=input;`, "client"},
		{"scalar acquisition", `let input="safe";const old=input;input=document.title;export const value=old;`, "isomorphic"},
		{"logical binding taken", `let input="";input||=document.title;export const value=input;`, "client"},
		{"logical binding skipped", `let input="safe";input||=document.title;export const value=input;`, "isomorphic"},
		{"dynamic before static", `const obj={item:{value:"safe"}};const old=obj.item;old.value=document.title;obj.item={value:"safe"};export const value=obj.item.value;`, "isomorphic"},
		{"static before dynamic", `const obj={item:{value:"safe"}};const old=obj.item;obj.item={value:"safe"};old.value=document.title;export const value=obj.item.value;`, "isomorphic"},
		{"property", `const input={value:"safe"};input.value=document.title;export const value=input.value;`, "client"},
		{"indexed", `const input=["safe"];input[0]=document.title;export const value=input[0];`, "client"},
		{"getter", `const input={value:"safe"};input.value=document.title;const obj={get value(){return input.value}};export const value=obj.value;`, "client"},
		{"call", `const input={value:"safe"};input.value=document.title;function read(){return input.value}export const value=read();`, "client"},
		{"projected call", `function make(input:{value:string}){return ()=>input.value}const input={value:"safe"};const xs=[make(input)];input.value=document.title;export const value=xs[0]!();`, "client"},
		{"called writer", `const input={value:"safe"};function write(){input.value=document.title}write();export const value=input.value;`, "client"},
		{"called binding writer", `let input="safe";function write(){input=document.title}write();export const value=input;`, "client"},
		{"dormant", `const obj={item:{value:"safe"}};function write(){obj.item={get value(){return document.title}}}export const value=obj.item.value;`, "isomorphic"},
		{"dormant method", `const obj={item:{value:"safe"},write(){obj.item={get value(){return document.title}}}};export const value=obj.item.value;`, "isomorphic"},
		{"dormant array", `const obj=[{value:"safe"}];function write(){obj[0]={get value(){return document.title}}}export const value=obj[0]!.value;`, "isomorphic"},
		{"later", `const input={value:"safe"};export const value=input.value;input.value=document.title;`, "isomorphic"},
		{"old storage", `const obj={item:{value:"safe"}};const old=obj.item;obj.item={get value(){return document.title}};export const value=old.value;`, "isomorphic"},
		{"old mutation", `const obj={item:{value:"safe"}};const old=obj.item;obj.item={value:"other"};old.value=document.title;export const value=old.value;`, "client"},
		{"unrelated", `const obj={value:"safe",other:"safe"};obj.other=document.title;export const value=obj.value;`, "isomorphic"},
		{"safe replacement", `const obj={item:{get value(){return document.title}}};obj.item={value:"safe"};export const value=obj.item.value;`, "isomorphic"},
		{"safe root replacement", `let obj={get value(){return document.title}};obj={value:"safe"};export const value=obj.value;`, "isomorphic"},
		{"compound", `const obj={value:""};obj.value+=document.title;export const value=obj.value;`, "client"},
		{"logical taken", `const obj={value:""};obj.value||=document.title;export const value=obj.value;`, "client"},
		{"logical skipped", `const obj={value:"safe"};obj.value||=document.title;export const value=obj.value;`, "isomorphic"},
		{"logical and taken", `let input="safe";input&&=document.title;export const value=input;`, "client"},
		{"logical nullish skipped", `const obj:{value:string|null}={value:"safe"};obj.value??=document.title;export const value=obj.value;`, "isomorphic"},
		{"computed key effect", `const obj={value:"safe"};obj[(document.title,"value")]="safe";export const value=obj.value;`, "client"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}

// Assignment availability follows executable source while authored types remain neutral.
func TestModuleWriteSelectedProducer(t *testing.T) {
	for _, browser := range []bool{false, true} {
		t.Run(fmt.Sprint(browser), func(t *testing.T) {
			typed, runtime, want := `return document.title`, `return "safe"`, "isomorphic"
			if browser {
				typed, runtime, want = `return "typed"`, `return document.title`, "client"
			}
			f := newExecutableFixture(t, map[string]string{
				"entry.ts":  `import {read} from './helper.js';const input={value:"safe"};input.value=read();export const value=input.value;export function run(){return read()}`,
				"helper.ts": `export function read(){` + typed + `}`,
				"helper.js": `export function read(){` + runtime + `}`,
			})
			if r := f.synchronize([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}); r.Error != "" {
				t.Fatal(r.Error)
			}
			r := f.session.Execute(f.request("analyze", "entry.ts"))
			if r.Error != "" || len(r.Diagnostics) != 0 {
				t.Fatalf("%s %#v", r.Error, r.Diagnostics)
			}
			found := false
			for _, exported := range r.Analysis.Exports {
				if exported.Name == "value" {
					found = true
					if exported.Placement != want {
						t.Fatalf("want %s got %s", want, exported.Placement)
					}
				}
			}
			if !found {
				t.Fatal("lost value export record")
			}
			effect := false
			for _, source := range executableSummary(t, r, "run").EffectSources {
				effect = effect || source.Environment == "browser"
			}
			if effect != browser {
				t.Fatal("value/effect executable owners disagree")
			}
		})
	}
}

// Return occurrences qualify their own performed producers before alternatives join.
// The emitted suite independently checks complete namespaces in both targets.
func TestModuleProducerBranchReturns(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"root-return-False-true", `function make(){let obj={value:"safe"};if(true)return obj;obj={get value(){return document.title}};return obj}export const value=make().value;`, "isomorphic"},
		{"root-return-True-true", `function make(){let obj={get value(){return document.title}};if(true)return obj;obj={value:"safe"};return obj}export const value=make().value;`, "client"},
		{"root-return-False-false", `function make(){let obj={value:"safe"};if(false)return obj;obj={get value(){return document.title}};return obj}export const value=make().value;`, "client"},
		{"root-return-True-false", `function make(){let obj={get value(){return document.title}};if(false)return obj;obj={value:"safe"};return obj}export const value=make().value;`, "isomorphic"},
		{"root-return-False-Number(\"1\")", `function make(){let obj={value:"safe"};if(Number("1"))return obj;obj={get value(){return document.title}};return obj}export const value=make().value;`, "isomorphic"},
		{"root-return-True-Number(\"1\")", `function make(){let obj={get value(){return document.title}};if(Number("1"))return obj;obj={value:"safe"};return obj}export const value=make().value;`, "client"},
		{"root-return-False-Number(\"0\")", `function make(){let obj={value:"safe"};if(Number("0"))return obj;obj={get value(){return document.title}};return obj}export const value=make().value;`, "client"},
		{"root-return-True-Number(\"0\")", `function make(){let obj={get value(){return document.title}};if(Number("0"))return obj;obj={value:"safe"};return obj}export const value=make().value;`, "isomorphic"},
		{"conditional-root-safe", `let obj={get value(){return document.title}};if(Number("1"))obj={value:"safe"};export const value=obj.value;`, "isomorphic"},
		{"early-return-browser", `function make(){const obj={item:{get value(){return document.title}}};if(Number("1"))return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;`, "client"},
		{"early-browser-true", `function make(){const obj={item:{get value(){return document.title}}};if(true)return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;`, "client"},
		{"early-browser-false", `function make(){const obj={item:{get value(){return document.title}}};if(false)return obj;obj.item={value:"safe"};return obj}export const value=make().item.value;`, "isomorphic"},
		{"early-safe-true", `function make(){const obj={item:{value:"safe"}};if(true)return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "isomorphic"},
		{"early-safe-false", `function make(){const obj={item:{value:"safe"}};if(false)return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "client"},
		{"early-return-safe", `function make(){const obj={item:{value:"safe"}};if(Number("1"))return obj;obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "isomorphic"},
		{"nested-safe-true", `function make(){const obj={item:{value:"safe"}};if(true){if(true)return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "isomorphic"},
		{"else-safe-true", `function make(){const obj={item:{value:"safe"}};if(true){return obj}else{obj.item={get value(){return document.title}};return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "isomorphic"},
		{"nested-browser-true", `function make(){const obj={item:{get value(){return document.title}}};if(true){if(true)return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;`, "client"},
		{"else-browser-true", `function make(){const obj={item:{get value(){return document.title}}};if(true){return obj}else{obj.item={value:"safe"};return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;`, "client"},
		{"nested-safe-false", `function make(){const obj={item:{value:"safe"}};if(false){if(true)return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "client"},
		{"else-safe-false", `function make(){const obj={item:{value:"safe"}};if(false){return obj}else{obj.item={get value(){return document.title}};return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "client"},
		{"nested-browser-false", `function make(){const obj={item:{get value(){return document.title}}};if(false){if(true)return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;`, "isomorphic"},
		{"else-browser-false", `function make(){const obj={item:{get value(){return document.title}}};if(false){return obj}else{obj.item={value:"safe"};return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;`, "isomorphic"},
		{"nested-safe-Number(\"1\")", `function make(){const obj={item:{value:"safe"}};if(Number("1")){if(true)return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "isomorphic"},
		{"else-safe-Number(\"1\")", `function make(){const obj={item:{value:"safe"}};if(Number("1")){return obj}else{obj.item={get value(){return document.title}};return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "isomorphic"},
		{"nested-browser-Number(\"1\")", `function make(){const obj={item:{get value(){return document.title}}};if(Number("1")){if(true)return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;`, "client"},
		{"else-browser-Number(\"1\")", `function make(){const obj={item:{get value(){return document.title}}};if(Number("1")){return obj}else{obj.item={value:"safe"};return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;`, "client"},
		{"nested-safe-Number(\"0\")", `function make(){const obj={item:{value:"safe"}};if(Number("0")){if(true)return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "client"},
		{"else-safe-Number(\"0\")", `function make(){const obj={item:{value:"safe"}};if(Number("0")){return obj}else{obj.item={get value(){return document.title}};return obj};obj.item={get value(){return document.title}};return obj}export const value=make().item.value;`, "client"},
		{"nested-browser-Number(\"0\")", `function make(){const obj={item:{get value(){return document.title}}};if(Number("0")){if(true)return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;`, "isomorphic"},
		{"else-browser-Number(\"0\")", `function make(){const obj={item:{get value(){return document.title}}};if(Number("0")){return obj}else{obj.item={value:"safe"};return obj};obj.item={value:"safe"};return obj}export const value=make().item.value;`, "isomorphic"},
		{"conditional-safe-true", `const obj={item:{get value(){return document.title}}};if(true){obj.item={value:"safe"}}export const value=obj.item.value;`, "isomorphic"},
		{"logical-true", `const obj={value:true?"":"safe"};obj.value||=document.title;export const value=obj.value;`, "client"},
		{"conditional-safe-false", `const obj={item:{get value(){return document.title}}};if(false){obj.item={value:"safe"}}export const value=obj.item.value;`, "client"},
		{"logical-false", `const obj={value:false?"":"safe"};obj.value||=document.title;export const value=obj.value;`, "isomorphic"},
		{"conditional-safe-Number(\"1\")", `const obj={item:{get value(){return document.title}}};if(Number("1")){obj.item={value:"safe"}}export const value=obj.item.value;`, "isomorphic"},
		{"logical-Number(\"1\")", `const obj={value:Number("1")?"":"safe"};obj.value||=document.title;export const value=obj.value;`, "client"},
		{"conditional-safe-Number(\"0\")", `const obj={item:{get value(){return document.title}}};if(Number("0")){obj.item={value:"safe"}}export const value=obj.item.value;`, "client"},
		{"logical-Number(\"0\")", `const obj={value:Number("0")?"":"safe"};obj.value||=document.title;export const value=obj.value;`, "isomorphic"},
		{"early-read-before-write", `function make(){const obj={item:{value:"safe"}};const old=obj.item.value;if(false)return {item:{value:old}};obj.item={get value(){return document.title}};return {item:{value:old}}}export const value=make().item.value;`, "isomorphic"},
		{"conditional-safe", `const obj={item:{get value(){return document.title}}};if(Number("1"))obj.item={value:"safe"};export const value=obj.item.value;`, "isomorphic"},
		{"logical-unknown-taken", `const obj={value:Number("1")?"":"safe"};obj.value||=document.title;export const value=obj.value;`, "client"},
		{"old-return-object", `function make(){const obj={item:{value:"safe"}};const old=obj.item;if(false)return obj;obj.item={get value(){return document.title}};return {item:old}}export const value=make().item.value;`, "isomorphic"},
		{"early-read-before-write", `function make(){const obj={item:{value:"safe"}};const old=obj.item.value;if(false)return {item:{value:old}};obj.item={get value(){return document.title}};return {item:{value:old}}}export const value=make().item.value;`, "isomorphic"},
		{"dead-scalar-read", `function make(){if(false){return document.title}return "safe"}export const value=make();`, "isomorphic"},
		{"dead-direct-call", `function read(){return document.title}function make(){if(false)return read();return "safe"}export const value=make();`, "isomorphic"},
		{"conditional-expression-safe", `function make(){const obj={item:{get value(){return document.title}}};if(false)return obj;obj.item={value:true?"safe":document.title};return obj}export const value=make().item.value;`, "isomorphic"},
		{"logical-expression-safe", `function make(){const obj={item:{get value(){return document.title}}};if(false)return obj;obj.item={value:Number("1")&&"safe"||document.title};return obj}export const value=make().item.value;`, "isomorphic"},
		{"logical-skip-before-return", `function make(){const obj={item:{value:"safe"}};if(true)return obj;obj.item.value||=document.title;return obj}export const value=make().item.value;`, "isomorphic"},
		{"direct-conditional-write", `const obj={item:{get value(){return document.title}}};function write(){if(true)obj.item={value:"safe"}}write();export const value=obj.item.value;`, "isomorphic"},
		{"dormant-return-write", `function make(){const obj={item:{value:"safe"}};function write(){if(true)obj.item={get value(){return document.title}}}return obj}export const value=make().item.value;`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}

// Finite intrinsic facts never execute an authored conversion or accept a replaced global.
func TestModuleProducerBranchFacts(t *testing.T) {
	for _, test := range []struct {
		prefix, input string
		known, truthy bool
	}{
		{"", `"1"`, true, true}, {"", `"0"`, true, false}, {"", `""`, true, false},
		{"", `" 1 "`, true, true}, {"", `true`, true, true}, {"", `false`, true, false},
		{"", `null`, true, false}, {"", `0`, true, false}, {"", `1`, true, true},
		{"", `"0x1p0"`, false, false}, {"", `"1_0"`, false, false}, {"", `"Infinity"`, false, false},
		{"", `"\u0085"`, false, false}, {"", `"\ufeff0"`, true, false},
		{`const Number=(value:string)=>0;`, `"1"`, false, false},
		{`Number=(()=>0) as NumberConstructor;`, `"1"`, false, false},
		{`globalThis.Number=(()=>0) as NumberConstructor;`, `"1"`, false, false},
		{`const host=globalThis;host.Number=(()=>0) as NumberConstructor;`, `"1"`, false, false},
		{`function replace(host:typeof globalThis){host.Number=(()=>0) as NumberConstructor}replace(globalThis);`, `"1"`, false, false},
		{`({Number:globalThis.Number}={Number:(()=>0) as NumberConstructor});`, `"1"`, false, false},
		{`[globalThis.Number]=[(()=>0) as NumberConstructor];`, `"1"`, false, false},
		{`({nested:{Number:globalThis.Number=(()=>0) as NumberConstructor}}={nested:{Number:undefined}});`, `"1"`, false, false},
		{`Object.defineProperty(globalThis,"Number",{value:()=>0});`, `"1"`, false, false},
		{`Reflect.set(globalThis,"Number",()=>0);`, `"1"`, false, false},
		{`declare function foreign():void;foreign();`, `"1"`, false, false},
		{`declare const foreign:{run():void};foreign.run();`, `"1"`, false, false},
		{`function run(){}run();`, `"1"`, true, true},
		{`const box={Number:0};({Number:box.Number}={Number:1});`, `"1"`, true, true},
		{`const box={Number:0};box.Number++;`, `"1"`, true, true},
		{`const box={Number:0};delete (box as {Number?:number}).Number;`, `"1"`, true, true},
		{`({Number}={Number:(()=>0) as NumberConstructor});`, `"1"`, false, false},
		{`let run=()=>{};({run}={run:()=>{Reflect.set(globalThis,"Number",()=>0)}});run();`, `"1"`, false, false},
		{`let run=()=>{};declare const foreign:()=>void;[run]=[foreign];run();`, `"1"`, false, false},
		{`let box:typeof globalThis|{Number:number}={Number:0};[box]=[globalThis];box.Number=(()=>0) as NumberConstructor;`, `"1"`, false, false},
		{`new (class {})();`, `"1"`, false, false},
		{`function tag(parts:TemplateStringsArray){}tag` + "`" + `` + "`" + `;`, `"1"`, false, false},
		{`const key="Number";const box={Number:0};({[key]:box.Number}={Number:1});`, `"1"`, true, true},
		{`function source(){return Number("0")}declare function foreign():void;foreign();`, `"1"`, false, false},
		{"", `{valueOf(){return 1}}`, false, false},
		{`let count=0;`, `(count++,"1")`, false, false},
	} {
		t.Run(test.prefix+test.input, func(t *testing.T) {
			session := NewSession()
			source := test.prefix + `export const value=Number(` + test.input + `);`
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/branch-fact.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatalf("invalid witness: %#v", response)
			}
			checked := false
			for _, project := range session.projects {
				owner := project.callableCache.owner.values
				for _, call := range owner.index(project.program.GetSourceFile("/virtual/branch-fact.ts")).calls {
					target := call.AsCallExpression().Expression
					if !ast.IsIdentifier(target) || target.Text() != "Number" {
						continue
					}
					query := sourceValueQuery{owner: owner, remaining: 4096}
					known, truthy, nullish := query.literalDecision(call, nil)
					if known != test.known || known && (truthy != test.truthy || nullish) {
						t.Fatalf("known=%v truthy=%v nullish=%v", known, truthy, nullish)
					}
					checked = true
				}
			}
			if !checked {
				t.Fatal("missing source call")
			}
		})
	}
}

// Parameter binding executes independently of body use. The same source-value owner
// supplies eager module availability and call-site effects without granting closure authority.
func TestClosureParameterPatterns(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"computed-key-order", `const log:string[]=[];function make(){return ({[(log.push("key"),"value")]:alias}:{value:string})=>{log.push("body");return alias}}export const value=[make()][0]!({get value(){log.push("get");return "safe"}});export const order=log.join(",");`, "isomorphic"},
		{"projected", `function make(){return ({value}:{value:string})=>value}export const value=[make()][0]!({get value(){return document.title}});`, "client"},
		{"unused", `function make(){return ({value}:{value:string})=>"safe"}export const value=[make()][0]!({get value(){return document.title}});`, "client"},
		{"unused identifier", `function make(){return (input:{value:string})=>"safe"}export const value=[make()][0]!({get value(){return document.title}});`, "isomorphic"},
		{"direct", `function read({value}:{value:string}){return value}export const value=read({get value(){return document.title}});`, "client"},
		{"method", `const obj={read({value}:{value:string}){return value}};export const value=obj.read({get value(){return document.title}});`, "client"},
		{"nested", `function make(){return ({inner:{value}}:{inner:{value:string}})=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "client"},
		{"bound member", `function make(){return ({inner}:{inner:{value:string}})=>inner.value}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "client"},
		{"plain", `function make(){return ({value}:{value:string})=>value}export const value=[make()][0]!({value:"safe"});`, "isomorphic"},
		{"evaluated data input", `function make(){return ({value}:{value:string})=>value}export const value=[make()][0]!({value:document.title});`, "client"},
		{"comma input", `function make(){return ({value}:{value:string})=>value}export const value=[make()][0]!((void 0,{get value(){return document.title}}));`, "client"},
		{"comma safe", `function make(){return ({value}:{value:string})=>value}export const value=[make()][0]!((void 0,{value:"safe"}));`, "isomorphic"},
		{"safe getter", `function make(){return ({value}:{value:string})=>value}export const value=[make()][0]!({get value(){return "safe"}});`, "isomorphic"},
		{"absent default", `function make(){return ({inner={value:document.title}}:{inner?:{value:string}})=>inner.value}export const value=[make()][0]!({});`, "client"},
		{"undefined default", `function make(){return ({value=document.title}:{value?:string})=>value}export const value=[make()][0]!({value:undefined});`, "client"},
		{"default bypass", `function make(){return ({inner={value:document.title}}:{inner?:{value:string}})=>inner.value}export const value=[make()][0]!({inner:{value:"safe"}});`, "isomorphic"},
		{"zero bypass", `function make(){return ({value=document.title}:{value?:string|number})=>value}export const value=[make()][0]!({value:0});`, "isomorphic"},
		{"null bypass", `function make(){return ({value=document.title}:{value?:string|null})=>value}export const value=[make()][0]!({value:null});`, "isomorphic"},
		{"rest copy", `function make(){return ({first,...rest}:{first:string;value:string})=>rest.value}export const value=[make()][0]!({first:"safe",value:"safe"});`, "isomorphic"},
		{"unused rest read", `function make(){return ({first,...rest}:{first:string;value:string})=>"safe"}export const value=[make()][0]!({first:"safe",get value(){return document.title}});`, "client"},
		{"literal computed", `function make(){return ({["value"]:alias}:{value:string})=>alias}export const value=[make()][0]!({get value(){return document.title}});`, "client"},
		{"unproven iterator", `function make(){return ([value]:Iterable<string>)=>value}const input={*[Symbol.iterator](){yield document.title}};export const value=[make()][0]!(input);`, "unknown"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}

// Binding an object member retains the actual caller's possible receiver, with unknown
// confidence. A destructured name is not an ordinary whole-parameter effect-graph root.
func TestClosureParameterPatternWrites(t *testing.T) {
	for _, source := range []string{
		`function make(){return ({inner}:{inner:{b:number}})=>{inner.b++;return inner.b}}export function run(s:{b:number}){return [make()][0]!({inner:s})}`,
		`function make(){return ({...rest}:{inner:{b:number}})=>{rest.inner.b++;return rest.inner.b}}export function run(s:{b:number}){return [make()][0]!({inner:s})}`,
		`function write({inner}:{inner:{b:number}}){inner.b++;return inner.b}export function run(s:{b:number}){return write({inner:s})}`,
		`function make({inner}:{inner:{b:number}}){return ()=>{inner.b++;return inner.b}}export function run(s:{b:number}){return [make({inner:s})][0]!()}`,
	} {
		response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/pattern-write.ts", Source: source})
		summary := executableSummary(t, response, "run")
		found := false
		for _, write := range summary.StateWrites {
			found = found || write.Path == "b" && write.Confidence == "unknown" && write.Receiver != nil && write.Receiver.Kind == "parameter" && write.Receiver.Index == 0
		}
		if !found {
			t.Fatalf("lost possible binding write or granted closure lowering: %#v", summary)
		}
	}
}

// Executable parameter syntax, rather than the authored signature's binding form,
// determines which getters execute. Selection still cannot authorize private lowering.
func TestClosureParameterPatternSelection(t *testing.T) {
	for _, browser := range []bool{false, true} {
		t.Run(fmt.Sprint(browser), func(t *testing.T) {
			typed := `export function make(){return ({value}:{value:string})=>value}`
			runtime := `export function make(){return input=>"safe"}`
			want := "isomorphic"
			if browser {
				typed = `export function make(){return (input:{value:string})=>"typed"}`
				runtime = `export function make(){return ({value})=>value}`
				want = "client"
			}
			f := newExecutableFixture(t, map[string]string{
				"entry.ts":  `import {make} from './helper.js';const xs=[make()];export const value=xs[0]!({get value(){return document.title}});export function run(){return xs[0]!({get value(){return document.title}})}`,
				"helper.ts": typed, "helper.js": runtime,
			})
			if r := f.synchronize([]ExecutableEdge{{"entry.ts", 0, "./helper.js", "import", "helper.js"}}); r.Error != "" {
				t.Fatal(r.Error)
			}
			response := f.session.Execute(f.request("analyze", "entry.ts"))
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("valid parameter selection rejected: %#v", response)
			}
			for _, export := range response.Analysis.Exports {
				if export.Name == "value" && export.Placement != want {
					t.Fatalf("placement %s want %s", export.Placement, want)
				}
			}
			found := false
			for _, effect := range executableSummary(t, response, "run").EffectSources {
				found = found || effect.Environment == "browser"
			}
			if found != browser {
				t.Fatalf("wrong binding execution effects: %#v", response.Analysis.Callables)
			}
		})
	}
}

// Unproved input operations retain causal incompleteness. Cost counters describe bounded
// query work and source indexing separately, rather than claiming whole-generation linearity.
func TestClosureParameterPatternBounds(t *testing.T) {
	assertClosurePlacement(t, `declare const input:{value:string};function make(){return ({value}:{value:string})=>"safe"}export const value=[make()][0]!(input);`, "unknown")
	assertClosurePlacement(t, `declare const key:string;function make(){return ({[key]:value}:Record<string,string>)=>"safe"}export const value=[make()][0]!({get value(){return document.title}});`, "unknown")
	for _, count := range []int{2, 16, 64} {
		var source strings.Builder
		source.WriteString(`function make(){return ({inner}:{inner:{value:string}})=>inner.value}const xs=[`)
		for i := 0; i < count; i++ {
			source.WriteString(`make(),`)
		}
		source.WriteString("];")
		for i := 0; i < count; i++ {
			fmt.Fprintf(&source, `export const v%d=xs[%d]!({inner:{value:"safe"}});`, i, i)
		}
		session := NewSession()
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/parameter-pattern-fanout.ts", Source: source.String()})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatalf("valid source rejected: %s %#v", response.Error, response.Diagnostics)
		}
		logClosureProvenance(t, session, fmt.Sprintf("parameter-pattern/%d", count))
	}
}

// Replacing a bound name changes later body reads, while entry binding effects and
// earlier acquired aliases retain their own evaluation and object provenance.
func TestClosureParameterBindingReplacement(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"reassign-safe", `function make(){return ({inner}:{inner:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"local-reassign-safe", `function make(){return (input:{inner:{value:string}})=>{let {inner}=input;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"local-reassign-browser", `function make(){return (input:{inner:{value:string}})=>{let {inner}=input;inner={get value(){return document.title}};return inner.value}}export const value=[make()][0]!({inner:{value:"safe"}});`, "client"},
		{"computed-safe", `function make(){return ({["inner"]:inner}:{inner:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"formal-safe-direct", `function read({inner}:{inner:{value:string}}){inner={value:"safe"};return inner.value}export const value=read({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"formal-alias-safe", `function make(){return ({inner:alias}:{inner:{value:string}})=>{alias={value:"safe"};return alias.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"formal-nested-safe", `function make(){return ({outer:{inner}}:{outer:{inner:{value:string}}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({outer:{inner:{get value(){return document.title}}}});`, "isomorphic"},
		{"formal-rest-safe", `function make(){return ({...rest}:{inner:{value:string}})=>{rest={inner:{value:"safe"}};return rest.inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"identifier-reassign-safe", `function make(){return (inner:{value:string})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({get value(){return document.title}});`, "isomorphic"},
		{"local-alias-safe", `function make(){return (input:{inner:{value:string}})=>{let {inner:alias}=input;alias={value:"safe"};return alias.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"local-rest-safe", `function make(){return (input:{inner:{value:string}})=>{let {...rest}=input;rest={inner:{value:"safe"}};return rest.inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "isomorphic"},
		// The source-owned inner Get executes at binding. A proved later replacement
		// makes the deferred browser value getter irrelevant to the current read.
		{"local-identifier-safe", `function make(){return (input:{inner:{value:string}})=>{let inner=input.inner;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"formal-initial-binding-effect", `function make(){return ({inner}:{inner:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({get inner(){document.title;return {value:"safe"}}});`, "client"},
		{"formal-final-browser", `function make(){return ({inner}:{inner:{value:string}})=>{inner={get value(){return document.title}};return inner.value}}export const value=[make()][0]!({inner:{value:"safe"}});`, "client"},
		{"formal-plain-reassign", `function make(){return ({inner}:{inner:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({inner:{value:"old"}});`, "isomorphic"},
		{"formal-safe-after-read", `function make(){return ({inner}:{inner:{value:string}})=>{const observed=inner.value;inner={value:"safe"};return observed}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "client"},
		{"old-alias-browser", `function make(){return ({inner}:{inner:{value:string}})=>{const old=inner;inner={value:"safe"};return old.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "client"},
		{"old-alias-safe", `function make(){return ({inner}:{inner:{value:string}})=>{const old=inner;inner={get value(){return document.title}};return old.value}}export const value=[make()][0]!({inner:{value:"safe"}});`, "isomorphic"},
		{"replacement-alias-safe", `function make(){return ({inner}:{inner:{value:string}})=>{inner={value:"safe"};const old=inner;return old.value}}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"member-mutation-old-alias", `function make(){return ({inner}:{inner:{value:string}})=>{const old=inner;inner={value:"safe"};old.value=document.title;return old.value}}export const value=[make()][0]!({inner:{value:"safe"}});`, "client"},
		{"returned-replacement-object", `function read({inner}:{inner:{value:string}}){inner={value:"safe"};return inner}export const value=read({inner:{get value(){return document.title}}}).value;`, "isomorphic"},
		{"local-nested-safe", `function make(){return (input:{outer:{inner:{value:string}}})=>{let {outer:{inner}}=input;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({outer:{inner:{get value(){return document.title}}}});`, "isomorphic"},
		{"default-safe-replaced", `function make(){return ({inner={get value(){return document.title}}}:{inner?:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({});`, "isomorphic"},
		{"default-binding-browser", `function make(){return ({inner=(document.title,{value:"safe"})}:{inner?:{value:string}})=>{inner={value:"safe"};return inner.value}}export const value=[make()][0]!({});`, "client"},
		{"rest-binding-browser", `function make(){return ({...rest}:{inner:{value:string}})=>{rest={inner:{value:"safe"}};return rest.inner.value}}export const value=[make()][0]!({get inner(){document.title;return {value:"safe"}}});`, "client"},
		{"native-acquired-method", `function make(){return ({inner}:{inner:{value:string;read():string}})=>{const old=inner;inner={value:"safe",read(){return this.value}};return old.read()}}export const value=[make()][0]!({inner:{value:"safe",read(){return this.value}}});`, "isomorphic"},
		{"browser-acquired-method", `function make(){return ({inner}:{inner:{read():string}})=>{const read=inner.read;inner={read(){return "safe"}};return read()}}export const value=[make()][0]!({inner:{read(){return document.title}}});`, "client"},
	} {
		t.Run(test.name, func(t *testing.T) {
			assertClosurePlacement(t, test.source, test.placement)
		})
	}
}

// Defaults execute only for undefined inputs. Supplied values must not acquire effects
// from bypassed defaults, while unused defaults and earlier bound values still execute.
func TestClosureParameterDefaultExecution(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"active-default-rebind", `const Number=(a=0,b=(a=1))=>a;const obj={item:{value:"safe"}};if(Number())obj.item={get value(){return document.title}};export const value=obj.item.value;`, "client"},
		{"active-default-rebind-safe", `const choose=(a=1,b=(a=0))=>a;const obj={item:{value:"safe"}};if(choose())obj.item={get value(){return document.title}};export const value=obj.item.value;`, "isomorphic"},
		{"bypassed-default-rebind", `const choose=(a=0,b=(a=1))=>a;const obj={item:{value:"safe"}};if(choose(0,2))obj.item={get value(){return document.title}};export const value=obj.item.value;`, "isomorphic"},
		{"default-read-before-later-rebind", `const choose=(a=0,b=a,c=(a=1))=>b;const obj={item:{value:"safe"}};if(choose())obj.item={get value(){return document.title}};export const value=obj.item.value;`, "isomorphic"},
		{"finding-direct-default-bypass-False", `function read({inner}:{inner:{value:string}},value=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},"safe");`, "isomorphic"},
		{"finding-direct-default-bypass-True", `function read({inner}:{inner:{value:string}},value=inner.value){inner={value:"safe"};return value}export const value=read({inner:{get value(){return document.title}}},"safe");`, "isomorphic"},
		{"finding-projected-default-bypass-False", `function make(){return ({inner}:{inner:{value:string}},value=inner.value)=>{return value}}export const value=[make()][0]!({inner:{get value(){return document.title}}},"safe");`, "isomorphic"},
		{"finding-projected-default-bypass-True", `function make(){return ({inner}:{inner:{value:string}},value=inner.value)=>{inner={value:"safe"};return value}}export const value=[make()][0]!({inner:{get value(){return document.title}}},"safe");`, "isomorphic"},
		{"finding-default-bypass-identifier-formal", `function read(inner:{value:string},value=inner.value){inner={value:"safe"};return value}export const value=read({get value(){return document.title}},"safe");`, "isomorphic"},
		{"default-direct-missing", `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}});`, "client"},
		{"default-direct-undefined", `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},undefined);`, "client"},
		{"default-direct-null", `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},null);`, "isomorphic"},
		{"default-direct-false", `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},false);`, "isomorphic"},
		{"default-direct-zero", `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},0);`, "isomorphic"},
		{"default-direct-empty", `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},"");`, "isomorphic"},
		{"default-direct-safe", `function read({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},"safe");`, "isomorphic"},
		{"default-projected-missing", `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}});`, "client"},
		{"default-projected-undefined", `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},undefined);`, "client"},
		{"default-projected-null", `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},null);`, "isomorphic"},
		{"default-projected-false", `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},false);`, "isomorphic"},
		{"default-projected-zero", `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},0);`, "isomorphic"},
		{"default-projected-empty", `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},"");`, "isomorphic"},
		{"default-projected-safe", `function make(){return ({inner}:{inner:{value:string}},value:string|null|boolean|number=inner.value)=>value}export const value=[make()][0]!({inner:{get value(){return document.title}}},"safe");`, "isomorphic"},
		{"default-nested-bypass", `function read({inner,value=inner.value}:{inner:{value:string},value?:string}){return value}export const value=read({inner:{get value(){return document.title}},value:"safe"});`, "isomorphic"},
		{"default-nested-taken", `function read({inner,value=inner.value}:{inner:{value:string},value?:string}){return value}export const value=read({inner:{get value(){return document.title}}});`, "client"},
		{"default-unused-pattern-default", `function read({inner}:{inner:{value:string}},value=inner.value){return "safe"}export const value=read({inner:{get value(){return document.title}}});`, "client"},
		{"default-unused-default-bypass", `function read({inner}:{inner:{value:string}},value=inner.value){return "safe"}export const value=read({inner:{get value(){return document.title}}},"safe");`, "isomorphic"},
		{"default-plain-default", `function read({inner}:{inner:{value:string}},value=inner.value){return value}export const value=read({inner:{value:"safe"}});`, "isomorphic"},
		{"default-earlier-chain", `function read({inner}:{inner:{value:string}},second=inner,third=second.value){return third}export const value=read({inner:{get value(){return document.title}}});`, "client"},
		{"default-rest-default-bypass", `function read({inner,...rest}:{inner:{value:string},value:string},value=inner.value){return value+rest.value}export const value=read({inner:{get value(){return document.title}},value:""},"safe");`, "isomorphic"},
		{"default-defined-object-bypass", `function read({inner}:{inner:{value:string}},value:unknown=inner.value){return "safe"}export const value=read({inner:{get value(){return document.title}}},{});`, "isomorphic"},
		{"default-argument-runs", `function read({inner}:{inner:{value:string}},value=inner.value){return "safe"}export const value=read({inner:{value:"safe"}},document.title);`, "client"},
		{"expansion-direct-global-bypass", `function read(value=document.title){return value}export const value=read("safe");`, "isomorphic"},
		{"expansion-projected-global-bypass", `function make(){return (value=document.title)=>value}export const value=[make()][0]!("safe");`, "isomorphic"},
		{"expansion-call-default-bypass", `function browser(){return document.title}function read({inner}:{inner:{value:string}},value=browser()){return value}export const value=read({inner:{value:"safe"}},"safe");`, "isomorphic"},
		{"expansion-call-default-taken", `function browser(){return document.title}function read({inner}:{inner:{value:string}},value=browser()){return value}export const value=read({inner:{value:"safe"}});`, "client"},
		{"expansion-conditional-known-safe", `function read({inner}:{inner:{value:string}},value=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},true?"safe":undefined);`, "isomorphic"},
		{"expansion-conditional-known-undefined", `function read({inner}:{inner:{value:string}},value=inner.value){return value}export const value=read({inner:{get value(){return document.title}}},false?"safe":undefined);`, "client"},
		{"expansion-nested-deep-bypass", `function read({inner,outer:{value=inner.value}}:{inner:{value:string},outer:{value?:string}}){return value}export const value=read({inner:{get value(){return document.title}},outer:{value:"safe"}});`, "isomorphic"},
		{"expansion-nested-deep-taken", `function read({inner,outer:{value=inner.value}}:{inner:{value:string},outer:{value?:string}}){return value}export const value=read({inner:{get value(){return document.title}},outer:{}});`, "client"},
		{"expansion-local-default-bypass", `function read({inner}:{inner:{value:string}}){const {value=inner.value}={value:"safe"};return value}export const value=read({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"expansion-local-default-taken", `function read({inner}:{inner:{value:string}}){const {value=inner.value}: {value?:string}={};return value}export const value=read({inner:{get value(){return document.title}}});`, "client"},
		{"expansion-getter-before-rebind", `function read({inner}:{inner:{value:string}},value=inner.value){inner={value:"safe"};return "safe"}export const value=read({inner:{get value(){return document.title}}});`, "client"},
		{"expansion-alias-default", `function read({inner}:{inner:{value:string}},second=inner,third=second.value){inner={value:"safe"};return third}export const value=read({inner:{get value(){return document.title}}});`, "client"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacementAt(t, test.source, test.placement, "parameter-default.ts") })
	}
}

// A possibly undefined actual retains the known default getter. Control/value
// uncertainty supplies neither a new opaque effect nor normal execution authority.
func TestClosureParameterDefaultUncertainty(t *testing.T) {
	source := `function read({inner}:{inner:{value:string}},value=inner.value){return value}/** @exact pure */ export function run(flag:boolean){return [read][0]!({inner:{get value(){return document.title}}},flag?undefined:"safe")}`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "parameter-default-uncertainty.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("%s %#v", response.Error, response.Diagnostics)
	}
	summary := executableSummary(t, response, "run")
	browser := false
	for _, effect := range summary.EffectSources {
		browser = browser || effect.Environment == "browser"
	}
	if !browser || summary.ReevaluationSafe || environmentEffectFor(summary.EffectSources) == "neutral" {
		t.Fatalf("lost default alternatives: %#v", summary)
	}
	compiled := NewSession().Execute(Request{Kind: "compile", ID: "parameter-default-uncertainty.ts", Source: source, Diagnostics: "semantic", Target: TargetClient})
	if compiled.Error != "" || hasErrorDiagnostic(compiled.Diagnostics) || compiled.Code == "" {
		t.Fatal(compiled.Error, compiled.Diagnostics)
	}
	sourceNodeScript(t, compiled.Code, `const fs=require('node:fs'),vm=require('node:vm');let gets=0;const sandbox={exports:{},document:{get title(){gets++;return 'browser'}}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);if(sandbox.exports.run(false)!=='safe'||gets!==0||sandbox.exports.run(true)!=='browser'||gets!==1)throw Error('default selection/get count');const sentinel=Error('stop');Object.defineProperty(sandbox.document,'title',{get(){gets++;throw sentinel}});try{sandbox.exports.run(true);throw Error('missing Throw')}catch(error){if(error!==sentinel||gets!==2)throw error}`)
}

// A returned closure reads the live binding through invocation, while an earlier
// alias keeps its acquired object and binding-time effects still execute.
func TestClosureReturnedBindingReplacement(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"direct-closure-False-before", `function read({inner}:{inner:{value:string}}){const get=()=>inner.value;inner={value:"safe"};return get}export const value=read({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"direct-closure-False-after", `function read({inner}:{inner:{value:string}}){inner={value:"safe"};const get=()=>inner.value;return get}export const value=read({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"returned-pattern-literal-arrow", `function read({inner}:{inner:{value:string}}){inner={value:"safe"};return ()=>inner.value}export const value=read({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"True-object-after", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={value:"safe"};return {read};}export const value=make({inner:{get value(){return document.title}}}).read();`, "isomorphic"},
		{"True-array-after", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={value:"safe"};return [read] as const;}export const value=make({inner:{get value(){return document.title}}})[0]();`, "isomorphic"},
		{"True-alias-after", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={value:"safe"};const alias=read;return alias;}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"False-direct-after", `function make(inner:{value:string}){const read=()=>inner.value;inner={value:"safe"};return read;}export const value=make({get value(){return document.title}})();`, "isomorphic"},
		{"True-old-alias-True", `function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;inner={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`, "client"},
		{"True-old-alias-False", `function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;inner={get value(){return document.title}};return read}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"True-invoke-before-True", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;const observed=read();inner={value:"safe"};return observed;}export const value=make({inner:{get value(){return document.title}}});`, "client"},
		{"True-invoke-before-False", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={value:"safe"};const observed=read();return observed;}export const value=make({inner:{get value(){return document.title}}});`, "isomorphic"},
		{"False-invoke-before-False", `function make(inner:{value:string}){const read=()=>inner.value;inner={value:"safe"};const observed=read();return observed;}export const value=make({get value(){return document.title}});`, "isomorphic"},
		{"local-identifier", `function make(input:{inner:{value:string}}){let alias=input.inner;const read=()=>alias.value;alias={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"local-binding-element", `function make(input:{inner:{value:string}}){let {inner:alias}=input;const read=()=>alias.value;alias={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"binding-getter", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={value:"safe"};return read}export const value=make({get inner(){document.title;return {value:"old"}}})();`, "client"},
		{"default-effect", `function make({inner=(document.title,{value:"old"})}:{inner?:{value:string}}){const read=()=>inner.value;inner={value:"safe"};return read}export const value=make({})();`, "client"},
		{"prefix-replacement", `function make({inner}:{inner:{nested:{value:string}}}){const old=inner.nested;const read=()=>old.value;inner.nested={value:"safe"};return read}export const value=make({inner:{nested:{get value(){return document.title}}}})();`, "client"},
		{"own-object-mutation", `function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;old.value=document.title;return read}export const value=make({inner:{value:"old"}})();`, "client"},
		{"True-final-browser", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={get value(){return document.title}};return read}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"conditional-true", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;if(true)inner={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"conditional-false", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;if(false)inner={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`, "client"},
		{"two-writes", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;inner={get value(){return document.title}};inner={value:"safe"};return read}export const value=make({inner:{value:"old"}})();`, "isomorphic"},
		{"own-call-default", `function make({inner}:{inner:{value:string}}){const read=(value=inner.value)=>value;inner={value:"safe"};return read}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}

// Return selection does not snapshot a capture. Its later invocation observes
// completion, while earlier calls and acquired old objects keep their own boundary.
func TestClosureReturnedCaptureCompletion(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"comma-literal", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (inner={get value(){return document.title}},()=>inner.value)}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"finally-literal", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return ()=>inner.value}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"comma-named", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (inner={get value(){return document.title}},read)}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"finally-named", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"comma-object", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (inner={get value(){return document.title}},{read})}export const value=make({inner:{value:"safe"}}).read();`, "client"},
		{"finally-object", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return {read}}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}}).read();`, "client"},
		{"comma-array", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (inner={get value(){return document.title}},[read] as const)}export const value=make({inner:{value:"safe"}})[0]();`, "client"},
		{"finally-array", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return [read] as const}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})[0]();`, "client"},
		{"comma-local-identifier", `function make({inner}:{inner:{value:string}}){let alias=inner;const read=()=>alias.value;return(alias={get value(){return document.title}},read)}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"comma-identifier-formal", `function make(inner:{value:string}){const read=()=>inner.value;return(inner={get value(){return document.title}},read)}export const value=make({value:"safe"})();`, "client"},
		{"finally-local-identifier", `function make({inner}:{inner:{value:string}}){let alias=inner;const read=()=>alias.value;try{return read}finally{alias={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"finally-identifier-formal", `function make(inner:{value:string}){const read=()=>inner.value;try{return read}finally{inner={get value(){return document.title}}}}export const value=make({value:"safe"})();`, "client"},
		{"comma-statement-browser-control", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;(inner={get value(){return document.title}},read);return read}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"finally-prior-invocation-control", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read()}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}});`, "isomorphic"},
		{"finally-return-after-control", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{void 0}finally{inner={get value(){return document.title}}}return read}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"comma-helper-browser", `function identity<T>(x:T){return x}function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return identity((inner={get value(){return document.title}},read))}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"finally-old-alias", `function make({inner}:{inner:{value:string}}){const old=inner;try{return ()=>old.value}finally{inner={get value(){return document.title}}}}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"finally-override", `function make({inner}:{inner:{value:string}}){try{return ()=>inner.value}finally{return ()=>"safe"}}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"comma-old-alias", `function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;return (inner={get value(){return document.title}},read)}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"finally-inert", `function make({inner}:{inner:{value:string}}){inner={value:"safe"};try{return ()=>inner.value}finally{void 0}}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"comma-safe", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return(inner={value:"safe"},read)}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"comma-after-literal-safe", `function make({inner}:{inner:{value:string}}){let read=()=>inner.value;return(read=()=>inner.value,inner={value:"safe"},read)}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"finally-safe", `function make({inner}:{inner:{value:string}}){try{return ()=>inner.value}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"finally-safe-object", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return {read}}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}}).read();`, "isomorphic"},
		{"finally-before-invoke", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read()}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}});`, "client"},
		{"finally-alias-safe", `function make({inner}:{inner:{value:string}}){const old=inner;try{return ()=>old.value}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}})();`, "client"},
		{"nested-finally-safe", `function make({inner}:{inner:{value:string}}){try{try{return ()=>inner.value}finally{inner={get value(){return document.title}}}}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"nested-return-safe", `function make({inner}:{inner:{value:string}}){try{return ()=>()=>inner.value}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}})()();`, "isomorphic"},
		{"finally-member-browser", `function make({inner}:{inner:{value:string}}){const old=inner;try{return ()=>old.value}finally{old.value=document.title}}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"direct-independent-instances", `function make({inner}:{inner:{value:string}}){try{return ()=>inner.value}finally{inner={value:"safe"}}}export const value=make({inner:{get value(){return document.title}}})();export const safeValue=make({inner:{value:"other"}})();`, "isomorphic"},
		{"finally-overrides-old-alias", `function make({inner}:{inner:{value:string}}){const old=inner;try{return ()=>inner.value}finally{inner={get value(){return document.title}};return ()=>old.value}}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}

// Bypassed expression writes cannot change a live capture at completion.
// Taken counterparts and old aliases retain native selection and ownership.
func TestClosureCaptureCompletionReachability(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"false-and", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (false&&(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"true-or", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (true||(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"nonnull-nullish", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;const test:string|null="kept";return (test??(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"true-ternary", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (true?0:(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"false-ternary", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (false?(inner={get value(){return document.title}}):0,read)}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"true-and", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (true&&(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"false-or", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (false||(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"null-nullish", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;const test:string|null=null;return (test??(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"false-and-portable", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (false&&(inner={value:"safe"}),read)}export const value=make({inner:{get value(){return document.title}}})();`, "client"},
		{"conditional-taken-browser", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return (true?(inner={get value(){return document.title}}):0,read)}export const value=make({inner:{value:"safe"}})();`, "client"},
		{"unreachable-browser-then-safe", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return ((false&&(inner={get value(){return document.title}}),inner={value:"safe"}),read)}export const value=make({inner:{get value(){return document.title}}})();`, "isomorphic"},
		{"logical-safe-before-finally", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return (false&&(inner={get value(){return document.title}}),read)}finally{void 0}}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"false-and-finally", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read}finally{false&&(inner={get value(){return document.title}})}}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"true-or-finally", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read}finally{true||(inner={get value(){return document.title}})}}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"true-conditional-finally", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;try{return read}finally{true?0:(inner={get value(){return document.title}})}}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"false-and-statement", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;false&&(inner={get value(){return document.title}});return read}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"old-object-ignored-unreachable-rebind", `function make({inner}:{inner:{value:string}}){const old=inner;const read=()=>old.value;return(false&&(inner={get value(){return document.title}}),read)}export const value=make({inner:{value:"safe"}})();`, "isomorphic"},
		{"later-definite-browser-kept", `function make({inner}:{inner:{value:string}}){const read=()=>inner.value;return(false&&(inner={value:"safe"}),inner={get value(){return document.title}},read)}export const value=make({inner:{value:"safe"}})();`, "client"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.placement) })
	}
}

// Repeated direct and aliased arguments retain captured writes under the same query
// bound. Reassigned inputs keep their own acquisition rather than cached cells.
func TestClosureLocalConstInterferenceMemo(t *testing.T) {
	for _, test := range []struct {
		name, declaration, argument, after string
		write                              bool
	}{
		{"direct", "", "s", "", true},
		{"const-alias", "const alias=s;", "alias", "", true},
		{"reassigned-let", "let alias=s;", "alias", "alias={b:0};", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			call := "make(" + test.argument + ")"
			source := `function make(input:{b:number}){return {get value(){input.b=2;return document.title}}}export function run(s:{b:number}){` + test.declaration + `const xs=[` + call + strings.Repeat(","+call, 899) + `];` + test.after + `return xs[Number("0")]!.value}`
			id := "/virtual/local-const-memo-" + test.name + ".ts"
			session := NewSession()
			r := session.Execute(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatalf("invalid control: %#v", r)
			}
			run := executableSummary(t, r, "run")
			if run.Effect != "unknown" {
				t.Fatalf("unknown computed index acquired certainty: %#v", run)
			}
			if test.write {
				found := false
				for _, write := range run.StateWrites {
					found = found || write.Path == "b" && write.Confidence == "unknown"
				}
				if !found {
					t.Fatalf("lost known captured b path: %#v", run)
				}
			}

		})
	}
}
