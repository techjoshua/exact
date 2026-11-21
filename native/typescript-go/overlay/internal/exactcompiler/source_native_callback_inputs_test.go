package exactcompiler

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// A named access on a fresh array can reuse the actual checker symbol while
// preserving callback placement and authored member alternatives.
func TestLiteralArrayNamedMemberTaskEffects(t *testing.T) {
	for _, row := range []struct {
		name, declarations, expression string
		browser, unknown               bool
	}{
		{"native", "", `[1].map(value=>String(value))[0]!`, false, false},
		{"named", "", `[1].map(()=>document.title)[0]!`, true, false},
		{"computed", "", `[1]['map'](()=>document.title)[0]!`, true, false},
		{"optional", "", `[1].map?.(()=>document.title)[0]??''`, true, false},
		{"authored-augmentation", `declare global{interface Array<T>{extra():string}}`, `[1].extra()`, false, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			const body = "this.state.label="
			source := row.declarations + publicAwaitRequiredPage("", body+row.expression, TargetServer)
			fixture := newPublicAwaitRequiredFixture(t, source)
			for _, target := range []Target{TargetClient, TargetServer} {
				request := fixture.request("compile", "entry.tsx")
				request.Target = target
				response := NewSession().Execute(request)
				if response.Error != "" || len(response.Analysis.Tasks) != 1 || hasErrorDiagnostic(response.Diagnostics) != row.browser || (response.Code == "") != row.browser {
					t.Fatal(target, response.Error, response.Diagnostics)
				}
				browser, unknown := false, false
				for _, effect := range response.Analysis.Tasks[0].EffectSources {
					browser = browser || effect.Environment == "browser" && strings.Contains(effect.Description, "document")
					unknown = unknown || effect.Environment == "unknown"
				}
				if browser != row.browser || row.unknown && !unknown {
					t.Fatal(target, response.Analysis.Tasks[0].EffectSources)
				}
			}
		})
	}
}

// Placement follows the actual key producer of a native map callback's
// captured read. An unused getter beside a reached slot adds no requirement.
func TestNativeMapCapturedKeyTaskPlacement(t *testing.T) {
	root, config := formsSourceFixture(t)
	keys := `const raw=[1, 3, 'border'] as const;export const keys=Object.freeze(raw);export function readKeys(){for(const _ of raw){}}`
	if err := os.WriteFile(filepath.Join(root, "keys.ts"), []byte(keys), 0600); err != nil {
		t.Fatal(err)
	}
	const lookup = `i=>rows[i]!.background.css`
	for _, row := range []struct {
		name, setup, callback, browserKey string
		browser                           bool
	}{
		{"imported reached", ``, lookup, "3", true},
		{"imported unused", ``, lookup, "2", false},
		{"aliased callback unused", `const keys=Object.freeze([1]);const callback=(i:number)=>rows[i]!.background.css`, `callback`, "2", false},
		{"read-only parameter unused", `const keys=Object.freeze([1])`, `i=>{const label=String(i);return rows[i]!.background.css+label}`, "2", false},
		{"empty", `const keys=Object.freeze([] as number[])`, `()=>rows[2]!.background.css`, "2", false},
		{"unknown input", `const keys=Object.freeze([key])`, lookup, "2", true},
		{"write before freeze", `const raw=[1];const alias=raw;alias[0]=2;const keys=Object.freeze(raw)`, lookup, "2", true},
		{"shadowed freeze", `const Object={freeze(_:number[]){return [2]}};const keys=Object.freeze([1])`, lookup, "2", true},
		{"updated parameter", `const keys=Object.freeze([1])`, `i=>{i++;return rows[i]!.background.css}`, "2", true},
		{"callback write", `const keys=[1,1]`, `(i,offset)=>{if(offset===0)keys[1]=2;return rows[i]!.background.css}`, "2", true},
	} {
		t.Run(row.name, func(t *testing.T) {
			fields := []string{}
			for _, key := range []string{"1", "2", "3", "border"} {
				value := `{background:{css:'safe'}}`
				if key == row.browserKey {
					value = `{get background(){return {css:document.title}}}`
				}
				fields = append(fields, key+":"+value)
			}
			source := `import {type Component,TaskContext} from '@exactjs/core';import {keys} from './keys.js';function read(key:number,rows:Record<string,{background:{css:string}}>){` + row.setup + `;return keys.map(` + row.callback + `).join()}export function Page(this:Component<{result:string}>,props:{index:number}){this.state.result='ready';function save(task:TaskContext=TaskContext.server()){this.state.result=read(props.index,{` + strings.Join(fields, ",") + `})}return()=> <button onClick={save}>{this.state.result}</button>}`
			for _, target := range []Target{TargetClient, TargetServer} {
				result := formsCompileSource(t, root, config, source, target)
				refused := containsDiagnosticCode(result.Diagnostics, "EXACT2001") && strings.Contains(strings.Join(formsDiagnosticDetails(result.Diagnostics), " "), "document")
				if refused != row.browser || (result.Code == "") != row.browser || !row.browser && hasErrorDiagnostic(result.Diagnostics) {
					t.Fatalf("%s emitted=%t diagnostics=%v", target, result.Code != "", formsDiagnosticDetails(result.Diagnostics))
				}
			}
		})
	}
}

