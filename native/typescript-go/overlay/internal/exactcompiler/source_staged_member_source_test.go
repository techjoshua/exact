package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Source publication precedes the original argument/receiver/RHS consumers.
// It must not promote candidate discovery to activation, even with real inputs.
func TestStagedMemberOriginalSourceBeforeRecovery(t *testing.T) {
	for _, control := range []struct{ name, target string }{
		{"direct", "target.run"},
		{"parenthesizedProperty", "(target.run)"},
		{"nestedProperty", "((target.run))"},
		{"assertedProperty", "(target.run as (() => number))"},
		{"parenthesizedElement", "(target['run'])"},
		{"nonnullElement", "(target['run']!)"},
	} {
		t.Run(control.name, func(t *testing.T) {
			fixture := `const box={run:()=>1};function put(target:typeof box,value:()=>number){` + control.target + `=value}function install(){Object.defineProperty(box,'run',{value:()=>2})}export function invoke(){put(box,()=>3);install();return box.run()}`
			// This owner control inspects pending SOURCE registration, not public algorithm completion.
			// The existing helper rejects all non-coverage errors and partial artifacts.
			withSourceCalleeWriteQueryStatus(t, fixture, func(q *sourceValueQuery, call *ast.Node) {
				facts := installationSourceFacts(q)
				fact := &facts[installationFactIndex(t, facts, q.effectOwner)]
				request, ok := sourceStagedOccurrenceRequest(fact, call, relativeDemandEffects, "member-owner-control")
				if !ok {
					t.Fatal("original source occurrence")
				}
				work := callableEffectWork{extracting: -1, operationGeneration: q.owner.generation}
				candidates := []sourceStagedMemberCandidate{}
				dispositions := 0
				revoke, installed := q.beginStagedMemberSource(request, func(candidate sourceStagedMemberCandidate) bool {
					if q.pendingWriterInput != nil || q.normalBindingCall != nil || q.stagedMember.read == nil {
						t.Fatal("source publication waited for writer inputs")
					}
					if !candidate.reflective && ast.IsBinaryExpression(candidate.operation) {
						assignment := candidate.operation.AsBinaryExpression()
						member := unwrapSourceCallableReference(assignment.Left)
						receiver, key := accessorReceiver(member)
						if candidate.target.expression != receiver || key != "run" || candidate.value.expression != assignment.Right || candidate.value.get != assignment.Left {
							t.Fatal("normalized target lost original writer/value/Get association")
						}
						var expectedKey *ast.Node
						if ast.IsElementAccessExpression(member) {
							expectedKey = member.AsElementAccessExpression().ArgumentExpression
						} else {
							expectedKey = member.Name()
						}
						if candidate.key.expression != expectedKey || candidate.target.producer != candidate.operation || candidate.key.producer != candidate.operation || candidate.value.producer != candidate.operation || candidate.target.cut != candidate.cut || candidate.key.cut != candidate.cut || candidate.value.cut != candidate.cut {
							t.Fatal("source endpoints lost original key/producer/cut")
						}
					}
					altered := candidate
					altered.target.expression = q.effectOwner
					if work.registerStagedMemberCandidate(facts, q, request, altered) {
						t.Fatal("altered source endpoint admitted")
					}
					copied := *q
					if work.registerStagedMemberCandidate(facts, &copied, request, candidate) {
						t.Fatal("copied issuer acquired publication")
					}
					if !work.registerStagedMemberCandidate(facts, q, request, candidate) {
						t.Fatal("original candidate not registered")
					}
					recipe := work.operationRecipes[stagedMemberCandidateRequest(request, candidate).producer]
					if recipe.delta.extracted || operationDeltaSize(recipe.delta) != 0 {
						t.Fatal("candidate paid activation/value debt")
					}
					candidates = append(candidates, candidate)
					return true
				}, func(receipt sourceStagedMemberDisposition) bool {
					if receipt.delta.extracted || len(receipt.delta.residuals) != 0 {
						t.Fatal("inventory became completion or runtime unknown")
					}
					dispositions++
					return work.registerStagedMemberDisposition(facts, q, receipt)
				})
				if !installed {
					t.Fatal("original source interval")
				}
				q.receiverCandidates(call, nil)
				revoke()
				assignment, reflective := false, false
				for _, candidate := range candidates {
					assignment = assignment || !candidate.reflective
					reflective = reflective || candidate.reflective
				}
				if !assignment || !reflective || dispositions == 0 {
					t.Fatal("original assignment/reflective source relations missing", assignment, reflective, dispositions)
				}
				if work.registerStagedMemberCandidate(facts, q, request, candidates[0]) {
					t.Fatal("expired source publication accepted")
				}
				for _, recipe := range work.operationRecipes {
					if recipe.memberSource == nil {
						continue
					}
					if work.registerOperationUse(facts, sourceStagedOperationUse{request: recipe.memberSource.request, call: call}) {
						t.Fatal("source inventory authorized a stored invocation")
					}
					if _, ok := work.requireOperation(facts, recipe.memberSource.request); !ok {
						t.Fatal("typed pending source ticket refused")
					}
				}
				work.prepareOperationUses(facts, q.executable)
				knownStored := false
				for _, recipe := range work.operationRecipes {
					if recipe.memberSource == nil {
						continue
					}
					for _, value := range recipe.delta.exposures {
						knownStored = knownStored || value.endpoint.expression != nil && ast.IsArrowFunction(value.endpoint.expression)
					}
					if len(recipe.delta.invoked)+len(recipe.delta.effects)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
						t.Fatal("stored source data activated a body")
					}
				}
				if !knownStored {
					t.Fatal("current creating association did not transfer known stored RHS")
				}
				// Original reference Effects can close without proving a writer ran.
				// The stored payload must remain dormant, as checked above.
			}, true)
		})
	}
}

