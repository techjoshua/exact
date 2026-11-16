package exactcompiler

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

func TestStagedAssignmentOriginalSet(t *testing.T) {
	for _, row := range []struct {
		name, source     string
		setter, external bool
	}{
		{"data", `export function invoke(){const target={slot:0};target.slot=1;return 2}`, false, false},
		{"setter", `const target={set slot(_value:number){window.name},get slot(){throw 'getter'}};export function invoke(){target.slot=1;return 2}`, true, false},
		{"global alias", `export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['assignment-probe']=()=>document.title;return 2}`, false, true},
		{"WeakMap RHS", `export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['assignment-probe']=new WeakMap();return 2}`, false, true},
		{"global Symbol key", `const key=Symbol.for('assignment-probe');export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope[key]=()=>document.title;return 2}`, false, true},
		{"mixed data and setter", `declare const choose:boolean;const data={slot:0};const setter={set slot(_value:number){window.name}};export function invoke(){const target=choose?data:setter;target.slot=1;return 2}`, true, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			withStagedAssignmentSource(t, row.source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
				consumer := installationFactIndex(t, facts, q.effectOwner)
				work := newCallableEffectWork(facts)
				if !work.stageAssignment(facts, consumer, operation, q.executable) {
					key := sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}
					if source := work.operationRecipes[key].assignment; source != nil {
						logStagedAssignmentRequiredSources(t, &work, source.root)
					}
					t.Fatal("original bounded Set not adopted")
				}
				work.prepareOperationUses(facts, q.executable)
				key := sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}
				recipe := work.operationRecipes[key]
				if recipe.assignment == nil || len(recipe.delta.required) != len(stagedAssignmentPhases) {
					t.Fatal("original finite assignment prerequisites missing")
				}
				for _, phase := range stagedAssignmentPhases {
					request := stagedAssignmentRequest(recipe.assignment.root, phase)
					if !work.operationRecipes[request.producer].delta.extracted {
						t.Fatal("original phase not represented", phase)
					}
				}
				state := &work.operations[work.operationIDs[key].index]
				if state.assignment == nil || !state.assignment.observed || (len(state.assignment.bodies) != 0) != row.setter {
					t.Fatal("original Set/setter receipt missing or data storage invoked a body")
				}
				for _, body := range state.assignment.bodies {
					if !body.delivered || body.bound.unsupported != relativeInputsSupported || !ast.IsSetAccessorDeclaration(body.request.declaration) || body.request.operation != operation || len(body.request.actuals) != 1 || body.request.actuals[0].expression != operation.AsBinaryExpression().Right {
						t.Fatal("setter lost real original receiver/RHS binder association")
					}
				}
				dataOnly, external := work.stagedAssignmentSourceDisposition(recipe.assignment.root)
				if dataOnly != (!row.setter && !row.external) || external != row.external {
					t.Fatalf("original Set source disposition dataOnly=%v external=%v", dataOnly, external)
				}
				setID := work.operationIDs[stagedAssignmentRequest(recipe.assignment.root, "set").producer]
				disposition := work.operations[setID.index].assignment.disposition
				if disposition == nil || disposition.issuer == nil || disposition.generation != q.owner.generation || disposition.cut.reading != operation.AsBinaryExpression().Left || len(disposition.required) == 0 {
					t.Fatal("Set source disposition lost original issuer/Get/source requirements")
				}
				if dataOnly || external {
					copy := *disposition
					work.operations[setID.index].assignment.disposition = &copy
					if data, host := work.stagedAssignmentSourceDisposition(recipe.assignment.root); data || host {
						t.Fatal("copied receipt inherited original issuer authority")
					}
					work.operations[setID.index].assignment.disposition = disposition
					generation := work.operationGeneration
					work.operationGeneration = &projectGeneration{}
					if data, host := work.stagedAssignmentSourceDisposition(recipe.assignment.root); data || host {
						t.Fatal("Set source receipt crossed generation")
					}
					work.operationGeneration = generation
				}
				for _, call := range facts[consumer].staged.calls {
					if call.invocation.declaration != nil && ast.IsGetAccessorDeclaration(call.invocation.declaration) {
						t.Fatal("LHS Set executed getter")
					}
				}
				bad := recipe
				copy := *recipe.assignment
				bad.assignment = &copy
				bad.assignment.request.inputs = &sourceRelativeInputEdge{}
				if validStagedAssignmentRecipe(bad) {
					t.Fatal("supplied input packet replaced original source request")
				}
				cloned := append([]callableFacts(nil), facts...)
				for i := range cloned {
					cloned[i].staged = cloneCallableExtraction(cloned[i].staged)
				}
				next := newCallableEffectWork(cloned)
				next.operationGeneration = q.owner.generation
				next.indexOperationSources(cloned)
				if !next.registerOperationUse(cloned, sourceStagedOperationUse{request: recipe.assignment.root}) {
					t.Fatal("clone lost descriptive original assignment")
				}
				fresh := next.operations[next.operationIDs[key].index].assignment
				if data, host := next.stagedAssignmentSourceDisposition(recipe.assignment.root); data || host {
					t.Fatal("cloned graph inherited Set DATA/external source authority")
				}
				if fresh != nil && fresh.observed || next.closedOperationDependencies()[next.operationIDs[key].index] {
					t.Fatal("cloned metadata retained original Set observation")
				}
			})
		})
	}
}