// Both actual callback readers use the same eager module binding. Updating the
// selected key must move the browser getter requirement in the retained session.
func TestNativeMapFrozenModuleKeyEdits(t *testing.T) {
	root, config := formsSourceFixture(t)
	keys := filepath.Join(root, "keys.ts")
	page := filepath.Join(root, "Page.tsx")
	const source = `import {type Component,TaskContext} from '@exactjs/core';
import {keys} from './keys.js';
type Rows=Record<number,{label:string}>;
function palette(rows:Rows){return keys.map(index=>rows[index]!.label).join()}
function tokens(rows:Rows){return ['start',...keys.map(index=>rows[index]!.label)].join()}
export function Page(this:Component<{result:string}>,props:{tokens:boolean}){
  this.state.result='ready';
  function show(task:TaskContext=TaskContext.server()){
    const rows={1:{label:'safe'},2:{get label(){return document.title}}};
    this.state.result=props.tokens?tokens(rows):palette(rows);
  }
  return ()=> <button onClick={show}>{this.state.result}</button>
}`
	session := NewSession()
	original := map[Target]string{}
	for _, key := range []int{1, 2, 1} {
		initializer := fmt.Sprintf("const raw=[%d];export const keys=Object.freeze(raw);", key)
		synced := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: config, Sources: []ProjectSource{
			{ID: keys, Source: initializer},
			{ID: page, Source: source},
		}})
		if synced.Error != "" || hasErrorDiagnostic(synced.Diagnostics) {
			t.Fatal("synchronize frozen module fixture", synced.Error, synced.Diagnostics)
		}
		for _, target := range []Target{TargetClient, TargetServer} {
			result := session.Execute(Request{Kind: "compile", Target: target, ID: page, Root: root, ConfigFile: config, Source: source, Diagnostics: "semantic"})
			reached := containsDiagnosticCode(result.Diagnostics, "EXACT2001") && strings.Contains(strings.Join(formsDiagnosticDetails(result.Diagnostics), " "), "document")
			if result.Error != "" || reached != (key == 2) || (result.Code == "") != reached || !reached && hasErrorDiagnostic(result.Diagnostics) {
				t.Fatalf("%s key %d emitted=%t error=%s diagnostics=%v", target, key, result.Code != "", result.Error, formsDiagnosticDetails(result.Diagnostics))
			}
			if key == 1 {
				if prior := original[target]; prior != "" && result.Code != prior {
					t.Fatalf("%s output changed after restoring the original key", target)
				}
				original[target] = result.Code
			}
		}
	}
}

// A selected library callback slot retains effects from actual supplied source
// elements. This is separate from proving native method identity or map output.
func TestNativeMapCallbackElementEffects(t *testing.T) {
	for _, test := range []struct {
		name, declarations, input, callback string
		browser, unknown                    bool
	}{
		{"owned data", ``, `[{value:'safe'}]`, `node=>node.value`, false, false},
		{"owned getter", ``, `[{get value(){return document.title}}]`, `node=>node.value`, true, false},
		{"foreign element", `declare const foreign:{value:string};`, `[foreign]`, `node=>node.value`, false, true},
		{"mixed elements", `declare const foreign:{value:string};`, `[{get value(){return document.title}},foreign]`, `node=>node.value`, true, true},
		{"callback body", ``, `[{value:'safe'}]`, `node=>{document.title;return node.value}`, true, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `type Pattern=readonly {value:string}[];function project(pattern:Pattern){return pattern.map(` + test.callback + `);}` + test.declarations + `const input=` + test.input + `;export function work(){return project(input)}`
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/native-map-input.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal("invalid source", response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "work")
			browser, unknown := false, false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			// No portability assertion follows from an ordinary readonly type.
			// Known work and genuinely unknown elements remain independent donors.
			if browser != test.browser || test.unknown && !unknown {
				t.Errorf("callback input donor browser=%v unknown=%v: %#v", browser, unknown, summary.EffectSources)
			}
			if test.declarations == "" {
				compiled := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/native-map-input.ts", Source: source, Diagnostics: "semantic"})
				if compiled.Error != "" || hasErrorDiagnostic(compiled.Diagnostics) || compiled.Code == "" {
					t.Fatal("ordinary emitted source", compiled.Error, compiled.Diagnostics)
				}
				want, gets := "safe", 0
				if test.name == "owned getter" {
					want, gets = "browser", 1
				}
				if test.name == "callback body" {
					gets = 1
				}
				sourceNodeScript(t, compiled.Code, `const fs=require('node:fs'),vm=require('node:vm');let gets=0;const sandbox={exports:{},document:{get title(){gets++;return 'browser'}}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);const result=sandbox.exports.work();if(result.join(',')!==process.argv[2]||gets!==Number(process.argv[3]))throw Error(JSON.stringify({result,gets}));`, want, fmt.Sprint(gets))
			}
		})
	}
}

