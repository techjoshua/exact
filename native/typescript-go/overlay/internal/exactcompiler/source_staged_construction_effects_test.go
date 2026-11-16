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

const stagedConstructionAssignmentSource = `export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['construction-effects-probe']=new WeakMap<object,unknown>();return 2}`

func TestStagedConstructionEffectsRegistrationIsNotAdoption(t *testing.T) {
	const source = `function dormant(){return document.title}export function invoke(target:Record<string,unknown>){target.slot=new WeakMap();return 2}`
	withStagedAssignmentSource(t, source, func(q *sourceValueQuery, assignment *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		node := assignment.AsBinaryExpression().Right
		uses := len(facts[consumer].staged.operationUses)
		root, registered := work.registerStagedConstructionEffects(facts, consumer, node, q.executable)
		if !registered || root.producer.operation != node || root.producer.selector != (sourceStagedOperationSelector{}) {
			t.Fatal("original passive New registration lost its exact source request")
		}
		if len(work.operationIDs) != 0 || len(facts[consumer].staged.operationUses) != uses {
			t.Fatal("required New registration adopted or scheduled an ordinary producer")
		}
		for _, recipe := range work.operationRecipes {
			if s := recipe.memberSource; s != nil && s.protocolSource != nil && s.protocolSource.get != nil && work.memberCoverageObserved[recipe.key] != nil {
				t.Fatal("passive New registration refreshed an independent source Get")
			}
		}
		if work.stageAssignment(facts, consumer, assignment, q.executable) {
			t.Fatal("known New child displaced the unsupported Set receiver owner")
		}
		key := sourceStagedOperationKey{declaration: q.effectOwner, operation: assignment, kind: relativeDemandEffects}
		if _, adopted := work.operationIDs[key]; adopted {
			t.Fatal("unsupported parent acquired speculative assignment membership")
		}
	})
}

