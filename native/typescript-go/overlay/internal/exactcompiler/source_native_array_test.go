package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// Runtime identity comes from the source array and selected declaration together.
// Structural signatures and custom implementations cannot grant that identity.
// Existing unsupported class origins may retain unknown instead of a body.
func TestSourceNativeArrayPushSelection(t *testing.T) {
	for _, row := range []struct {
		name, source string
		native       bool
		authored     string
	}{
		{"literal", `const xs:number[]=[];export function invoke(){xs.push(1)}`, true, ""},
		{"captured queue", `export function collect(input:number){const pending:number[]=[]; function invoke(value:number){pending.push(value)} invoke(input); let total=0; for(let i=0;i<pending.length;i++){const value=pending[i];total+=value} return total}`, true, ""},
		{"alias", `const xs:number[]=[];const alias=xs;export function invoke(){alias.push(1)}`, true, ""},
		{"shadow", `const Array={prototype:{push(){return 9}}};const xs:number[]=[];export function invoke(){xs.push(1)}`, true, ""},
		{"object", `const xs={push(value:number){return value}};export function invoke(){xs.push(1)}`, false, "push"},
		{"class", `class Rows{push(value:number){return value}}const xs=new Rows();export function invoke(){xs.push(1)}`, false, "push"},
		{"mixed", `declare const choose:boolean;const values:number[]=[];const xs=choose?values:{push(value:number){document.title;return value}};export function invoke(){xs.push(1)}`, true, "push"},
		{"asserted unknown", `export function invoke(input:unknown){const xs=input as number[];xs.push(1)}`, false, ""},
		{"typed input", `export function invoke(xs:number[]){xs.push(1)}`, false, ""},
		{"override", `class Rows extends Array<number>{push(...values:number[]){return 9}}const xs=new Rows();export function invoke(){xs.push(1)}`, false, "push"},
		{"own replacement", `const xs:number[]=[];xs.push=function custom(...values:number[]){return 9};export function invoke(){xs.push(1)}`, true, "custom"},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(q *sourceValueQuery, call *ast.Node) {
				view := q.receiverWriteCandidates(call, nil)
				native, authored := false, false
				for _, value := range view.candidates.values {
					if value.native != nil && value.native.kind == sourceNativeArrayPush {
						native = true
						if value.native.acquired == nil || value.normal != nil || value.acquired != nil {
							t.Fatal("identity manufactured output authority")
						}
					}
					if value.node != nil && ast.IsFunctionLike(value.node) && value.node.Body() != nil && callableNameText(value.node.Name()) == row.authored {
						authored = true
					}
				}
				if native != row.native {
					t.Fatalf("native push = %v, want %v", native, row.native)
				}
				if row.authored != "" && !authored && !view.unknown {
					t.Fatal("lost authored alternative", row.authored)
				}
			})
		})
	}
}

const nativeArrayPushOrderSource = `export function run(fail=false){const xs:number[]=[];const alias=xs;let effects=0;function argument(){effects++;if(fail)throw 'stop';return 2}const saved=alias.push;alias.push=function custom(...values:number[]){effects+=10;return 9};try{saved.call(alias,argument());return [xs[0],alias.push(3),effects,xs.length]}catch(error){return [String(error),effects,xs.length]}}
export function generic(){const seen:string[]=[];const input=Object.create({1:'inherited'});input[0]='own';input.length=3;Array.prototype.forEach.call(input,(value:string)=>seen.push(value));let brand=false;try{Map.prototype.get.call({},'key')}catch(error){brand=error instanceof TypeError}return [seen.join(','),brand]}`

const nativeArrayPushOrderRunner = `const assert=require('node:assert/strict');const m=require(process.argv[1]);assert.deepEqual(m.run(),[2,9,11,1]);assert.deepEqual(m.run(true),['stop',1,0]);assert.deepEqual(m.generic(),['own,inherited',true]);`

// Original Call routing owns saved identity, receiver, argument effects and Throw.
// Paired targets also retain generic receiver semantics and branded rejection.
func TestSourceNativeArrayPushEmittedOrder(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/native-array-push.ts", Source: nativeArrayPushOrderSource, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, nativeArrayPushOrderRunner)
		})
	}
}

