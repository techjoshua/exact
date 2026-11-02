package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// A stable direct alias keeps the authored Get's own slot and source use.
// Other locals and normal descriptor admission retain their existing contracts.
func TestPatternAliasEffectDomain(t *testing.T) {
	for _, row := range []struct {
		name, source string
		relative     bool
	}{
		{"direct", `export function read({inner}:{inner:{value:string}}){const old=inner;return old.value}`, true},
		{"renamed", `export function read({item:inner}:{item:{value:string}}){const old=(inner);return old.value}`, true},
		{"written alias", `export function read({inner}:{inner:{value:string}}){let old=inner;old={value:"safe"};return old.value}`, false},
		{"ordinary input", `export function read(inner:{value:string}){const old=inner;return old.value}`, false},
		{"local pattern", `export function read(input:{inner:{value:string}}){const {inner}=input;const old=inner;return old.value}`, false},
		{"property acquisition", `export function read(input:{inner:{value:string}}){const old=input.inner;return old.value}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			session := NewSession()
			response := session.Execute(Request{Kind: "analyze", ID: "/virtual/pattern-alias-domain.ts", Source: row.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Error, response.Diagnostics)
			}
			found := false
			for _, project := range session.projects {
				file := project.program.GetSourceFile("/virtual/pattern-alias-domain.ts")
				if file == nil {
					continue
				}
				walkNode(file.AsNode(), func(operation *ast.Node) bool {
					if !ast.IsPropertyAccessExpression(operation) || operation.Expression().Kind != ast.KindIdentifier || operation.Expression().Text() != "old" {
						return true
					}
					found = true
					receiver, key := accessorReceiver(operation)
					query := newSourceDependencyQuery(operation, project.callableCache.owner.values.checker, project.callableCache.owner, enclosingCallableNode(operation))
					demand, symbol := query.fieldDemand(operation, receiver, key)
					if (demand.declaration != nil) != row.relative {
						t.Fatal("alias obligation changed domain", demand.declaration != nil, row.relative)
					}
					if row.relative && (demand.operation != operation || demand.slot != symbol.ValueDeclaration || !ast.IsVariableDeclaration(demand.slot)) {
						t.Fatal("alias Get lost original operation or saved slot")
					}
					query.dependenciesOnly = false
					if normal, _ := query.fieldDemand(operation, receiver, key); normal.declaration != nil {
						t.Fatal("source alias granted normal descriptor demand")
					}
					return false
				})
			}
			if !found {
				t.Fatal("missing alias Get witness")
			}
		})
	}
}

// The formal's original Getter and the saved value's later Getter run once.
// Replacing the formal cannot retarget the saved object or replay acquisition.
func TestPatternAliasEffectsEmitted(t *testing.T) {
	const source = `export function run(){const trace:string[]=[];function make(){return ({inner}:{inner:{value:string}})=>{const old=inner;inner={get value(){trace.push("new");return "new"}};trace.push("saved");return old.value}}const value=[make()][0]!({get inner(){trace.push("bind");return {get value(){trace.push("old");return "old"}}}});return [...trace,value]}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/pattern-alias-emitted.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			sourceNodeScript(t, response.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.deepEqual(Array.from(out.run()),['bind','saved','old','old']);`)
		})
	}
}

// The saved slot cannot erase its original binding Get or a genuinely foreign
// value alternative merely because the formal is replaced before the read.
func TestPatternAliasEffectResiduals(t *testing.T) {
	for _, row := range []struct {
		name, source string
		unknown      bool
	}{
		{"binding getter", `function make(){return ({inner}:{inner:{value:string}})=>{const old=inner;inner={value:"new"};return old.value}}export const value=[make()][0]!({get inner(){document.title;return {value:"safe"}}});`, false},
		{"foreign alternative", `declare const choose:boolean;declare function foreign():{value:string};function make(){return ({inner}:{inner:{value:string}})=>{const old=inner;inner={value:"new"};return old.value}}export const value=[make()][0]!({inner:choose?{get value(){return document.title}}:foreign()});`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/pattern-alias-residual.ts", Source: row.source, Diagnostics: "semantic"})
			browser, unknown := reentrantInitializerEffects(t, response, row.source, true)
			if !browser || unknown != row.unknown {
				t.Fatal("alias lost original or foreign effect", browser, unknown)
			}
		})
	}
}