func TestStagedConstructionEffectsOriginalAssignment(t *testing.T) {
	withStagedAssignmentSource(t, stagedConstructionAssignmentSource, func(q *sourceValueQuery, assignment *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		if !work.stageAssignment(facts, consumer, assignment, q.executable) {
			logStagedConstructionSource(t, &work, q, assignment.AsBinaryExpression().Right)
			t.Fatal("original New prerequisite did not connect to Set adoption")
		}
		node := assignment.AsBinaryExpression().Right
		// The ordinary source walker reaches Set before its RHS New. The New
		// occurrence must adopt its own use before the caller's final queue drain.
		if !work.stageConstructionEffects(facts, consumer, node, q.executable) {
			logStagedConstructionSource(t, &work, q, node)
			t.Fatal("ordinary New did not consume its already-required source phases")
		}
		work.prepareOperationUses(facts, q.executable)
		key := sourceStagedOperationKey{declaration: q.effectOwner, operation: node, kind: relativeDemandEffects}
		recipe := work.operationRecipes[key]
		if recipe.constructionEffects == nil || !validStagedConstructionEffectsRecipe(recipe) || !work.passiveConstructionEffectsReady(recipe) || len(recipe.delta.required) != len(stagedConstructionPhases) {
			t.Fatal("original construction phase/source receipt missing")
		}
		root := recipe.constructionEffects.root
		id, issued := work.operationIDs[key]
		if !issued || !work.closedOperationDependencies()[id.index] {
			t.Fatal("original New Effects did not close its independent source children")
		}
		assignmentKey := sourceStagedOperationKey{declaration: q.effectOwner, operation: assignment, kind: relativeDemandEffects}
		setRoot := work.operationRecipes[assignmentKey].assignment.root
		rhs := work.operationRecipes[stagedAssignmentRequest(setRoot, "rhs").producer]
		if len(rhs.delta.required) != 1 || !sameOperationRequest(rhs.delta.required[0], root) || !work.closedOperationDependencies()[work.operationIDs[assignmentKey].index] {
			t.Fatal("Set RHS used a construction category instead of original New Effects")
		}
		for _, phase := range stagedConstructionPhases {
			request := stagedConstructionRequest(root, phase)
			current := work.operationRecipes[request.producer]
			if !validStagedConstructionEffectsRecipe(current) || !work.passiveConstructionEffectsReady(current) || !work.closedOperationDependencies()[work.operationIDs[request.producer].index] {
				t.Fatal("original New phase remains unsupported", phase)
			}
			if phase == "prototype" {
				observed := work.constructionEffectsObserved[key]
				get := observed.prototypeGet
				if get == nil || get.issuer != observed.issuer || get.issuer.prototypeGet != get || get.issuer.observation != observed || get.operation != node || get.reference != node.Expression() || get.acquired != node.Expression() || get.receiver != observed.constructor || get.prototype != observed.prototype || get.generation != work.operationGeneration || get.cut != observed.cut || !sameOperationRequest(get.request, request) {
					t.Fatal("complete original prototype Get lacks its exact detached source receipt")
				}
				for _, required := range current.delta.required {
					if source := work.operationRecipes[required.producer].memberSource; source != nil && source.coverage != nil {
						t.Fatal("complete prototype Get was forced to repay broad descriptive C")
					}
				}
			}
			if phase == "callee" && len(current.delta.required) != 0 {
				found := false
				for _, child := range current.delta.required {
					coverage := work.operationRecipes[child.producer].memberSource
					if coverage != nil && coverage.coverage != nil {
						c := coverage.coverage
						found = found || c.cut.operation == node && c.cut.reading == node && c.cut.initializing == node && c.generation == work.operationGeneration
					}
				}
				if !found {
					t.Fatal("callee source did not retain its original preselection New cut")
				}
			}
			if len(current.delta.exposures)+len(current.delta.invoked)+len(current.delta.relative)+len(current.delta.residuals)+len(current.delta.effects) != 0 {
				t.Fatal("construction Effects granted result or invocation authority")
			}
		}
		observation := work.constructionEffectsObserved[key]
		// This original selector completed its own Get, including alternatives.
		// Its generic preselection inventory must remain descriptive instead of
		// adding another mandatory broad source interval to the callee phase.
		calleeRecipe := work.operationRecipes[stagedConstructionRequest(root, "callee").producer]
		for _, required := range calleeRecipe.delta.required {
			if source := work.operationRecipes[required.producer].memberSource; source != nil && source.coverage != nil && source.coverage.cut.initializing == node {
				t.Fatal("complete original callee was forced to repay descriptive source coverage")
			}
		}
		originalGet := observation.prototypeGet
		copiedGet := *originalGet
		observation.prototypeGet = &copiedGet
		if work.passiveConstructionEffectsReady(recipe) || work.closedOperationDependencies()[id.index] {
			t.Fatal("copied prototype Get receipt inherited original source issuer")
		}
		observation.prototypeGet = originalGet
		for _, change := range []func(*sourceStagedConstructionPrototypeGet){
			func(get *sourceStagedConstructionPrototypeGet) { get.operation = node.Expression() },
			func(get *sourceStagedConstructionPrototypeGet) { get.receiver = node },
			func(get *sourceStagedConstructionPrototypeGet) { get.acquired = node },
			func(get *sourceStagedConstructionPrototypeGet) { get.cut.initializing = node },
			func(get *sourceStagedConstructionPrototypeGet) { get.generation = &projectGeneration{} },
			func(get *sourceStagedConstructionPrototypeGet) { get.request.edge += ":copied" },
		} {
			change(originalGet)
			if work.passiveConstructionEffectsReady(recipe) || work.closedOperationDependencies()[id.index] {
				t.Fatal("retargeted prototype Get receipt retained source closure")
			}
			*originalGet = copiedGet
		}
		copy := *observation
		work.constructionEffectsObserved[key] = &copy
		if work.passiveConstructionEffectsReady(recipe) || work.closedOperationDependencies()[id.index] {
			t.Fatal("copied receipt inherited original construction issuer")
		}
		work.constructionEffectsObserved[key] = observation
		generation := work.operationGeneration
		work.operationGeneration = &projectGeneration{}
		if work.passiveConstructionEffectsReady(recipe) || work.closedOperationDependencies()[id.index] {
			t.Fatal("construction receipt crossed generation")
		}
		work.operationGeneration = generation
		bad := recipe
		s := *recipe.constructionEffects
		bad.constructionEffects = &s
		bad.constructionEffects.request.inputs = &sourceRelativeInputEdge{}
		if validStagedConstructionEffectsRecipe(bad) {
			t.Fatal("constructed input packet replaced original New source")
		}
		for _, call := range facts[consumer].staged.calls {
			if call.invocation.operation == node {
				t.Fatal("native New manufactured a source constructor B")
			}
		}
		cloned := make([]callableFacts, len(facts))
		for i := range facts {
			cloned[i] = cloneProjectCallableFact(facts[i])
		}
		next := newCallableEffectWork(cloned)
		next.operationGeneration = generation
		next.indexOperationSources(cloned)
		if !next.registerOperationUse(cloned, sourceStagedOperationUse{request: root}) {
			t.Fatal("clone lost descriptive original New membership")
		}
		if next.passiveConstructionEffectsReady(next.operationRecipes[key]) || next.closedOperationDependencies()[next.operationIDs[key].index] {
			t.Fatal("cloned recipe inherited original construction observation")
		}
	})
}

