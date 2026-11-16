package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
	"testing"
)

// These are the original Get/Set relationships, including the assignment result
// stored by the outer map. The ordinary collector must issue them and consume
// the data prefix before selecting the next receiver. Complete private source
// use coverage settles Effects without granting a normal member result.
func TestStagedConstructedOriginalDomainOccurrences(t *testing.T) {
	source := `const domainOperationPrototypes=new WeakMap<object,WeakMap<object,object>>();
function domainOperationPrototype(prototype:object,domain:object){
 let domains=domainOperationPrototypes.get(prototype);
 if(!domains)domainOperationPrototypes.set(prototype,(domains=new WeakMap<object,object>()));
 let owned=domains.get(domain);
 if(!owned){owned={};domains.set(domain,owned)}
 return owned;
}
export function invoke(){return domainOperationPrototype({},{});}`
	session := NewSession()
	response := session.Execute(Request{Kind: "compile", ID: "/virtual/staged-original-domains.ts", Source: source, Target: "client", Diagnostics: "semantic"})
	if hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal("invalid source witness", response.Diagnostics)
	}
	if response.Error != "" || response.Code == "" || len(response.Analysis.Callables) == 0 {
		t.Fatal("original source group did not settle", response.Error)
	}
	found := false
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name != "domainOperationPrototype" {
			continue
		}
		found = true
		if len(fact.staged.constructedOccurrences) != 4 {
			t.Fatalf("original Get/Set occurrences not enrolled: %d", len(fact.staged.constructedOccurrences))
		}
		adopted := make(map[string]int)
		for _, occurrence := range fact.staged.constructedOccurrences {
			call := occurrence.request.producer.operation
			if _, legacy := fact.staged.legacy[call]; legacy {
				t.Fatal("adopted member Call retained legacy recovery", sourceText(fact.sourceFile, call))
			}
			recipeFound := false
			for _, recipe := range fact.staged.operationRecipes {
				if recipe.key != occurrence.request.producer {
					continue
				}
				recipeFound = true
				if len(recipe.constructedGroup) != 1 || !recipe.delta.extracted {
					t.Fatal("missing settled conditional receiver", recipe)
				}
				if strings.HasPrefix(sourceText(fact.sourceFile, call), "domains.") {
					if len(recipe.constructedInputs) == 0 {
						t.Fatal("next receiver bypassed delivered original Get-result data")
					}
					for _, input := range recipe.constructedInputs {
						if input.reading.operation == call || input.reading.operation == nil {
							t.Fatal("receiver source retargeted to later Get")
						}
					}
				}
			}
			if !recipeFound {
				t.Fatal("source occurrence has no selected member contribution", sourceText(fact.sourceFile, call))
			}
			_, key := accessorReceiver(call.Expression())
			adopted[key]++
		}
		if adopted["get"] != 2 || adopted["set"] != 2 {
			t.Fatal("original method coverage", adopted)
		}
		delivered := false
		for _, use := range fact.staged.operationUses {
			if use.request.reading.operation == nil {
				continue
			}
			if !ast.IsCallExpression(use.request.reading.operation) || !strings.HasPrefix(sourceText(fact.sourceFile, use.request.reading.operation), "domainOperationPrototypes.get") {
				continue
			}
			if use.call != nil || use.request.inputs != nil {
				t.Fatal("stored data was invoked or installed as binder output")
			}
			delivered = true
		}
		if !delivered {
			t.Fatal("outer Set payload was never consumed by original Get result")
		}
	}
	if !found {
		t.Fatal("source fact missing behind causal pending response")
	}
}

