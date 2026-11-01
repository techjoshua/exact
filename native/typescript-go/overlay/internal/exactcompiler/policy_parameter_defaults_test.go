package exactcompiler

import (
	"strings"
	"testing"
)

const annotatedParameterPropertyDefault = `constructor(/** @exact keep=secret */ public value='PRIVATE_PARAMETER_PAYLOAD'){}`

func parameterDefaultPolicySource(members, statement string) string {
	return `export {};interface Tagged{
/** @exact keep=secret */ value:string}
const record={label:'public',factory:class{
` + members + `}};export function work(){` + statement + `}`
}

// The annotation already owns the parameter property's secret contract. A
// public projection and a forbidden property/aggregate disclosure differ.
func TestPolicyParameterPropertyDefaultOwnership(t *testing.T) {
	for _, expression := range []string{"record", "(new record.factory()).value", "record.label"} {
		r := NewSession().Execute(Request{Kind: "compile", ID: "parameter-property-ownership.ts", Target: TargetServer, SourceMap: true,
			Source: parameterDefaultPolicySource(annotatedParameterPropertyDefault, `console.log(`+expression+`);`)})
		owned := false
		for _, subject := range r.Analysis.Policy.Subjects {
			owned = owned || subject.Kind == "parameter" && subject.Name == "value" && subject.Policy.Secret
		}
		if !owned {
			t.Fatal("authored parameter policy was not recognized")
		}
		denied := expression != "record.label"
		if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT3020") != denied {
			t.Fatalf("%s ownership: %s %#v", expression, r.Error, r.Diagnostics)
		}
		if denied {
			if r.Code != "" || r.SourceMap != nil {
				t.Fatal("secret disclosure returned an artifact")
			}
		} else if hasErrorDiagnostic(r.Diagnostics) || r.Code == "" {
			t.Fatalf("public server projection rejected: %#v", r.Diagnostics)
		}
	}
}

// A protected default is retained executable source even though the public
// projection does not construct the class.
func TestPolicyParameterPropertyDefaultContainment(t *testing.T) {
	for _, test := range []struct {
		name, members string
		secret        bool
	}{
		{"annotated property", annotatedParameterPropertyDefault, true},
		{"newline annotation", "constructor(\n/** @exact keep=secret */ public value='PRIVATE_PARAMETER_PAYLOAD'){}", true},
		{"contextual Tagged", `constructor(public value:Tagged={value:'PRIVATE_PARAMETER_PAYLOAD'}){}`, true},
		{"annotated field", `/** @exact keep=secret */ value='PRIVATE_PARAMETER_PAYLOAD';`, true},
		{"public property default", `constructor(public value='PRIVATE_PARAMETER_PAYLOAD'){}`, false},
		{"public parameter default", `constructor(value='PRIVATE_PARAMETER_PAYLOAD'){}`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := NewSession().Execute(Request{Kind: "compile", ID: "parameter-property-default.ts", Target: TargetClient, SourceMap: true,
				Source: parameterDefaultPolicySource(test.members, `return record.label;`)})
			if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT2101") || hasDiagnosticCode(r.Diagnostics, "EXACT3020") {
				t.Fatalf("retained initializer contract not isolated: %s %#v", r.Error, r.Diagnostics)
			}
			if test.secret {
				if !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
					t.Fatalf("qualified default delivered: diagnostics=%#v code=%v payload=%v map=%v", r.Diagnostics, r.Code != "", strings.Contains(r.Code, "PRIVATE_PARAMETER_PAYLOAD"), r.SourceMap != nil)
				}
			} else {
				if hasErrorDiagnostic(r.Diagnostics) || r.Code == "" || !strings.Contains(r.Code, "PRIVATE_PARAMETER_PAYLOAD") {
					t.Fatalf("public retained default changed: %#v", r.Diagnostics)
				}
				artifactEvalNode(t, r.Code, `if(sandbox.exports.work()!=='public')throw Error('public projection');`)
			}
		})
	}
}

// Ordinary parameters use the same authored parameter annotation, but have no
// stored property. Confirm lexical ownership before comparing their defaults.
func TestPolicyOrdinaryParameterDefaultComparison(t *testing.T) {
	for _, annotated := range []bool{false, true} {
		annotation := ""
		if annotated {
			annotation = "/** @exact keep=secret */ "
		}
		members := `constructor(` + annotation + `value='PRIVATE_PARAMETER_PAYLOAD'){console.log(value)}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "ordinary-parameter-ownership.ts", Target: TargetServer, SourceMap: true,
			Source: parameterDefaultPolicySource(members, `return record.label;`)})
		owned := false
		for _, subject := range r.Analysis.Policy.Subjects {
			owned = owned || subject.Kind == "parameter" && subject.Name == "value" && subject.Policy.Secret
		}
		if owned != annotated {
			t.Fatal("ordinary parameter annotation ownership changed")
		}
		if r.Error != "" || hasDiagnosticCode(r.Diagnostics, "EXACT3020") != annotated {
			t.Fatalf("ordinary parameter annotation ownership: %s %#v", r.Error, r.Diagnostics)
		}
	}
	t.Run("unused annotated default", func(t *testing.T) {
		members := `constructor(/** @exact keep=secret */ value='PRIVATE_PARAMETER_PAYLOAD'){}`
		r := NewSession().Execute(Request{Kind: "compile", ID: "ordinary-parameter-default.ts", Target: TargetClient, SourceMap: true,
			Source: parameterDefaultPolicySource(members, `return record.label;`)})
		if r.Error != "" || !hasDiagnosticCode(r.Diagnostics, "EXACT3022") || r.Code != "" || r.SourceMap != nil {
			t.Fatalf("qualified ordinary default delivered: error=%s diagnostics=%#v code=%v payload=%v map=%v", r.Error, r.Diagnostics, r.Code != "", strings.Contains(r.Code, "PRIVATE_PARAMETER_PAYLOAD"), r.SourceMap != nil)
		}
	})
}