// Callback MAY inputs retain original receiver acquisition and current element
// reads. No readonly view or selected signature closes foreign alternatives.
func TestNativeMapCallbackInputPhases(t *testing.T) {
	for _, test := range []struct {
		name, source     string
		browser, unknown bool
	}{
		{"alias", `const original=[{get value(){return document.title}}];const alias=original;export function work(){return alias.map(node=>node.value)}`, true, true},
		{"current element write", `const input:{value:string}[]=[{value:'safe'}];input[0]={get value(){return document.title}};export function work(){return input.map(node=>node.value)}`, true, true},
		{"later element write", `const input:{value:string}[]=[{value:'safe'}];export function work(){const result=input.map(node=>node.value);input[0]={get value(){return document.title}};return result}`, false, true},
		{"argument receiver rebind", `let input:{value:string}[]=[{get value(){return document.title}}];function callback(){input=[{value:'safe'}];return (node:{value:string})=>node.value}export function work(){return input.map(callback())}`, true, true},
		{"argument element write", `const input:{value:string}[]=[{value:'safe'}];function callback(){input[0]={get value(){return document.title}};return (node:{value:string})=>node.value}export function work(){return input.map(callback())}`, true, true},
		{"supplied default bypass", `const input=[{value:'safe'}];export function work(){return input.map((node={get value(){return document.title}})=>node.value)}`, false, true},
		{"undefined default", `const input:({value:string}|undefined)[]=[undefined];export function work(){return input.map((node={get value(){return document.title}})=>node.value)}`, true, true},
		{"sparse inherited getter", `const input:{value:string}[]=[];input.length=1;Object.defineProperty(Array.prototype,'0',{get(){return {get value(){return document.title}}},configurable:true});export function work(){return input.map(node=>node.value)}`, true, true},
		{"index getter", `const input:{value:string}[]=[{value:'safe'}];Object.defineProperty(input,'0',{get(){document.title;return {value:'safe'}},configurable:true});export function work(){return input.map(node=>node.value)}`, true, true},
		{"argument Throw", `const input:string[]=[];input.length=1;Object.defineProperty(input,'0',{get(){return document.title},configurable:true});const args={get callback():(node:string)=>string{throw 9}};export function work(){try{return input.map(args.callback)}catch{return ['stopped']}}`, false, true},
		{"named index impostor", `const input=[{value:'safe'}];Object.defineProperty(input,'01',{get(){return document.title},configurable:true});export function work(){return input.map(node=>node.value)}`, false, true},
		{"negative index impostor", `const input=[{value:'safe'}];Object.defineProperty(input,'-1',{get(){return document.title},configurable:true});export function work(){return input.map(node=>node.value)}`, false, true},
		{"deferred argument body", `const input=[{value:'safe'}];function put(){input[0]={get value(){return document.title}}}export function work(){return input.map(node=>{void put;return node.value})}`, false, true},
		{"scalar argument snapshot", `const input=[{value:'safe'}];let captured='safe';function callback(){captured='later';return (node:{value:string})=>node.value}export function work(){return input.map(callback())}`, false, true},
		{"uncertain argument completion", `declare const flag:boolean;const input:string[]=[];input.length=1;Object.defineProperty(input,'0',{get(){return document.title},configurable:true});const args={get callback():(node:string)=>string{if(flag)throw 9;return node=>node}};export function work(){return input.map(args.callback)}`, true, true},
		{"argument getter effect", `const input=[{value:'safe'}];const args={get callback(){document.title;return (node:{value:string})=>node.value}};export function work(){return input.map(args.callback)}`, true, true},
		{"unknown argument getter", `declare const args:{readonly callback:(node:string)=>string};const input:string[]=[];input.length=1;Object.defineProperty(input,'0',{get(){return document.title},configurable:true});export function work(){return input.map(args.callback)}`, true, true},
		{"mixed argument getter", `declare const flag:boolean;declare const foreign:{readonly callback:(node:string)=>string};const throwing={get callback():(node:string)=>string{throw 9}};const args=flag?throwing:foreign;const input:string[]=[];input.length=1;Object.defineProperty(input,'0',{get(){return document.title},configurable:true});export function work(){return input.map(args.callback)}`, true, true},
		{"argument success alternative", `declare const flag:boolean;const throwing={get callback():(node:string)=>string{throw 9}};const success={callback:(node:string)=>node};const args=flag?throwing:success;const input:string[]=[];input.length=1;Object.defineProperty(input,'0',{get(){return document.title},configurable:true});export function work(){return input.map(args.callback)}`, true, true},
		{"all argument getters Throw", `declare const flag:boolean;const first={get callback():(node:string)=>string{throw 9}};const second={get callback():(node:string)=>string{throw 10}};const args=flag?first:second;const input:string[]=[];input.length=1;Object.defineProperty(input,'0',{get(){return document.title},configurable:true});export function work(){return input.map(args.callback)}`, false, true},
		{"thisArg acquired snapshot", `let chosen={get value(){return document.title}};const args={get context(){return chosen}};const input=[{value:'safe'}];export function work(){return input.map(function(this:{value:string}){chosen={value:'safe'};return this.value},args.context)}`, true, true},
		{"thisArg safe snapshot", `let chosen={value:'safe'};const args={get context(){return chosen}};const input=[{value:'safe'}];export function work(){return input.map(function(this:{value:string}){chosen={get value(){return document.title}};return this.value},args.context)}`, false, true},
		{"foreign array", `declare const input:readonly {value:string}[];export function work(){return input.map(node=>node.value)}`, false, true},
		{"foreign callback", `declare const callback:(node:{value:string})=>string;const input=[{value:'safe'}];export function work(){return input.map(callback)}`, false, true},
		{"known body foreign alternative", `declare const foreign:(node:{value:string})=>string;declare const flag:boolean;const input=[{get value(){return document.title}}];const callback=flag?((node:{value:string})=>node.value):foreign;export function work(){return input.map(callback)}`, true, true},
		// The existing source fallback overunions the old getter here. Keep its
		// independent unknown and do not turn this pilot into a purity repair.
		{"authored replacement", `const input=[{get value(){return document.title}}];input.map=()=>[];export function work(){return input.map(node=>node.value)}`, false, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/native-map-phase.ts", Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal("invalid source", response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "work")
			browser, unknown := false, false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if test.name != "authored replacement" && browser != test.browser || test.unknown && !unknown {
				t.Errorf("browser=%v unknown=%v effects=%#v", browser, unknown, summary.EffectSources)
			}
			// These exact sources have no external declarations. Execute both
			// matched phase controls and a still-red source relation unchanged.
			want, gets, run := "safe", 0, true
			switch test.name {
			case "alias", "current element write", "argument receiver rebind", "argument element write", "undefined default", "sparse inherited getter", "thisArg acquired snapshot":
				want, gets = "browser", 1
			case "index getter", "argument getter effect":
				gets = 1
			case "argument Throw":
				want = "stopped"
			case "foreign array", "foreign callback", "known body foreign alternative", "authored replacement", "uncertain argument completion", "unknown argument getter", "mixed argument getter", "argument success alternative", "all argument getters Throw":
				run = false
			}
			if run {
				compiled := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/native-map-phase.ts", Source: test.source, Diagnostics: "semantic"})
				if compiled.Error != "" || hasErrorDiagnostic(compiled.Diagnostics) || compiled.Code == "" {
					t.Fatal("phase emission", compiled.Error, compiled.Diagnostics)
				}
				sourceNodeScript(t, compiled.Code, `const fs=require('node:fs'),vm=require('node:vm');let gets=0;const sandbox={exports:{},document:{get title(){gets++;return 'browser'}}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);const result=sandbox.exports.work();if(result.join(',')!==process.argv[2]||gets!==Number(process.argv[3]))throw Error(JSON.stringify({result,gets}));`, want, fmt.Sprint(gets))
			}
		})
	}
}

