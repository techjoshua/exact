package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

const activationCallSource = activationCaptureSource + `selected();`

func TestReturnedActivationExactFieldEdge(t *testing.T) {
	session := NewSession()
	r := session.Execute(Request{Kind: "compile", ID: "/virtual/activation-field-edge.ts", Source: activationCallSource, Diagnostics: "semantic"})
	if r.Error != "" || hasErrorDiagnostic(r.Diagnostics) {
		t.Fatal(r.Error, r.Diagnostics)
	}
	joined := 0
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		facts := project.callableCache.merged.facts
		for _, caller := range facts {
			for _, target := range facts {
				for _, effect := range target.summary.DirectEffectSources {
					if effect.fieldOrigin == nil || !ast.IsParameterDeclaration(effect.fieldOrigin.slot) || !activationCapturedDemand(effect.fieldOrigin.declaration, effect.fieldOrigin.operation, effect.fieldOrigin.slot, effect.fieldOrigin.key) {
						continue
					}
					// The generic target retains UNKNOWN. Coverage is an exact caller edge.
					if effect.Environment != "unknown" || !effect.Opaque || !effect.provenanceIncomplete {
						t.Fatal("naming field demand minted precision")
					}
					for _, edge := range caller.summary.Calls {
						if !fieldFallbackFulfilled(&caller, &target, edge, effect) {
							continue
						}
						joined++
						if len(caller.fieldCalls) != 1 || len(caller.fieldCalls[0].outcomes) != 1 {
							t.Fatal("actual field outcome published other than once")
						}
						wrong := edge
						wrong.ID += "wrong"
						if fieldFallbackFulfilled(&caller, &target, wrong, effect) {
							t.Fatal("wrong edge fulfilled")
						}
						wrong = edge
						wrong.Resolved = false
						if fieldFallbackFulfilled(&caller, &target, wrong, effect) {
							t.Fatal("unresolved alternative fulfilled")
						}
						for _, name := range []string{"untagged", "forwarded", "key", "member", "parameter", "declaration", "knownbrowser", "independentunknown"} {
							altered := effect
							origin := *effect.fieldOrigin
							altered.fieldOrigin = &origin
							switch name {
							case "untagged":
								altered.fieldOrigin = nil
							case "forwarded":
								altered.fieldForwarded = true
							case "key":
								origin.key = "other"
							case "member":
								origin.operation = origin.operation.Expression()
							case "parameter":
								origin.slot = target.node
							case "declaration":
								origin.declaration = origin.slot.Parent
							case "knownbrowser":
								altered.Environment = "browser"
							case "independentunknown":
								altered.provenanceIncomplete = false
							}
							if fieldFallbackFulfilled(&caller, &target, edge, altered) {
								t.Fatal("unrelated effect fulfilled", name)
							}
						}
						copied := caller
						copied.summary.Calls = append(append([]CallEdge(nil), caller.summary.Calls...), edge)
						if fieldFallbackFulfilled(&copied, &target, edge, effect) {
							t.Fatal("duplicate edge granted coverage")
						}
						copied = caller
						copied.fieldCalls = append([]sourceFieldCall(nil), caller.fieldCalls...)
						incomplete := cloneSourceFieldCall(copied.fieldCalls[0])
						incomplete.complete = false
						copied.fieldCalls = append(copied.fieldCalls, incomplete)
						if fieldFallbackFulfilled(&copied, &target, edge, effect) {
							t.Fatal("uncovered duplicate alternative lost")
						}
						copied = caller
						copied.fieldCalls = append([]sourceFieldCall(nil), caller.fieldCalls...)
						copied.fieldCalls[0].operation = target.node
						if fieldFallbackFulfilled(&copied, &target, edge, effect) {
							t.Fatal("other Call matched")
						}
					}
				}
			}
		}
	}
	if joined != 1 {
		t.Fatal("exact original second-Call field join", joined)
	}
}

func TestReturnedActivationUnmatchedEffects(t *testing.T) {
	for _, c := range []struct {
		name, source string
		browser      bool
	}{
		{"getter", `export{};function make(input:{value:string}){return()=>input.value}const input={get value(){return document.title}};const selected=make(input);selected();`, true},
		{"proxy", `export{};function make(input:{value:string}){return()=>input.value}const input=new Proxy({value:'safe'},{get(){document.title;return 'proxy'}});const selected=make(input);selected();`, true},
		{"body-browser", `export{};function make(input:{value:string}){return()=>{document.title;return input.value}}const input={value:'safe'};const selected=make(input);selected();`, true},
		{"independent-unknown", `export{};declare function foreign():void;function make(input:{value:string}){return()=>{foreign();return input.value}}const input={value:'safe'};const selected=make(input);selected();`, false},
	} {
		t.Run(c.name, func(t *testing.T) {
			session := NewSession()
			r := session.Execute(Request{Kind: "analyze", ID: "/virtual/activation-effect-refusal.ts", Source: c.source, Diagnostics: "semantic"})
			if r.Error != "" {
				t.Fatal(r.Error)
			}
			for _, d := range r.Diagnostics {
				if strings.HasPrefix(d.Code, "TS") {
					t.Fatal("invalid control", r.Diagnostics)
				}
			}
			currentCallers := 0
			for _, project := range session.projects {
				if project.callableCache != nil {
					for _, fact := range project.callableCache.merged.facts {
						if fact.node == nil || !ast.IsExpressionStatement(fact.node) || !ast.IsCallExpression(fact.node.Expression()) || !ast.IsIdentifier(fact.node.Expression().Expression()) || fact.node.Expression().Expression().Text() != "selected" {
							continue
						}
						currentCallers++
						browser, unknown := false, false
						for _, effect := range fact.summary.EffectSources {
							browser = browser || effect.Environment == "browser"
							unknown = unknown || effect.Environment == "unknown"
						}
						if !unknown || c.browser && !browser {
							t.Fatalf("CURRENT selected() caller lost propagated effects: %s browser=%v unknown=%v effects=%#v", fact.summary.Name, browser, unknown, fact.summary.EffectSources)
						}
						for _, call := range fact.fieldCalls {
							for _, outcome := range call.outcomes {
								if outcome.fulfilled && ast.IsParameterDeclaration(outcome.demand.slot) && outcome.demand.slot.Parent != outcome.demand.declaration {
									t.Fatal("CURRENT caller received unadmitted DATA field outcome")
								}
							}
						}
					}
				}
			}
			if currentCallers != 1 {
				t.Fatal("exact current selected() caller not found", currentCallers)
			}
			for _, project := range session.projects {
				if project.callableCache != nil {
					for _, fact := range project.callableCache.merged.facts {
						for _, call := range fact.fieldCalls {
							for _, outcome := range call.outcomes {
								if outcome.fulfilled && ast.IsParameterDeclaration(outcome.demand.slot) && outcome.demand.slot.Parent != outcome.demand.declaration {
									t.Fatal("unadmitted accessor/Proxy/body received capture DATA coverage")
								}
							}
						}
					}
				}
			}
		})
	}
}