func TestStagedConstructionEffectsUnsupportedInputsRemainPassive(t *testing.T) {
	for _, source := range []string{
		`export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['construction-effects-probe']=new WeakMap([]);return 2}`,
		`export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['construction-effects-probe']=new Map();return 2}`,
		`export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['construction-effects-probe']=new Array();return 2}`,
		`class WeakMap{constructor(){window.name}}export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['construction-effects-probe']=new WeakMap();return 2}`,
		`WeakMap=class Replacement{constructor(){window.name}} as unknown as WeakMapConstructor;export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['construction-effects-probe']=new WeakMap();return 2}`,
		`const Constructor=new Proxy(WeakMap,{});export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['construction-effects-probe']=new Constructor();return 2}`,
		`export function invoke(Constructor:WeakMapConstructor){const scope=globalThis as Record<PropertyKey,unknown>;scope['construction-effects-probe']=new Constructor();return 2}`,
	} {
		withStagedAssignmentSource(t, source, func(q *sourceValueQuery, assignment *ast.Node, facts []callableFacts) {
			consumer := installationFactIndex(t, facts, q.effectOwner)
			work := newCallableEffectWork(facts)
			node := assignment.AsBinaryExpression().Right
			if work.stageConstructionEffects(facts, consumer, node, q.executable) {
				t.Fatal("unsupported construction displaced original source owner", source)
			}
			key := sourceStagedOperationKey{declaration: q.effectOwner, operation: node, kind: relativeDemandEffects}
			recipe := work.operationRecipes[key]
			if recipe.constructionEffects == nil {
				t.Fatal("unsupported New lost pending source dependencies")
			}
			if args := node.AsNewExpression().Arguments; args != nil && len(args.Nodes) != 0 {
				callee := work.operationRecipes[stagedConstructionRequest(recipe.constructionEffects.root, "callee").producer]
				inputs := work.operationRecipes[stagedConstructionRequest(recipe.constructionEffects.root, "inputs").producer]
				if !work.passiveConstructionEffectsReady(callee) || inputs.delta.extracted || work.passiveConstructionEffectsReady(inputs) {
					logStagedConstructionSource(t, &work, q, node)
					t.Fatal("known callee and unsupported argument protocol were conflated")
				}
			} else if work.passiveConstructionEffectsReady(recipe) {
				t.Fatal("unsupported constructor acquired a local algorithm receipt")
			}
			for _, phase := range append([]string{""}, stagedConstructionPhases[:]...) {
				if _, adopted := work.operationIDs[stagedConstructionRequest(recipe.constructionEffects.root, phase).producer]; adopted {
					t.Fatal("unsupported New created speculative source membership", phase)
				}
			}
		})
	}
}

