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

const stagedWriterResultSource = `function factory(){return()=>{window.name;return undefined}}export function invoke(){const map=new WeakMap<object,object>();map.get=factory();return map.get({})}`

// The actual local writer owner needs its source result, not the factory's
// normal output or an acquired capture scope for this input-independent method.
// This connection control observes the actual production entry independently
// of the still-required original assignment protocol. Its known prefix cannot
// establish whole-function placement while that separate producer is missing.
func TestStagedWriterResultOriginalConnection(t *testing.T) {
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/writer-result.ts", Source: stagedWriterResultSource, Diagnostics: "semantic", stagedReplacement: true})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	assertStagedWriterResultConnection(t, session)
	browser := false
	for _, effect := range executableSummary(t, response, "invoke").EffectSources {
		browser = browser || effect.Environment == "browser" && effect.Description == "window"
	}
	if !browser {
		t.Fatal("issued writer result lost known body contribution")
	}
}

func TestStagedWriterResultSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/writer-result.ts", Source: stagedWriterResultSource, Target: target, Diagnostics: "semantic", stagedReplacement: true})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			for _, fact := range stagedDeclarationFacts(session) {
				t.Logf("canonical %s ready=%t pending=%t calls=%+v pendingRoles=%+v", fact.summary.Name, fact.staged.ready, fact.staged.operationsPending, fact.summary.Calls, fact.staged.pending)
				if fact.summary.Name != "invoke" {
					continue
				}
				t.Logf("invoke ready=%t pending=%t uses=%d pendingRoles=%+v", fact.staged.ready, fact.staged.operationsPending, len(fact.staged.operationUses), fact.staged.pending)
				for _, recipe := range fact.staged.operationRecipes {
					if recipe.writer != nil {
						t.Logf("writer %s extracted=%t required=%+v reads=%+v projections=%+v", recipe.key.selector.field, recipe.delta.extracted, recipe.delta.required, recipe.writer.reads, recipe.writer.projections)
						for _, projection := range recipe.writer.projections {
							if projection != nil {
								t.Logf("projection context=%t extracted=%t pending=%+v values=%+v required=%+v", projection.resultContext, projection.delta.extracted, projection.pending, projection.delta.exposures, projection.delta.required)
							}
						}
					} else if recipe.constructionEffects != nil || recipe.constructedDisposition != nil || recipe.callResult != nil {
						t.Logf("role %s op=%v extracted=%t req=%+v values=%+v", recipe.key.selector.field, recipe.key.operation, recipe.delta.extracted, recipe.delta.required, recipe.delta.exposures)
					}
				}
			}
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		assertStagedWriterResultConnection(t, session)
		browser := false
		for _, effect := range executableSummary(t, response, "invoke").EffectSources {
			browser = browser || effect.Environment == "browser" && effect.Description == "window"
			if effect.Environment == "unknown" {
				t.Fatalf("result gap became runtime unknown: %+v", effect)
			}
		}
		if !browser {
			t.Fatal("issued writer DATA lost actual method body donor")
		}
		file := filepath.Join(t.TempDir(), "writer-result.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.window={get name(){events.push('window');return 'known'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);assert.equal(m.invoke(),undefined);assert.deepEqual(events,['window']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s: %v %s", target, err, output)
		}
	}
}

func TestStagedWriterResultUndefinedCapture(t *testing.T) {
	for _, row := range []struct {
		source   string
		captured bool
	}{
		{stagedWriterResultSource, false},
		{`function factory(undefined:()=>string){return()=>{window.name;return undefined()}}export function invoke(){return factory(()=>document.title)}`, true},
	} {
		withStagedReturnProgram(t, row.source, func(owner *executableBodyOwner, call *ast.Node) {
			symbol := owner.checker.GetSymbolAtLocation(call.Expression())
			templates := describeStagedReturnTemplates(symbol.ValueDeclaration, owner.values)
			if len(templates) != 1 || templates[0].unknown || (len(templates[0].captures) != 0) != row.captured || stagedCallReturnLiteralHasCapture(templates[0].callable, owner.values) != row.captured {
				t.Fatal("intrinsic undefined and original shadow capture confused")
			}
		})
	}
}

