package exactcompiler

import (
	"strings"
	"testing"
)

// Leaf and enclosing-pattern defaults share the existing qualified input. A
// pattern name must not hide the owned leaves that receive its default payload.
func TestPolicyNestedBindingDefaultContainment(t *testing.T) {
	for _, shape := range []struct{ name, inputType, binding string }{
		{"array leaf", "string[]", `[value='PRIVATE_SHAPE_PAYLOAD']`},
		{"nested leaf", "{nested:{value?:string}}", `{nested:{value='PRIVATE_SHAPE_PAYLOAD'}}`},
		{"nested pattern", "{nested?:{value?:string}}", `{nested:{value}={value:'PRIVATE_SHAPE_PAYLOAD'}}`},
		{"array pattern", "Array<{value?:string}|undefined>", `[{value}={value:'PRIVATE_SHAPE_PAYLOAD'}]`},
	} {
		t.Run(shape.name, func(t *testing.T) {
			source := func(protected, disclose, retained bool) string {
				annotation, creation, disclosure := "", "", ""
				if protected {
					annotation = "/** @exact keep=secret */ "
				}
				if retained {
					creation = `static{console.log('public creation')}`
				}
				if disclose {
					disclosure = `console.log(value);`
				}
				return `export {};const record={label:'public',factory:class{` + creation + `constructor(` + annotation + `input:` + shape.inputType + `){const ` + shape.binding + `=input;` + disclosure + `}}};export function work(){return record.label;}`
			}
			for _, protected := range []bool{false, true} {
				r := NewSession().Execute(Request{Kind: "compile", ID: "nested-binding-ownership.ts", Target: TargetServer, SourceMap: true, Source: source(protected, true, false)})
				owned := false
				for _, subject := range r.Analysis.Policy.Subjects {
					owned = owned || subject.Kind == "declaration" && subject.Name == "value" && subject.Policy.Secret
				}
				if r.Error != "" || owned != protected || hasDiagnosticCode(r.Diagnostics, "EXACT3020") != protected {
					t.Fatalf("ownership protected=%v: error=%s owned=%v diagnostics=%#v", protected, r.Error, owned, r.Diagnostics)
				}
				if protected && (r.Code != "" || r.SourceMap != nil) {
					t.Fatal("secret leaf disclosure returned an artifact")
				}
			}
			for _, retained := range []bool{false, true} {
				name := "private/pruned"
				if retained {
					name = "private/retained"
				}
				t.Run(name, func(t *testing.T) {
					r := NewSession().Execute(Request{Kind: "compile", ID: "nested-binding-private.ts", Target: TargetClient, SourceMap: true, Source: source(true, false, retained)})
					if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT2101") || hasDiagnosticCode(r.Diagnostics, "EXACT3020") {
						t.Fatalf("artifact contract not isolated: %s %#v", r.Error, r.Diagnostics)
					}
					if retained {
						if !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
							t.Fatalf("retained default delivered: %#v code=%v payload=%v map=%v", r.Diagnostics, r.Code != "", strings.Contains(r.Code, "PRIVATE_SHAPE_PAYLOAD"), r.SourceMap != nil)
						}
					} else if hasErrorDiagnostic(r.Diagnostics) || strings.Contains(r.Code, "PRIVATE_SHAPE_PAYLOAD") || r.SourceMap != nil && len(r.SourceMap.SourcesContent) != 0 {
						t.Fatalf("private default survived pruning: %#v payload=%v map=%#v", r.Diagnostics, strings.Contains(r.Code, "PRIVATE_SHAPE_PAYLOAD"), r.SourceMap)
					}
				})
				t.Run(strings.Replace(name, "private/", "public/", 1), func(t *testing.T) {
					r := NewSession().Execute(Request{Kind: "compile", ID: "nested-binding-public.ts", Target: TargetClient, SourceMap: true, Source: source(false, false, retained)})
					if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
						t.Fatalf("public default rejected: %s %#v", r.Error, r.Diagnostics)
					}
					expected := `[]`
					if retained {
						expected = `["public creation"]`
					}
					sourceNodeScript(t, r.Code, `const fs=require('node:fs'),vm=require('node:vm');const logs=[];const sandbox={exports:{},console:{log:v=>logs.push(v)}};vm.runInNewContext('(function(exports){'+fs.readFileSync(process.argv[1],'utf8')+'\n})(exports)',sandbox);if(sandbox.exports.work()!=='public'||sandbox.exports.work()!=='public'||JSON.stringify(logs)!=='`+expected+`')throw Error(JSON.stringify(logs));`)
				})
			}
		})
	}
}
