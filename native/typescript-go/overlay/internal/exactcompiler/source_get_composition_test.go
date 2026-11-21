package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Getter composition preserves the selected receiver and known effects without
// granting thenable fulfillment or task-result lifetime authority. Effect and
// value assertions protect their separate analysis contracts.
func TestOrdinaryGetComposition(t *testing.T) {
	rows := []struct {
		Name             string
		Request          Request
		Browser, Unknown bool
	}{
		{"nested-getter-then", Request{Kind: "analyze", ID: "/virtual/r36-nested-getter-then.ts", Source: "const helper={thenValue(resolve:(value:{kind:string})=>void){window.name;resolve({kind:'failure'})},get selected(){return this.thenValue}};async function make(){return {kind:'audit',thenValue:'noncallable',get then(){return helper.selected}}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, true, true},
		{"ordinary-getter-call", Request{Kind: "analyze", ID: "/virtual/r36-ordinary-getter-call.ts", Source: "const helper={run(){window.name;return 1},get selected(){return this.run}};export function read(){return helper.selected()}", Diagnostics: "semantic"}, true, false},
		{"unentered-constructor", Request{Kind: "analyze", ID: "/virtual/r36-unentered-constructor.ts", Source: "class Unentered{constructor(){Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}}async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, false, false},
		{"unentered-instance-field", Request{Kind: "analyze", ID: "/virtual/r36-unentered-instance-field.ts", Source: "class Unentered{field=Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, false, false},
		{"eager-static-field", Request{Kind: "analyze", ID: "/virtual/r36-eager-static-field.ts", Source: "class Installed{static field=Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}})}async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, true, false},
		{"eager-computed-name", Request{Kind: "analyze", ID: "/virtual/r36-eager-computed-name.ts", Source: "function name():'field'{Object.defineProperty(Object.prototype,'then',{configurable:true,get(){window.name;return undefined}});return 'field'}class Installed{[name()](){}}async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, true, false},
		{"opaque-prototype-receiver", Request{Kind: "analyze", ID: "/virtual/r36-opaque-prototype-receiver.ts", Source: "declare global{interface Object{install():void}}Object.prototype.install();async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, false, true},
		{"passive-unknown-method", Request{Kind: "analyze", ID: "/virtual/r36-passive-unknown-method.ts", Source: "declare const ordinary:{install():void};ordinary.install();async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, false, false},
		{"opaque-adapted-call", Request{Kind: "analyze", ID: "/virtual/r36-opaque-adapted-call.ts", Source: "declare const install:(this:object)=>void;install.call(Object.prototype);async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, false, true},
		{"opaque-adapted-apply", Request{Kind: "analyze", ID: "/virtual/r36-opaque-adapted-apply.ts", Source: "declare const install:(this:object)=>void;install.apply(Object.prototype,[]);async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, false, true},
		{"opaque-installed-receiver", Request{Kind: "analyze", ID: "/virtual/r36-opaque-installed-receiver.ts", Source: "declare global{interface Object{install():void}}function start(proto:object){proto.install()}start(Object.prototype);async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, false, true},
		{"known-installed-receiver", Request{Kind: "analyze", ID: "/virtual/r36-known-installed-receiver.ts", Source: "declare global{interface Object{install():void}}Object.prototype.install=function(){Object.defineProperty(this,'then',{configurable:true,get(){window.name;return undefined}})};Object.prototype.install();async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, true, false},
		{"trusted-native-receiver", Request{Kind: "analyze", ID: "/virtual/r36-trusted-native-receiver.ts", Source: "Object.prototype.toString();async function make(){return {kind:'audit'}}export async function read(){return (await make()).kind}", Diagnostics: "semantic"}, false, false},
	}
	for _, row := range rows {
		t.Run(row.Name, func(t *testing.T) {
			session := NewSession()
			response := session.Execute(row.Request)

			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Errorf("invalid source: %s %#v", response.Error, response.Diagnostics)
				return
			}
			var read *CallableSummary
			for i := range response.Analysis.Callables {
				if response.Analysis.Callables[i].Name == "read" {
					read = &response.Analysis.Callables[i]
				}
			}
			if read == nil {
				t.Error("missing read")
				return
			}
			if got := settlementBrowser(*read); got != row.Browser {
				t.Errorf("named browser=%v want=%v effect=%s", got, row.Browser, read.Effect)
			}
			if row.Unknown && read.Effect != "unknown" {
				t.Errorf("unaccounted then granted neutral: %s", read.Effect)
			}
			if row.Name == "unentered-constructor" || row.Name == "unentered-instance-field" {
				for _, producer := range response.Analysis.Callables {
					if producer.Name == "make" && producer.Effect != "neutral" {
						t.Errorf("unentered body admitted to settlement: %s", producer.Effect)
					}
				}
			}
			for _, project := range session.projects {
				source := project.program.GetSourceFile(row.Request.ID)
				if source == nil {
					continue
				}
				owner := project.callableCache.owner
				query := sourceValueQuery{owner: owner.values, executable: owner, remaining: 4096, active: make(map[*ast.Node]bool)}
				if row.Name == "nested-getter-then" {
					var record *ast.Node
					walkNode(source.AsNode(), func(node *ast.Node) bool {
						if ast.IsGetAccessorDeclaration(node) && node.Name().Text() == "then" {
							record = node.Parent
						}
						return true
					})
					if record == nil {
						t.Error("missing actual return record")
						continue
					}
					bindings := sourceValueBindings{0: []sourceValue{{node: record}}}
					selected := query.settlementThen(&sourceGetInputs{operation: record, receiver: sourceValue{node: record}, freshReturn: true}, bindings, nil, false)
					callable := false
					for _, term := range selected.effects.values {
						callable = callable || term.node != nil && ast.IsMethodDeclaration(term.node) && term.node.Name().Text() == "thenValue"
					}
					if selected.noncallable || !callable {
						t.Errorf("nested receiver acquired noncallable=%v callable=%v opaque=%v", selected.noncallable, callable, selected.effects.opaque)
					}
					if len(bindings[0]) != 1 || bindings[0][0].node != record || query.inputs != nil || query.creators != nil {
						t.Error("nested Get leaked installed scope")
					}
					t.Logf("NESTED_GET callable=%v noncallable=%v opaque=%v remaining=%d", callable, selected.noncallable, selected.effects.opaque, query.remaining)
				}
				if row.Name == "unentered-constructor" || row.Name == "unentered-instance-field" || row.Name == "eager-static-field" || row.Name == "eager-computed-name" {
					index := query.owner.index(source)
					deferred, eager := 0, 0
					for region, refs := range index.operationRegions {
						for _, call := range refs.calls {
							if query.thenMutationSyntax(call) {
								if region == nil {
									eager++
								} else {
									deferred++
								}
							}
						}
					}
					wantDeferred := row.Name == "unentered-constructor" || row.Name == "unentered-instance-field"
					if wantDeferred && (deferred != 1 || eager != 0) {
						t.Errorf("deferred inventory=%d eager=%d", deferred, eager)
					}
					// The computed-name installer has a normal function region. The call of
					// that function, not its declaration region, is the eager operation.
					if row.Name == "eager-static-field" && (eager != 1 || deferred != 0) {
						t.Errorf("static inventory=%d eager=%d", deferred, eager)
					}
					t.Logf("REGION eager=%d deferred=%d", eager, deferred)
				}
			}
		})
	}
}

// The same receiver can be revisited at a different residual member. A repeated
// lookup still widens, and deferred siblings do not become selected methods.
func TestGetterMemberProjectionRecursion(t *testing.T) {
	for _, row := range []struct {
		name, source, effect string
		browser              bool
	}{
		{"chain", `const helper={run(){window.name;return 1},get next(){return this.run},get selected(){return this.next}};export function read(){return helper.selected()}`, "browser", true},
		{"safe sibling", `const helper={run(){window.name;return 1},safe(){return 1},get selected(){return this.safe}};export function read(){return helper.selected()}`, "neutral", false},
		{"self cycle", `const helper={get selected():()=>number{return this.selected}};export function read(){return helper.selected()}`, "unknown", false},
		{"mutual cycle", `const helper={get selected():()=>number{return this.next},get next():()=>number{return this.selected}};export function read(){return helper.selected()}`, "unknown", false},
		{"cycle donor", `const helper={get selected():()=>number{window.name;return this.next},get next():()=>number{return this.selected}};export function read(){return helper.selected()}`, "unknown", true},
		{"static", `class Helper{static run(){window.name;return 1}static get selected(){return this.run}}export function read(){return Helper.selected()}`, "browser", true},
		{"instance", `class Helper{static run(){return 1}run(){window.name;return 1}get selected(){return this.run}}const helper=new Helper();export function read(){return helper.selected()}`, "browser", true},
		// Static-to-instance selection retains the known method browser donor
		// through both getter reads and the final call.
		{"static to instance", `class Helper{run(){window.name;return 1}get selected():()=>number{return this.run}static get selected():()=>number{return new Helper().selected}}export function read(){return Helper.selected()}`, "browser", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := "import type { Component } from '@exactjs/core'; " + row.source + `
export function Page(this: Component<{}>) {
	const display = read();
	return () => display;
}`
			fixture := newExecutableFixture(t, map[string]string{"entry.ts": source})
			r := fixture.session.Execute(fixture.request("analyze", "entry.ts"))
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatalf("invalid fixture: %s %#v", r.Error, r.Diagnostics)
			}
			page := findCallable(t, r.Analysis.Callables, "Page")
			if page.Effect != row.effect || settlementBrowser(page) != row.browser {
				t.Fatalf("member projection changed effects: effect=%s browser=%v", page.Effect, settlementBrowser(page))
			}
		})
	}
}

// The getter result remains an ordinary method reference. Its receiver, once-only
// Get and abrupt prefix must survive emission without a normal analysis receipt.
func TestGetterReturnedMethodEmission(t *testing.T) {
	source := `let gets=0,calls=0,fail=false;const helper={label:'safe',run():string{calls++;window.name;return this.label},get selected():()=>string{gets++;if(fail)throw 'stop';return this.run}};export function read(throwing:boolean){fail=throwing;return helper.selected()}export function counts(){return {gets,calls}}`
	checkFormalGetterComponent(t, source, "read(false)", true)
	checkFormalGetterComponent(t, source, "helper.selected", false)
	r := NewSession().Execute(Request{Kind: "compile", ID: "getter-returned-method.ts", Source: source, Diagnostics: "semantic", Target: TargetClient, PreserveOrdinaryModules: true})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
		t.Fatalf("getter emission: %s %#v", r.Error, r.Diagnostics)
	}
	sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm');let reads=0;
const sandbox={exports:{},window:{get name(){reads++;return 'browser'}}};
vm.runInNewContext('(function(exports){'+fs.readFileSync(process.argv[1],'utf8')+'\n})(exports)',sandbox);
let state=sandbox.exports.counts();if(state.gets||state.calls||reads)throw Error('creation invoked getter or method');
if(sandbox.exports.read(false)!=='safe')throw Error('method receiver lost');
state=sandbox.exports.counts();if(state.gets!==1||state.calls!==1||reads!==1)throw Error('method/Get count');
try{sandbox.exports.read(true);throw Error('missing Throw')}catch(error){if(error!=='stop')throw error}
state=sandbox.exports.counts();if(state.gets!==2||state.calls!==1||reads!==1)throw Error('getter Throw invoked method');`)
}