// Failure-only source diagnostics distinguish the original selection outputs
// from graph publication. No supplied flags alter admission or source closure.
func logStagedConstructionSource(t *testing.T, work *callableEffectWork, q *sourceValueQuery, node *ast.Node) {
	t.Helper()
	key := sourceStagedOperationKey{declaration: q.effectOwner, operation: node, kind: relativeDemandEffects}
	root := work.operationRecipes[key].constructionEffects
	if root != nil {
		for _, phase := range append([]string{""}, stagedConstructionPhases[:]...) {
			request := stagedConstructionRequest(root.root, phase)
			recipe := work.operationRecipes[request.producer]
			id, adopted := work.operationIDs[request.producer]
			closed := adopted && work.closedOperationDependencies()[id.index]
			t.Logf("New phase=%q extracted=%t observed=%t adopted=%t closed=%t required=%#v", phase, recipe.delta.extracted, work.passiveConstructionEffectsReady(recipe), adopted, closed, recipe.delta.required)
		}
	}
	query := newSourceDependencyQuery(node, q.owner.checker, q.executable, q.effectOwner)
	query.protectedMember = node
	defer query.publishDependencyStatistics()
	result := accessorCandidates{}
	selected := query.selectSourceConstruction(node, nil, &result)
	t.Logf("original New effects values=%d opaque=%t incomplete=%t receiver=%t field=%t own=%t env=%d context=%d effects=%d fallbacks=%d calls=%d bodies=%d descriptors=%d", len(result.values), result.opaque, result.valueIncomplete, result.receiverIncomplete, result.fieldReceiverIncomplete, result.ownOperation, len(result.environmentEffects), len(result.contextEffects), len(result.effects), len(result.fieldFallbacks)+len(result.callFallbacks), len(result.nativeCalls)+len(result.normalCalls)+len(result.fieldCalls), len(result.ordinaryBodies)+len(result.writeBodies), len(result.nativeDescriptorEffects))
	if selected != nil {
		t.Logf("original New selected values=%d opaque=%t incomplete=%t receiver=%t declarations=%d", len(selected.acquired.values), selected.acquired.opaque, selected.acquired.valueIncomplete, selected.acquired.receiverIncomplete, len(selected.declarations))
		for _, value := range selected.acquired.values {
			t.Logf("callee node=%p native=%+v path=%v captured=%t bound=%t normal=%t instance=%t", value.node, value.native, value.path, value.capture != nil, value.bound != nil, value.normal != nil, value.instance != nil)
		}
	}
}

// This is a loan transport control. Actual original source admission and closure
// are exercised above, rather than inferred from a supplied borrowed marker.
func TestStagedConstructionEffectsPrototypeBorrowLifetime(t *testing.T) {
	withStagedAssignmentSource(t, stagedConstructionAssignmentSource, func(q *sourceValueQuery, assignment *ast.Node, facts []callableFacts) {
		node := assignment.AsBinaryExpression().Right
		consumer := installationFactIndex(t, facts, q.effectOwner)
		root, valid := sourceStagedOccurrenceRequest(&facts[consumer], node, relativeDemandEffects, "construction-prototype-lifetime")
		if !valid {
			t.Fatal("original construction occurrence")
		}
		query := newSourceDependencyQuery(node, q.owner.checker, q.executable, q.effectOwner)
		query.protectedMember = node
		acquired := query.accessors(node.Expression(), nil, "", accessorAcquire, nil, nil)
		if len(acquired.values) != 1 || acquired.values[0].native == nil || acquired.values[0].native.kind != sourceNativeWeakMapConstructor {
			t.Fatal("original genuine constructor acquisition")
		}
		receiver := acquired.values[0]
		get := &sourceGetInputs{operation: node, receiver: receiver, propertyKey: "prototype"}
		borrow := &sourceStagedConstructionGetBorrow{issuer: query, owner: query.owner, generation: query.owner.generation, root: root, get: get, receiver: receiver, cut: query.relativeInputCut(node)}
		get.constructionEffects = borrow
		selected := &sourceGetInputs{operation: node, receiver: receiver}
		revoke := query.lendConstructionEffectsGet(get, selected, "prototype")
		if !standardNativeLookup(selected) {
			t.Fatal("original selected prototype Get did not receive its scoped loan")
		}
		copy := *selected
		if standardNativeLookup(&copy) {
			t.Fatal("copied internal Get inherited live source authority")
		}
		revoke()
		if standardNativeLookup(selected) {
			t.Fatal("revoked internal Get retained lookup authority")
		}
		copiedQuery := *query
		copiedQuery.lendConstructionEffectsGet(get, selected, "prototype")()
		if standardNativeLookup(selected) {
			t.Fatal("copied query issued original construction authority")
		}
		originalCut := query.initializing
		query.initializing = node
		if borrow.live(get) {
			t.Fatal("different physical input cut inherited the construction loan")
		}
		query.initializing = originalCut
		borrow.finished = true
		if borrow.live(get) || standardNativeLookup(get) {
			t.Fatal("finished original construction loan remained live")
		}
	})
}

