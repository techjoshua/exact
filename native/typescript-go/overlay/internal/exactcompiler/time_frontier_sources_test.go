package exactcompiler

import (
	"strings"
	"testing"
)

// Comparison controls protect threshold boundaries and fallback planning through authored sources.
func TestTimeComparisonSourceFrontier(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, rounding := range []string{"floor", "ceil"} {
		for _, operator := range []string{"<", "<=", ">", ">=", "==", "===", "!=", "!=="} {
			for _, absolute := range []bool{false, true} {
				for _, reverse := range []bool{false, true} {
					for _, target := range []Target{TargetClient, TargetServer} {
						name := rounding + operator + string(target)
						if absolute {
							name += "/absolute"
						}
						if reverse {
							name += "/reverse"
						}
						t.Run(name, func(t *testing.T) {
							difference := "Date.now()-props.anchor"
							if rounding == "ceil" {
								difference = "props.anchor-Date.now()"
							}
							value := "Math." + rounding + "((" + difference + ")/1000)"
							if absolute {
								value = "Math.abs(" + value + ")"
							}
							condition := value + operator + "2"
							if reverse {
								condition = "2" + operator + value
							}
							response := NewSession().Execute(Request{Kind: "compile", ID: "time-comparison-frontier.tsx", ConfigFile: config, Target: target, Diagnostics: "semantic", Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number}){return()=> <time time:update>{` + condition + `?'inside':'outside'}</time>}`})
							if response.Error != "" || len(response.Diagnostics) != 0 {
								t.Fatalf("valid comparison rejected: %s %#v", response.Error, response.Diagnostics)
							}
							if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" || !strings.Contains(response.Code, "readEpochMilliseconds") || !strings.Contains(response.Code, "createTimeActivation") || (!absolute && (operator == "<" || operator == "<=" || operator == ">" || operator == ">=") && !strings.Contains(response.Code, "threshold")) {
								t.Fatalf("comparison lost portable clock ownership: %#v\n%s", response.Analysis.Components, response.Code)
							}
						})
					}
				}
			}
		}
	}
}
