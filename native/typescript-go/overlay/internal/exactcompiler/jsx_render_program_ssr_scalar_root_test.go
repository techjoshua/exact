package exactcompiler

import (
	"strings"
	"testing"
)

func TestSessionCapturesOnlyClosedSingleRootValues(t *testing.T) {
	for _, test := range []struct {
		name, attributes string
		scalar           bool
	}{
		{"single value", `title={props.label}`, true},
		{"static neighbors", `id="before" title={props.label} role="note"`, true},
		{"class proof", `className="base" className:active={props.active}`, true},
		{"two values", `title={props.label} className={props.label}`, false},
		{"spread", `{...props}`, false},
		{"duplicates", `title={props.label} title={props.label}`, false},
		{"static only", `title="static"`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "scalar.tsx", Kind: "compile", Target: TargetServer,
				Source: `export function Panel(props: {label: string; active: boolean}) { return () => <span ` + test.attributes + `>{props.label}</span>; }`,
			})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if strings.Contains(response.Code, "__exactRootValue") != test.scalar {
				t.Fatalf("unexpected scalar capture: %s", response.Code)
			}
		})
	}
}