func TestStagedConstructionEffectsSessionAndArtifacts(t *testing.T) {
	for _, source := range []string{stagedConstructionAssignmentSource, stagedConstructionModuleAssignmentSource} {
		for _, target := range []Target{TargetClient, TargetServer} {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/construction-effects.ts", Source: source, Target: target, Diagnostics: "semantic"})
			moduleStore := source == stagedConstructionModuleAssignmentSource
			if moduleStore {
				// A setter installed before import can run at this arbitrary
				// global slot. Closed source Effects must retain that unknown.
				if response.Error != "" || !containsDiagnosticCode(response.Diagnostics, "EXACT2101") || response.Code != "" || response.SourceMap != nil {
					t.Fatal("external module Set lost its placement refusal", response.Error, response.Diagnostics)
				}
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity == "error" && diagnostic.Code != "EXACT2101" {
						t.Fatal("unrelated failure in module placement control", diagnostic)
					}
				}
			} else if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				logStagedConstructionSessionFailure(t, session)
				t.Fatal(response.Error, response.Diagnostics)
			}
			assignment, construction := false, false
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "invoke" && !runtimeModuleEvaluation(fact.node) {
					continue
				}
				if !fact.staged.settled || fact.staged.operationsPending {
					t.Fatal("ordinary construction/Set source work did not settle")
				}
				for _, use := range fact.staged.operationUses {
					for _, recipe := range fact.staged.operationRecipes {
						if recipe.key == use.request.producer {
							assignment = assignment || recipe.assignment != nil && recipe.assignment.phase == ""
							construction = construction || recipe.constructionEffects != nil && recipe.constructionEffects.phase == ""
						}
					}
				}
			}
			if !construction || !moduleStore && !assignment {
				for _, fact := range stagedDeclarationFacts(session) {
					if fact.summary.Name != "invoke" && !runtimeModuleEvaluation(fact.node) {
						continue
					}
					t.Logf("public target=%v assignment=%t construction=%t declaration=%p settled=%t pending=%t uses=%d recipes=%d", target, assignment, construction, fact.node, fact.staged.settled, fact.staged.operationsPending, len(fact.staged.operationUses), len(fact.staged.operationRecipes))
					for _, use := range fact.staged.operationUses {
						t.Logf("ordinary use operation=%s@%d selector=%#v consumer=%p edge=%q call=%p", use.request.producer.operation.Kind, use.request.producer.operation.Pos(), use.request.producer.selector, use.request.consumer, use.request.edge, use.call)
					}
					for _, recipe := range fact.staged.operationRecipes {
						if recipe.assignment == nil && recipe.constructionEffects == nil {
							continue
						}
						phase := "Set:"
						if recipe.assignment != nil {
							phase += recipe.assignment.phase
						} else {
							phase = "New:" + recipe.constructionEffects.phase
						}
						t.Logf("source phase=%q operation=%s@%d selector=%#v extracted=%t required=%#v", phase, recipe.key.operation.Kind, recipe.key.operation.Pos(), recipe.key.selector, recipe.delta.extracted, recipe.delta.required)
					}
				}
				t.Fatalf("public original New/Set did not use staged Effects owners: assignment=%t construction=%t", assignment, construction)
			}
			if moduleStore {
				facts := stagedDeclarationFacts(session)
				recipes := make(map[sourceStagedOperationKey]sourceStagedOperationRecipe)
				unknown := false
				for _, fact := range facts {
					if runtimeModuleEvaluation(fact.node) {
						for _, effect := range fact.summary.EffectSources {
							unknown = unknown || effect.Environment == "unknown" && effect.Opaque
						}
					}
					for _, recipe := range fact.staged.operationRecipes {
						recipes[recipe.key] = recipe
					}
				}
				seen := make(map[sourceStagedOperationKey]bool)
				var externalSet func(sourceStagedOperationRequest) bool
				externalSet = func(request sourceStagedOperationRequest) bool {
					if seen[request.producer] {
						return false
					}
					seen[request.producer] = true
					recipe := recipes[request.producer]
					if member := recipe.memberSource; member != nil && member.candidate.runtimeUnknown && member.candidate.origin != nil && ast.IsIdentifier(member.candidate.origin) && member.candidate.origin.Text() == "globalThis" {
						return recipe.delta.extracted && len(recipe.delta.residuals) == 1 && recipe.delta.residuals[0] == (sourceStagedOperationResidual{operation: member.parent.producer.operation})
					}
					for _, child := range recipe.delta.required {
						if externalSet(child) {
							return true
						}
					}
					return false
				}
				retained := false
				for _, recipe := range recipes {
					if recipe.assignment != nil && recipe.assignment.phase == "" && runtimeModuleEvaluation(recipe.assignment.root.consumer) {
						retained = externalSet(recipe.assignment.root) || retained
					}
				}
				if !unknown || !retained {
					t.Fatal("closed module Set lost its original reached external unknown residual")
				}
				// Execute the unchanged original source with a hostile initial
				// slot. This is a placement counterexample, not emitted success.
				file := filepath.Join(t.TempDir(), "original-external-module.mts")
				if err := os.WriteFile(file, []byte(source), 0600); err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				runner := `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const key='construction-effects-probe';const old=Object.getOwnPropertyDescriptor(globalThis,key);const marker=new Error('preinstalled setter');let calls=0;try{Object.defineProperty(globalThis,key,{configurable:true,set(value){calls++;assert.equal(Object.getPrototypeOf(value),WeakMap.prototype);throw marker}});await assert.rejects(import(pathToFileURL(process.argv[1]).href),error=>error===marker);assert.equal(calls,1)}finally{if(old)Object.defineProperty(globalThis,key,old);else delete globalThis[key]}`
				output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
				cancel()
				if err != nil {
					t.Fatal(err, string(output))
				}
				continue
			}
			file := filepath.Join(t.TempDir(), "construction-effects.mts")
			if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			runner := `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);const old=Object.getOwnPropertyDescriptor(globalThis,'construction-effects-probe');try{assert.equal(m.invoke(),2);const map=globalThis['construction-effects-probe'];assert.equal(Object.getPrototypeOf(map),WeakMap.prototype);const key={};let calls=0;const stored=()=>{calls++;return 3};map.set(key,stored);assert.equal(map.get(key),stored);assert.equal(calls,0);assert.equal(map.get(key)(),3);assert.equal(calls,1);assert.throws(()=>map.set(1,stored),TypeError)}finally{if(old)Object.defineProperty(globalThis,'construction-effects-probe',old);else delete globalThis['construction-effects-probe']}`
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatal(err, string(output))
			}
		}
	}
}