// Domain validation consumes real checker-owned nodes. Invalid input-plan tags
// cannot authorize another receiver, key, phase or a normal Get consumer.
func TestNativeMapIndexDomainRefusals(t *testing.T) {
	const id = "/virtual/map-domain.ts"
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: `const array=[{get value(){return document.title}}];const object={value:'safe'};export function work(){return array.map(node=>node.value)}`, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, project := range session.projects {
		source := project.program.GetSourceFile(id)
		if source == nil || project.callableCache == nil {
			continue
		}
		var array, object, call *ast.Node
		walkNode(source.AsNode(), func(n *ast.Node) bool {
			if ast.IsArrayLiteralExpression(n) {
				array = n
			}
			if ast.IsVariableDeclaration(n) && n.Name().Text() == "object" {
				object = n.Initializer()
			}
			if ast.IsCallExpression(n) {
				call = n
			}
			return true
		})
		if array == nil || object == nil || call == nil {
			t.Fatal("missing authored domain inputs")
		}
		found = true
		owner := project.callableCache.owner
		query := newSourceDependencyQuery(call, owner.checker, owner, enclosingCallableNode(call))
		get := sourceGetInputs{operation: call, receiver: sourceValue{node: array}, propertyKey: "*", arrayIndexMay: &sourceArrayIndexMay{owner: query, operation: call, receiver: array}}
		if !query.arrayIndexMayAtGet(&get, array, []string{"*"}, "", accessorAcquire) {
			t.Fatal("actual source index plan refused")
		}
		for _, name := range []string{"normal", "wrong query", "no domain", "wrong operation", "wrong receiver", "nonarray", "named key", "nested element key", "normal receiver", "set"} {
			t.Run(name, func(t *testing.T) {
				local := get
				domain := *get.arrayIndexMay
				local.arrayIndexMay = &domain
				origin, path, mode := array, []string{"*"}, accessorAcquire
				query.dependenciesOnly = true
				switch name {
				case "normal":
					query.dependenciesOnly = false
				case "wrong query":
					domain.owner = nil
				case "no domain":
					local.arrayIndexMay = nil
				case "wrong operation":
					domain.operation = object
				case "wrong receiver":
					domain.receiver = object
				case "nonarray":
					origin = object
					local.receiver.node = object
					domain.receiver = object
				case "named key":
					path = []string{"map"}
				case "nested element key":
					path = []string{"*", "value"}
				case "normal receiver":
					local.receiver.normal = &sourceNormalValue{}
				case "set":
					mode = accessorSet
				}
				if query.arrayIndexMayAtGet(&local, origin, path, "", mode) {
					t.Fatal("invalid domain accepted")
				}
			})
		}
		query.dependenciesOnly = true
		prepared, _ := query.prepareInvocation(call, nil)
		part := accessorCandidates{}
		query.nativeCallbackInputEffects(call, nil, prepared, &part)
		if len(part.values)+len(part.normalCalls)+len(part.nativeCalls)+len(part.fieldCalls)+len(part.callOutcomes)+len(part.accessorMutations)+len(part.nativeDescriptorEffects)+len(part.ownSlots) != 0 || part.invocationOwned || part.replacedInvocation {
			t.Fatalf("MAY input plan issued execution/output authority: %#v", part)
		}
		if query.inputs != nil || query.creators != nil {
			t.Fatal("callback input context leaked")
		}
	}
	if !found {
		t.Fatal("missing current Program")
	}
	for _, key := range []string{"0", "1", "4294967294"} {
		if !sourceGetKeyMayMatch(key, "*", true) {
			t.Fatal("canonical index refused", key)
		}
	}
	for _, key := range []string{"-1", "01", "1.0", "4294967295", "length", "value"} {
		if sourceGetKeyMayMatch(key, "*", true) || sourceGetKeyMayMatch("0", "*", false) {
			t.Fatal("named or unowned key admitted", key)
		}
	}
}