func TestStagedWriterResultPrivateAllocation(t *testing.T) {
	for _, row := range []struct {
		name, source string
		private      bool
	}{
		{"exported callable", `function factory(){}export function invoke(){const map=new WeakMap<object,object>();factory();map.get({})}`, true},
		{"returned allocation", `function factory(){}export function invoke(){const map=new WeakMap<object,object>();factory();map.get({});return map}`, false},
		{"exported allocation", `export const map=new WeakMap<object,object>();function factory(){}export function invoke(){factory();map.get({})}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedReturnProgram(t, row.source, func(owner *executableBodyOwner, creating *ast.Node) {
				file := ast.GetSourceFileOfNode(creating)
				var site, read *ast.Node
				walkNode(file.AsNode(), func(node *ast.Node) bool {
					if ast.IsNewExpression(node) {
						site = node
					}
					if ast.IsCallExpression(node) && ast.IsPropertyAccessExpression(node.Expression()) {
						read = node
					}
					return true
				})
				facts := stagedReturnSourceFacts(file)
				restore := registerPendingMemberFacts(owner, facts)
				defer restore()
				work := registerCallableEffectWork(facts)
				region := enclosingCallableNode(site)
				if region == nil {
					region = sourceStagedModuleOwner(site)
				}
				visitImplicitAccessors(site, owner.checker, nil, owner, region, nil, func(accessorCandidates) {})
				caller := work.memberNodes[enclosingCallableNode(read)]
				request, represented := work.prepareConstructedResultSource(facts, caller, read, owner)
				root := work.operationRecipes[request.producer]
				if !represented || len(root.constructedGroup) != 1 {
					t.Fatal("original construction/member publication missing")
				}
				if work.constructedUsesCovered(facts, &root.constructedGroup[0], owner) != row.private {
					t.Fatal("callable export confused with an actual allocation escape")
				}
			})
		})
	}
}

// The production Session must have reached the original receiver/writer owner.
// A ready factory alone cannot satisfy this exact reader or activate its body.
func assertStagedWriterResultConnection(t *testing.T, session *Session) {
	t.Helper()
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name != "invoke" {
			continue
		}
		if !fact.staged.settled || fact.staged.operationsPending {
			t.Fatal("writer consumer did not settle")
		}
		raw, invoked := false, false
		for _, recipe := range fact.staged.operationRecipes {
			source := recipe.writer
			if source == nil || source.parent.producer.selector.field != "own-writers" {
				continue
			}
			if len(source.reads) != 1 || len(source.projections) != 1 || source.projections[0] == nil {
				t.Fatal("original writer projection missing")
			}
			read, projection := source.reads[0], source.projections[0]
			rhs := read.write.AsBinaryExpression().Right
			if read.region != fact.node || read.call != nil || read.incomplete || read.value.expression != rhs || read.value.get != read.write.AsBinaryExpression().Left || read.get != source.parent.producer.operation || !recipe.delta.extracted || !projection.resultContext || len(projection.pending) != 0 || len(projection.delta.exposures) != 1 {
				t.Fatal("issued source context/result was replaced or incomplete")
			}
			alternative := projection.delta.exposures[0]
			if alternative.creating != nil || alternative.endpoint.creation != rhs || !ast.IsArrowFunction(alternative.endpoint.expression) {
				t.Fatal("capture-free DATA manufactured creating B or lost original factory")
			}
			child, covered := false, false
			for _, required := range projection.delta.required {
				for _, result := range fact.staged.operationRecipes {
					if result.key != required.producer || result.callResult == nil || result.key.operation != rhs {
						continue
					}
					association := result.callResult.association
					current := false
					for _, call := range fact.staged.calls {
						current = current || call.invocation.operation == rhs && call.sourceInputs != nil && call.sourceInputs == association.sourceInputs && call.inputs == association.inputs
					}
					if !current || association.inputs != nil || !result.delta.extracted {
						t.Fatal("factory DATA lost exact current source-call association")
					}
					child = true
				}
				for _, candidate := range fact.staged.operationRecipes {
					if candidate.memberSource == nil || candidate.memberSource.coverage == nil {
						continue
					}
					c := candidate.memberSource.coverage
					if c.origin != read.origin || c.cut != read.observation {
						continue
					}
					for _, debt := range c.required {
						covered = covered || sameOperationRequest(debt, required)
					}
				}
			}
			if !child || !covered {
				t.Fatal("original C did not retain exact writer DATA request")
			}
			if source.callable {
				invoked = true
				body := false
				for _, call := range fact.summary.Calls {
					body = body || call.Resolved && call.TargetID == writerResultBodyID(session, alternative.endpoint.expression)
				}
				if !body {
					t.Fatal("actual writer body canonical dependency missing")
				}
			} else {
				raw = true
			}
		}
		if !raw || !invoked {
			t.Fatal("original stored and invoked writer parents were not both served")
		}
		return
	}
	t.Fatal("original writer consumer fact missing")
}

func writerResultBodyID(session *Session, body *ast.Node) string {
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.node == body {
			return fact.summary.ID
		}
	}
	return ""
}
