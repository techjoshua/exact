package exactcompiler

import (
	"strings"
	"testing"
)

// Assignment defaults keep the qualification already established on a local by
// destructuring the annotated input. No annotation is added to the assignment.
func TestPolicyAssignmentDefaultContainment(t *testing.T) {
	for _, form := range []struct{ name, inputType, binding, assignment string }{
		{"shorthand", "{value?:string}", `let {value}=input;`, `({value='PRIVATE_ASSIGNMENT_PAYLOAD'}=input);`},
		{"renamed", "{field?:string}", `let {field:value}=input;`, `({field:value='PRIVATE_ASSIGNMENT_PAYLOAD'}=input);`},
		{"array", "Array<string|undefined>", `let [value]=input;`, `[value='PRIVATE_ASSIGNMENT_PAYLOAD']=input;`},
	} {
		t.Run(form.name, func(t *testing.T) {
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
				return `export {};const record={label:'public',factory:class{` + creation + `constructor(` + annotation + `input:` + form.inputType + `){` + form.binding + form.assignment + disclosure + `}}};export function work(){return record.label;}`
			}
			for _, protected := range []bool{false, true} {
				for _, assigned := range []bool{false, true} {
					fixture := source(protected, true, false)
					if !assigned {
						fixture = strings.Replace(fixture, form.assignment, "", 1)
					}
					r := NewSession().Execute(Request{Kind: "compile", ID: "assignment-default-ownership.ts", Source: fixture, Target: TargetServer, SourceMap: true})
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
			}
			for _, retained := range []bool{false, true} {
				name := "private/pruned"
				if retained {
					name = "private/retained"
				}
				t.Run(name, func(t *testing.T) {
					r := NewSession().Execute(Request{Kind: "compile", ID: "assignment-default-private.ts", Source: source(true, false, retained), Target: TargetClient, SourceMap: true})
					if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT2101") || hasDiagnosticCode(r.Diagnostics, "EXACT3020") {
						t.Fatalf("artifact contract not isolated: %s %#v", r.Error, r.Diagnostics)
					}
					if retained {
						if !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
							t.Fatalf("assignment default delivered: %#v code=%v payload=%v map=%v", r.Diagnostics, r.Code != "", strings.Contains(r.Code, "PRIVATE_ASSIGNMENT_PAYLOAD"), r.SourceMap != nil)
						}
					} else if hasErrorDiagnostic(r.Diagnostics) || strings.Contains(r.Code, "PRIVATE_ASSIGNMENT_PAYLOAD") || r.SourceMap != nil && len(r.SourceMap.SourcesContent) != 0 {
						t.Fatalf("private assignment default survived pruning: %#v payload=%v", r.Diagnostics, strings.Contains(r.Code, "PRIVATE_ASSIGNMENT_PAYLOAD"))
					}
				})
				t.Run(strings.Replace(name, "private/", "public/", 1), func(t *testing.T) {
					r := NewSession().Execute(Request{Kind: "compile", ID: "assignment-default-public.ts", Source: source(false, false, retained), Target: TargetClient, SourceMap: true})
					if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
						t.Fatalf("public assignment default rejected: %s %#v", r.Error, r.Diagnostics)
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
