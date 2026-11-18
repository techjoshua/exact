package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This exercises the original New/Get publishers before ordinary enrollment.
// A complete conditional method branch still requires its own full Effects
// root, C, callee and eager producers; it never invokes a stored payload.
func TestStagedPrivateWeakMapMethodOriginalSource(t *testing.T) {
	for _, method := range []string{"get", "set"} {
		t.Run(method, func(t *testing.T) {
			body := `return table.get(key)`
			if method == "set" {
				body = `table.set(key,()=>document.title)`
			}
			withPrivateWeakMapMethodSource(t, `const table=new WeakMap<object,object>();export function invoke(key:object){`+body+`}`, func(q *sourceValueQuery, call *ast.Node) {
				facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
				restore := registerPendingMemberFacts(q.executable, facts)
				defer restore()
				work := registerCallableEffectWork(facts)
				caller := work.memberNodes[q.effectOwner]
				request, registered := work.prepareStagedStandardMemberCall(facts, caller, call, q.executable)
				if !registered {
					t.Fatal("original conditional method source not registered")
				}
				recipe := work.operationRecipes[request.producer]
				if !validStagedMemberCallRecipe(recipe) || !recipe.delta.extracted || !recipe.memberSource.call.complete || len(recipe.memberSource.call.standard) != 1 {
					t.Fatal("original full-tail method branch not locally complete")
				}
				source := recipe.memberSource.call.standard[0]
				if !sameOperationRequest(source.request, recipe.memberSource.parent) || source.get != call.Expression() || source.cut != (sourceRelativeCut{operation: call, reading: call, initializing: call}) {
					t.Fatal("method source lost original operation/Get/cut")
				}
				for _, required := range standardMemberCallRequirements(&source) {
					found := false
					for _, actual := range recipe.delta.required {
						found = found || sameOperationRequest(required, actual)
					}
					if !found {
						t.Fatal("method source lost required original role", required.producer.selector.field)
					}
				}
				if len(facts[caller].staged.operationUses) != 0 || len(facts[caller].staged.constructedOccurrences) != 0 || len(work.operations) > 1 || len(recipe.delta.effects)+len(recipe.delta.invoked)+len(recipe.delta.exposures)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
					t.Fatal("source discovery activated a Call or supplied output")
				}
				if _, accepted := work.registerStagedStandardMemberCall(facts, q, source); accepted {
					t.Fatal("detached source description gained original event authority")
				}
				before := len(work.operationRecipes)
				if again, ok := work.prepareStagedStandardMemberCall(facts, caller, call, q.executable); !ok || !sameOperationRequest(again, request) || len(work.operationRecipes) != before {
					t.Fatal("current method source was not reused")
				}
				clone := make([]callableFacts, len(facts))
				for i := range facts {
					clone[i] = cloneProjectCallableFact(facts[i])
				}
				fresh := registerCallableEffectWork(clone)
				if fresh.memberCoverageObserved[request.producer] != nil {
					t.Fatal("cloned description inherited original Get observation")
				}
				restoreClone := registerPendingMemberFacts(q.executable, clone)
				defer restoreClone()
				if current, ok := fresh.prepareStagedStandardMemberCall(clone, caller, call, q.executable); !ok || !sameOperationRequest(current, request) || fresh.memberCoverageObserved[current.producer] != q.owner.generation {
					t.Fatal("fresh original method Get failed to renew cloned description")
				}
			})
		})
	}
}

// The original opacity contributor in 400 has two literal actuals. An alias
// descriptor map would demand a separate module/input producer before New.
const stagedPrivateMethodDisjointReflectivePrefix = `Object.defineProperties({}, {tag:{value:true}});`

