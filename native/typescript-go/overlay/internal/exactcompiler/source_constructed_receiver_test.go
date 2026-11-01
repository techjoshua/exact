package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// One New source site can have distinct acquired creator/formal contexts.
// A possible write must not replace another context's captured field donor.
func TestConstructedReceiverCreatorWrites(t *testing.T) {
	for _, c := range []struct {
		name, setup, read string
		browser           bool
	}{
		{"safe-first", `const a=make({value:'safe'});const b=make({get value(){return document.title}});a.field={value:'replacement'};`, "b", true},
		{"browser-first", `const b=make({get value(){return document.title}});const a=make({value:'safe'});a.field={value:'replacement'};`, "b", true},
		{"independent-write", `const a=make({value:'safe'});const b=make({value:'safe'});a.field={get value(){return document.title}};`, "b", false},
		{"reversed-independent-write", `const b=make({value:'safe'});const a=make({value:'safe'});a.field={get value(){return document.title}};`, "b", false},
		{"same-context-write", `const a=make({value:'safe'});a.field={get value(){return document.title}};`, "a", true},
		{"nested-same-site-donor", `const a=wrap({value:'safe'});const b=wrap({get value(){return document.title}});a.field={value:'replacement'};`, "b", true},
		{"nested-same-site-independent", `const a=wrap({value:'safe'});const b=wrap({value:'safe'});a.field={get value(){return document.title}};`, "b", false},
		{"nested-same-site-reversed", `const b=wrap({value:'safe'});const a=wrap({value:'safe'});a.field={get value(){return document.title}};`, "b", false},
		{"captured-formal-donor", `const a=capture({value:'safe'})();const b=capture({get value(){return document.title}})();a.field={value:'replacement'};`, "b", true},
		{"captured-formal-independent", `const a=capture({value:'safe'})();const b=capture({value:'safe'})();a.field={get value(){return document.title}};`, "b", false},
		{"acquired-object", `let input={get value(){return document.title}};const a=make(input);input={value:'safe'};`, "a", true},
		{"acquired-safe", `let input={value:'safe'};const a=make(input);input={get value(){return document.title}};`, "a", false},
		{"live-current-write", `const input={value:'safe'};const a=make(input);input.value=document.title;`, "a", true},
		{"safe-current-write", `const input={value:'safe'};const a=make(input);input.value='replacement';`, "a", false},
		{"unrelated-field", `const a=make({value:'safe'});a.other={get value(){return document.title}};`, "a", false},
	} {
		t.Run(c.name, func(t *testing.T) {
			assertConstructedReceiverRead(t, c.setup, c.read, c.browser)
		})
	}
}

func TestConstructedReceiverUnknownConservesDonor(t *testing.T) {
	assertSymbolicInitializerDonors(t, `declare function mutate(value:unknown):void;function make(input:{value:string}){class Box{field=input}return new Box()}const box=make({get value(){return document.title}});mutate(box);export const value=box.field.value;`)
	assertSymbolicInitializerDonors(t, `class Box{get field():{value:string}{document.title;return this.field}}export const value=(new Box()).field.value;`)
}

func TestConstructedReceiverSourceReplacement(t *testing.T) {
	session := NewSession()
	for _, browser := range []bool{true, false, true} {
		body := `return 'safe'`
		if browser {
			body = `return document.title`
		}
		source := `export{};function make(){class Box{field={get value(){` + body + `}}}return new Box()}const box=make();export const value=box.field.value;`
		r := session.Execute(Request{Kind: "analyze", ID: "/virtual/receiver-replacement.ts", Source: source, Diagnostics: "semantic"})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
			t.Fatal(r.Error, r.Diagnostics)
		}
		found := false
		for _, fact := range r.Analysis.Callables {
			if fact.Name != fmt.Sprint("module@", strings.LastIndex(source, "export const value")) {
				continue
			}
			found = true
			got := false
			for _, effect := range fact.EffectSources {
				got = got || effect.Environment == "browser"
			}
			if got != browser {
				t.Fatal("stale receiver/source context", fact.EffectSources)
			}
		}
		if !found {
			t.Fatal("current source caller absent")
		}
	}
}

func TestConstructedReceiverSourceAuthority(t *testing.T) {
	const source = `export{};class Box{field={value:'safe'}}const box=new Box();box.field={value:'current'};export const value=box.field.value;`
	session, _, caller := currentProxyCaller(t, source, "export const value")
	checked := false
	for _, project := range session.projects {
		owner := project.callableCache.owner
		var member, consumer *ast.Node
		walkNode(project.program.GetSourceFile("/virtual/possible-proxy.ts").AsNode(), func(node *ast.Node) bool {
			if ast.IsPropertyAccessExpression(node) && node.Pos() >= strings.LastIndex(source, "box.field.value") && node.Name().Text() == "value" {
				member = node
			}
			return true
		})
		for _, fact := range project.callableCache.merged.facts {
			if fact.summary.Name == caller.Name {
				consumer = fact.node
			}
		}
		if member == nil || consumer == nil {
			t.Fatal("original source consumer absent")
		}
		part := sourceMemberDependencies(member, owner.checker, owner, consumer, nil)
		if len(part.normalCalls) != 0 || len(part.nativeCalls) != 0 || len(part.ownedGets) != 0 {
			t.Fatal("source receiver relationship issued normal authority")
		}
		for _, value := range part.values {
			if value.instance != nil || value.normal != nil || value.ownedGetRow != nil {
				t.Fatal("source receiver relationship acquired instance/DATA authority")
			}
		}
		checked = true
	}
	if !checked {
		t.Fatal("source query absent")
	}
}

// Formal writer inputs preserve the original Call relation before receiver
// matching. Independent creator contexts cannot borrow that write.
func TestConstructedReceiverFormalWriter(t *testing.T) {
	for _, c := range []struct {
		name, setup, read string
		browser           bool
	}{
		{"independent", `const a=make({value:'safe'});const b=make({value:'safe'});write(a);`, "b", false},
		{"reversed", `const b=make({value:'safe'});const a=make({value:'safe'});write(a);`, "b", false},
		{"same-context", `const a=make({value:'safe'});write(a);`, "a", true},
	} {
		t.Run(c.name, func(t *testing.T) { assertConstructedReceiverRead(t, c.setup, c.read, c.browser) })
	}
}

func assertConstructedReceiverRead(t *testing.T, setup, read string, browser bool) {
	t.Helper()
	source := `export{};function make(input:{value:string}){class Box{field=input;other={value:'safe'}}return new Box()}function wrap(input:{value:string}){return make(input)}function capture(input:{value:string}){return()=>make(input)}function write(box:{field:{value:string}}){box.field={get value(){return document.title}}}` + setup + `export const value=` + read + `.field.value;`
	_, _, summary := currentProxyCaller(t, source, "export const value")
	got := false
	for _, effect := range summary.EffectSources {
		got = got || effect.Environment == "browser"
	}
	if got != browser {
		t.Fatal("creator/field write relation lost", summary.EffectSources)
	}
}
