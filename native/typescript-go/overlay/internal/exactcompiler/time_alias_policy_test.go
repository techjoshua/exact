package exactcompiler

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

// Alias analysis must preserve the selected clock and reject unproven repeated evaluation.
func TestTimeAliasPolicyAcrossConcreteTargets(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, c := range []struct {
		name, setup, expression string
		valid                   bool
	}{
		{"record", `const reading={stamp:Date.now()};const {stamp:now}=reading;`, `Math.floor((now-props.anchor)/1000)`, true},
		{"computed-record", `const reading={["stamp"]:Date.now()};const {stamp:now}=reading;`, `Math.floor((now-props.anchor)/1000)`, true},
		{"computed-binding", `const {["stamp"]:now}={stamp:Date.now()};`, `Math.floor((now-props.anchor)/1000)`, true},
		{"empty-key", `const {[""]:now}={[""]:Date.now()};`, `Math.floor((now-props.anchor)/1000)`, true},
		{"numeric-key", `const {1e21:now}={"1e+21":Date.now()};`, `Math.floor((now-props.anchor)/1000)`, true},
		{"nested-record", `const reading={nested:[0,{stamp:Date.now()}]};const {nested:[,{stamp:now}]}=reading;`, `Math.floor((now-props.anchor)/1000)`, true},
		{"array", `const [,now]=[0,Date.now()];`, `Math.floor((now-props.anchor)/1000)`, true},
		{"asserted-record", `const {stamp:now}=({stamp:Date.now()} as {stamp:number})!;`, `Math.floor((now-props.anchor)/1000)`, true},
		{"satisfies-record", `const {stamp:now}={stamp:Date.now()} satisfies {stamp:number};`, `Math.floor((now-props.anchor)/1000)`, true},
		{"default-binding", `const {stamp:now=Date.now()}={stamp:Date.now()};`, `Math.floor((now-props.anchor)/1000)`, false},
		{"rest-binding", `const {...reading}={stamp:Date.now()};`, `Math.floor((reading.stamp-props.anchor)/1000)`, false},
		{"dynamic-key", `const key=props.key;const {stamp:now}={[key]:Date.now()};`, `Math.floor((now-props.anchor)/1000)`, false},
		{"spread-overwrite", `const {stamp:now}={stamp:Date.now(),...{stamp:Date.now()+500}};`, `Math.floor((now-props.anchor)/1000)`, false},
		{"shifted-array", `const [now]=[...[Date.now()+500],Date.now()];`, `Math.floor((now-props.anchor)/1000)`, false},
		{"helper", `function elapsed(start:number,now:number){return Math.floor((now-start)/1000);}`, `elapsed(props.anchor,Date.now())`, true},
		{"helper-shifted-clock", `function elapsed(start:number,now:number){return Math.floor((now-start)/1000);}`, `elapsed(props.anchor,Date.now()+1)`, false},
		{"opaque-helper", `declare function elapsed(start:number,now:number):number;`, `elapsed(props.anchor,Date.now())`, false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(fmt.Sprintf("%s/%s", c.name, target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "alias.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number;key:string}){` + c.setup + `return()=> <time time:update>{` + c.expression + `}</time>;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				hasErrors := false
				for _, d := range response.Diagnostics {
					hasErrors = hasErrors || d.Severity == "error"
				}
				if hasErrors == c.valid {
					t.Fatalf("alias proof changed: %#v", response.Diagnostics)
				}
				if c.valid && (!strings.Contains(response.Code, "createTimeActivation") || strings.Contains(response.Code, `kind: "continuous"`)) {
					t.Fatal("safe alias lost its finite activation")
				}
			})
		}
	}
}

// The operator and operand order determine both finite phase boundaries, especially at zero.
func TestFiniteTimeComparisonPolicyAcrossOperators(t *testing.T) {
	root, config := timePlanContractWorkspace(t)
	for _, rounding := range []string{"floor", "ceil"} {
		for _, absolute := range []bool{false, true} {
			for _, operator := range []string{"<", "<=", ">", ">="} {
				for _, reversed := range []bool{false, true} {
					for _, target := range []Target{TargetClient, TargetServer} {
						t.Run(fmt.Sprintf("%s/%t/%s/%t/%s", rounding, absolute, operator, reversed, target), func(t *testing.T) {
							difference := "Date.now()-props.anchor"
							if rounding == "ceil" {
								difference = "props.anchor-Date.now()"
							}
							value := "Math." + rounding + "((" + difference + ")/1000)"
							if absolute {
								value = "Math.abs(" + value + ")"
							}
							condition := value + operator + "0"
							if reversed {
								condition = "0" + operator + value
							}
							response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "comparison.tsx"), Root: root, ConfigFile: config, Target: target, Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){const inside=` + condition + `;return()=> <time time:update>{inside?"inside":"outside"}</time>;}`})
							if response.Error != "" || len(response.Diagnostics) != 0 {
								t.Fatalf("finite comparison rejected: %s %#v", response.Error, response.Diagnostics)
							}
							if !strings.Contains(response.Code, "createTimeActivation") || strings.Contains(response.Code, `kind: "continuous"`) {
								t.Fatal("finite comparison lost its plan")
							}
						})
					}
				}
			}
		}
	}
}