// A typed data member does not erase a conditional accessor at the same actual
// source receiver. The original computed name keeps its own independent debt.
func TestStagedAssignmentDispositionRetainsAccessorAlternative(t *testing.T) {
	const source = `declare const name:string;const target={slot:0,get [name](){return document.title}};export function invoke(){target.slot=1;return 2}`
	withStagedAssignmentSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		work.stageAssignment(facts, consumer, operation, q.executable)
		key := sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}
		recipe := work.operationRecipes[key]
		if recipe.assignment == nil || !work.registerOperationUse(facts, sourceStagedOperationUse{request: recipe.assignment.root}) {
			t.Fatal("original source consumer could not require assignment")
		}
		work.prepareOperationUses(facts, q.executable)
		if dataOnly, external := work.stagedAssignmentSourceDisposition(recipe.assignment.root); dataOnly || external {
			t.Fatal("conditional accessor alternative became DATA or external authority")
		}
	})
}

func TestStagedAssignmentUnavailableInputsRemainRequired(t *testing.T) {
	for _, source := range []string{
		`export function invoke(target:Record<string,unknown>){target.slot=1;return 2}`,
		`export function invoke(){const target=new Proxy({slot:0},{});target.slot=1;return 2}`,
		`const target={} as Record<PropertyKey,unknown>;export function invoke(key:object){target[key as unknown as string]=1;return 2}`,
		`declare const choose:boolean;declare const other:Record<string,unknown>;const known={set slot(_value:number){window.name}};export function invoke(){const target=choose?known:other;target.slot=1;return 2}`,
		`export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope['assignment-probe']=new WeakMap([]);return 2}`,
		`let captured:Record<string,unknown>|undefined;export function invoke(){try{return 2}finally{if(captured)captured.slot=1}}`,
	} {
		withStagedAssignmentSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
			consumer := installationFactIndex(t, facts, q.effectOwner)
			work := newCallableEffectWork(facts)
			if work.stageAssignment(facts, consumer, operation, q.executable) {
				t.Fatal("unavailable source input acquired ordinary adoption", source)
			}
			key := sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}
			recipe := work.operationRecipes[key]
			if recipe.assignment == nil || len(recipe.delta.required) != len(stagedAssignmentPhases) {
				t.Fatal("pending assignment lost finite original requirements")
			}
			if right := operation.AsBinaryExpression().Right; ast.IsNewExpression(right) {
				child := work.operationRecipes[sourceStagedOperationKey{declaration: q.effectOwner, operation: right, kind: relativeDemandEffects}].constructionEffects
				if child == nil || work.operationRecipes[stagedConstructionRequest(child.root, "inputs").producer].delta.extracted {
					t.Fatal("unsupported New input protocol lost its separate pending child")
				}
			} else if work.passiveAssignmentSourceReady(recipe) {
				t.Fatal("missing input or selected setter acquired a passive local receipt")
			}
			for _, phase := range append([]string{""}, stagedAssignmentPhases[:]...) {
				if _, adopted := work.operationIDs[stagedAssignmentRequest(recipe.assignment.root, phase).producer]; adopted {
					t.Fatal("passive unrepresented assignment left speculative required membership", phase, source)
				}
			}
			for _, use := range facts[consumer].staged.operationUses {
				if use.request.producer == key {
					t.Fatal("passive pending source became ordinary collector coverage")
				}
			}
		})
	}
}

