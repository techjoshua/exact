package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

const stagedAssignmentStandardReceiverSource = `
function factory(){return()=>{window.name;return undefined}}
export function invoke(){const map=new WeakMap<object,object>();map.get=factory();return map.get({})}
export function installOnly(){const map=new WeakMap<object,object>();map.get=factory();return 0}
`

// The original Set replaces an own method. Assignment and factory evaluation
// do not invoke either the replacement or the standard prototype method. The
// later original read/Call consumes the independently retained stored DATA.
func TestStagedAssignmentStandardReceiverSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, replacement := range []bool{true, false} {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/assignment-standard-receiver.ts", Source: stagedAssignmentStandardReceiverSource, Target: target, Diagnostics: "semantic", stagedReplacement: replacement})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
			}
			for name, wantBrowser := range map[string]bool{"invoke": true, "installOnly": false} {
				browser, unknown := false, false
				for _, effect := range executableSummary(t, response, name).EffectSources {
					browser = browser || effect.Environment == "browser" && effect.Description == "window"
					unknown = unknown || effect.Environment == "unknown"
				}
				if browser != wantBrowser || unknown {
					t.Fatalf("%s original Set lost replacement or invoked it eagerly: %#v", name, executableSummary(t, response, name))
				}
			}
			facts := stagedDeclarationFacts(session)
			sets := 0
			for _, fact := range facts {
				if fact.summary.Name != "invoke" && fact.summary.Name != "installOnly" {
					continue
				}
				if !fact.staged.settled || fact.staged.operationsPending {
					t.Fatal("original assignment consumer remains pending")
				}
				recipes := make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
				for _, recipe := range fact.staged.operationRecipes {
					recipes[recipe.key] = recipe
				}
				for _, recipe := range fact.staged.operationRecipes {
					if recipe.assignment == nil || recipe.assignment.phase != "" {
						continue
					}
					sets++
					if !recipe.delta.extracted || len(recipe.delta.required) != len(stagedAssignmentPhases) {
						t.Fatal("Set did not retain all five original phase dependencies")
					}
					var rhs sourceStagedOperationRecipe
					for _, request := range recipe.delta.required {
						phase := recipes[request.producer]
						if phase.assignment == nil || !phase.delta.extracted || phase.assignment.root.producer != recipe.key {
							t.Fatal("original Set phase source is unrepresented")
						}
						if phase.assignment.phase == "rhs" {
							rhs = phase
						}
					}
					callFound := false
					for _, request := range rhs.delta.required {
						child := recipes[request.producer]
						if child.declarationCall == nil {
							continue
						}
						if request.inputs != nil || request.producer.kind != relativeDemandEffects || request.producer.selector != (sourceStagedOperationSelector{}) || !sameOperationRequest(request, stagedDeclarationCallEffectsRequest(request.use, fact.node)) || !child.delta.extracted {
							t.Fatal("RHS Call Effects was replaced by DATA or a retargeted cut")
						}
						for _, call := range fact.staged.calls {
							if call.invocation.operation != request.use || call.invocation.declaration != child.declarationCall.invocation.declaration {
								continue
							}
							edge := stagedDeclarationCallEdge(fact.summary.ID, call.invocation)
							for _, actual := range fact.summary.Calls {
								if actual.ID == edge && actual.Resolved && fact.fieldEdgeOperations[edge] == request.use {
									callFound = true
								}
							}
						}
					}
					if !callFound {
						t.Fatal("Set RHS lacks its original reached factory canonical relationship")
					}
				}
			}
			if sets != 2 {
				t.Fatalf("original source Set roots=%d want2", sets)
			}
			file := filepath.Join(t.TempDir(), "assignment-standard-receiver.mts")
			if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.window={get name(){events.push('replacement');return 'known'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);assert.equal(m.installOnly(),0);assert.deepEqual(events,[]);assert.equal(m.invoke(),undefined);assert.deepEqual(events,['replacement']);`
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatalf("runtime %s: %v %s", target, err, output)
			}
		}
	}
}

// The receiver gate only permits traversal under an original live Set loan.
// It neither observes a Set nor closes C, and an unavailable construction or
// copied/cut-changed issuer must retain the existing receiver deferral.
func TestStagedAssignmentStandardConstructionGate(t *testing.T) {
	const source = `function factory(){return()=>{window.name;return undefined}}export function invoke(){const map=new WeakMap<object,object>();map.get=factory();return map.get({})}`
	withStagedAssignmentSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		var site *ast.Node
		walkNode(q.effectOwner, func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				site = node
			}
			return true
		})
		work := registerCallableEffectWork(facts)
		if !work.prepareStagedConstructionSource(facts, site, q.executable) {
			t.Fatal("original construction source unavailable")
		}
		contribution, published := q.executable.standardConstructions[site]
		if !published || !contribution.selectionComplete {
			t.Fatal("original reached construction premise absent")
		}
		target := operation.AsBinaryExpression().Left
		request := q.sourceSetterRequest(target, accessorSet|accessorNoGet, nil)
		if request == nil {
			t.Fatal("original source Set request absent")
		}
		prior, protected := q.setterInput, q.protectedMember
		borrow := &sourceStagedAssignmentBorrow{issuer: q, request: request, generation: q.owner.generation, cut: q.relativeInputCut(operation), complete: true, allData: true}
		request.assignment = borrow
		q.setterInput, q.protectedMember = request, target
		defer func() {
			q.setterInput, q.protectedMember = prior, protected
			request.assignment = nil
			borrow.finished = true
		}()
		if !q.stagedStandardAssignmentConstruction(site) {
			t.Fatal("original published construction cannot reach Set source")
		}
		result := accessorCandidates{}
		if q.deferStagedAssignmentReceiver(site, accessorSet|accessorNoGet, &result) || !borrow.complete || result.valueIncomplete || borrow.observed || len(borrow.covered) != 0 {
			t.Fatal("source gate deferred valid traversal or fabricated disposition")
		}
		copied := *q
		if copied.stagedStandardAssignmentConstruction(site) {
			t.Fatal("copied query inherited live Set issuer")
		}
		reading := q.reading
		q.reading = nil
		if q.stagedStandardAssignmentConstruction(site) {
			t.Fatal("changed physical cut inherited live Set issuer")
		}
		q.reading = reading
		delete(q.executable.standardConstructions, site)
		if q.stagedStandardAssignmentConstruction(site) {
			t.Fatal("unpublished construction opened Set traversal")
		}
		q.executable.standardConstructions[site] = contribution
		incomplete := contribution
		incomplete.selectionComplete = false
		q.executable.standardConstructions[site] = incomplete
		if q.stagedStandardAssignmentConstruction(site) {
			t.Fatal("mixed/unrepresented constructor alternatives opened Set traversal")
		}
		q.executable.standardConstructions[site] = contribution
	})
}
