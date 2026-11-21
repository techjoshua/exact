package exactcompiler

import (
	"context"
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestParameterProjectionRetainsUnknownOrigin(t *testing.T) {
	filename, err := normalizeFileName("collection-parameter-origin.ts", "")
	if err != nil {
		t.Fatal(err)
	}
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: filename, Source: `export function source(props:{rows:number[]}){return props.rows}`, Diagnostics: "semantic"})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	var project *projectState
	for _, candidate := range session.projects {
		project = candidate
	}
	if project == nil {
		t.Fatal("source project missing")
	}
	currentChecker, release := project.program.GetCheckerPool().GetChecker(context.Background(), nil)
	defer release()
	file := project.program.GetSourceFile(filename)
	if file == nil {
		t.Fatal("actual source missing")
	}
	var member *ast.Node
	walkNode(file.AsNode(), func(node *ast.Node) bool {
		if ast.IsPropertyAccessExpression(node) {
			member = node
		}
		return true
	})
	if member == nil {
		t.Fatal("actual member missing")
	}
	owner := newSourceValueOwner(currentChecker)
	query := sourceValueQuery{owner: owner, remaining: 4096, active: make(map[*ast.Node]bool), protectedMember: member}
	result := query.accessors(member, nil, "", accessorAcquire, nil, nil)
	if (!result.opaque && len(result.fieldFallbacks) == 0) || !result.valueIncomplete {
		t.Fatalf("unknown parameter acquired effect/value authority: %#v", result)
	}
	if len(result.values) != 1 || result.values[0].node != member.AsPropertyAccessExpression().Expression || len(result.values[0].path) != 1 || result.values[0].path[0] != "rows" {
		t.Fatalf("relative origin lost: %#v", result.values)
	}
	value := result.values[0]
	if value.native != nil || value.bound != nil || value.adapter != nil || value.ownedGetRow != nil || result.sourceCallable || len(result.ownedGets) != 0 || len(result.normalCalls) != 0 || len(result.nativeCalls) != 0 {
		t.Fatal("origin manufactured completed/native authority")
	}
}

func TestParameterFieldOutcomeExactCaller(t *testing.T) {
	session := NewSession()
	filename, err := normalizeFileName("parameter-field-caller.ts", "")
	if err != nil {
		t.Fatal(err)
	}
	response := session.Execute(Request{Kind: "analyze", ID: filename, Diagnostics: "semantic", Source: `function readRows(input:{rows:number[]}){const rows=input.rows;return rows}export const result=readRows({rows:[1]});`})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	checked := false
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		facts := project.callableCache.merged.facts
		for _, caller := range facts {
			for _, target := range facts {
				for _, source := range target.summary.DirectEffectSources {
					if source.fieldOrigin == nil {
						continue
					}
					for _, edge := range caller.summary.Calls {
						if !fieldFallbackFulfilled(&caller, &target, edge, source) {
							continue
						}
						checked = true
						wrong := edge
						wrong.ID += "/foreign"
						if fieldFallbackFulfilled(&caller, &target, wrong, source) {
							t.Fatal("wrong edge fulfilled input read")
						}
						copySource := source
						origin := *source.fieldOrigin
						origin.slot = nil
						copySource.fieldOrigin = &origin
						if fieldFallbackFulfilled(&caller, &target, edge, copySource) {
							t.Fatal("wrong slot fulfilled input read")
						}
						copySource = source
						copySource.Environment = "browser"
						if fieldFallbackFulfilled(&caller, &target, edge, copySource) {
							t.Fatal("known browser source suppressed as abstract fallback")
						}
						copySource = source
						copySource.fieldForwarded = true
						if fieldFallbackFulfilled(&caller, &target, edge, copySource) {
							t.Fatal("forwarded obligation fulfilled transitively")
						}
						wrongTarget := target
						wrongTarget.node = caller.node
						if fieldFallbackFulfilled(&caller, &wrongTarget, edge, source) {
							t.Fatal("wrong target fulfilled input read")
						}
					}
				}
			}
		}
	}
	if !checked {
		t.Fatal("actual helper own-data Get has no fulfilled caller association")
	}
}

func TestParameterHelperCallerPair(t *testing.T) {
	for _, reader := range []string{`const rows=input.rows;return rows`, `return input.rows`} {
		session := NewSession()
		filename, err := normalizeFileName("parameter-helper-pair.ts", "")
		if err != nil {
			t.Fatal(err)
		}
		response := session.Execute(Request{Kind: "analyze", ID: filename, Diagnostics: "semantic", Source: `function readRows(input:{rows:number[]}){` + reader + `}export const result=readRows({rows:[1]});`})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
			t.Fatal(response.Error, response.Diagnostics)
		}
		matched := false
		for _, project := range session.projects {
			if project.callableCache == nil {
				continue
			}
			facts := project.callableCache.merged.facts
			for _, caller := range facts {
				for _, target := range facts {
					if target.summary.Name != "readRows" {
						continue
					}
					for _, source := range target.summary.DirectEffectSources {
						if source.fieldOrigin != nil {
							for _, edge := range caller.summary.Calls {
								if !fieldFallbackFulfilled(&caller, &target, edge, source) {
									continue
								}
								matched = true
								if caller.summary.Effect == "unknown" {
									t.Fatalf("actual helper caller remains unknown: %#v", caller.summary)
								}
								count := 0
								for _, call := range caller.fieldCalls {
									if call.operation == caller.fieldEdgeOperations[edge.ID] && call.target == target.node {
										for _, outcome := range call.outcomes {
											if sameFieldObligation(outcome.demand, *source.fieldOrigin) {
												count++
											}
										}
									}
								}
								if count != 1 {
									t.Fatalf("original read outcome published %d times", count)
								}
							}
						}
					}
				}
			}
		}
		if !matched {
			t.Fatalf("no exact actual caller read relation for %s", reader)
		}
	}
}

func TestParameterHelperEmittedSavedValue(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "compile", ID: "parameter-saved-value.ts", Diagnostics: "semantic", Source: `function readRows(input:{rows:number[]}){const rows=input.rows;input.rows=[2];return rows}const input={rows:[1]};export const value=readRows(input);export const current=input.rows;`})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	module := filepath.Join(t.TempDir(), "generated.mts")
	if err := os.WriteFile(module, []byte(response.Code+`
console.log(JSON.stringify({value,current}));`), 0600); err != nil {
		t.Fatal(err)
	}
	output, err := exec.Command("node", module).CombinedOutput()
	if err != nil {
		t.Fatalf("emitted execution: %v %s", err, output)
	}
	var result struct {
		Value   []int `json:"value"`
		Current []int `json:"current"`
	}
	if err := json.Unmarshal(output, &result); err != nil {
		t.Fatal(err, string(output))
	}
	if len(result.Value) != 1 || result.Value[0] != 1 || len(result.Current) != 1 || result.Current[0] != 2 {
		t.Fatalf("saved input value changed: %s", output)
	}
}
