package exactcompiler

import (
	"regexp"
	"testing"
)

func TestServerScalarPropsProofRequiresFreshFiniteBag(t *testing.T) {
	issuedProof := regexp.MustCompile(`\.reference\(Child, __exactValue_[0-9]+,`)
	for _, test := range []struct {
		name, attributes string
		proof            bool
	}{
		{"empty", "", true},
		{"single", `severity={props.severity}`, true},
		{"multiple", `severity={props.severity} title="extra"`, false},
		{"spread", `{...props}`, false},
		{"key", `key="key"`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "scalar-props.tsx", Kind: "compile", Target: TargetServer,
				Source: `function Child(props: {severity?: string; title?: string}) { return () => <span>{props.severity}</span>; }
				export function Parent(props: {severity: string}) { return () => <div><Child ` + test.attributes + ` /></div>; }`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			if issuedProof.MatchString(response.Code) != test.proof {
				t.Fatalf("unexpected proof selection: %s", response.Code)
			}
		})
	}
}
