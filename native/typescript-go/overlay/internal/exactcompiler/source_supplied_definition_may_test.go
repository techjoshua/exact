package exactcompiler

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// This smaller graph qualifies the effects-only forwarding boundary before the
// unchanged depth28 root. No occurrence result may be borrowed from the graph.
func TestSuppliedDefinitionMAYGrowth(t *testing.T) {
	for _, control := range []struct {
		name, body, effect string
		write              bool
	}{
		{"browser", `document.title;`, "browser", false},
		{"server", `process.cwd();`, "server", false},
		{"write", `inputs.children=document.title;`, "browser", true},
		{"unknown", `foreign(inputs);`, "unknown", false},
	} {
		t.Run(control.name, func(t *testing.T) {
			priorWork := 0
			for _, depth := range []int{2, 4} {
				source := `import {createCompiledTargetReceipt} from "@exactjs/core/runtime/component-abi";declare function foreign(value:unknown):void;function p0(inputs:{children?:unknown}){` + control.body + `return createCompiledTargetReceipt({},inputs.children);}`
				for level := 1; level <= depth; level++ {
					source += fmt.Sprintf(`function p%d(inputs:{children?:unknown}){if(Math.random())return p%d(inputs);return p%d(inputs);}`, level, level-1, level-1)
				}
				source += fmt.Sprintf(`export function Contribution(props:{children?:unknown}){return()=>p%d(props);}`, depth)
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/supplied-definition-" + control.name + ".tsx", Target: TargetClient, Source: source})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
					t.Fatalf("source rejected: %s %#v", response.Error, response.Diagnostics)
				}
				head := executableSummary(t, response, fmt.Sprintf("p%d", depth))
				known, unknown := false, false
				for _, effect := range head.EffectSources {
					known = known || effect.Environment == control.effect
					unknown = unknown || effect.Environment == "unknown"
				}
				if !known || !unknown {
					t.Fatalf("lost %s effect: %#v", control.effect, head)
				}
				if control.write {
					exact := false
					for _, write := range head.StateWrites {
						exact = exact || write.Path == "children" && write.Confidence == "exact" && write.Receiver != nil && write.Receiver.Kind == "parameter" && write.Receiver.Index == 0
					}
					if !exact {
						t.Fatal("lost exact forwarded parameter write")
					}
				}
				work, edges := 0, 0
				for _, project := range session.projects {
					work += project.callableCache.owner.values.work
					for _, analysis := range project.callableCache.bySource {
						for _, fact := range analysis.facts {
							if !strings.HasPrefix(fact.summary.Name, "p") || fact.summary.Name == "p0" {
								continue
							}
							unique := map[string]bool{}
							for _, edge := range fact.summary.Calls {
								if strings.HasPrefix(edge.Name, "p") {
									if unique[edge.ID] || !edge.Resolved {
										t.Fatalf("invalid edge: %#v", edge)
									}
									unique[edge.ID] = true
									edges++
								}
							}
							if fact.summary.Name != "p1" && (len(fact.normalCalls) != 0 || len(fact.nativeCalls) != 0) {
								t.Fatal("settled definition retained occurrence results")
							}
						}
					}
				}
				if edges != 2*depth || work <= 0 {
					t.Fatalf("edges%d work%d", edges, work)
				}
				if priorWork > 0 && work > 3*priorWork {
					t.Fatalf("unbounded forwarding work: depth2=%d depth4=%d", priorWork, work)
				}
				t.Logf("depth%d edges%d work%d known%s writes%v diagnostics%#v", depth, edges, work, control.effect, head.StateWrites, response.Diagnostics)
				priorWork = work
			}
		})
	}
}

