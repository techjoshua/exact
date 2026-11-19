package exactcompiler

import (
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These are real declaration-only imports and ordinary source binders. Getter
// and Proxy bodies are MAY summary donors, never normal invocation receipts.
// Source uncertainty may refuse staged completion; it must not erase donors.
func TestFrameworkDeclaredInputMayEffects(t *testing.T) {
	for _, row := range []struct {
		name, expression string
		proxy            bool
	}{
		{"getter", `{get [proxyMarker](){document.title;return false}}`, false},
		{"proxy", `new Proxy({}, {get(){document.title;return undefined}})`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `/// <reference lib="dom" />
import {reactiveObjects} from '@exactjs/reactive/framework/objects';
import {proxyMarker} from '@exactjs/reactive/framework/runtime';
export function invoke(){return reactiveObjects(` + row.expression + `)}`
			withFrameworkViewProgram(t, source, func(owner *executableBodyOwner, generation *projectGeneration) {
				var call, donor *ast.Node
				walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
					if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "reactiveObjects" {
						call = n
					}
					if ast.IsGetAccessorDeclaration(n) || row.proxy && ast.IsMethodDeclaration(n) && callableNameText(n.Name()) == "get" {
						donor = n
					}
					return true
				})
				if call == nil || donor == nil {
					t.Fatal("original Call/input donor absent")
				}
				candidates := sourceInvocationDependencies(call, generation.checker, owner, enclosingCallableNode(call))
				assertFrameworkRuntimeMay(t, candidates, call)
				assertFrameworkMayDonor(t, candidates, donor)
				for _, receipt := range candidates.normalCalls {
					if receipt.operation == call {
						t.Fatal("framework contract manufactured normal output")
					}
				}
				// An observed pending source remains pending, beside the runtime contract.
				if frameworkEffectsCompilerPending(candidates) && !candidates.opaque && len(candidates.owned)+len(candidates.callFallbacks)+len(candidates.fieldFallbacks)+len(candidates.effects) == 0 {
					t.Fatal("pending source lost its original representation")
				}
			})
		})
	}
}

func TestFrameworkDeclaredCaptureMayEffects(t *testing.T) {
	const source = `/// <reference lib="dom" />
import {reactiveObjects} from '@exactjs/reactive/framework/objects';
import {proxyMarker} from '@exactjs/reactive/framework/runtime';
function create(read:()=>string){return reactiveObjects({get [proxyMarker](){read();return false}})}
export function invoke(){return create(()=>document.title)}`
	withFrameworkViewProgram(t, source, func(owner *executableBodyOwner, generation *projectGeneration) {
		var start, call, donor *ast.Node
		walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) {
				if n.Expression().Text() == "create" {
					start = n
				}
				if n.Expression().Text() == "reactiveObjects" {
					call = n
				}
			}
			if ast.IsArrowFunction(n) {
				donor = n
			}
			return true
		})
		if start == nil || call == nil || donor == nil {
			t.Fatal("original capture source absent")
		}
		q := newSourceDependencyQuery(start, generation.checker, owner, enclosingCallableNode(start))
		reached := false
		q.projectSourceCallReturns(start, nil, sourceCallResultInterest{purpose: resultSourceProjection}, func(v sourceValue, bound sourceValueBindings) {
			if v.node != call || q.inputs == nil || q.inputs.invocation != start || len(q.creators) == 0 || len(bound) == 0 {
				t.Fatal("real binder/creator connection absent")
			}
			c := q.invocation(call, bound)
			assertFrameworkRuntimeMay(t, c, call)
			assertFrameworkMayDonor(t, c, donor)
			reached = true
		}, func() { t.Fatal("real source return/default owner unavailable") })
		if !reached {
			t.Fatal("captured invocation input consumer unreached")
		}
	})
}

func TestFrameworkMixedCalleeKeepsOriginalSources(t *testing.T) {
	const source = `/// <reference lib="dom" />
import {reactiveObjects} from '@exactjs/reactive/framework/objects';
function authored(value:object[]){document.title;return value}
export function invoke(flag:boolean){const selected=flag?reactiveObjects:authored;return selected([])}`
	withFrameworkViewProgram(t, source, func(owner *executableBodyOwner, generation *projectGeneration) {
		var call, authored *ast.Node
		walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "selected" {
				call = n
			}
			if ast.IsFunctionDeclaration(n) && n.Name() != nil && n.Name().Text() == "authored" {
				authored = n
			}
			return true
		})
		if call == nil || authored == nil {
			t.Fatal("mixed original source absent")
		}
		c := sourceInvocationDependencies(call, generation.checker, owner, enclosingCallableNode(call))
		assertFrameworkMayDonor(t, c, authored)
		symbol := resolvedCallableSymbol(callTargetSymbol(call.Expression(), generation.checker), generation.checker)
		if symbol != nil && reactiveObjectsViewDeclaration(call, symbol.Declarations, owner) != nil {
			t.Fatal("mixed alias granted framework disposition")
		}
		for _, effect := range c.environmentEffects {
			if effect.callOrigin != nil && effect.callOrigin.phase == sourceFrameworkViewEffects {
				t.Fatal("unrecognized mixed callee acquired framework-only disposition")
			}
		}
	})
}