// Identity must reach the actual source-write consumer, with no Promise receipt
// or normal output. Runtime JavaScript behavior alone cannot establish this path.
func TestSourceNativeArrayPushConsumer(t *testing.T) {
	for _, source := range []string{
		`const xs:number[]=[];export function invoke(){xs.push(1)}`,
		`const xs:number[]=[];const alias=xs;export function invoke(){alias.push(1)}`,
	} {
		withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
			result := q.invocation(call, nil)
			if !result.invocationOwned || len(result.writes) == 0 {
				t.Fatal("standard push identity did not reach mutation consumer")
			}
			if !result.valueIncomplete || !result.opaque || len(result.nativeCalls) != 0 || len(result.normalCalls) != 0 {
				t.Fatal("mutation summary granted result or completion authority")
			}
			for _, write := range result.writes {
				if write.value.node == nil || !ast.IsArrayLiteralExpression(write.value.node) || write.operation != stateEffectOperation("array-mutation") {
					t.Fatal("mutation lost actual source receiver")
				}
			}
		})
	}
}

// Early standard selection cannot turn a pending own writer into a missing donor.
func TestSourceNativeArrayPushPendingOwnWriter(t *testing.T) {
	const source = `function install(xs:number[]){xs.push=function custom(...values:number[]){document.title;return 0}}const xs:number[]=[];install(xs);export function invoke(){return xs.push(1)}`
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/push-own-writer.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	var caller *CallableSummary
	for i := range response.Analysis.Callables {
		if response.Analysis.Callables[i].Name == "invoke" {
			caller = &response.Analysis.Callables[i]
		}
	}
	if caller == nil {
		t.Fatal("missing caller")
	}
	browser, unknown := false, false
	for _, effect := range caller.EffectSources {
		browser = browser || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
	}
	if !browser || !unknown {
		t.Fatal("pending own writer lost browser or uncertainty", caller.EffectSources)
	}
}

// A conditional standard alternative cannot make a browser-writing own method
// eligible for an explicitly server-placed task or emit its conflicting output.
func TestSourceNativeArrayPushOwnWriterServerRejection(t *testing.T) {
	const source = `import{TaskContext}from '@exactjs/core';function install(xs:number[]){xs.push=function custom(...values:number[]){document.title;return 0}}const xs:number[]=[];install(xs);function invoke(){return xs.push(1)}export function Page(){const run=(_task:TaskContext=TaskContext.server())=>invoke();return()=> <button onClick={()=>run()}>Go</button>;}`
	response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/push-own-server.tsx", Target: TargetServer, Source: source})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !hasErrorDiagnostic(response.Diagnostics) || response.Code != "" {
		t.Fatal("conflicting server placement emitted", response.Diagnostics)
	}
	message := ""
	for _, diagnostic := range response.Diagnostics {
		message += diagnostic.Message + "\n"
	}
	if !strings.Contains(message, "browser") || !strings.Contains(message, "server") {
		t.Fatal("rejection did not explain browser/server conflict", response.Diagnostics)
	}
}

// Normal/input member acquisition retains the conditional native donor without
// requiring hypothetical callee preparation or granting normal Get output rights.
func TestSourceNativeArrayPushNormalAcquisition(t *testing.T) {
	for _, row := range []struct {
		source   string
		authored bool
	}{
		{`const xs:number[]=[];export function invoke(){xs.push(1)}`, false},
		{`const xs:number[]=[];xs.push=function custom(...values:number[]){document.title;return 0};export function invoke(){xs.push(1)}`, true},
	} {
		withSourceCalleeWriteQuery(t, row.source, func(q *sourceValueQuery, call *ast.Node) {
			q.dependenciesOnly = false
			candidates := q.receiverCandidates(call, nil)
			native, authored := false, false
			for _, value := range candidates.values {
				native = native || value.native != nil && value.native.kind == sourceNativeArrayPush
				authored = authored || value.node != nil && ast.IsFunctionLike(value.node) && value.node.Body() != nil && callableNameText(value.node.Name()) == "custom"
				if value.normal != nil || value.acquired != nil {
					t.Fatal("conditional donor acquired normal output rights")
				}
			}
			if !native || !candidates.opaque || row.authored && !authored {
				t.Fatal("normal acquisition lost native, uncertainty or own donor", native, candidates.opaque, authored)
			}
			if len(candidates.normalCalls) != 0 || len(candidates.nativeCalls) != 0 || len(candidates.writeOutcomes) != 0 {
				t.Fatal("member selection manufactured operation authority")
			}
		})
	}
}
