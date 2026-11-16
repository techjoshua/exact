package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Classification uses actual source/checker declarations and the existing write
// inventory. No declaration supplied here represents a known runtime body.
func TestSourceOpaqueDeclarationCallOriginalSource(t *testing.T) {
	for _, row := range []struct {
		name, source string
		want         bool
	}{
		{"ambient lexical", `declare function opaque():void;export function invoke(){return opaque()}`, true},
		{"explicit pure", `/** @exact pure */ declare function foreign():void;export function invoke(){return foreign()}`, false},
		{"explicit client", `/** @exact client */ declare function foreign():void;export function invoke(){return foreign()}`, false},
		{"explicit server", `/** @exact server */ declare function foreign():void;export function invoke(){return foreign()}`, false},
		{"ambient overloads", `declare function opaque():void;declare function opaque(value?:string):void;export function invoke(){return opaque()}`, true},
		{"local implementation", `function opaque(){window.name}export function invoke(){return opaque()}`, false},
		{"implemented overloads", `function opaque():void;function opaque(){window.name}export function invoke(){return opaque()}`, false},
		{"ambient variable", `declare const opaque:()=>void;export function invoke(){return opaque()}`, false},
		{"parameter", `export function invoke(opaque:()=>void){return opaque()}`, false},
		{"value alias", `declare function opaque():void;const alias=opaque;export function invoke(){return alias()}`, false},
		{"namespace alias", `declare namespace ns{function opaque():void}import alias=ns.opaque;export function invoke(){return alias()}`, false},
		{"namespace property", `declare namespace ns{function opaque():void}export function invoke(){return ns.opaque()}`, false},
		{"merged namespace", `declare function opaque():void;declare namespace opaque{const member:number}export function invoke(){return opaque()}`, false},
		{"argument", `declare function opaque(value?:number):void;export function invoke(){return opaque(1)}`, false},
		{"spread", `declare function opaque(...values:number[]):void;export function invoke(values:number[]){return opaque(...values)}`, false},
		{"call member", `declare function opaque():void;export function invoke(){return opaque.call(null)}`, false},
		{"bind member", `declare function opaque():void;export function invoke(){return opaque.bind(null)}`, false},
		{"optional", `declare function opaque():void;export function invoke(){return opaque?.()}`, false},
		{"library declaration", `export function invoke(){return Math.random()}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withSourceCalleeWriteQuery(t, row.source, func(query *sourceValueQuery, call *ast.Node) {
				if got := sourceOpaqueDeclarationCall(call, query.executable); got != row.want {
					t.Fatalf("opaque declaration call=%t want=%t", got, row.want)
				}
				if sourceOpaqueDeclarationCall(nil, query.executable) || sourceOpaqueDeclarationCall(call, nil) {
					t.Fatal("missing original operation/owner supplied classification")
				}
			})
		})
	}
}