func TestStagedMemberExternalUnknownOriginalSource(t *testing.T) {
	for _, write := range []bool{false, true} {
		body := "return scope[key]"
		if write {
			body = "scope[key]=1;return 1"
		}
		fixture := `const scope=globalThis as Record<PropertyKey,unknown>;function quiet(){}export function invoke(key:PropertyKey){quiet();` + body + `}`
		withSourceCalleeWriteQuery(t, fixture, func(parent *sourceValueQuery, _ *ast.Node) {
			var operation *ast.Node
			walkNode(ast.GetSourceFileOfNode(parent.effectOwner).AsNode(), func(node *ast.Node) bool {
				if ast.IsElementAccessExpression(node) {
					operation = node
				}
				return true
			})
			if operation == nil {
				t.Fatal("original member")
			}
			q := newSourceDependencyQuery(operation, parent.owner.checker, parent.executable, parent.effectOwner)
			facts := installationSourceFacts(parent)
			fact := &facts[installationFactIndex(t, facts, q.effectOwner)]
			request, ok := sourceStagedOccurrenceRequest(fact, operation, relativeDemandEffects, "external-member-control")
			if !ok {
				t.Fatal("original external occurrence")
			}
			work := callableEffectWork{extracting: -1}
			revoke, installed := work.beginStagedMemberWork(q, facts, request)
			if !installed {
				t.Fatal("original member work")
			}
			q.evaluatedSourceAccessors(operation, nil)
			revoke()
			terminals := 0
			for _, recipe := range work.operationRecipes {
				if recipe.memberSource == nil || !recipe.memberSource.candidate.runtimeUnknown {
					continue
				}
				terminals++
				source := recipe.memberSource
				if source.candidate.operation != operation || source.candidate.cut.operation != operation || !recipe.delta.extracted || len(recipe.delta.residuals) != 1 {
					t.Fatal("external terminal lost original source/cut")
				}
				coverage := work.operationRecipes[stagedMemberCoverageRequest(source.parent, source.candidate.origin, source.candidate.cut).producer].memberSource
				retained := false
				if coverage != nil && coverage.coverage != nil {
					for _, required := range coverage.coverage.required {
						retained = retained || sameOperationRequest(required, source.request)
					}
				}
				if !retained {
					t.Fatal("source set lost its later reached external terminal")
				}
				if _, ok := work.requireOperation(facts, source.request); !ok {
					t.Fatal("typed external terminal refused")
				}
			}
			if terminals == 0 {
				t.Fatal("reached original global terminal not observed", write)
			}
			work.prepareOperationUses(facts, q.executable)
			closed := work.closedOperationDependencies()
			for key, id := range work.operationIDs {
				if work.operationRecipes[key].memberSource != nil && work.operationRecipes[key].memberSource.candidate.runtimeUnknown {
					if !closed[id.index] {
						t.Fatal("independent reached external terminal not extracted")
					}
					generation := work.operationGeneration
					work.operationGeneration = &projectGeneration{}
					if work.closedOperationDependencies()[id.index] {
						t.Fatal("old external receipt crossed generation")
					}
					work.operationGeneration = generation
				}
			}
		})
	}
}