// Fresh local Set roles do not displace the legacy owner when the same
// original source interval still has an unrepresented member Call consumer.
func TestStagedAssignmentUnmappedSemanticSourceRemainsPassive(t *testing.T) {
	const source = `export function invoke(){const target={slot:()=>''};target.slot=()=>document.title;return target.slot()}`
	withStagedAssignmentSource(t, source, func(q *sourceValueQuery, operation *ast.Node, facts []callableFacts) {
		consumer := installationFactIndex(t, facts, q.effectOwner)
		work := newCallableEffectWork(facts)
		if work.stageAssignment(facts, consumer, operation, q.executable) {
			t.Fatal("local Set flags displaced an unmigrated semantic source consumer")
		}
		key := sourceStagedOperationKey{declaration: q.effectOwner, operation: operation, kind: relativeDemandEffects}
		root := work.operationRecipes[key].assignment
		if root == nil {
			t.Fatal("original passive assignment source missing")
		}
		for _, phase := range stagedAssignmentPhases {
			request := stagedAssignmentRequest(root.root, phase)
			if !work.operationRecipes[request.producer].delta.extracted {
				t.Fatal("control did not reach local Set representation", phase)
			}
			if _, adopted := work.operationIDs[request.producer]; adopted {
				t.Fatal("unrepresented semantic source left speculative phase membership", phase)
			}
		}
		if _, adopted := work.operationIDs[key]; adopted {
			t.Fatal("passive assignment left a speculative root")
		}
		// The exact local Set observation survives independently of ordinary
		// adoption. Its unsupported Call child still prevents aggregate closure.
		if !work.passiveAssignmentSourceReady(work.operationRecipes[key]) {
			t.Fatal("original passive Set lost its local source observation")
		}
		dataOnly, external := work.stagedAssignmentSourceDisposition(root.root)
		if !dataOnly || external {
			t.Fatal("passive original DATA Set lost its source disposition")
		}
		for _, phase := range stagedAssignmentPhases {
			if !work.passiveAssignmentSourceReady(work.operationRecipes[stagedAssignmentRequest(root.root, phase).producer]) {
				t.Fatal("original passive phase lost exact local accounting", phase)
			}
		}
		observation := work.assignmentObserved[key]
		copy := *observation
		work.assignmentObserved[key] = &copy
		if work.passiveAssignmentSourceReady(work.operationRecipes[key]) {
			t.Fatal("copied observation inherited original issuer authority")
		}
		work.assignmentObserved[key] = observation
		disposition := *observation.disposition
		observation.disposition = &disposition
		if data, host := work.stagedAssignmentSourceDisposition(root.root); data || host {
			t.Fatal("copied passive disposition inherited original issuer authority")
		}
		observation.disposition = observation.disposition.issuer.disposition
		generation := work.operationGeneration
		work.operationGeneration = &projectGeneration{}
		if work.passiveAssignmentSourceReady(work.operationRecipes[key]) {
			t.Fatal("passive observation crossed source generation")
		}
		work.operationGeneration = generation
		setRequest := stagedAssignmentRequest(root.root, "set")
		set := work.operationRecipes[setRequest.producer]
		changed := set
		changed.delta = cloneOperationDelta(set.delta)
		changed.delta.required = append(changed.delta.required, root.root)
		work.operationRecipes[setRequest.producer] = changed
		if work.passiveAssignmentSourceReady(work.operationRecipes[key]) {
			t.Fatal("different required interval reused the passive observation")
		}
		work.operationRecipes[setRequest.producer] = set
		cloned := make([]callableFacts, len(facts))
		for i := range facts {
			cloned[i] = cloneProjectCallableFact(facts[i])
		}
		next := newCallableEffectWork(cloned)
		next.operationGeneration = generation
		next.indexOperationSources(cloned)
		if next.passiveAssignmentSourceReady(next.operationRecipes[key]) {
			t.Fatal("cloned recipes inherited a graph-local Set observation")
		}
		if data, host := next.stagedAssignmentSourceDisposition(root.root); data || host {
			t.Fatal("cloned recipes inherited passive Set disposition")
		}
		for _, call := range facts[consumer].staged.calls {
			if call.invocation.operation == operation {
				t.Fatal("passive Set observation acquired a body/B subscriber")
			}
		}
		for _, use := range facts[consumer].staged.operationUses {
			if use.request.producer == key {
				t.Fatal("unrepresented assignment acquired ordinary coverage")
			}
		}
	})
}

func TestStagedAssignmentBorrowLifetime(t *testing.T) {
	withStagedAssignmentSource(t, `export function invoke(){const target={slot:0};target.slot=1;return 2}`, func(q *sourceValueQuery, operation *ast.Node, _ []callableFacts) {
		target := operation.AsBinaryExpression().Left
		q.protectedMember = target
		request := q.sourceSetterRequest(target, accessorSet|accessorNoGet, nil)
		b := &sourceStagedAssignmentBorrow{issuer: q, request: request, generation: q.owner.generation, cut: q.relativeInputCut(operation)}
		request.assignment, q.setterInput = b, request
		if q.liveStagedAssignment() != b {
			t.Fatal("original Set borrow not live")
		}
		copy := *q
		if copy.liveStagedAssignment() != nil {
			t.Fatal("copied query inherited Set authority")
		}
		b.finished = true
		if q.liveStagedAssignment() != nil {
			t.Fatal("expired Set retained source authority")
		}
	})
}

