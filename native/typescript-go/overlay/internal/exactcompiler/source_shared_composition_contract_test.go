package exactcompiler

import (
	"fmt"
	"strings"
	"testing"
)

// These source witnesses exercise the summary contract independently of concrete
// Call receipts. Each destination must carry the captured object's current member
// dependency. The unchanged projected-call anchor remains owned by its original test.
func TestSharedCompositionDestinations(t *testing.T) {
	for _, test := range []struct{ name, storage, read string }{
		{"object", `const box={read:make(input)};`, `box.read()`},
		{"argument", `function invoke(read:()=>string){return read()}const read=make(input);`, `invoke(read)`},
		{"return", `function wrap(){return {read:make(input)}}const box=wrap();`, `box.read()`},
		{"conditional", `declare const choose:boolean;const read=choose?make(input):()=>"safe";`, `read()`},
	} {
		t.Run(test.name, func(t *testing.T) {
			assertSharedCompositionPlacement(t, `function make(input:{value:string}){return ()=>input.value}const input={value:"safe"};`+test.storage+`input.value=document.title;export const value=`+test.read+`;`, "client")
		})
	}
}

// Binding reassignment and object acquisition are different operations. A shared
// parameter declaration must not merge independent factory uses into one capture.
func TestSharedCompositionCaptureObservations(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"live binding", `let input={value:"safe"};const box=[()=>input.value];input={value:document.title};export const value=box[0]!();`, "client"},
		{"acquired argument", `function make(input:{value:string}){return ()=>input.value}let input={value:"safe"};const box=[make(input)];input={value:document.title};export const value=box[0]!();`, "isomorphic"},
		{"distinct captures", `function make(input:{value:string}){return ()=>input.value}const a={value:"safe"},b={value:"safe"};const reads=[make(a),make(b)];b.value=document.title;export const safeValue=reads[0]!();export const value=reads[1]!();`, "client"},
		{"prior read", `function make(input:{value:string}){return ()=>input.value}const input={value:"safe"};const reads=[make(input)];export const value=reads[0]!();input.value=document.title;`, "isomorphic"},
		{"unrelated field", `function make(input:{value:string}){return ()=>input.value}const input={value:"safe",other:"safe"};const reads=[make(input)];input.other=document.title;export const value=reads[0]!();`, "isomorphic"},
		{"finally capture replacement", `function make(input:{value:string}){try{return ()=>input.value}finally{input={value:document.title}}}export const value=make({value:"safe"})();`, "client"},
		{"deferred getter", `const input={get value(){return document.title}};const reads=[()=>input.value];export const value="safe";`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) { assertSharedCompositionPlacement(t, test.source, test.placement) })
	}
}

// Printability does not authorize eager opaque work without target ownership.
func TestSharedCompositionOpaqueArtifactBoundary(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			request := Request{Kind: "compile", ID: "/virtual/shared-opaque.ts", Target: target,
				Source: `declare function foreign():string;function invoke(read:()=>string){return read()}export const value=invoke(foreign);`}
			response := NewSession().Execute(request)
			if response.Error != "" || !containsDiagnosticCode(response.Diagnostics, "EXACT2101") {
				t.Fatalf("opaque eager Call lost placement denial: %s %#v", response.Error, response.Diagnostics)
			}
		})
	}
}

// Require an actual exported observation before reusing the existing two-target
// placement assertion. An absent analysis record cannot count as a passing witness.
func assertSharedCompositionPlacement(t *testing.T, source, placement string) {
	t.Helper()
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/shared-composition.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("analysis failed: %s %#v", response.Error, response.Diagnostics)
	}
	found := false
	for _, exported := range response.Analysis.Exports {
		if exported.Name == "value" {
			found = true
		}
	}
	if !found {
		t.Fatal("missing value export observation")
	}
	assertClosurePlacement(t, source, placement)
}

// Unknown interference cannot strongly erase a browser-derived alternative. Read
// the current export initializer fact, not the aggregate module or writer body.
func TestSharedCompositionUnknownOverlap(t *testing.T) {
	source := `declare function mutate(input:{value:string}):void;function make(input:{value:string}){return ()=>input.value}const input={value:"safe"};const reads=[make(input)];input.value=document.title;mutate(input);export const value=reads[0]!();`
	current := sharedCompositionCurrentFact(t, source, "export const value=")
	browser, unknown := false, false
	for _, effect := range current.EffectSources {
		browser = browser || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !browser || !unknown {
		t.Fatalf("current read lost known donor or overlap uncertainty: %#v", current.EffectSources)
	}
}

// Returning a container does not perform its getter or Proxy trap body. Proxy
// construction retains its existing uncertainty and does not gain DATA authority.
func TestSharedCompositionReturnedDeferredBodies(t *testing.T) {
	for _, test := range []struct{ name, body string }{
		{"getter", `return {get value(){return document.title}}`},
		{"proxy", `return new Proxy({value:"safe"},{get(){return document.title}})`},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `function make(){` + test.body + `}const box=[make()];export const value="safe";`
			current := sharedCompositionCurrentFact(t, source, "const box=")
			for _, effect := range current.EffectSources {
				if effect.Environment == "browser" {
					t.Fatalf("creation performed deferred body: %#v", current)
				}
			}
			if test.name == "getter" {
				assertSharedCompositionPlacement(t, source, "isomorphic")
			} else if current.Effect != "unknown" {
				t.Fatalf("Proxy construction lost its residual uncertainty: %#v", current)
			}
		})
	}
}

// Select one authored initializer by source position so a donor elsewhere in the
// module cannot satisfy a current-read assertion. Warnings remain advisory.
func sharedCompositionCurrentFact(t *testing.T, source, statement string) CallableSummary {
	t.Helper()
	offset := strings.LastIndex(source, statement)
	if offset < 0 {
		t.Fatal("missing authored observation", statement)
	}
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/shared-current.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("analysis failed: %s %#v", response.Error, response.Diagnostics)
	}
	name := fmt.Sprint("module@", offset)
	for _, current := range response.Analysis.Callables {
		if current.Name == name {
			return current
		}
	}
	t.Fatal("missing current initializer fact", name)
	return CallableSummary{}
}

// A selected DATA argument cannot prove a general exported member read pure.
// The annotation also admits getters and proxies supplied by future callers.
func TestSharedCompositionExportedInputBoundary(t *testing.T) {
	const helper = `export function read(input:{value:string}){return input.value}`
	for _, test := range []struct{ name, use, placement string }{
		{"library", `export const value="stable";`, "isomorphic"},
		{"safe use", `export const value=read({value:"safe"});`, "isomorphic"},
		{"browser use", `export const value=read({get value(){return document.title}});`, "client"},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := helper + test.use
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/exported-input.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			found := false
			for _, fact := range response.Analysis.Callables {
				if fact.Name != "read" {
					continue
				}
				found = true
				unknown := false
				for _, effect := range fact.EffectSources {
					unknown = unknown || effect.Environment == "unknown"
				}
				if !unknown {
					t.Fatalf("selected use erased open exported input uncertainty: %#v", fact)
				}
			}
			if !found {
				t.Fatal("missing exported helper fact")
			}
			assertSharedCompositionPlacement(t, source, test.placement)
		})
	}
}