func TestStagedMemberNativeOwnerRegistersBeforeRecovery(t *testing.T) {
	const fixture = `function install(target:object,key:PropertyKey){Object.defineProperty(target,key,{value:()=>1})}export function invoke(){return Object.defineProperty({},'run',{})}`
	withSourceCalleeWriteQueryStatus(t, fixture, func(q *sourceValueQuery, call *ast.Node) {
		facts := installationSourceFacts(q)
		request, ok := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, q.effectOwner)], call, relativeDemandEffects, "native-member-owner")
		if !ok {
			t.Fatal("original native occurrence")
		}
		work := callableEffectWork{extracting: -1}
		revoke, installed := q.beginStagedNativeGetSource(&work, facts, sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: restrictedInvocationArguments(call.AsCallExpression())[2], request: request})
		if !installed {
			t.Fatal("original native source")
		}
		q.receiverCandidates(call, nil)
		revoke()
		found := false
		bindingRead := false
		for _, recipe := range work.operationRecipes {
			if recipe.memberSource != nil {
				found = true
				bindingRead = bindingRead || recipe.memberSource.candidate.cut.operation != call
				if recipe.delta.extracted && ((recipe.memberSource.coverage == nil || !validStagedMemberCoverageRecipe(recipe)) && (recipe.memberSource.getEffects == nil || !validStagedMemberGetEffectsRecipe(recipe)) && (recipe.memberSource.call == nil || !validStagedMemberCallRecipe(recipe)) && (recipe.memberSource.protocolSource == nil || !validStagedMemberProtocolRecipe(recipe))) {
					t.Fatal("native candidate supplied selection completion")
				}
				if recipe.memberSource.coverage != nil && len(recipe.delta.required) == 0 {
					t.Fatal("finite source extraction discarded required writer/protocol children")
				}
			}
		}
		for _, state := range work.operations {
			if state.nativeCallee != nil {
				t.Fatal("finite source extraction supplied native selection")
			}
		}
		if !found || !bindingRead {
			t.Fatal("actual native member owner did not publish initial binding and member candidates", found, bindingRead)
		}
	}, true)
}

func TestStagedMemberCalleePhaseUsesSharedOriginalCut(t *testing.T) {
	const fixture = `const holder={run(...values:unknown[]){}};declare function argument():unknown;declare function deferred():void;function factory(){return holder}export function invoke(){holder.run=()=>{};return factory().run(argument(),()=>deferred())}`
	withSourceCalleeWriteQuery(t, fixture, func(parent *sourceValueQuery, _ *ast.Node) {
		var call, earlier, argument, deferred, factory *ast.Node
		walkNode(ast.GetSourceFileOfNode(parent.effectOwner).AsNode(), func(node *ast.Node) bool {
			if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindEqualsToken {
				earlier = node
			}
			if ast.IsCallExpression(node) {
				if ast.IsPropertyAccessExpression(node.Expression()) && node.Expression().Name().Text() == "run" {
					call = node
				}
				if ast.IsIdentifier(node.Expression()) {
					switch node.Expression().Text() {
					case "argument":
						argument = node
					case "deferred":
						deferred = node
					case "factory":
						factory = node
					}
				}
			}
			return true
		})
		if call == nil || earlier == nil || argument == nil || deferred == nil || factory == nil {
			t.Fatal("original ordered source")
		}
		q := newSourceDependencyQuery(call.Expression(), parent.owner.checker, parent.executable, parent.effectOwner)
		facts := installationSourceFacts(parent)
		request, owned := sourceStagedOccurrenceRequest(&facts[installationFactIndex(t, facts, q.effectOwner)], call.Expression(), relativeDemandEffects, "ordinary-callee-phase")
		if !owned {
			t.Fatal("original Get occurrence")
		}
		revoke, installed := q.beginStagedMemberSource(request, func(sourceStagedMemberCandidate) bool { return true }, func(sourceStagedMemberDisposition) bool { return true })
		if !installed {
			t.Fatal("ordinary original callee loan")
		}
		cut := &sourceMemberWriterReadCut{operation: call.Expression(), use: call.Expression()}
		get := &sourceGetInputs{operation: call.Expression()}
		for name, operation := range map[string]*ast.Node{"argument": argument, "earlier": earlier, "deferred": deferred, "factory": factory} {
			result := accessorCandidates{}
			if got := cut.followsCalleeGet(q, get, operation, &result); got != (name == "argument") {
				t.Fatal("ordinary Get lost before-argument phase", name, got)
			}
		}
		copied := *q
		result := accessorCandidates{}
		if cut.followsCalleeGet(&copied, get, argument, &result) {
			t.Fatal("copied ordinary query inherited source callee cut")
		}
		revoke()
		if cut.followsCalleeGet(q, get, argument, &result) {
			t.Fatal("expired ordinary callee cut survived")
		}
	})
}
