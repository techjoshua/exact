package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Each row distinguishes implicit operation effects from result/lifetime facts.
// Constructors without an installed input owner retain relevant incompleteness.
func TestImplicitSettlementBoundaries(t *testing.T) {
	for _, row := range []struct {
		name, source        string
		browser, incomplete bool
	}{
		{"entered-constructor", `class Entered{constructor(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}}new Entered();async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}`, false, true},
		{"entered-instance", `class Entered{field=Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}new Entered();async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}`, false, true},
		{"empty-entered-constructor", `class Entered{constructor(){}}new Entered();async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}`, false, false},
		{"getter-order", `const events:string[]=[];const helper={get selected(){events.push('inner');window.name;return undefined}};async function make(){try{return {kind:'audit',get then(){events.push('outer');return helper.selected}}}finally{events.push('finally')}}export async function read(){return (await make()).kind}`, true, false},
		{"getter-throw", `async function make(){return {kind:'audit',get then():undefined{window.name;throw new Error('stop')}}}export async function read(){return (await make()).kind}`, true, true},
		{"getter-captures", `function install(read:()=>string){return {get selected(){read();return undefined}}}const helper=install(()=>window.name);async function make(){return {kind:'audit',get then(){return helper.selected}}}export async function read(){return (await make()).kind}`, true, false},
		{"finally-reject", `async function make(){try{return {kind:'audit',get then(){window.name;return undefined}}}finally{throw new Error('stop')}}export async function read(){return (await make()).kind}`, false, false},
		{"finally-replace", `async function make(){try{return {kind:'audit',get then(){window.name;return undefined}}}finally{return {kind:'failure',then:undefined}}}export async function read(){return (await make()).kind}`, false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			request := Request{Kind: "analyze", ID: "/virtual/implicit-" + row.name + ".ts", Source: row.source, Diagnostics: "semantic"}
			session := NewSession()
			response := session.Execute(request)

			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Errorf("invalid source %#v", response.Diagnostics)
				return
			}
			found := false
			for _, c := range response.Analysis.Callables {
				if c.Name == "make" {
					found = true
					if settlementBrowser(c) != row.browser {
						t.Errorf("producer named browser=%v want=%v effect=%s", settlementBrowser(c), row.browser, c.Effect)
					}
					if row.incomplete && c.Effect != "unknown" {
						t.Errorf("unaccounted operation granted %s", c.Effect)
					}
				}
			}
			if !found {
				t.Error("missing make")
			}
		})
	}
}

// Missing selected runtime input is not an empty module initializer. The module
// edge is real selection input, not inferred from file membership or type purity.
func TestImplicitUnavailableDependency(t *testing.T) {
	f := newExecutableFixture(t, map[string]string{"entry.ts": `import {installed} from './installer.js';void installed;async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}`, "installer.d.ts": `export declare const installed:boolean;`})
	q := f.request("analyze", "entry.ts")
	r := f.session.Execute(q)

	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Errorf("declaration-only setup %#v", r)
		return
	}
	found := false
	for _, c := range r.Analysis.Callables {
		if c.Name == "make" {
			found = true
			if c.Effect != "unknown" {
				t.Errorf("missing executable dependency granted %s", c.Effect)
			}
		}
	}
	if !found {
		t.Error("missing make")
	}
}

// A source-selected getter has effects, but an unowned query cannot reconstruct
// its normal returned payload. The original source still executes through emission.
func TestInstalledGetReturnHandoff(t *testing.T) {
	q := Request{Kind: "analyze", ID: "/virtual/installed-get-return.ts", Source: `const helper={value:undefined,get selected(){window.name;return this.value}};async function make(){return {kind:'audit',value:'outer',get then(){return helper.selected}}}export async function read(){return (await make()).kind}`, Diagnostics: "semantic"}
	session := NewSession()
	r := session.Execute(q)

	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Errorf("invalid source %#v", r.Diagnostics)
		return
	}
	for _, project := range session.projects {
		source := project.program.GetSourceFile(q.ID)
		if source == nil {
			continue
		}
		var getter, record *ast.Node
		walkNode(source.AsNode(), func(n *ast.Node) bool {
			if ast.IsGetAccessorDeclaration(n) && n.Name().Text() == "then" {
				getter = n
				record = n.Parent
			}
			return true
		})
		if getter == nil {
			t.Error("missing source getter")
			continue
		}
		owner := project.callableCache.owner
		query := sourceValueQuery{owner: owner.values, executable: owner, remaining: 4096, active: make(map[*ast.Node]bool)}
		result := accessorCandidates{}
		observed := query.acquireGetResult(getter, &sourceGetInputs{operation: record, receiver: sourceValue{node: record}}, acquiredCallableScope{}, &result)
		if !observed.incomplete || len(observed.values) != 0 || observed.owned != nil {
			t.Fatalf("unowned Get manufactured normal return: %#v", observed)
		}
		if query.inputs != nil || query.creators != nil {
			t.Error("Get context leaked")
		}
	}
	if !settlementBrowser(executableSummary(t, r, "make")) || !settlementBrowser(executableSummary(t, r, "read")) {
		t.Fatal("original getter source lost browser donor")
	}
	q.Kind, q.Target = "compile", TargetClient
	compiled := session.Execute(q)
	if compiled.Error != "" || hasErrorDiagnostic(compiled.Diagnostics) || compiled.Code == "" {
		t.Fatal(compiled.Error, compiled.Diagnostics)
	}
	sourceNodeScript(t, compiled.Code, `const fs=require('node:fs'),vm=require('node:vm');let gets=0;const sandbox={exports:{},window:{get name(){gets++;return 'browser'}}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);sandbox.exports.read().then(value=>{if(value!=='audit'||gets!==1)throw Error('Get handoff/get count')}).catch(error=>{console.error(error);process.exitCode=1})`)
}
