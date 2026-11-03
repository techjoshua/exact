package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Conditional entry selection must reach the existing algorithm consumer while
// retaining independent unknown and withholding successful output authority.
func TestSourceNativePolicyConsumers(t *testing.T) {
	for _, row := range []struct {
		name, source string
		kind         sourceNativeKind
	}{
		{"static promise", `export function invoke(){return Promise.resolve({get then(){document.title;return undefined}})}`, sourceNativePromiseResolve},
		{"static descriptor", `export function invoke(){return Object.defineProperty({},'value',{get(){return document.title}})}`, sourceNativeObjectDefineProperty},
		{"reflect descriptor", `export function invoke(){return Reflect.defineProperty({},'value',{value:1})}`, sourceNativeReflectDefineProperty},
		{"prototype mutation", `const xs:number[]=[];export function invoke(){xs.push(1)}`, sourceNativeArrayPush},
		{"saved borrowed mutation", `const xs:number[]=[];const saved=xs.push;export function invoke(){saved.call(xs,1)}`, sourceNativeArrayPush},
		{"saved apply mutation", `const xs:number[]=[];const saved=xs.push;export function invoke(){saved.apply(xs,[1])}`, sourceNativeArrayPush},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(q *sourceValueQuery, call *ast.Node) {
				view := q.receiverWriteCandidates(call, nil)
				found := false
				for _, value := range view.candidates.values {
					found = found || value.native != nil && value.native.kind == row.kind
				}
				// Borrowed calls select the adapter property. Its existing routing
				// relation retains the independently acquired standard target.
				for _, body := range view.candidates.ordinaryBodies {
					found = found || body.nativeTarget != nil && body.nativeTarget.native != nil && body.nativeTarget.native.kind == row.kind
				}
				if !found {
					t.Fatal("selected standard alternative missing")
				}
				result := q.invocation(call, nil)
				switch row.kind {
				case sourceNativeArrayPush:
					if len(result.writes) == 0 {
						t.Fatal("missing mutation consumer")
					}
				case sourceNativePromiseResolve:
					if len(result.nativeCalls) == 0 {
						t.Fatal("missing assimilation consumer")
					}
				default:
					if len(result.reflective) == 0 {
						t.Fatal("missing descriptor consumer")
					}
				}
			})
		})
	}
}

// Names and structural declarations do not establish a runtime standard entry.
func TestSourceNativePolicyNonbuiltinControls(t *testing.T) {
	for _, source := range []string{
		`const Promise={resolve(value:unknown){return value}};export function invoke(){return Promise.resolve(1)}`,
		`const Object={freeze(value:unknown){return value}};export function invoke(){return Object.freeze(1)}`,
		`export function invoke(input:{resolve:typeof Promise.resolve}){return input.resolve(1)}`,
		`class Custom{push(value:number){return value}}const xs=new Custom();export function invoke(){return xs.push(1)}`,
	} {
		withSourceCalleeWriteQuery(t, source, func(q *sourceValueQuery, call *ast.Node) {
			view := q.receiverWriteCandidates(call, nil)
			for _, value := range view.candidates.values {
				if value.native != nil {
					t.Fatal("authored or type-only input acquired standard identity")
				}
			}
		})
	}
}

const nativePolicyProtocolSource = `export async function run(){
 const seen:(string|number)[]=[];
 const xs=[1,2];
 const saved=xs.push;
 xs.push=function own(value){seen.push('own');return value};
 saved.call(xs,3);
 const mapped=xs.map(value=>{seen.push(value);return String(value).toUpperCase()});
 const input={get then(){seen.push('then');return undefined}};
 const resolved=await Promise.resolve(input);
 const target:{readonly value?:string}={};
 Object.defineProperty(target,'value',{get(){seen.push('get');return mapped.join(',')}});
 const value=target.value;
 const own=xs.push(9);
 return [value,own,resolved===input,seen];
}`

const nativePolicyProtocolRunner = `const assert=require('node:assert/strict');const m=require(process.argv[1]);m.run().then(value=>assert.deepEqual(value,['1,2,3',9,true,[1,2,3,'then','get','own']])).catch(error=>{console.error(error);process.exitCode=1});`

// Emission must preserve callbacks, primitive operations, assimilation and getters
// across saved/fresh acquisition. Native consumer tests above independently check
// that represented operations reach analysis rather than merely printing intact.
func TestSourceNativePolicyEmittedProtocols(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/native-policy-protocols.ts", Source: nativePolicyProtocolSource, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, nativePolicyProtocolRunner)
		})
	}
}

// Native target routing must retain actual argument Gets, own adapter overrides,
// and authored alternatives beside the standard operation. No declaration-only
// recognition or native MAY mutation may erase their environment requirements.
func TestSourceNativePolicyBorrowedEffects(t *testing.T) {
	for _, row := range []struct {
		name, source string
		unknown      bool
	}{
		{"call argument Get", `const xs:number[]=[];const saved=xs.push;export function invoke(){return saved.call(xs,({get value(){document.title;return 1}}).value)}`, false},
		{"apply vector Get", `const xs:number[]=[];const saved=xs.push;const args:[number]=[1];Object.defineProperty(args,'0',{get(){document.title;return 1}});export function invoke(){return saved.apply(xs,args)}`, false},
		{"own call", `const xs:number[]=[];const saved=xs.push;saved.call=((_receiver:number[],_value:number)=>{document.title;return 0}) as typeof saved.call;export function invoke(){return saved.call(xs,1)}`, false},
		{"mixed targets", `const xs:number[]=[];const saved=xs.push;declare const choose:boolean;const selected=choose?saved:(...values:number[])=>{document.title;return 0};export function invoke(){return selected.call(xs,1)}`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/native-policy-borrowed.ts", Source: row.source, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
				t.Fatal(r.Error, r.Diagnostics)
			}
			fact := findCallable(t, r.Analysis.Callables, "invoke")
			browser, unknown := false, false
			for _, effect := range fact.EffectSources {
				browser = browser || effect.Environment == "browser"
				unknown = unknown || effect.Environment == "unknown"
			}
			if !browser || row.unknown && !unknown {
				t.Fatal("borrowed target lost authored donor or independent uncertainty", fact.EffectSources)
			}
		})
	}
}
