package exactcompiler

import (
	"regexp"
	"testing"
)

func TestSessionProvesOnlySafeRootClassOutputs(t *testing.T) {
	proof := regexp.MustCompile(`\[\s*7,\s*"className",\s*"class"\s*\]`)
	for _, test := range []struct {
		name, attributes string
		proven           bool
	}{
		{"conditional tokens", `className="base" className:active={props.active}`, true},
		{"literal branches", `className={props.active ? "base active" : "base"}`, true},
		{"unknown class", `className={props.label}`, false},
		{"unknown concatenation", `className={"base " + props.label}`, false},
		{"unsafe branch", `className={props.active ? "base" : "<bad>"}`, false},
		{"quoted branch", `className={props.active ? "base" : 'a"b'}`, false},
		{"unicode branch", `className={props.active ? "base" : "caf\u00e9"}`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "classes.tsx", Kind: "compile", Target: TargetServer,
				Source: `export function Panel(props: {active: boolean; label: string}) { return () => <span ` + test.attributes + `>{props.label}</span>; }`,
			})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if proof.MatchString(response.Code) != test.proven {
				t.Fatalf("unexpected class proof: %s", response.Code)
			}
		})
	}
}