// Real occurrences keep their own acquired arguments, writes, getters and fresh
// results. Deferred arrows do not execute their forwarded body at construction.
func TestSuppliedDefinitionMAYActualCalls(t *testing.T) {
	for _, test := range []struct{ name, source, expected string }{
		{"arguments-getters-writes", `let reads=0;let writes=0;let selected=3;function p0(input:number){writes++;return input+1;}function p1(input:number){return p0(input);}function p2(input:number){return p1(input);}const receiver={get value(){reads++;return selected}};const first=p2(receiver.value);selected=7;const second=p2(receiver.value);export const observation=[first,second,reads,writes];`, "[4,8,2,2]"},
		{"replaced-callee", `let selected=(input:number)=>input+1;function p1(input:number){return selected(input);}selected=(input:number)=>input+10;export const observation=[p1(3),p1(7)];`, "[13,17]"},
		{"deferred-arrow", `function p0(input:number){return input+1;}function make(input:number){return()=>p0(input);}const first=make(3);const second=make(7);export const observation=[first(),second()];`, "[4,8]"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(test.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/supplied-occurrence-" + test.name + ".ts", Source: test.source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
				}
				module := filepath.Join(t.TempDir(), "actual.mts")
				if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
				defer cancel()
				const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(m.observation,JSON.parse(process.argv[2]));`
				if out, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module, test.expected).CombinedOutput(); err != nil {
					t.Fatalf("runtime: %v %s", err, out)
				}
			})
		}
	}
}

// Unsupported forwarding keeps ordinary input and body obligations. A syntax
// resemblance cannot erase an accessor, default, rest, capture or binding write.
func TestSuppliedDefinitionMAYRefusalEffects(t *testing.T) {
	for _, test := range []struct{ name, source string }{
		{"async-result", `function leaf(input:object){return input;}export async function run(input:object){return leaf(input);}`},
		{"coercion", `function leaf(input:object){return input;}export function run(input:object){return ""+leaf(input);}`},
		{"member", `function leaf(input:{value:string}){return input.value;}export function run(input:{value:{value:string}}){return leaf(input.value);} `},
		{"constructed", `function leaf(input:{value:string}){return input.value;}export function run(input:{value:string}){return leaf({value:document.title});}`},
		{"written-formal", `function leaf(input:{value:string}){return input.value;}export function run(input:{value:string}){input={value:document.title};return leaf(input);}`},
		{"default", `function leaf(input:{value:string}={value:document.title}){return input.value;}export function run(input:{value:string}){return leaf(input);}`},
		{"rest", `function leaf(...inputs:{value:string}[]){return inputs[0].value;}export function run(input:{value:string}){return leaf(input);}`},
		{"capture", `declare const captured:{value:string};function leaf(input:{value:string}){return captured.value;}export function run(input:{value:string}){return leaf(input);}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/supplied-refusal-" + test.name + ".ts", Source: test.source + "export function Panel(props:Parameters<typeof run>[0]){return ()=>run(props)}", Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" && diagnostic.Code != "EXACT2101" {
					t.Fatal(response.Diagnostics)
				}
			}
			head := executableSummary(t, response, "run")
			if head.Effect == "neutral" {
				t.Fatalf("unresolved input became neutral: %#v", head)
			}
		})
	}
}

// A real formal-forwarding cycle remains a finite graph carrying its reachable
// effects. It cannot produce a completion or a value from that fixed point.
func TestSuppliedDefinitionMAYCycleEffects(t *testing.T) {
	source := `function restricted(){return document.title}function left(input:{value:string}){restricted();return right(input);}function right(input:{value:string}){process.cwd();return left(input);}export function Page(input:{value:string}){left(input);return ()=>null}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/supplied-formal-cycle.ts", Source: source})
	if response.Error != "" || len(response.Diagnostics) != 1 || response.Diagnostics[0].Code != "EXACT2001" || !strings.Contains(response.Diagnostics[0].Message, "indivisible browser and server effects") {
		t.Fatalf("mixed cycle lost its component placement diagnostic: %s %#v", response.Error, response.Diagnostics)
	}
	for _, name := range []string{"left", "right"} {
		summary := executableSummary(t, response, name)
		browser, server := false, false
		for _, effect := range summary.EffectSources {
			browser = browser || effect.Environment == "browser"
			server = server || effect.Environment == "server"
		}
		if !browser || !server {
			t.Fatalf("lost cycle effect: %#v", summary)
		}
	}
}

// An actual receiver at a task invocation supplies precisely the getter or
// callback effects demanded through multiple definitions forwarding that input.
func TestSuppliedDefinitionComponentArgumentEffects(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, row := range []struct {
		name, operation, field string
		browser                bool
	}{
		{"read-getter", "input.children", "get children(){document.title;return ()=>1}", true},
		{"store-method", "input.children", "children(){document.title;return 1}", false},
		{"invoke-method", "input.children()", "children(){document.title;return 1}", true},
		{"skip-getter", "1", "get children(){document.title;return ()=>1}", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := "import {type Component,TaskContext} from '@exactjs/core';type Input={children():number};" +
				"function leaf(input:Input){return " + row.operation + "}function middle(input:Input){return leaf(input)}" +
				"function outer(input:Input){return middle(input)}export function Page(this:Component<{}>){" +
				"function run(task:TaskContext=TaskContext.server()){const input={" + row.field + "};outer(input)}" +
				"return ()=> <button onClick={()=>run()}>run</button>}"
			for _, target := range []Target{TargetClient, TargetServer} {
				result := formsCompileSource(t, root, config, source, target)
				refused := containsDiagnosticCode(result.Diagnostics, "EXACT2001") && strings.Contains(strings.Join(formsDiagnosticDetails(result.Diagnostics), " "), "document")
				if refused != row.browser || (result.Code == "") != row.browser || !row.browser && hasErrorDiagnostic(result.Diagnostics) {
					t.Fatalf("%s emitted=%t diagnostics=%v", target, result.Code != "", formsDiagnosticDetails(result.Diagnostics))
				}
			}
		})
	}
}
