package exactcompiler

import (
	"strings"
	"testing"
)

func TestStandardFactoryMapperEffects(t *testing.T) {
	for _, factory := range []string{"Array", "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array"} {
		t.Run(factory, func(t *testing.T) {
			for _, test := range []struct{ body, effect string }{
				{`const value=` + factory + `.from([1],()=>window.innerWidth);`, "browser"},
				{`const value=` + factory + `.from([1],()=>Number(process.env.VALUE));`, "server"},
				{`function unused(){return window.innerWidth;}const value=` + factory + `.from({length:0,unused},()=>1,unused);`, "neutral"},
			} {
				t.Run(test.effect, func(t *testing.T) {
					body := test.body
					if strings.HasPrefix(factory, "Big") {
						body = strings.ReplaceAll(body, "()=>window.innerWidth", "()=>BigInt(window.innerWidth)")
						body = strings.ReplaceAll(body, "()=>Number(process.env.VALUE)", "()=>BigInt(Number(process.env.VALUE))")
						body = strings.ReplaceAll(body, "()=>1,unused", "()=>1n,unused")
					}
					response := NewSession().Execute(Request{ID: "factory-mapper.tsx", Kind: "analyze", Source: `export function Page(){` + body + `return()=> <p>{String(value)}</p>;}`})
					if response.Error != "" || len(response.Analysis.Components) != 1 {
						t.Fatalf("invalid analysis: %s", response.Error)
					}
					if response.Analysis.Components[0].EnvironmentEffect != test.effect {
						t.Fatalf("mapper ownership: expected %s, got %s", test.effect, response.Analysis.Components[0].EnvironmentEffect)
					}
				})
			}
		})
	}
}

func TestFactoryMapperReferencesAndLiteralKeys(t *testing.T) {
	for _, body := range []string{
		`function mapper(){return window.innerWidth;}const value=Array.from([1],mapper);`,
		`const value=Array["from"]([1],()=>window.innerWidth);`,
		`function mapper(){return window.innerWidth;}const value=Uint8Array.from([1],mapper);`,
		`const value=Uint8Array["from"]([1],()=>window.innerWidth);`,
	} {
		response := NewSession().Execute(Request{ID: "factory-mapper-reference.tsx", Kind: "analyze", Source: `export function Page(){` + body + `return()=> <p>{String(value)}</p>;}`})
		if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].EnvironmentEffect != "browser" {
			t.Fatalf("mapper reference effects lost: error=%s", response.Error)
		}
	}
}
