package exactcompiler

import (
	"crypto/sha256"
	"encoding/json"
	"testing"
)

// Literal containers carry the same finite origins regardless of how many
// acquired slices the interference worklist needs. Foreign routes remain opaque.
func TestInterferenceContainerWorklist(t *testing.T) {
	for _, row := range []struct {
		name, setup, argument string
		unknown               bool
	}{
		{"direct", "", "box", true},
		{"nested", "", "{nested:{box}}", true},
		{"successive operands", "", "[], {nested:{box}}", true},
		{"multiple origins", "declare const flag:boolean;", "{first:flag?box:{},second:box}", true},
		{"shared container", "const nested={box};", "{first:nested,second:nested}", true},
		{"disjoint", "", "{nested:{other:{}}}", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare function foreign(...input:unknown[]):void;function box(){}box.field='safe';` + row.setup + `foreign(` + row.argument + `);export const value=box.field;`
			_, _, summary := currentProxyCaller(t, source, "export const value")
			unknown := false
			for _, effect := range summary.EffectSources {
				unknown = unknown || effect.Environment == "unknown"
			}
			if unknown != row.unknown {
				t.Fatal("container route lost or invented", summary.EffectSources)
			}
		})
	}
}

// The compiler must preserve the original container and callback order through
// emitted code. The callback can mutate a receiver reached through either alias.
func TestInterferenceContainerWorklistEmitted(t *testing.T) {
	const source = `export function run(){const trace:string[]=[];const box={get field(){trace.push('get');return 'safe'}};const nested={box};function inspect(input:{first:{box:typeof box},second:{box:typeof box}}){trace.push(input.first===input.second?'shared':'different');Object.defineProperty(input.second.box,'field',{get(){trace.push('changed');return 'next'}})}inspect({first:nested,second:nested});trace.push(box.field);return trace}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/interference-container.ts", Source: source, Target: target, Diagnostics: "semantic"})
			if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
				t.Fatal(r.Error, r.Diagnostics)
			}
			sourceNodeScript(t, r.Code, `const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),out={};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),{exports:out});assert.deepEqual(Array.from(out.run()),['shared','changed','next']);`)
		})
	}
}

// BenchmarkInterferenceContainerTraversal includes complete source analysis, with
// an optional trace-array write. Owner-local profiles distinguish worklist copies
// from the larger checker and session allocations included in these totals.
func BenchmarkInterferenceContainerTraversal(b *testing.B) {
	for _, trace := range []bool{false, true} {
		name, prefix, event := "plain", "", ""
		if trace {
			name = "trace"
			prefix = "const trace:string[]=[];"
			event = "trace.push('put');"
		}
		b.Run(name, func(b *testing.B) {
			source := prefix + `declare function foreign(value:object):void;const box={field:{value:'safe'}};function put(){` + event + `box.field={get value(){return document.title}}}foreign(box);put();export const value=box.field.value;`
			request := Request{Kind: "analyze", ID: "/virtual/lane-b-interference.ts", Source: source, Diagnostics: "semantic"}
			run := func() Response {
				r := NewSession().Execute(request)
				if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
					b.Fatal(r.Error, r.Diagnostics)
				}
				return r
			}
			response := run()
			data, err := json.Marshal(response.Analysis)
			if err != nil {
				b.Fatal(err)
			}
			b.Logf("source=%x analysis=%x", sha256.Sum256([]byte(source)), sha256.Sum256(data))
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				run()
			}
		})
	}
}
