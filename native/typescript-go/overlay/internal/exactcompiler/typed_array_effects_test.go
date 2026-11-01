package exactcompiler

import (
	"strings"
	"testing"
)

func TestStandardTypedArrayMemberEffects(t *testing.T) {
	for _, name := range []string{"Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array"} {
		t.Run(name, func(t *testing.T) {
			value := "1"
			if strings.HasPrefix(name, "Big") {
				value = "1n"
			}
			source := `export function Page(){const bytes=new ` + name + `(2);bytes.fill(` + value + `);const part=bytes.subarray(0,1);return()=> <p>{String(part[0])}</p>;}`
			response := NewSession().Execute(Request{ID: "typed-array.tsx", Kind: "analyze", Source: source})
			if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].EnvironmentEffect != "neutral" {
				t.Fatalf("standard member lost portable authority: error=%s, components=%d", response.Error, len(response.Analysis.Components))
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				compiled := NewSession().Execute(Request{ID: "typed-array.tsx", Kind: "compile", Target: target, Source: source})
				if compiled.Error != "" || compiled.Code == "" {
					t.Fatalf("%s: %s", target, compiled.Error)
				}
			}
		})
	}
}

func TestTypedArrayMembersRetainDeclarationAuthority(t *testing.T) {
	for _, test := range []struct{ name, source, placement string }{
		{"shadow", `class Uint8Array{fill(value:number){return window.location.href;}}export function Page(){const bytes=new Uint8Array();const value=bytes.fill(1);return()=> <p>{value}</p>;}`, "client"},
		{"override", `class Bytes extends Uint8Array{fill(value:number){void window.location.href;return this;}}export function Page(){const bytes=new Bytes(2);bytes.fill(1);return()=> <p/>;}`, "client"},
		{"augmentation", `export {};declare global{interface Uint8Array<TArrayBuffer extends ArrayBufferLike=ArrayBufferLike>{custom():number;}}export function Page(){const bytes=new Uint8Array(2);bytes.custom();return()=> <p/>;}`, "unknown"},
		{"unrelated-augmentation", `export {};declare global{interface Uint8Array<TArrayBuffer extends ArrayBufferLike=ArrayBufferLike>{custom():number;}}export function Page(){const bytes=new Uint8Array(2);bytes.fill(1);return()=> <p/>;}`, "isomorphic"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "typed-array-control.tsx", Kind: "analyze", Source: test.source})
			if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != test.placement {
				t.Fatalf("method ownership changed: error=%s, components=%d", response.Error, len(response.Analysis.Components))
			}
		})
	}
}

func TestStandardByteStorageMemberEffects(t *testing.T) {
	for _, test := range []struct{ name, body string }{
		{"buffer", `const storage=new ArrayBuffer(4);const part=storage.slice(0,2);`},
		{"view", `const storage=new ArrayBuffer(4);const view=new DataView(storage);view.setUint8(0,1);const value=view.getUint8(0);`},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "byte-storage.tsx", Kind: "analyze", Source: `export function Page(){` + test.body + `return()=> <p/>;}`})
			if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].EnvironmentEffect != "neutral" {
				t.Fatalf("byte storage lost portable authority: error=%s, components=%d", response.Error, len(response.Analysis.Components))
			}
		})
	}
}