// Refusal and normal mode cannot turn a missing source projection into Throw.
// Each request starts with a real selected library Call and original inputs.
func TestNativeMapArgumentProjectionRefusals(t *testing.T) {
	const id = "/virtual/map-argument-refusal.ts"
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: `const array=['safe'];const args={get callback():(node:string)=>string{throw 9}};export function work(){return array.map(args.callback)}`, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		source := project.program.GetSourceFile(id)
		if source == nil || project.callableCache == nil {
			continue
		}
		var call, getter *ast.Node
		walkNode(source.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) {
				call = n
			}
			if ast.IsGetAccessorDeclaration(n) {
				getter = n
			}
			return true
		})
		if call == nil || getter == nil {
			t.Fatal("missing original inputs")
		}
		checked = true
		owner := project.callableCache.owner
		for _, name := range []string{"selected", "unentered", "normal", "advisory gauge"} {
			t.Run(name, func(t *testing.T) {
				query := newSourceDependencyQuery(call, owner.checker, owner, enclosingCallableNode(call))
				signature := owner.checker.GetResolvedSignature(call)
				if signature == nil || signature.Declaration() == nil {
					t.Fatal("missing selected signature")
				}
				part := accessorCandidates{}
				var inputs *sourceValueInputs
				query.withActiveInvocation(call, func() { inputs = query.bindInputs(signature.Declaration(), call, nil, &part) })
				symbol := owner.checker.GetSymbolAtLocation(signature.Declaration().Parameters()[0].Name())
				if symbol == nil {
					t.Fatal("missing callback slot")
				}
				switch name {
				case "unentered":
					query.active[getter] = true
				case "normal":
					query.dependenciesOnly = false
				case "advisory gauge":
					query.remaining = 0
				}
				var acquired accessorCandidates
				abrupt := false
				query.withActiveInvocation(call, func() {
					acquired, abrupt = query.acquireNativeCallbackArgument(call, call.AsCallExpression().Arguments.Nodes[0], inputs.bindings[ast.GetSymbolId(symbol)], nil)
				})
				if abrupt != (name == "selected" || name == "advisory gauge") {
					t.Fatalf("assessed abrupt=%v: %#v", abrupt, acquired)
				}
				if len(acquired.normalCalls)+len(acquired.nativeCalls) != 0 {
					t.Fatal("source argument granted normal outputs")
				}
			})
		}
	}
	if !checked {
		t.Fatal("missing Program")
	}
}

