package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Each nested binding Get retains its own authored operation while the existing
// binder supplies its intermediate value, default phase and current-write cut.
func TestNestedLocalBindingEffects(t *testing.T) {
	for _, row := range []struct{ name, source, placement string }{
		{"renamed", `function make(){return (input:{outer:{inner:{value:string}}})=>{let {outer:{["inner"]:item}}=input;item={value:"safe"};return item.value}}export const value=[make()][0]!({outer:{inner:{get value(){return document.title}}}});`, "isomorphic"},
		{"computed key effect", `function make(){return (input:{outer:{inner:{value:string}}})=>{let {outer:{[(document.title,"inner")]:inner}}=input;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({outer:{inner:{value:"old"}}});`, "client"},
		{"binding getters", `function make(){return (input:{outer:{inner:{value:string}}})=>{let {outer:{inner}}=input;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({get outer(){document.title;return {get inner(){document.title;return {value:"old"}}}}});`, "client"},
		{"captured", `function make(input:{outer:{inner:{value:string}}}){const {outer:{inner}}=input;return ()=>inner.value}export const value=make({outer:{inner:{get value(){return document.title}}}})();`, "client"},
		{"retained mutation", `function make(input:{outer:{inner:{value:string}}}){const {outer:{inner}}=input;inner.value=document.title;return ()=>inner.value}export const value=make({outer:{inner:{value:"old"}}})();`, "client"},
		{"selected default", `function make(){return (input:{outer?:{inner:{value:string}}})=>{let {outer:{inner}={inner:{value:"fallback"}}}=input;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({outer:undefined});`, "isomorphic"},
		{"default effect", `function make(){return (input:{outer?:{inner:{value:string}}})=>{let {outer:{inner}=(document.title,{inner:{value:"fallback"}})}=input;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({outer:undefined});`, "client"},
	} {
		t.Run(row.name, func(t *testing.T) { assertClosurePlacement(t, row.source, row.placement) })
	}
}

// A known outer Getter cannot certify the nested Get on its foreign result.
func TestNestedLocalBindingForeignGet(t *testing.T) {
	const source = `declare function foreign():{inner:{value:string}};function make(){return (input:{outer:{inner:{value:string}}})=>{let {outer:{inner}}=input;inner={value:"safe"};return inner.value}}export const value=[make()][0]!({get outer(){document.title;return foreign()}});`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/nested-binding-foreign.ts", Source: source, Diagnostics: "semantic"})
	browser, unknown := reentrantInitializerEffects(t, response, source, true)
	if !browser || !unknown {
		t.Fatal("nested Get lost original or foreign effect", browser, unknown)
	}
}

// The Get's source identity does not authorize a normal descriptor, and an
// object pattern nested beneath an array still needs its iterator relationship.
func TestNestedLocalBindingDemandModes(t *testing.T) {
	for _, row := range []struct {
		name, source string
		relative     bool
	}{
		{"object", `export function read(input:{outer:{inner:{value:string}}}){const {outer:{inner}}=input;return inner.value}`, true},
		{"array prefix", `export function read(input:[{inner:{value:string}}]){const [{inner}]=input;return inner.value}`, false},
		{"unknown computed key", `export function read(input:{outer:Record<string,{value:string}>},key:string){const {outer:{[key]:inner}}=input;return inner.value}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/nested-binding-domain.ts", Source: row.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			found := false
			for _, project := range session.projects {
				file := project.program.GetSourceFile("/virtual/nested-binding-domain.ts")
				if file == nil {
					continue
				}
				walkNode(file.AsNode(), func(operation *ast.Node) bool {
					if !ast.IsBindingElement(operation) || !ast.IsIdentifier(operation.Name()) || operation.Name().Text() != "inner" {
						return true
					}
					found = true
					query := newSourceDependencyQuery(operation, project.callableCache.owner.values.checker, project.callableCache.owner, enclosingCallableNode(operation))
					demand := query.operationFieldDemand(operation, "inner")
					if (demand.declaration != nil) != row.relative {
						t.Fatal("nested Get changed source domain")
					}
					if row.relative && (demand.operation != operation || demand.slot == nil || !ast.IsParameterDeclaration(demand.slot)) {
						t.Fatal("nested Get lost operation or root input slot")
					}
					query.dependenciesOnly = false
					if normal := query.operationFieldDemand(operation, "inner"); normal.declaration != nil {
						t.Fatal("nested source Get granted normal descriptor admission")
					}
					return false
				})
			}
			if !found {
				t.Fatal("missing nested binding operation")
			}
		})
	}
}

// Nested Getter and default execution remains ordered and once-only. Repeated
// captured reads use the acquired inner object after its source is replaced.
func TestNestedLocalBindingEmitted(t *testing.T) {
	const source = `export function run(useDefault:boolean){const trace:string[]=[];let current={get value(){trace.push("value");return "old"}};const outer={get inner(){trace.push("inner");return current}};function fallback(){trace.push("default");return outer}function make(input:{outer?:{inner:{value:string}}}){const {outer:{[(trace.push("key"),"inner")]:inner}=fallback()}=input;current={value:"new"};return ()=>inner.value}const read=make({get outer(){trace.push("outer");return useDefault?undefined:outer}});trace.push("created");trace.push(read());trace.push(read());return trace}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/nested-binding-order.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			sourceNodeScript(t, response.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.deepEqual(Array.from(out.run(false)),['outer','key','inner','created','value','old','value','old']);assert.deepEqual(Array.from(out.run(true)),['outer','default','key','inner','created','value','old','value','old']);`)
		})
	}
}

// The existing normal captured-slot request remains named, but source-owned
// syntax without an original normal receipt cannot fulfill that request.
func TestNestedLocalBindingNormalCapturedGuard(t *testing.T) {
	const source = `export function outer(input:{inner:{value:string}}){const holder=input;return ()=>{const {inner}=holder;return inner.value}}export const sample={inner:{value:"safe"}};`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/nested-binding-normal-guard.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/nested-binding-normal-guard.ts")
		if file == nil {
			continue
		}
		var operation, literal *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsBindingElement(node) {
				operation = node
			}
			if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) && node.Name().Text() == "sample" {
				literal = node.Initializer()
			}
			return true
		})
		if operation == nil || literal == nil {
			t.Fatal("missing captured normal Get witness")
		}
		found = true
		query := newSourceDependencyQuery(operation, project.callableCache.owner.values.checker, project.callableCache.owner, enclosingCallableNode(operation))
		query.dependenciesOnly = false
		part := accessorCandidates{}
		query.bindingPropertyOperation([]sourceValue{{node: literal}}, "inner", nil, &part, accessorAcquire, operation)
		if len(part.fieldOutcomes) != 1 || part.fieldOutcomes[0].demand.operation != operation || part.fieldOutcomes[0].demand.slot == nil || part.fieldOutcomes[0].demand.slot.Name().Text() != "holder" {
			t.Fatal("normal captured-slot request lost original identity")
		}
		if part.fieldOutcomes[0].fulfilled || len(part.normalCalls) != 0 || len(part.nativeCalls) != 0 {
			t.Fatal("source-owned syntax borrowed normal Get authority")
		}
	}
	if !found {
		t.Fatal("missing normal captured-slot source")
	}
}
