package exactcompiler

import (
	"fmt"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

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
			case "alias", "current element write", "argument receiver rebind", "argument element write", "undefined default", "sparse inherited getter":
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
