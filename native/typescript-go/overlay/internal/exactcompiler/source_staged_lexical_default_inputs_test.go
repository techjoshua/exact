package exactcompiler

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The existing getter-return fixture adds only ordinary lexical defaults. Every
// binding inspected below comes from the original collector, not a test binder.
const stagedLexicalDefaultDataSource = `
function factory(callback:()=>string=quiet,unused:()=>string=dormant){return ({get value(){return callback}}).value}
function browser(){return window.name}
function quiet(){return 'quiet'}
function dormant(){return document.title}
function consume(callback:()=>string){return callback()}
export function provided(){return consume(factory(browser))}
export function omitted(){return consume(factory())}
export function explicitUndefined(){return consume(factory(undefined))}
export function partial(other:(()=>string)|undefined){consume(factory(browser));return consume(factory(other))}
export function expose(){return factory()}
`

func assertStagedLexicalDefaultEffects(t *testing.T, response Response, defaultBrowser bool) {
	t.Helper()
	for name, want := range map[string]struct{ known, unknown bool }{
		"provided": {true, false}, "omitted": {defaultBrowser, false}, "explicitUndefined": {defaultBrowser, false}, "partial": {true, true}, "expose": {false, false},
	} {
		known, unknown, dormant := false, false, false
		for _, effect := range executableSummary(t, response, name).EffectSources {
			known = known || effect.Environment == "browser" && effect.Description == "window"
			unknown = unknown || effect.Environment == "unknown"
			dormant = dormant || effect.Environment == "browser" && effect.Description == "document"
		}
		if known != want.known || unknown != want.unknown || dormant {
			t.Fatalf("%s: default DATA lost a donor/unknown or invoked stored work: %#v", name, executableSummary(t, response, name))
		}
	}
}

func assertStagedLexicalDefaultBinderEntry(t *testing.T, session *Session) {
	t.Helper()
	project := qualifiedIncrementalProject(t, session)
	cache := project.callableCache
	if cache == nil || cache.owner == nil || cache.merged.facts == nil || !cache.ownsGeneration(project.program, cache.owner.checker) {
		t.Fatal("current merged factory facts have no matching program/checker owner")
	}
	seen := make(map[string]bool)
	for _, fact := range cache.merged.facts {
		for _, call := range fact.staged.calls {
			if call.invocation.declaration == nil || call.invocation.declaration.Name() == nil || call.invocation.declaration.Name().Text() != "factory" {
				continue
			}
			if call.inputs == nil || call.sourceInputs != nil || !call.inputs.delivered || !validStagedDataResultCall(call) || len(call.inputs.bound.defaults) != 2 || call.inputs.relative.unsupported != relativeInputsSupported {
				t.Fatal("original factory Call did not reach one delivered bound input edge", fact.summary.Name)
			}
			selected := call.inputs.bound.defaults[0].selection
			if call.inputs.bound.defaults[1].selection != relativeDefaultRequired {
				t.Fatal("unused default did not retain its own original selection")
			}
			want := relativeDefaultRequired
			switch fact.summary.Name {
			case "provided":
				want = relativeDefaultBypassed
			case "partial":
				if len(call.invocation.actuals) != 1 {
					t.Fatal("original conditional actual vector missing")
				}
				if call.invocation.actuals[0].endpoint.kind != relativeEndpointRole {
					want = relativeDefaultBypassed
					break
				}
				want = relativeDefaultConditional
				foundRole, foundDefault := false, false
				for _, binding := range call.inputs.relative.bindings {
					if binding.target.kind != relativeRoleFormal || binding.target.slot != 0 {
						continue
					}
					for _, source := range binding.sources {
						foundRole = foundRole || source.kind == relativeEndpointRole && source.role.declaration == fact.node && source.role.slot == 0
						foundDefault = foundDefault || source.kind == relativeEndpointExpression && source.expression != nil && source.expression.Name() != nil && source.expression.Name().Text() == "quiet"
					}
				}
				if !foundRole || !foundDefault {
					t.Fatal("conditional default lost original actual role or authentic known donor")
				}
			}
			if selected != want {
				t.Fatalf("%s actual binder selection %d, want %d", fact.summary.Name, selected, want)
			}
			if fact.staged.operationsPending {
				t.Fatal("actual default Call still has unpaid operation dependencies", fact.summary.Name)
			}
			seen[fact.summary.Name] = true
		}
	}
	for _, name := range []string{"provided", "omitted", "explicitUndefined", "partial", "expose"} {
		if !seen[name] {
			t.Fatal("original bound factory entry UNREACHED", name)
		}
	}
}

