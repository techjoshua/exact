package exactcompiler

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// The same capture/member operation must retain its use context across destinations.
func TestSymbolicCaptureDependencies(t *testing.T) {
	factory := `function make(input:{value:string}){return ()=>input.value}`
	for _, test := range []struct{ name, source, want string }{
		{"safe", `const input={value:'safe'};const xs=[make(input)];input.value='next';export const value=xs[0]!();`, "isomorphic"},
		{"later", `const input={value:'safe'};const xs=[make(input)];export const value=xs[0]!();input.value=document.title;`, "isomorphic"},
		{"unrelated", `const input={value:'safe',other:'safe'};const xs=[make(input)];input.other=document.title;export const value=xs[0]!();`, "isomorphic"},
		{"object", `const input={value:'safe'};const box={read:make(input)};input.value=document.title;export const value=box.read();`, "client"},
		{"argument", `function invoke(read:()=>string){return read()}const input={value:'safe'};const read=make(input);input.value=document.title;export const value=invoke(read);`, "client"},
		{"distinct", `const a={value:'safe'},b={value:'safe'};const xs=[make(a),make(b)];b.value=document.title;export const safeValue=xs[0]!();export const value=xs[1]!();`, "client"},
		{"acquired object", `let input={value:'safe'};const original=input;const read=make(input);input={value:'next'};original.value=document.title;export const value=read();`, "client"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, factory+test.source, test.want) })
	}
}

// A declaration summary cannot cache the previous request's current-write donor.
func TestSymbolicDependenciesSourceReplacement(t *testing.T) {
	session := NewSession()
	for _, rhs := range []string{"document.title", "'safe'", "document.title"} {
		source := `function make(input:{value:string}){return ()=>input.value}const input={value:'safe'};const xs=[make(input)];input.value=` + rhs + `;export const value=xs[0]!();`
		response := session.Execute(Request{Kind: "analyze", ID: "/virtual/symbolic-replacement.ts", Source: source, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal(response.Error, response.Diagnostics)
		}
		want := "client"
		if rhs == "'safe'" {
			want = "isomorphic"
		}
		found := false
		for _, export := range response.Analysis.Exports {
			if export.Name == "value" {
				found = true
				if export.Placement != want {
					t.Fatalf("%s: got %s want %s", rhs, export.Placement, want)
				}
			}
		}
		if !found {
			t.Fatal("missing exported observation")
		}
	}
}

// Recursive source contexts widen instead of growing simulated activations. The
// known host donor must survive even when no exact return value is available.
func TestSymbolicDependenciesRecursiveJoin(t *testing.T) {
	source := `declare const repeat:boolean;function read():string{if(repeat)return read();return document.title}export const value=read();`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/symbolic-recursion.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	name := fmt.Sprint("module@", strings.LastIndex(source, "export const value="))
	found := false
	for _, callable := range response.Analysis.Callables {
		if callable.Name != name {
			continue
		}
		found = true
		for _, effect := range callable.EffectSources {
			if effect.Environment == "browser" {
				return
			}
		}
		t.Fatal("recursive initializer lost browser donor", callable.EffectSources)
	}
	if !found {
		t.Fatal("missing recursive initializer")
	}
}

// The dependency analysis must preserve ordinary emitted closure semantics and
// paired target pruning without knowing the browser string at compile time.
func TestSymbolicDependenciesEmitted(t *testing.T) {
	const source = `function make(input:{value:string}){return ()=>input.value}const input={value:'safe'};const xs=[make(input)];input.value=document.title;export const value=xs[0]!();export const stable='stable';`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/symbolic-emitted.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			file := filepath.Join(t.TempDir(), "emitted.mts")
			if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';let reads=0;globalThis.document=Object.defineProperty({},'title',{get(){reads++;return 'observed'}});const value=await import(pathToFileURL(process.argv[1]).href);assert.equal(value.stable,'stable');if(process.argv[2]==='client'){assert.equal(value.value,'observed');assert.equal(reads,1)}else{assert.equal('value' in value,false);assert.equal(reads,0)}`
			if out, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file, string(target)).CombinedOutput(); err != nil {
				t.Fatalf("emitted namespace: %v %s", err, out)
			}
		})
	}
}

// Existing binding/default operations must appear in the shared demand stream.
func TestSymbolicBindingAndNestedUseContexts(t *testing.T) {
	for _, test := range []struct{ name, source, want string }{
		{"array default", `function read(input:string[]){const [value=document.title]=input;return value}export const value=read([]);`, "client"},
		{"array default bypass", `function read(input:string[]){const [value=document.title]=input;return value}export const value=read(['safe']);`, "isomorphic"},
		{"earlier formal", `function read(input:{value:string},value=input.value){return value}export const value=read({get value(){return document.title}});`, "client"},
		{"explicit bypass", `function read(input:{value:string},value=input.value){return value}export const value=read({get value(){return document.title}},'safe');`, "isomorphic"},
		{"nested contexts", `function invoke(f:()=>string){return f()}function make(input:{value:string}){return ()=>invoke(()=>input.value)}const a=make({value:'safe'}),b=make({get value(){return document.title}});export const safeValue=a();export const value=b();`, "client"},
	} {
		t.Run(test.name, func(t *testing.T) { assertClosurePlacement(t, test.source, test.want) })
	}
}

// Generator defaults belong to Call. Its body belongs to resume, even when the
// iterator result itself has no exact value model.
func TestSymbolicGeneratorEffectPhases(t *testing.T) {
	for _, test := range []struct{ name, source, marker, want string }{
		{"dormant body", `function* create(){return document.title}const iterator=create();export const value='safe';`, "const iterator=", "neutral"},
		{"default before resume", `function* create(value=document.title){return value}const iterator=create();export const value='safe';`, "const iterator=", "browser"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/generator-effect-phase.ts", Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			name := fmt.Sprint("module@", strings.Index(test.source, test.marker))
			for _, fact := range response.Analysis.Callables {
				if fact.Name == name {
					if fact.Effect != test.want {
						t.Fatalf("%s want %s, got %s: %#v", test.name, test.want, fact.Effect, fact.EffectSources)
					}
					return
				}
			}
			t.Fatal("missing generator creation observation")
		})
	}
}
