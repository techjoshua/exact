package exactcompiler

import (
	"fmt"
	"path/filepath"
	"testing"
)

// Named and spread policies must require a finite auto plan only when auto is a possible value.
func TestTimeAccuracyPolicyProofAcrossAttributeShapes(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, c := range []struct {
		name, policyType, policy string
		auto                     bool
	}{
		{"bare", `"millisecond"`, `time:update`, true},
		{"quoted-auto", `"millisecond"`, `time:update="auto"`, true},
		{"expression-auto", `"millisecond"`, `time:update={"auto"}`, true},
		{"expression-true", `"millisecond"`, `time:update={true}`, true},
		{"quoted-explicit", `"millisecond"`, `time:update="millisecond"`, false},
		{"expression-explicit", `"millisecond"`, `time:update={"millisecond"}`, false},
		{"named-explicit-input", `"millisecond"`, `time:update={props.update}`, false},
		{"named-auto-input", `"millisecond"|"auto"`, `time:update={props.update}`, true},
		{"spread-explicit-input", `"millisecond"`, `{...attributes}`, false},
		{"spread-auto-input", `"millisecond"|"auto"`, `{...attributes}`, true},
		{"spread-true-input", `"millisecond"|true`, `{...attributes}`, true},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "accuracy.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{update:` + c.policyType + `}){const attributes={"time:update":props.update};return()=> <time ` + c.policy + `>{Date.now()}</time>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if hasDiagnosticCode(response.Diagnostics, "EXACT_TIME_AUTO") != c.auto {
					t.Fatalf("policy proof changed: %#v", response.Diagnostics)
				}
				if !c.auto {
					for _, d := range response.Diagnostics {
						if d.Severity == "error" {
							t.Fatalf("explicit accuracy rejected: %#v", response.Diagnostics)
						}
					}
				}
			})
		}
	}
}