// The private-use proof is complete and rejects actual own-method alternatives
// and escapes. A genuine constructor seed alone cannot close these branches.
func TestStagedPrivateWeakMapMethodUnrepresentedSources(t *testing.T) {
	for _, row := range []struct{ name, prefix, receiver string }{
		{"own replacement", `table.get=(_key:object)=>({});`, "table"},
		{"getter", `Object.defineProperty(table,'get',{get(){document.title;return (_key:object)=>({})}});`, "table"},
		{"reflective escape", `declare function expose(value:object):void;expose(table);`, "table"},
		{"mixed receiver", `declare const other:WeakMap<object,object>;declare const choose:boolean;const receiver=choose?table:other;`, "receiver"},
		{"written receiver", `declare const other:WeakMap<object,object>;let receiver=table;receiver=other;`, "receiver"},
		{"multiple private sources", `let receiver=table;receiver=new WeakMap<object,object>();`, "receiver"},
		{"proxy receiver", `const receiver=new Proxy(table,{});`, "receiver"},
		{"opaque own replacement", stagedPrivateMethodDisjointReflectivePrefix + `table.get=(_key:object)=>({});`, "table"},
		{"opaque getter", stagedPrivateMethodDisjointReflectivePrefix + `Object.defineProperty(table,'get',{get(){document.title;return (_key:object)=>({})}});`, "table"},
		{"opaque unknown method", stagedPrivateMethodDisjointReflectivePrefix + `declare const foreign:(key:object)=>object|undefined;table.get=foreign;`, "table"},
	} {
		t.Run(row.name, func(t *testing.T) {
			withPrivateWeakMapMethodSource(t, `const table=new WeakMap<object,object>();`+row.prefix+`export function invoke(key:object){return `+row.receiver+`.get(key)}`, func(q *sourceValueQuery, call *ast.Node) {
				facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
				restore := registerPendingMemberFacts(q.executable, facts)
				defer restore()
				work := registerCallableEffectWork(facts)
				work.prepareStagedStandardMemberCall(facts, work.memberNodes[q.effectOwner], call, q.executable)
				for _, recipe := range work.operationRecipes {
					if recipe.memberSource != nil && recipe.memberSource.call != nil && len(recipe.memberSource.call.standard) != 0 && (recipe.delta.extracted || recipe.memberSource.call.complete) {
						t.Fatal("unsupported receiver/method source became complete")
					}
				}
			})
		})
	}
}

// Only the synchronous full-tail event may refine a pending method role. A
// copied query/Get, altered cut or generation cannot borrow that authority.
func TestStagedPrivateWeakMapMethodOriginalEventLifetime(t *testing.T) {
	for _, row := range []struct {
		name, prefix string
		opaque       bool
	}{
		{"clean", "", false},
		{"disjoint reflective source", stagedPrivateMethodDisjointReflectivePrefix, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withPrivateWeakMapMethodSource(t, row.prefix+`const table=new WeakMap<object,object>();export function invoke(key:object){return table.get(key)}`, func(q *sourceValueQuery, call *ast.Node) {
				facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
				restore := registerPendingMemberFacts(q.executable, facts)
				defer restore()
				work := registerCallableEffectWork(facts)
				caller := work.memberNodes[q.effectOwner]
				occurrence := stagedConstructedOccurrenceAt(&facts[caller], call, q.executable)
				if occurrence == nil || len(occurrence.sites) != 1 {
					t.Fatal("original source allocation missing")
				}
				if row.opaque {
					preparePrivateMethodOriginalModulePrefix(t, facts, &work, q.executable, occurrence.sites[0])
				}
				if !work.prepareStagedConstructionSource(facts, occurrence.sites[0], q.executable) {
					t.Fatal("original source construction unavailable")
				}
				priorIDs := len(work.operationIDs)
				work.operationGeneration = q.owner.generation
				q.initializing, q.protectedMember = call, call.Expression()
				var observed sourceStagedConstructedMember
				pending, complete := 0, 0
				result := accessorCandidates{}
				revoke, installed := q.beginStagedConstructedMemberSource(occurrence.request, occurrence.sites[0], func(source sourceStagedConstructedMember, _ []*ast.SourceFile, _ bool) bool {
					return work.registerConstructedMemberSourcePrefix(facts, source)
				}, func(query *sourceValueQuery, source sourceStagedConstructedMember) bool {
					if !query.stagedConstructedMember.finishing {
						pending++
						_, ok := work.registerStagedPendingStandardMemberCall(facts, query, source)
						return ok
					}
					complete++
					observed = source
					copied := *query
					if _, ok := work.registerStagedStandardMemberCall(facts, &copied, source); ok {
						t.Fatal("copied query issued method Effects")
					}
					bad := source
					bad.cut.initializing = nil
					if _, ok := work.registerStagedStandardMemberCall(facts, query, bad); ok {
						t.Fatal("changed physical cut issued method Effects")
					}
					borrow := query.stagedConstructedMember
					originalGet := borrow.issued
					copyGet := *originalGet
					borrow.issued = &copyGet
					_, copiedGetAccepted := work.registerStagedStandardMemberCall(facts, query, source)
					borrow.issued = originalGet
					if copiedGetAccepted {
						t.Fatal("copied Get issued method Effects")
					}
					generation := borrow.generation
					borrow.generation = new(projectGeneration)
					_, oldGenerationAccepted := work.registerStagedStandardMemberCall(facts, query, source)
					borrow.generation = generation
					if oldGenerationAccepted {
						t.Fatal("mismatched generation issued method Effects")
					}
					if !work.constructedStandardMethodCovered(facts, caller, &source, query.executable) {
						t.Fatal("original private receiver source not covered")
					}
					if result.opaque != row.opaque {
						t.Fatal("original reflective opacity witness differs before method event", result.opaque)
					}
					_, ok := work.registerStagedStandardMemberCall(facts, query, source)
					if result.opaque != row.opaque {
						t.Fatal("method event changed original Get opacity")
					}
					return ok
				})
				if !installed {
					t.Fatal("original member source sink unavailable")
				}
				defer revoke()
				revokeMember, installed := work.beginStagedMemberWork(q, facts, occurrence.request)
				if !installed {
					t.Fatal("original source C sink unavailable")
				}
				defer revokeMember()
				q.standardConstructionMember(sourceConstructedMemberDemand{source: occurrence.sites[0], projection: []string{"get"}, mode: accessorAcquire}, nil, &result, func(*ast.Node, []string, bool) {}, func([]sourceValue, []string, bool) {})
				if pending != 1 || complete != 1 || result.opaque != row.opaque || len(result.values) != 0 || len(work.operationIDs) != priorIDs || len(facts[caller].staged.operationUses) != 0 || len(facts[caller].staged.constructedOccurrences) != 0 {
					t.Fatal("original pending/full-tail method event or passive boundary differs", pending, complete)
				}
				revokeMember()
				revoke()
				if _, ok := work.registerStagedStandardMemberCall(facts, q, observed); ok {
					t.Fatal("revoked original event issued method Effects")
				}
			})
		})
	}
}

