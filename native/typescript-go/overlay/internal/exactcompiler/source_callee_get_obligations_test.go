package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Original member callee Gets retain their source field obligation through
// saved receiver aliases, while body selection keeps the original receiver.
func TestMemberCalleeGetObligations(t *testing.T) {
	for _, row := range []struct{ name, source, placement string }{
		{"literal key", `function make(){return ({inner}:{inner:{value:string;read():string}})=>{const old=inner;inner={value:"new",read(){return this.value}};return old["read"]()}}export const value=[make()][0]!({inner:{value:"old",read(){return this.value}}});`, "isomorphic"},
		{"Getter donor", `function make(){return ({inner}:{inner:{value:string;read():string}})=>{const old=inner;inner={value:"new",read(){return this.value}};return old.read()}}export const value=[make()][0]!({inner:{value:"old",get read(){document.title;return function(this:{value:string}){return this.value}}}});`, "client"},
		{"original body donor", `function make(){return ({inner}:{inner:{value:string;read():string}})=>{const old=inner;inner={value:"new",read(){return this.value}};return old.read()}}export const value=[make()][0]!({inner:{value:"old",read(){document.title;return this.value}}});`, "client"},
		{"current receiver value", `function make(){return ({inner}:{inner:{value:string;read():string}})=>{const old=inner;inner={value:"new",read(){return this.value}};old.value=document.title;return old.read()}}export const value=[make()][0]!({inner:{value:"old",read(){return this.value}}});`, "client"},
	} {
		t.Run(row.name, func(t *testing.T) { assertClosurePlacement(t, row.source, row.placement) })
	}
}

// A Get obligation cannot certify a callable target, a foreign Get result or an
// unknown input. Its original donor remains beside independent uncertainty.
func TestMemberCalleeGetResiduals(t *testing.T) {
	for _, row := range []struct {
		name, source string
		browser      bool
	}{
		{"foreign target", `declare function foreign():()=>string;function make(){return ({inner}:{inner:{read():string}})=>{const old=inner;inner={read(){return "safe"}};return old.read()}}export const value=[make()][0]!({inner:{get read(){document.title;return foreign()}}});`, true},
		{"foreign input", `declare function foreign():{read():string};function make(){return ({inner}:{inner:{read():string}})=>{const old=inner;inner={read(){return "safe"}};return old.read()}}export const value=[make()][0]!({inner:foreign()});`, false},
		{"noncallable", `function make(){return ({inner}:{inner:{read():string}})=>{const old=inner;inner={read(){return "safe"}};return old.read()}}export const value=[make()][0]!({inner:{read:0 as unknown as ()=>string}});`, false},
		{"unknown key", `declare const key:string;function make(){return ({inner}:{inner:Record<string,()=>string>})=>{const old=inner;inner={read(){return "new"}};return old[key]!()}}export const value=[make()][0]!({inner:{read(){return "old"}}});`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/member-callee-residual.ts", Source: row.source, Diagnostics: "semantic"})
			browser, unknown := reentrantInitializerEffects(t, r, row.source, true)
			if browser != row.browser || !unknown {
				t.Fatal("Get classification lost donor or independent callee residual", browser, unknown)
			}
		})
	}
}

// The original member operation runs once with old as this. A throwing Get or
// noncallable result prevents body execution, independently of current replacement.
func TestMemberCalleeGetEmitted(t *testing.T) {
	const source = `declare function record(value:string):void;export function run(kind:"value"|"throw"|"noncallable"){function make(){return ({inner}:{inner:{value:string;read():string}})=>{const old=inner;inner=(record("replace"),{value:"new",read(){return this.value}});return old.read()}}return [make()][0]!({inner:{get value(){record("value");return "old"},get read(){record("get");if(kind==="throw")throw new Error("get");return kind==="noncallable"?0 as unknown as ()=>string:function(this:{value:string}){record("call");return this.value}}}})}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/member-callee-emitted.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={},trace=[];vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out,record:value=>trace.push(value)});assert.equal(out.run('value'),'old');assert.deepEqual(trace,['replace','get','call','value']);trace.length=0;assert.throws(()=>out.run('throw'),/get/);assert.deepEqual(trace,['replace','get']);trace.length=0;assert.throws(()=>out.run('noncallable'),/not a function/);assert.deepEqual(trace,['replace','get']);`)
		})
	}
}