func TestStagedAssignmentSessionAndArtifacts(t *testing.T) {
	for _, row := range []struct{ source, runner string }{
		{`export function invoke(){const target={slot:0};target.slot=1;return 2}`, `assert.equal(m.invoke(),2);`},
		{`const target={set slot(_value:number){window.name},get slot():number{throw 'getter'}};export function invoke(){target.slot=1;return 2}`, `let reads=0;globalThis.window={get name(){reads++;return 'name'}};assert.equal(m.invoke(),2);assert.equal(reads,1);`},
		{`const key=Symbol.for('assignment-probe');export function invoke(){const scope=globalThis as Record<PropertyKey,unknown>;scope[key]=()=>document.title;return 2}`, `let reads=0;globalThis.document={get title(){reads++;return 'title'}};const key=Symbol.for('assignment-probe');const old=Object.getOwnPropertyDescriptor(globalThis,key);try{assert.equal(m.invoke(),2);assert.equal(typeof globalThis[key],'function');assert.equal(reads,0)}finally{if(old)Object.defineProperty(globalThis,key,old);else delete globalThis[key]}`},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			session := NewSession()
			response := session.Execute(Request{Kind: "compile", ID: "/virtual/assignment-public.ts", Source: row.source, Target: target, Diagnostics: "semantic"})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				for _, fact := range stagedDeclarationFacts(session) {
					for _, recipe := range fact.staged.operationRecipes {
						if recipe.assignment != nil {
							t.Logf("phase=%q extracted=%v required=%#v", recipe.assignment.phase, recipe.delta.extracted, recipe.delta.required)
						}
					}
				}
				t.Fatal(response.Error, response.Diagnostics)
			}
			covered := false
			for _, fact := range stagedDeclarationFacts(session) {
				if fact.summary.Name != "invoke" {
					continue
				}
				for _, use := range fact.staged.operationUses {
					for _, recipe := range fact.staged.operationRecipes {
						if recipe.key == use.request.producer && recipe.assignment != nil && recipe.assignment.phase == "" {
							covered = fact.staged.settled && !fact.staged.operationsPending
						}
					}
				}
			}
			if !covered {
				t.Fatal("ordinary assignment did not settle through original source owner")
			}
			file := filepath.Join(t.TempDir(), "assignment.mts")
			if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			runner := `import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';const m=await import(pathToFileURL(process.argv[1]).href);` + row.runner
			output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
			cancel()
			if err != nil {
				t.Fatal(err, string(output))
			}
		}
	}
}

func withStagedAssignmentSource(t *testing.T, source string, inspect func(*sourceValueQuery, *ast.Node, []callableFacts)) {
	t.Helper()
	const id = "/virtual/staged-assignment.ts"
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: source, Diagnostics: "semantic"}, id, map[string]string{id: source})
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	file := generation.sourceFile
	var operation *ast.Node
	walkNode(file.AsNode(), func(node *ast.Node) bool {
		if plainStagedAssignment(node) && sourceStagedEvaluationOwner(node) != nil && callableNameText(sourceStagedEvaluationOwner(node).Name()) == "invoke" {
			operation = node
		}
		return true
	})
	if operation == nil {
		t.Fatal("original plain Set absent")
	}
	// The positive journey owns live source facts. Completed cached descriptions
	// and their refusal to lend observation authority are tested separately.
	owner := newExecutableBodyOwner(project, generation.checker)
	facts := stagedReturnSourceFacts(file)
	for i := range facts {
		facts[i].callExpressions = make(map[string]*ast.Node)
		facts[i].contextReferences = make(map[string]*ast.Node)
		facts[i].ownedScalarCalls = make(map[string]bool)
		facts[i].callSymbols = make(map[string]ast.SymbolId)
	}
	restore := registerWriterInputFacts(owner, facts)
	defer restore()
	q := newSourceDependencyQuery(operation, owner.checker, owner, sourceStagedEvaluationOwner(operation))
	inspect(q, operation, facts)
}

// Failure diagnostics describe local phase/source membership only. They cannot
// grant a live source receipt or substitute for the assertions above.
func logStagedAssignmentRequiredSources(t *testing.T, work *callableEffectWork, root sourceStagedOperationRequest) {
	t.Helper()
	for _, phase := range append([]string{""}, stagedAssignmentPhases[:]...) {
		r := stagedAssignmentRequest(root, phase)
		recipe := work.operationRecipes[r.producer]
		_, adopted := work.operationIDs[r.producer]
		t.Logf("assignment phase=%q extracted=%v adopted=%v passive=%v required=%d", phase, recipe.delta.extracted, adopted, work.passiveAssignmentSourceReady(recipe), len(recipe.delta.required))
		for _, child := range recipe.delta.required {
			operation := "nil"
			if child.producer.operation != nil {
				operation = fmt.Sprintf("%s@%d", child.producer.operation.Kind, child.producer.operation.Pos())
			}
			t.Logf("required operation=%s selector=%q kind=%v edge=%q", operation, child.producer.selector.field, child.producer.kind, child.edge)
		}
	}
}