// Map checks callback callability before indexed Gets. A source category can
// exclude an impossible callback without proving invocation or result values.
func TestNativeMapCallbackCallabilityPhases(t *testing.T) {
	for _, test := range []struct {
		name, callback  string
		browser, throws bool
	}{
		{"undefined", `const cb=undefined as unknown as (value:{value:string})=>string;`, false, true},
		{"number", `const cb=0 as unknown as (value:{value:string})=>string;`, false, true},
		{"object", `const cb={} as unknown as (value:{value:string})=>string;`, false, true},
		{"known callable", `const cb=(value:{value:string})=>value.value;`, true, false},
		{"unknown callable", `declare const cb:(value:{value:string})=>string;`, true, false},
		{"mixed callback", `declare const flag:boolean;const cb=flag?(undefined as unknown as (value:{value:string})=>string):((value:{value:string})=>value.value);`, true, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `const input:{value:string}[]=[];input.length=1;Object.defineProperty(input,'0',{get(){document.title;return {value:'safe'}},configurable:true});` + test.callback + `export function work(){return input.map(cb)}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/map-callback-category.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal("invalid emitted source", response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "work")
			browser, unknown := false, false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if browser != test.browser || !unknown {
				t.Errorf("browser=%v unknown=%v: %#v", browser, unknown, summary.EffectSources)
			}
			gets := 0
			if !test.throws {
				gets = 1
			}
			sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');const mixed=process.argv[4]==='true';for(const flag of(mixed?[false,true]:[false])){let gets=0;const sandbox={exports:{},flag,cb:value=>value.value,document:{get title(){gets++;return 'browser'}}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);let thrown=false;try{const result=sandbox.exports.work();if(result.join(',')!=='safe')throw Error('wrong result')}catch(error){if(error.name!=='TypeError')throw error;thrown=true}const expected=mixed?flag:process.argv[2]==='true';if(thrown!==expected||gets!==(expected?0:Number(process.argv[3])))throw Error(JSON.stringify({flag,thrown,gets}));}`, fmt.Sprint(test.throws), fmt.Sprint(gets), fmt.Sprint(test.name == "mixed callback"))
		})
	}
}

// Native map reads length before checking callback callability. A borrowed
// library method cannot hide that independent source Get behind the callback.
func TestNativeMapNoncallableLengthOrder(t *testing.T) {
	source := `const input={map:Array.prototype.map,get length(){document.title;return 1},0:{value:'safe'}};const cb=undefined as unknown as (value:{value:string})=>string;export function work(){return input.map(cb)}`
	response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/map-length-order.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal("invalid emitted source", response.Error, response.Diagnostics)
	}
	summary := executableSummary(t, response, "work")
	browser := false
	for _, effect := range summary.EffectSources {
		browser = browser || effect.Environment == "browser"
	}
	if !browser {
		t.Errorf("length Get donor lost: %#v", summary.EffectSources)
	}
	sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');let gets=0;const sandbox={exports:{},document:{get title(){gets++;return 'browser'}}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);let thrown=false;try{sandbox.exports.work()}catch(error){if(error.name!=='TypeError')throw error;thrown=true}if(!thrown||gets!==1)throw Error(JSON.stringify({thrown,gets}));`)
}

