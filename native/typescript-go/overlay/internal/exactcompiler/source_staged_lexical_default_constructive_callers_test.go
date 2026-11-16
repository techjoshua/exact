package exactcompiler

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

// These three source forms share one original program. consume owns invocation;
// default-bearing declarations only return or forward their stored formal DATA.
const stagedLexicalDefaultConstructiveSource = `
function quiet(){return 'quiet'}
function browser(){return window.name}
function dormant(){return document.title}
function consume(callback:()=>string){return callback()}
function direct(callback:()=>string=quiet){return callback}
function forward(callback:()=>string=quiet){return consume(callback)}
function mixed(tag:()=>string,callback:()=>string=quiet,unused:()=>string=dormant){return ({get value(){return callback}}).value}
export function directProvided(){return consume(direct(browser))}
export function directOmitted(){return consume(direct())}
export function directUndefined(){return consume(direct(undefined))}
export function directPartial(other:(()=>string)|undefined){consume(direct(browser));return consume(direct(other))}
export function directStored(){return direct()}
export function forwardProvided(){return forward(browser)}
export function forwardOmitted(){return forward()}
export function forwardUndefined(){return forward(undefined)}
export function forwardPartial(other:(()=>string)|undefined){forward(browser);return forward(other)}
export function mixedProvided(){return consume(mixed(quiet,browser))}
export function mixedOmitted(){return consume(mixed(quiet))}
export function mixedUndefined(){return consume(mixed(quiet,undefined))}
export function mixedPartial(other:(()=>string)|undefined){consume(mixed(quiet,browser));return consume(mixed(quiet,other))}
export function mixedStored(){return mixed(quiet)}
`

// Stored original packets prove source entry without rerunning selectors,
// binders or return planners after the public request's lifetime has closed.
func assertStagedLexicalDefaultConstructiveEntry(t *testing.T, session *Session) {
	t.Helper()
	project := qualifiedIncrementalProject(t, session)
	cache := project.callableCache
	if cache == nil || cache.owner == nil || cache.merged.facts == nil || !cache.ownsGeneration(project.program, cache.owner.checker) {
		t.Fatal("UNREACHED: original merged program/checker facts unavailable")
	}
	type entry struct {
		owner     string
		selection sourceRelativeDefaultSelection
	}
	seen := make(map[entry]bool)
	forwardRole, directOutput := false, false
	for _, fact := range cache.merged.facts {
		for _, call := range fact.staged.calls {
			declaration := call.invocation.declaration
			if declaration == nil || declaration.Name() == nil {
				continue
			}
			name := declaration.Name().Text()
			if fact.summary.Name == "forward" && name == "consume" {
				if call.inputs == nil || !call.inputs.delivered || len(call.invocation.actuals) != 1 {
					t.Fatal("UNREACHED: defaulted caller did not bind the actual nondefault consumer")
				}
				actual := call.invocation.actuals[0].endpoint
				if actual.kind != relativeEndpointRole || actual.role.kind != relativeRoleFormal || actual.role.declaration != fact.node || actual.role.slot != 0 {
					t.Fatal("defaulted caller argument was substituted instead of preserved as its formal role")
				}
				for _, binding := range call.inputs.relative.bindings {
					if binding.target.kind == relativeRoleFormal && binding.target.slot == 0 {
						for _, source := range binding.sources {
							forwardRole = forwardRole || source.kind == relativeEndpointRole && source.role == actual.role
						}
					}
				}
			}
			slot, defaults := 0, 1
			if name == "mixed" {
				slot, defaults = 1, 2
			} else if name != "direct" && name != "forward" {
				continue
			}
			if call.inputs == nil || call.sourceInputs != nil || call.legacyInputs || call.inputConsumerWait != nil || !call.inputs.delivered || !validStagedDataResultCall(call) || len(call.inputs.bound.defaults) != defaults || call.inputs.relative.unsupported != relativeInputsSupported || call.inputs.bound.cut != call.inputs.request.cut || call.inputs.bound.operation != call.invocation.operation {
				t.Fatal("UNREACHED: constructive source lacks its exact original delivered B", name, fact.summary.Name)
			}
			selected := call.inputs.bound.defaults[0]
			if selected.formal.slot != slot {
				t.Fatal("default selection lost authored slot order")
			}
			if name == "mixed" {
				if call.inputs.bound.defaults[1].selection != relativeDefaultRequired || len(call.invocation.actuals) < 1 || call.invocation.actuals[0].ordinal != 0 {
					t.Fatal("ordinary/default formal reducer lost the supplied leading actual or trailing default")
				}
				ordinary := false
				for _, binding := range call.inputs.relative.bindings {
					if binding.target.kind == relativeRoleFormal && binding.target.slot == 0 {
						for _, source := range binding.sources {
							ordinary = ordinary || sameOperationEndpoint(source, call.invocation.actuals[0].endpoint)
						}
					}
				}
				if !ordinary {
					t.Fatal("ordinary formal did not retain its real actual beside defaults")
				}
			}
			want := relativeDefaultRequired
			ownerName := fact.summary.Name
			if ownerName == name+"Provided" {
				want = relativeDefaultBypassed
			} else if ownerName == name+"Partial" {
				if len(call.invocation.actuals) <= slot {
					t.Fatal("conditional caller lost its original actual")
				}
				actual := call.invocation.actuals[slot].endpoint
				if actual.kind != relativeEndpointRole {
					want = relativeDefaultBypassed
				} else {
					want = relativeDefaultConditional
					role, donor := false, false
					for _, binding := range call.inputs.relative.bindings {
						if binding.target.kind != relativeRoleFormal || binding.target.slot != slot {
							continue
						}
						for _, source := range binding.sources {
							role = role || source.kind == relativeEndpointRole && source.role == actual.role
							donor = donor || source.kind == relativeEndpointExpression && source.expression != nil && source.expression.Name() != nil && source.expression.Name().Text() == "quiet"
						}
					}
					if !role || !donor {
						t.Fatal("conditional default dropped original caller role or authenticated quiet donor")
					}
				}
			}
			if selected.selection != want || fact.staged.operationsPending {
				t.Fatal("original default selection/pending contract failed", name, ownerName, selected.selection, want)
			}
			if ownerName == "directOmitted" {
				for _, recipe := range fact.staged.operationRecipes {
					result := recipe.callResult
					if result == nil || result.operand != nil || result.declaration != declaration || result.association.inputs != call.inputs || recipe.key.operation != call.invocation.operation || !recipe.delta.extracted {
						continue
					}
					for _, output := range recipe.delta.exposures {
						directOutput = directOutput || output.endpoint.kind == relativeEndpointExpression && output.endpoint.expression != nil && output.endpoint.expression.Name() != nil && output.endpoint.expression.Name().Text() == "quiet"
					}
				}
			}
			seen[entry{ownerName, selected.selection}] = true
		}
	}
	for _, name := range []string{"direct", "forward", "mixed"} {
		for _, row := range []struct {
			suffix string
			state  sourceRelativeDefaultSelection
		}{{"Provided", relativeDefaultBypassed}, {"Omitted", relativeDefaultRequired}, {"Undefined", relativeDefaultRequired}, {"Partial", relativeDefaultConditional}} {
			if !seen[entry{name + row.suffix, row.state}] {
				t.Fatal("UNREACHED: original constructive default binding", name, row.suffix)
			}
		}
	}
	if !forwardRole || !directOutput {
		t.Fatal("UNREACHED: defaulted caller forwarding role or direct-return DATA output", forwardRole, directOutput)
	}
}

