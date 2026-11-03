package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
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
		{"alias", `const xs:number[]=[];const alias=xs;export function invoke(){alias.push(1)}`, true, ""},
		{"shadow", `const Array={prototype:{push(){return 9}}};const xs:number[]=[];export function invoke(){xs.push(1)}`, true, ""},
		{"object", `const xs={push(value:number){return value}};export function invoke(){xs.push(1)}`, false, "push"},
		{"class", `class Rows{push(value:number){return value}}const xs=new Rows();export function invoke(){xs.push(1)}`, false, "push"},
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