// A noncallable result cannot erase the original argument Get's own effect.
// Its actual source body and the later index getter are separate donor owners.
func TestNativeMapNoncallableKeepsArgumentGet(t *testing.T) {
	const id = "/virtual/map-noncallable-argument.ts"
	source := `const input:{value:string}[]=[];input.length=1;Object.defineProperty(input,'0',{get(){document.title;return {value:'safe'}},configurable:true});const args={get callback(){document.title;return undefined as unknown as (node:{value:string})=>string}};export function work(){return input.map(args.callback)}`
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: id, Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
		t.Fatal("invalid emitted source", response.Error, response.Diagnostics)
	}
	summary := executableSummary(t, response, "work")
	browser := false
	for _, effect := range summary.EffectSources {
		browser = browser || effect.Environment == "browser"
	}
	if !browser {
		t.Fatal("argument Get effect lost", summary.EffectSources)
	}
	checked := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil || project.callableCache == nil {
			continue
		}
		var call, argumentGetter, indexGetter *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsPropertyAccessExpression(n.Expression()) && n.Expression().AsPropertyAccessExpression().Name().Text() == "map" {
				call = n
			}
			if ast.IsGetAccessorDeclaration(n) {
				argumentGetter = n
			}
			if ast.IsMethodDeclaration(n) && n.Name().Text() == "get" {
				indexGetter = n
			}
			return true
		})
		if call == nil || argumentGetter == nil || indexGetter == nil {
			t.Fatal("missing source owners")
		}
		owner := project.callableCache.owner
		query := newSourceDependencyQuery(call, owner.checker, owner, enclosingCallableNode(call))
		prepared, _ := query.prepareInvocation(call, nil)
		part := accessorCandidates{}
		query.nativeCallbackInputEffects(call, nil, prepared, &part)
		argument, index := false, false
		for _, effect := range part.effects {
			argument = argument || effect.declaration == argumentGetter
			index = index || effect.declaration == indexGetter
		}
		if !argument || index {
			t.Fatalf("argument=%v index=%v", argument, index)
		}
		checked = true
	}
	if !checked {
		t.Fatal("missing Program")
	}
	sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');let gets=0;const sandbox={exports:{},document:{get title(){gets++;return 'browser'}}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);let thrown=false;try{sandbox.exports.work()}catch(error){if(error.name!=='TypeError')throw error;thrown=true}if(!thrown||gets!==1)throw Error(JSON.stringify({thrown,gets}));`)
}

// Protocol-defined top-level arguments bypass local native-branch defaults.
// Generic callback edges retain their existing default donor because complete
// actual-native slot identity is unavailable. Node protects actual Get counts,
// while undefined elements and nested/rest patterns keep separate behavior.
func TestNativeMapCallbackInputPresence(t *testing.T) {
	for _, test := range []struct {
		name, declarations, input, callback, want string
		browser                                   bool
		gets                                      int
	}{
		{"supplied index residual", ``, `[{value:'safe'}]`, `(value,index=(document.title,0))=>value.value`, "safe", true, 0},
		{"supplied array residual", ``, `[{value:'safe'}]`, `(value,index,array:{value:string}[]=(document.title,[]))=>value.value`, "safe", true, 0},
		{"undefined element", ``, `([undefined] as ({value:string}|undefined)[])`, `(value={value:(document.title,'safe')})=>value.value`, "safe", true, 1},
		{"unknown element", `declare const foreign:{value:string}|undefined;`, `[foreign]`, `(value={value:(document.title,'safe')})=>value.value`, "safe", true, 1},
		{"captured element default", `const fallback={get value(){return document.title}};`, `([undefined] as ({value:string}|undefined)[])`, `(value=fallback)=>value.value`, "browser", true, 1},
		{"nested index pattern", ``, `[{value:'safe'}]`, `(value,{missing=(document.title,0)}:any={})=>value.value`, "safe", true, 1},
		{"rest index conservative", ``, `[{value:'safe'}]`, `(value,...[index=(document.title,0)])=>value.value`, "safe", true, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := test.declarations + `const input=` + test.input + `;export function work(){return input.map(` + test.callback + `)}`
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/map-presence.ts", Source: source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal("invalid emitted source", response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "work")
			browser := false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != test.browser {
				t.Errorf("browser=%v: %#v", browser, summary.EffectSources)
			}
			sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');let gets=0;const sandbox={exports:{},foreign:undefined,document:{get title(){gets++;return 'browser'}}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);const result=sandbox.exports.work();if(result.join(',')!==process.argv[2]||gets!==Number(process.argv[3]))throw Error(JSON.stringify({result,gets}));`, test.want, fmt.Sprint(test.gets))
		})
	}
}