func TestStagedLexicalDefaultConstructiveCallers(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			var application Response
			for _, packageType := range []string{"application", "library"} {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/lexical-default-constructive.ts", Source: stagedLexicalDefaultConstructiveSource, Target: target, PackageType: packageType, Diagnostics: "semantic", stagedReplacement: true})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal("entry experiment compilation", packageType, response.Error, response.Diagnostics)
				}
				assertStagedLexicalDefaultConstructiveEntry(t, session)
				for _, family := range []string{"direct", "forward", "mixed"} {
					for _, suffix := range []string{"Provided", "Omitted", "Undefined", "Partial"} {
						known, unknown, dormant := false, false, false
						for _, effect := range executableSummary(t, response, family+suffix).EffectSources {
							known = known || effect.Environment == "browser" && effect.Description == "window"
							unknown = unknown || effect.Environment == "unknown"
							dormant = dormant || effect.Environment == "browser" && effect.Description == "document"
						}
						if known != (suffix == "Provided" || suffix == "Partial") || unknown != (suffix == "Partial") || dormant {
							t.Fatal("known effect/runtime uncertainty/default body contract", family, suffix, executableSummary(t, response, family+suffix))
						}
					}
				}
				for _, name := range []string{"directStored", "mixedStored"} {
					if len(executableSummary(t, response, name).EffectSources) != 0 {
						t.Fatal("stored default DATA became invoked work", name)
					}
				}
				if packageType == "application" {
					application = response
				} else {
					appContract, err := json.Marshal(application.Analysis.Callables)
					if err != nil {
						t.Fatal(err)
					}
					libraryContract, err := json.Marshal(response.Analysis.Callables)
					if err != nil {
						t.Fatal(err)
					}
					if application.Code != response.Code || !bytes.Equal(appContract, libraryContract) || !reflect.DeepEqual(application.Diagnostics, response.Diagnostics) {
						t.Fatal("package context changed implementation or portable public callable contract")
					}
				}
			}
			file := filepath.Join(t.TempDir(), "constructive-default.mts")
			if err := os.WriteFile(file, []byte(application.Code), 0600); err != nil {
				t.Fatal(err)
			}
			const runner = `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];globalThis.window={get name(){events.push('browser');return'known'}};globalThis.document={get title(){throw'unused-default-sentinel'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);for(const family of['direct','forward','mixed']){assert.equal(m[family+'Omitted'](),'quiet');assert.equal(m[family+'Undefined'](),'quiet');assert.deepEqual(events,[]);assert.equal(m[family+'Provided'](),'known');assert.deepEqual(events,['browser']);events.length=0;assert.equal(m[family+'Partial'](undefined),'quiet');assert.deepEqual(events,['browser']);events.length=0;assert.equal(m[family+'Partial'](()=>{events.push('other');return'other'}),'other');assert.deepEqual(events,['browser','other']);events.length=0;assert.throws(()=>m[family+'Partial'](()=>{events.push('throw');throw'sentinel'}),e=>e==='sentinel');assert.deepEqual(events,['browser','throw']);events.length=0}for(const name of['directStored','mixedStored']){const saved=m[name]();assert.equal(typeof saved,'function');assert.deepEqual(events,[]);assert.equal(saved(),'quiet');assert.deepEqual(events,[])}`
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatal(err, string(output))
			}
		})
	}
}
