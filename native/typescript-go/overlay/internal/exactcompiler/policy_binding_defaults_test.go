package exactcompiler

import (
	"strings"
	"testing"
)

func protectedBindingDefaultSource(local string, protected, disclose bool) string {
	annotation := ""
	if protected {
		annotation = "/** @exact keep=secret */ "
	}
	binding := "value"
	if local != "value" {
		binding += ":" + local
	}
	body := `const {` + binding + `='PRIVATE_BINDING_PAYLOAD'}=input;`
	if disclose {
		body += `console.log(` + local + `);`
	}
	return `export {};const record={label:'public',factory:class{constructor(` + annotation + `input:{value?:string}){` + body + `}}};export function work(){return record.label;}`
}

// The protected identifier parameter already qualifies the destructured local.
// This uses that existing ownership, rather than annotating a new pattern target.
func TestPolicyProtectedBindingDefaultOwnership(t *testing.T) {
	for _, local := range []string{"value", "selected"} {
		for _, protected := range []bool{false, true} {
			r := NewSession().Execute(Request{Kind: "compile", ID: "binding-default-ownership.ts", Target: TargetServer, SourceMap: true,
				Source: protectedBindingDefaultSource(local, protected, true)})
			parameter, binding := false, false
			for _, subject := range r.Analysis.Policy.Subjects {
				parameter = parameter || subject.Kind == "parameter" && subject.Name == "input" && subject.Policy.Secret
				binding = binding || subject.Kind == "declaration" && subject.Name == local && subject.Policy.Secret
			}
			if r.Error != "" || parameter != protected || binding != protected || hasDiagnosticCode(r.Diagnostics, "EXACT3020") != protected {
				t.Fatalf("binding ownership local=%s protected=%v: error=%s parameter=%v binding=%v diagnostics=%#v", local, protected, r.Error, parameter, binding, r.Diagnostics)
			}
			if protected && (r.Code != "" || r.SourceMap != nil) {
				t.Fatal("secret leaf disclosure returned an artifact")
			}
		}
	}
}

// A retained default inherits the same qualified binding obligation as its leaf.
func TestPolicyProtectedBindingDefaultContainment(t *testing.T) {
	for _, local := range []string{"value", "selected"} {
		t.Run(local, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "binding-default-containment.ts", Target: TargetClient, SourceMap: true,
				Source: protectedBindingDefaultSource(local, true, false)})
			if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT2101") || hasDiagnosticCode(r.Diagnostics, "EXACT3020") {
				t.Fatalf("retained binding contract not isolated: %s %#v", r.Error, r.Diagnostics)
			}
			if !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
				t.Fatalf("qualified binding default delivered: diagnostics=%#v code=%v payload=%v map=%v", r.Diagnostics, r.Code != "", strings.Contains(r.Code, "PRIVATE_BINDING_PAYLOAD"), r.SourceMap != nil)
			}
		})
	}
}

// Identical public literal bytes do not establish qualification. The projection
// must execute without entering its deferred constructor or destructuring default.
func TestPolicyPublicBindingDefaultProjection(t *testing.T) {
	for _, local := range []string{"value", "selected"} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "binding-default-public.ts", Target: TargetClient, SourceMap: true,
			Source: protectedBindingDefaultSource(local, false, false)})
		if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || !strings.Contains(r.Code, "PRIVATE_BINDING_PAYLOAD") {
			t.Fatalf("public binding default changed: %s %#v", r.Error, r.Diagnostics)
		}
		artifactEvalNode(t, r.Code, `if(sandbox.exports.work()!=='public')throw Error('public binding projection');`)
	}
}