// Unproved method replacement keeps its browser alternative. This check does
// not require current method identity or remove any remaining selection gap.
func TestMemberCalleeCurrentMethodDonor(t *testing.T) {
	const source = `function make(){return ({inner}:{inner:{value:string;read():string}})=>{const old=inner;inner={value:"new",read(){return this.value}};old.read=()=>document.title;return old.read()}}export const value=[make()][0]!({inner:{value:"old",read(){return this.value}}});`
	r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/member-current-method.ts", Source: source, Diagnostics: "semantic"})
	browser, _ := reentrantInitializerEffects(t, r, source, true)
	if !browser {
		t.Fatal("current method browser donor lost")
	}
}

// Naming an original source Get cannot grant a normal output, descriptor or
// complete callable identity. The normal query keeps its earlier acquisition route.
func TestMemberCalleeGetNormalGuard(t *testing.T) {
	const source = `function make(){return ({inner}:{inner:{value:string;read():string}})=>{const old=inner;inner={value:"safe",read(){return this.value}};return old.read()}}export const value=[make()][0]!({inner:{value:"safe",read(){return this.value}}});`
	session := NewSession()
	r := session.Execute(Request{Kind: "analyze", ID: "/virtual/member-normal-guard.ts", Source: source, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	found := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile("/virtual/member-normal-guard.ts")
		if file == nil {
			continue
		}
		var call *ast.Node
		walkNode(file.AsNode(), func(node *ast.Node) bool {
			if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().AsPropertyAccessExpression().Name().Text() == "read" {
				call = node
			}
			return true
		})
		if call == nil {
			t.Fatal("missing authored method Call")
		}
		found = true
		q := newSourceDependencyQuery(call, project.callableCache.owner.values.checker, project.callableCache.owner, enclosingCallableNode(call))
		acquired := q.receiverCandidates(call, nil)
		if len(acquired.fieldFallbacks) != 1 || acquired.fieldFallbacks[0].operation != call.Expression() || acquired.fieldFallbacks[0].key != "read" || !ast.IsVariableDeclaration(acquired.fieldFallbacks[0].slot) || acquired.fieldFallbacks[0].slot.Name().Text() != "old" {
			t.Fatal("source Get lost exact operation or saved slot")
		}
		if !acquired.valueIncomplete || len(acquired.normalCalls) != 0 || len(acquired.nativeCalls) != 0 || len(acquired.ownSlots) != 0 {
			t.Fatal("source Get supplied output or completeness")
		}
		if q.protectedMember != nil || q.initializing != nil || q.inputs != nil || len(q.active) != 0 {
			t.Fatal("callee Get leaked acquisition ownership")
		}
		q.dependenciesOnly = false
		normal := q.receiverCandidates(call, nil)
		if len(normal.fieldFallbacks) != 0 || len(normal.normalCalls) != 0 || len(normal.nativeCalls) != 0 || len(normal.ownSlots) != 0 {
			t.Fatal("normal query borrowed source obligation or receipt")
		}
	}
	if !found {
		t.Fatal("missing guard source")
	}
}

// The unchanged original source retains its exported result in both partitions.
func TestMemberCalleeOriginalEmitted(t *testing.T) {
	const source = `function make(){return ({inner}:{inner:{value:string;read():string}})=>{const old=inner;inner={value:"safe",read(){return this.value}};return old.read()}}export const value=[make()][0]!({inner:{value:"safe",read(){return this.value}}});`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/member-original.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.equal(out.value,'safe');`)
		})
	}
}