// Unmodeled/replaced methods cannot inherit a native callback default waiver.
func TestNativeMapDefaultUnmodeledCallee(t *testing.T) {
	for _, test := range []struct {
		name, source string
		gets         int
		unknown      bool
	}{
		{"foreign method", `const input=[{value:'safe'}];declare const externalMap:typeof input.map;input.map=externalMap;export function work(){return input.map((value,index=(document.title,0))=>value.value)}`, 0, true},
		{"authored replacement", `const input={map(cb:(value:{value:string},index?:number)=>string){return [cb({value:'safe'})]}} as unknown as {value:string}[];export function work(){return input.map((value,index=(document.title,0))=>value.value)}`, 1, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/map-default-callee.ts", Source: test.source, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal("invalid emitted source", response.Error, response.Diagnostics)
			}
			summary := executableSummary(t, response, "work")
			browser, unknown := false, false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if !browser || test.unknown && !unknown {
				t.Errorf("browser=%v unknown=%v: %#v", browser, unknown, summary.EffectSources)
			}
			sourceNodeScript(t, response.Code, `const fs=require('node:fs'),vm=require('node:vm');let gets=0;const sandbox={exports:{},externalMap:function(...args){return Array.prototype.map.apply(this,args)},document:{get title(){gets++;return 'browser'}}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);const result=sandbox.exports.work();if(result.join(',')!=='safe'||gets!==Number(process.argv[2]))throw Error(JSON.stringify({result,gets}));`, fmt.Sprint(test.gets))
		})
	}
}

// The shared binder accounts only protocol-defined top-level presence. Unknown
// payloads stay unknown and explicit element undefined still activates defaults.
func TestNativeMapLocalDefinedInputDomain(t *testing.T) {
	const id = "/virtual/map-defined-inputs.ts"
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: id, Source: `const input:({value:string}|undefined)[]=[undefined];export function work(){return input.map((value={value:document.title},index=(document.title,0),array:({value:string}|undefined)[]=(document.title,[]))=>value.value)}`, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, project := range session.projects {
		file := project.program.GetSourceFile(id)
		if file == nil || project.callableCache == nil {
			continue
		}
		var call, body *ast.Node
		walkNode(file.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) {
				call = n
			}
			if ast.IsArrowFunction(n) {
				body = n
			}
			return true
		})
		if call == nil || body == nil || len(body.Parameters()) != 3 {
			t.Fatal("missing actual inputs")
		}
		owner := project.callableCache.owner
		query := newSourceDependencyQuery(call, owner.checker, owner, enclosingCallableNode(call))
		inputs := &sourceValueInputs{declaration: body, invocation: call, bindings: make(sourceValueBindings), defaults: make(map[*ast.Node]sourceDefaultInput)}
		part := accessorCandidates{}
		query.installParameterInput(body.Parameters()[0], []sourceValue{{undefined: true}}, inputs, &part)
		for _, parameter := range body.Parameters()[1:] {
			query.bindDefinedParameterInput(parameter, []sourceValue{{}}, inputs, &part)
			if inputs.defaults[parameter.Initializer()].bindings != nil {
				t.Fatal("protocol argument activated top-level default")
			}
			symbol := owner.checker.GetSymbolAtLocation(parameter.Name())
			values := inputs.bindings[ast.GetSymbolId(symbol)]
			if len(values) != 1 || values[0].node != nil || values[0].undefined || values[0].normal != nil || values[0].acquired != nil {
				t.Fatal("presence fabricated DATA", values)
			}
		}
		if inputs.defaults[body.Parameters()[0].Initializer()].bindings == nil {
			t.Fatal("undefined element default bypassed")
		}
		if inputs.operationLifetime != nil || inputs.population != nil || inputs.fulfilled != nil || len(inputs.operations) != 0 || len(part.normalCalls)+len(part.nativeCalls) != 0 {
			t.Fatal("source presence issued normal authority")
		}
		found = true
	}
	if !found {
		t.Fatal("missing current Program")
	}
}