// Nested input Calls yield their Effects through canonical summaries. The
// returned callback remains a data result, so its body must not be activated.
func TestStagedSourceCallNestedInputEffects(t *testing.T) {
	source := `declare function foreign():void;function make(){window.name;foreign();return()=>document.title}function leaf(input:()=>string){return input}export function root(){return leaf(make())}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/staged-source-input-effects.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	known, unknown, dormant := false, false, false
	for _, effect := range executableSummary(t, response, "root").EffectSources {
		known = known || effect.Environment == "browser"
		unknown = unknown || effect.Environment == "unknown"
		dormant = dormant || effect.Description == "document"
	}
	if !known || !unknown || dormant {
		t.Fatal("eager source/unknown/dormant distinction", executableSummary(t, response, "root").EffectSources)
	}
	sourceCall := false
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name == "root" {
			for _, call := range fact.staged.calls {
				if call.sourceInputs != nil && call.inputs == nil {
					sourceCall = true
					if call.legacyInputs {
						t.Fatal("covered data input reentered legacy binding")
					}
				}
			}
		}
	}
	if !sourceCall {
		t.Fatal("ordinary occurrence did not issue its source association")
	}
}

// Return/argument transport uses the same occurrence owner as result-to-receiver
// transport. Source order must not decide which original map gets adopted.
func TestStagedConstructedReturnedAndReceiverOccurrences(t *testing.T) {
	declarations := []string{
		`declare function foreign():void;const operationPrototypes=new WeakMap<object,object>();const domainOperationPrototypes=new WeakMap<object,WeakMap<object,object>>();`,
		`function operationPrototype(execute:object){let prototype=operationPrototypes.get(execute);if(!prototype){prototype={};operationPrototypes.set(execute,prototype)}return prototype}`,
		`function domainOperationPrototype(prototype:object,domain:object){window.name;foreign();let domains=domainOperationPrototypes.get(prototype);if(!domains)domainOperationPrototypes.set(prototype,(domains=new WeakMap<object,object>()));let owned=domains.get(domain);if(!owned){owned={};domains.set(domain,owned)}return owned}`,
		`function dormant(){document.title;operationPrototypes.set({},()=>document.title)}`,
		`export function invoke(){return domainOperationPrototype(operationPrototype(()=> 'value'),{})}`,
	}
	for _, reverse := range []bool{false, true} {
		t.Run(map[bool]string{false: "forward", true: "reverse"}[reverse], func(t *testing.T) {
			ordered := append([]string(nil), declarations...)
			if reverse {
				for i, j := 0, len(ordered)-1; i < j; i, j = i+1, j-1 {
					ordered[i], ordered[j] = ordered[j], ordered[i]
				}
			}
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/staged-returned-map.ts", Source: strings.Join(ordered, "\n"), Target: "client", Diagnostics: "semantic"})
			if hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal(response.Diagnostics)
			}
			if response.Error != "" || response.Code == "" || len(response.Analysis.Callables) == 0 {
				t.Fatal("original source group did not settle", response.Error)
			}
			counts := map[string]int{}
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "operationPrototype" && fact.summary.Name != "domainOperationPrototype" {
					continue
				}
				counts[fact.summary.Name] = len(fact.staged.constructedOccurrences)
				for _, occurrence := range fact.staged.constructedOccurrences {
					call := occurrence.request.producer.operation
					if _, legacy := fact.staged.legacy[call]; legacy {
						t.Fatal("reached native member recursively reacquired", sourceText(fact.sourceFile, call))
					}
					found := false
					for _, recipe := range fact.staged.operationRecipes {
						if recipe.key != occurrence.request.producer {
							continue
						}
						found = len(recipe.constructedGroup) > 0
						if !recipe.delta.extracted || recipe.constructedDisposition == nil {
							t.Fatal("receiver source coverage did not arrive")
						}
						for _, source := range recipe.constructedGroup {
							if source.request.consumer != fact.node {
								t.Fatal("unrelated declaration activated as writer")
							}
						}
					}
					if !found {
						t.Fatal("original occurrence has no conditional native source", sourceText(fact.sourceFile, call))
					}
				}
				if fact.summary.Name == "domainOperationPrototype" {
					known, unknown, dormant := false, false, false
					for _, effect := range fact.summary.EffectSources {
						known = known || effect.Description == "window"
						unknown = unknown || effect.Environment == "unknown"
						dormant = dormant || effect.Description == "document"
					}
					if !known || !unknown || dormant {
						t.Fatal("known/unknown/dormant contributions", fact.summary.EffectSources)
					}
				}
			}
			if counts["operationPrototype"] != 2 || counts["domainOperationPrototype"] != 4 {
				t.Fatal("original occurrence coverage", counts)
			}
		})
	}
}
