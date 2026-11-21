package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Formal pattern names retain caller-relative effects without admitting normal
// Get output. An ordinary local pattern is not an interchangeable input slot.
func TestPatternFormalEffectObligationDomain(t *testing.T) {
	for _, test := range []struct {
		name, source string
		formal       bool
	}{
		{"direct", `export function read({inner}:{inner:{value:string}},value=inner.value){return value}`, true},
		{"nested", `export function read({outer:{inner}}:{outer:{inner:{value:string}}},value=inner.value){return value}`, true},
		{"renamed", `export function read({field:inner}:{field:{value:string}},value=inner.value){return value}`, true},
		{"array", `export function read([inner]:[{value:string}],value=inner.value){return value}`, true},
		{"local", `export function read(input:{inner:{value:string}}){const {inner}=input;return inner.value}`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := Request{Kind: "analyze", ID: "/virtual/pattern-effect-domain.ts", Source: test.source, Diagnostics: "semantic"}
			project, diagnostics, err := newProjectState(request, request.ID)
			if err != nil || len(diagnostics) != 0 {
				t.Fatal(err, diagnostics)
			}
			generation, err := project.advance(context.Background(), request.ID, test.source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			var operation *ast.Node
			walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
				if ast.IsPropertyAccessExpression(n) && n.AsPropertyAccessExpression().Name().Text() == "value" {
					operation = n
				}
				return true
			})
			if operation == nil {
				t.Fatal("missing actual source Get")
			}
			owner := newExecutableBodyOwner(project, generation.checker)
			receiver, key := accessorReceiver(operation)
			query := newSourceDependencyQuery(operation, generation.checker, owner, enclosingCallableNode(operation))
			demand, _ := query.fieldDemand(operation, receiver, key)
			if (demand.declaration != nil) != test.formal {
				t.Fatalf("relative formal obligation=%v want=%v", demand.declaration != nil, test.formal)
			}
			if test.formal && (demand.operation != operation || demand.slot == nil || !ast.IsBindingElement(demand.slot) || demand.key != "value") {
				t.Fatal("obligation lost original operation or formal slot")
			}
			query.dependenciesOnly = false
			if normal, _ := query.fieldDemand(operation, receiver, key); normal.declaration != nil {
				t.Fatal("source-only formal relation granted normal Get admission")
			}
		})
	}
}

func TestPatternFormalDefaultRuntime(t *testing.T) {
	for _, args := range []string{`{inner:input}`, `{inner:input},5`, `{inner:input},undefined`} {
		t.Run(args, func(t *testing.T) {
			source := `export {};const read=({inner}:{inner:{value:number}},x:number=inner.value)=>x;const input={get value(){return window.innerWidth}};read(` + args + `);`
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/pattern-default-runtime.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			want, gets := 42, 1
			if args == `{inner:input},5` {
				want, gets = 5, 0
			}
			conditionalNodeCompletion(t, response.Code, want, gets)
		})
	}
}

// A bypassed default does not bypass object-rest enumeration. Copied data reads
// retain that copy's getter effects without granting a normal descriptor/result.
func TestPatternFormalRestDefaultEffects(t *testing.T) {
	for _, test := range []struct {
		name, source string
		want, gets   int
	}{
		{"excluded-default", `export {};function read({inner,...rest}:{inner:{value:number},tail:number},value=inner.value){return value+rest.tail}const input={inner:{get value(){return window.innerWidth}},tail:0};export const result=read(input,5);result;`, 5, 0},
		{"copied-getter", `export {};function read({inner,...rest}:{inner:{value:number},tail:number},value=inner.value){return value+rest.tail}const input={inner:{value:0},get tail(){return window.innerWidth}};export const result=read(input,5);result;`, 47, 1},
		{"unused-copy-getter", `export {};function read({inner,...rest}:{inner:{value:number},tail:number},value=inner.value){return value}const input={inner:{value:0},get tail(){return window.innerWidth}};export const result=read(input,5);result;`, 5, 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/pattern-rest-runtime.ts", Source: test.source, Target: TargetClient, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			conditionalNodeCompletion(t, response.Code, test.want, test.gets)
		})
	}
}

func TestPatternFormalDefaultUnknownEffect(t *testing.T) {
	source := `declare function foreign():string;function read({inner}:{inner:{value:string}},value=inner.value){return value}/** @exact pure */ export function run(flag:boolean){return [read][0]!({inner:{get value(){document.title;return foreign()}}},flag?undefined:"safe")}`
	root, config := formsSourceFixture(t)
	source += `import {type Component} from '@exactjs/core';export function Page(this:Component<{}>, props:{flag:boolean}){return()=> <button onClick={()=>run(props.flag)}>read</button>}`
	response := formsCompileSource(t, root, config, source, TargetClient)
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	summary := executableSummary(t, response, "run")
	browser, unknown := false, false
	for _, effect := range summary.EffectSources {
		browser = browser || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !browser || !unknown || summary.ReevaluationSafe {
		t.Fatal("independent unknown/default browser donor lost", summary)
	}
}

// A source copy cannot discharge independent writes, escapes or dynamic work.
// Known data writes can have complete effects without supplying a normal value.
func TestPatternFormalRestMutationEffects(t *testing.T) {
	for _, test := range []struct {
		body    string
		unknown bool
	}{
		{`rest.tail=document.title;`, false},
		{`const alias=rest;alias.tail=document.title;`, false},
		{`Object.defineProperty(rest,'tail',{get(){return document.title}});document.title;`, true},
		{`foreign(rest);document.title;`, true},
		{`eval('rest.tail=1');document.title;`, true},
	} {
		t.Run(test.body, func(t *testing.T) {
			source := `declare function foreign(input:object):void;function read({inner,...rest}:{inner:{value:number},tail:string},value=inner.value){` + test.body + `return value+rest.tail}export const value=read({inner:{value:0},tail:''},5);`
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/pattern-rest-mutation.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "read")
			browser, unknown := false, false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if !browser || test.unknown && !unknown || summary.ReevaluationSafe {
				t.Fatal("independent rest mutation effects lost", summary)
			}
			for _, project := range session.projects {
				for _, fact := range project.callableCache.merged.facts {
					for _, call := range fact.fieldCalls {
						for _, outcome := range call.outcomes {
							if outcome.fulfilled && !call.dependencies {
								t.Fatal("rest effects acquired normal DATA coverage")
							}
						}
					}
				}
			}
		})
	}
}

// A present copied own field is a narrower effect domain than a missing key or
// a further Get on an unresolved copied value. Neither gains absence authority.
func TestPatternFormalRestUnresolvedProjection(t *testing.T) {
	for _, source := range []string{
		`function read({inner,...rest}:{inner:{value:number},tail?:string},value=inner.value){document.title;return rest.tail}export const value=read({inner:{value:0}},5);`,
		`declare const other:{value:string};function read({inner,...rest}:{inner:{value:number},tail:{value:string}},value=inner.value){document.title;return rest.tail.value}export const value=read({inner:{value:0},tail:other},5);`,
		`declare function foreign():void;function read({inner,...rest}:{inner:{value:number},tail:string,touch():void},value=inner.value){rest.touch();return value+rest.tail}export const value=read({inner:{value:0},tail:'',touch(){document.title;foreign()}},5);`,
		`declare function foreign():void;function read({inner,...rest}:{inner:{value:number},tail:string},value=inner.value){const selected=()=>{foreign();return rest.tail};document.title;return value+selected()}export const value=read({inner:{value:0},tail:''},5);`,
	} {
		assertSymbolicInitializerDonors(t, source)
	}
}