// A real source-result owner is required for source(). A contract label must
// not turn its unrepresented compiler DATA into a runtime residual/completion.
func TestFrameworkPendingInputSourceRemainsUnqualified(t *testing.T) {
	const source = `/// <reference lib="dom" />
import {reactiveObjects} from '@exactjs/reactive/framework/objects';
function source(){return [] as object[]}
export function invoke(){return reactiveObjects(source())}`
	withFrameworkViewProgram(t, source, func(owner *executableBodyOwner, generation *projectGeneration) {
		var call *ast.Node
		walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "reactiveObjects" {
				call = n
			}
			return true
		})
		if call == nil {
			t.Fatal("original source-result request absent")
		}
		facts := stagedReturnSourceFacts(generation.sourceFile)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		work := newCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(call)]
		if _, registered := work.registerStagedFrameworkEffects(facts, caller, call, owner); registered {
			t.Fatal("unsupported source-result input became completed framework Effects")
		}
		// This is a reachable refusal, not an executed late-initializer pending
		// positive, and it grants neither empty DATA nor a runtime unknown ACK.
		if _, issued := work.operationRecipes[stagedFrameworkEffectsRequest(call, enclosingCallableNode(call)).producer]; issued {
			t.Fatal("refused source input issued a recipe")
		}
	})
}

func assertFrameworkRuntimeMay(t *testing.T, c accessorCandidates, call *ast.Node) {
	t.Helper()
	count := 0
	for _, effect := range c.environmentEffects {
		if origin := effect.callOrigin; origin != nil && origin.operation == call && origin.phase == sourceFrameworkViewEffects {
			count++
			if effect.Environment != "unknown" || !effect.Opaque || effect.provenanceIncomplete {
				t.Fatal("contract runtime MAY was confused with compiler debt")
			}
		}
	}
	if count != 1 {
		t.Fatalf("genuine implicit runtime MAY count=%d", count)
	}
}
func assertFrameworkMayDonor(t *testing.T, c accessorCandidates, donor *ast.Node) {
	t.Helper()
	found := false
	for _, effect := range c.environmentEffects {
		found = found || effect.Environment == "browser"
	}
	for _, effect := range c.effects {
		found = found || effect.declaration == donor
	}
	for _, producer := range c.producers {
		found = found || producer == donor
	}
	if !found {
		t.Fatalf("actual source MAY donor was lost: %s@%d", donor.Kind, donor.Pos())
	}
}

