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

// Each target is separately selectable under the normal focused timeout. The
// same source, identity and target must emit the same app/library implementation.
func TestStagedLexicalDefaultGetCaptureSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			var application Response
			for _, packageType := range []string{"application", "library"} {
				session := NewSession()
				response := session.Execute(Request{Kind: "compile", ID: "/virtual/lexical-default-data.ts", Source: stagedLexicalDefaultDataSource, Target: target, PackageType: packageType, Diagnostics: "semantic"})
				if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
					t.Fatal(packageType, response.Error, response.Diagnostics)
				}
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
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/lexical-default-update.ts", Source: source, Target: TargetClient, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(response.Error, response.Diagnostics)
		}
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