// Each target is separately selectable under the normal focused timeout. The
// same source, identity and target must emit the same app/library implementation.
func TestStagedLexicalDefaultGetCaptureSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			var application Response
			for _, packageType := range []string{"application", "library"} {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/lexical-default-data.ts", Source: stagedLexicalDefaultDataSource, Target: target, PackageType: packageType, Diagnostics: "semantic", stagedReplacement: true})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal(packageType, response.Error, response.Diagnostics)
				}
				assertStagedLexicalDefaultBinderEntry(t, session)
				assertStagedLexicalDefaultEffects(t, response, false)
				if packageType == "application" {
					application = response
				} else {
					if application.Code != response.Code {
						t.Fatal("package mode changed portable implementation")
					}
					applicationPublic, err := json.Marshal(application.Analysis.Callables)
					if err != nil {
						t.Fatal("application callable contract encoding", err)
					}
					libraryPublic, err := json.Marshal(response.Analysis.Callables)
					if err != nil {
						t.Fatal("library callable contract encoding", err)
					}
					if !bytes.Equal(applicationPublic, libraryPublic) {
						t.Fatal("package mode changed public callable SOURCE contracts")
					}
					if !reflect.DeepEqual(application.Diagnostics, response.Diagnostics) {
						t.Fatal("package mode changed diagnostics")
					}
				}
			}
			file := filepath.Join(t.TempDir(), "lexical-default.mts")
			if err := os.WriteFile(file, []byte(application.Code), 0600); err != nil {
				t.Fatal(err)
			}
			const runner = `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const events=[];globalThis.window={get name(){events.push('browser');return'known'}};globalThis.document={get title(){throw'unused-default-sentinel'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);const stored=m.expose();assert.equal(typeof stored,'function');assert.deepEqual(events,[]);assert.equal(stored(),'quiet');assert.equal(m.omitted(),'quiet');assert.equal(m.explicitUndefined(),'quiet');assert.deepEqual(events,[]);assert.equal(m.provided(),'known');assert.deepEqual(events,['browser']);events.length=0;assert.equal(m.partial(undefined),'quiet');assert.deepEqual(events,['browser']);events.length=0;assert.equal(m.partial(()=>{events.push('other');return'other'}),'other');assert.deepEqual(events,['browser','other']);events.length=0;assert.throws(()=>m.partial(()=>{events.push('throw');throw'sentinel'}),e=>e==='sentinel');assert.deepEqual(events,['browser','throw']);`
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatal(err, string(output))
			}
		})
	}
}

// Actual session updates must replace both default selection donors and their
// generation-owned AST associations; old detached packets grant no new issuer.
func TestStagedLexicalDefaultGetCaptureRetainedSession(t *testing.T) {
	session := NewSession()
	var retired func(*projectState) bool
	for _, browserDefault := range []bool{false, true, false} {
		source := stagedLexicalDefaultDataSource
		if browserDefault {
			source = strings.Replace(source, "callback:()=>string=quiet", "callback:()=>string=browser", 1)
		}
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/lexical-default-update.ts", Source: source, Target: TargetClient, Diagnostics: "semantic", stagedReplacement: true})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(response.Error, response.Diagnostics)
		}
		assertStagedLexicalDefaultEffects(t, response, browserDefault)
		project := qualifiedIncrementalProject(t, session)
		if retired != nil && !retired(project) {
			t.Fatal("source edit retained retired program/checker ownership")
		}
		oldProgram, oldCache := project.program, project.callableCache
		retired = func(current *projectState) bool {
			cache := current.callableCache
			return current.program != oldProgram && !oldCache.ownsGeneration(current.program, cache.owner.checker) && !cache.ownsGeneration(oldProgram, oldCache.owner.checker)
		}
	}
}

// These real source forms remain outside the inert initializer law. The
// original bind/default API cannot be entered merely to obtain a default value.
func TestStagedLexicalDefaultInputAdmissionRefusers(t *testing.T) {
	for _, row := range []struct{ name, setup, initializer string }{
		{"call", "function make(){return quiet}", "make()"},
		{"get", "const holder={get callback(){window.name;return quiet}}", "holder.callback"},
		{"mutable", "let mutable:()=>string=quiet;mutable=browser;", "mutable"},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function quiet(){return 'quiet'}function browser(){return window.name}` + row.setup + `function factory(callback:()=>string=` + row.initializer + `){return ({get value(){return callback}}).value}export function invoke(){return factory()}`
			withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
				facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
				for index := range facts {
					if facts[index].node == enclosingCallableNode(call) {
						if _, gap := describeStagedDeclarationInvocation(&facts[index], call, owner.checker, owner); gap == stagedCallSupported {
							t.Fatal("effectful/mutable default entered inert SOURCE admission")
						}
						return
					}
				}
				t.Fatal("original caller missing")
			})
		})
	}
}