// Match the original collector's module ordering, as in the original module
// SourceQueue control. Native prefix entry laws are delivered by their actual
// owners before New is queried. New and every deferred callable stay queued.
func preparePrivateMethodOriginalModulePrefix(t *testing.T, facts []callableFacts, work *callableEffectWork, owner *executableBodyOwner, site *ast.Node) {
	t.Helper()
	file := ast.GetSourceFileOfNode(site)
	nodeTargets := make(map[*ast.Node]int)
	symbolTargets := make(map[ast.SymbolId]int)
	for i := range facts {
		fact := &facts[i]
		fact.callSymbols = make(map[string]ast.SymbolId)
		fact.callExpressions = make(map[string]*ast.Node)
		fact.contextReferences = make(map[string]*ast.Node)
		if runtimeVariableInitializer(fact.node) {
			if declaration, plan, ok := preflightModuleInitializer(owner, fact.node); ok {
				fact.initializerDeclaration, fact.initializerPlan = declaration, plan
			}
		}
		nodeTargets[fact.node] = i
		if !runtimeModuleEvaluation(fact.node) {
			if symbol := callableDeclarationSymbol(fact.node, owner.checker); symbol != nil {
				symbolTargets[ast.GetSymbolId(symbol)] = i
			}
		}
	}
	work.initializePropagation(facts)
	bindCallableAliases(file, symbolTargets, owner.checker)
	syntacticTargets := collectSyntacticCallableTargets(facts)
	bindSyntacticCallableAliases(file, syntacticTargets, symbolTargets, owner.checker)
	imports, contexts := collectExternalImportBindings(file, owner.checker), collectContextBindings(file, owner.checker)
	installBuildingInitializers(owner, file, facts)
	newOwner := work.memberNodes[sourceStagedModuleOwner(site)]
	for work.extractionHead < len(work.extractionQueue) {
		next := work.extractionQueue[work.extractionHead]
		if next.operation.index == 0 && (next.callable == newOwner || !runtimeModuleEvaluation(facts[next.callable].node)) {
			break
		}
		task, available := work.nextExtraction()
		if !available {
			break
		}
		if task.operation.index != 0 {
			work.extractOperation(facts, task, owner)
			continue
		}
		index := task.callable
		collectDirectCallableEffects(&facts[index], index, facts, symbolTargets, syntacticTargets, nodeTargets, file, owner.checker, nil, nil, imports, contexts, assetAnalysis{}, owner, work)
		work.finishExtraction(facts, index)
	}
	work.prepareOperationUses(facts, owner)
	if facts[newOwner].staged.ready {
		t.Fatal("prefix setup collected original New")
	}
}

// The original publication namespace must remain live for the entire source
// observation. A new owner created after Session.Execute is a legacy standalone
// owner and cannot issue current-generation semantic receipts.
func withPrivateWeakMapMethodSource(t *testing.T, source string, inspect func(*sourceValueQuery, *ast.Node)) {
	t.Helper()
	const id = "/virtual/private-weakmap-method.ts"
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}, id, map[string]string{id: source})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), generation.sourceFile) {
		if converted := projectDiagnostic(diagnostic); hasErrorDiagnostic([]Diagnostic{converted}) {
			t.Fatal(converted)
		}
	}
	var call *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		region := enclosingCallableNode(node)
		if ast.IsCallExpression(node) && region != nil && region.Name() != nil && callableNameText(region.Name()) == "invoke" {
			call = node
		}
		return true
	})
	if call == nil {
		t.Fatal("original invoked member Call missing")
	}
	owner := newExecutableBodyOwner(project, generation.checker)
	inspect(newSourceDependencyQuery(call, generation.checker, owner, enclosingCallableNode(call)), call)
}