// This goes through the real source recipe, existing operation queue and
// original three fact appenders. Descriptor X alone cannot supply graph issuance.
func TestStagedFrameworkEffectsOriginalPublisherLifecycle(t *testing.T) {
	const source = `/// <reference lib="dom" />
import {reactiveObjects} from '@exactjs/reactive/framework/objects';
export function invoke(){return reactiveObjects([])}`
	withFrameworkViewProgram(t, source, func(owner *executableBodyOwner, generation *projectGeneration) {
		var call *ast.Node
		walkNode(generation.sourceFile.AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) && n.Expression().Text() == "reactiveObjects" {
				call = n
			}
			return true
		})
		if call == nil {
			t.Fatal("original Call absent")
		}
		facts := stagedReturnSourceFacts(generation.sourceFile)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		work := newCallableEffectWork(facts)
		caller := work.memberNodes[enclosingCallableNode(call)]
		if !work.stageFrameworkEffects(facts, caller, call, owner) {
			t.Fatal("actual source collector/queue refused")
		}
		request := stagedFrameworkEffectsRequest(call, facts[caller].node)
		id, issued := work.operationIDs[request.producer]
		if !issued || work.operations[id.index].resultSourceRequested {
			t.Fatal("descriptor manufactured original publisher issuance")
		}
		work.prepareStagedFrameworkEffects(facts, id, owner)
		if !work.operations[id.index].resultSourceRequested {
			t.Fatal("original argument Effects publisher unreached")
		}
		count := len(facts[caller].summary.DirectEffectSources)
		if count == 0 {
			t.Fatal("actual per-call contract/MAY contribution missing")
		}
		work.prepareStagedFrameworkEffects(facts, id, owner)
		if len(facts[caller].summary.DirectEffectSources) != count {
			t.Fatal("repeated source wake reacquired/published original inputs")
		}
		bad := request
		bad.cut.reading = restrictedInvocationArguments(call.AsCallExpression())[0]
		if _, accepted := work.requireOperation(facts, bad); accepted {
			t.Fatal("foreign physical read adopted framework Effects")
		}
		clones := make([]callableFacts, len(facts))
		for i, fact := range facts {
			clones[i] = cloneProjectCallableFact(fact)
		}
		cloned := newCallableEffectWork(clones)
		// The old current publisher points to the original facts. A copied
		// descriptor cannot borrow that right or a completed source operation.
		if _, accepted := cloned.registerStagedFrameworkEffects(clones, caller, call, owner); accepted {
			t.Fatal("clone borrowed original live publisher")
		}
		restoreClone := registerWriterInputFacts(owner, clones)
		defer restoreClone()
		if !cloned.stageFrameworkEffects(clones, caller, call, owner) {
			t.Fatal("fresh clone publisher could not reissue original source")
		}
		next := cloned.operationIDs[request.producer]
		if next.index == 0 || cloned.operations[next.index].resultSourceRequested {
			t.Fatal("clone inherited source execution/currentness")
		}
		cloned.prepareStagedFrameworkEffects(clones, next, owner)
		if !cloned.operations[next.index].resultSourceRequested {
			t.Fatal("clone did not execute original producer")
		}
	})
}

// Full maintained canonical dispatch and first normal resolution, not a
// hand-installed query/frame or a post-Session currentness inspection. The
// separate default/creator control covers the original nested default source;
// the exact 300-source strict Session remains the original-workload gate.
func TestFrameworkBoundInputOriginalCollector(t *testing.T) {
	const source = `import {reactiveObjects} from '@exactjs/reactive/framework/objects';
function createErrorContextWithLimit(errors:object[]){reactiveObjects(errors)}
export function invoke(){createErrorContextWithLimit([])}`
	const root = "/home/techj/.t3/worktrees/exact/t3-5179cb70/.tmp/staged-analysis-first-slice/m08-fresh-runtime-provider-build/source/packages/core"
	id := filepath.Join(root, "src/component/g5-framework-bound-control.ts")
	request := Request{Kind: "analyze", Root: root, ConfigFile: filepath.Join(root, "tsconfig.json"), ID: id, Source: source, Diagnostics: "semantic"}
	withActiveModuleSourceWork(t, request, map[string]string{id: source}, nil, func(facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner) {
		var outer, nested *ast.Node
		walkNode(owner.values.program.GetSourceFile(id).AsNode(), func(n *ast.Node) bool {
			if ast.IsCallExpression(n) && ast.IsIdentifier(n.Expression()) {
				if n.Expression().Text() == "createErrorContextWithLimit" {
					outer = n
				}
				if n.Expression().Text() == "reactiveObjects" {
					nested = n
				}
			}
			return true
		})
		if outer == nil || nested == nil {
			t.Fatal("actual collector original Calls absent")
		}
		caller := work.memberNodes[enclosingCallableNode(outer)]
		connected := false
		for _, call := range facts[caller].staged.calls {
			if call.invocation.operation != outer {
				continue
			}
			if call.sourceInputs == nil || call.inputs != nil || call.legacyInputs || call.inputConsumerWait != nil {
				t.Fatal("bound MAY producer fabricated B or retained legacy/input wait")
			}
			recipe := work.operationRecipes[stagedDeclarationCallEffectsRequest(outer, facts[caller].node).producer]
			id, adopted := work.operationIDs[recipe.key]
			if !adopted || !work.operations[id.index].frameworkInputsRequested || !work.operations[id.index].frameworkInputsComplete {
				t.Fatal("actual bound source publisher not connected/completed")
			}
			connected = true
		}
		if !connected {
			t.Fatal("original collector did not issue source-input association")
		}
		found := false
		for _, effect := range facts[caller].summary.DirectEffectSources {
			if origin := effect.callOrigin; origin != nil && origin.operation == nested && origin.phase == sourceFrameworkViewEffects && effect.Environment == "unknown" && effect.Opaque && !effect.provenanceIncomplete {
				found = true
			}
		}
		if !found {
			t.Fatal("instantiated framework runtime MAY missing at original Call owner")
		}
	}, activeModuleCompleteAnalysis)
}
