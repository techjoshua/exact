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

const stagedModuleBindingSource = `
function browser(){return window.name}
const callback=browser;
function read(){return callback}
function consume(cb:()=>string){return cb()}
export function exposed(){return read()}
export function invoke(){return consume(read())}
`

// A module capture forwards its original initializer's DATA. The module is
// required for availability, rather than invoked or rebound in the function.
func TestStagedModuleBindingSessionAndArtifacts(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		session := NewSession()
		response := session.Execute(Request{Kind: "compile", ID: "/virtual/module-binding.ts", Source: stagedModuleBindingSource, Target: target, Diagnostics: "semantic"})
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatalf("%s: %s %#v", target, response.Error, response.Diagnostics)
		}
		file := filepath.Join(t.TempDir(), "module-binding.mts")
		if err := os.WriteFile(file, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		const runner = `import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';const events=[];globalThis.window={get name(){events.push('callback');return 'known'}};const m=await import(pathToFileURL(process.argv[1]).href);assert.deepEqual(events,[]);const callback=m.exposed();assert.deepEqual(events,[]);assert.equal(m.invoke(),'known');assert.deepEqual(events,['callback']);assert.equal(callback(),'known');assert.deepEqual(events,['callback','callback']);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, file).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatalf("%s emitted module binding: %v %s", target, err, output)
		}
		if target == TargetClient {
			checkStagedModuleBindingClone(t, session)
		}
	}
}

func TestStagedModuleBindingOriginalInitializer(t *testing.T) {
	const source = `const shared=Object.freeze({});function factory(){return shared}export function invoke(){return factory()}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
		work := registerCallableEffectWork(facts)
		declaration := owner.checker.GetSymbolAtLocation(call.Expression()).ValueDeclaration
		caller := work.memberNodes[declaration]
		read := declaration.Body().AsBlock().Statements.Nodes[0].AsReturnStatement().Expression
		binding := owner.checker.GetSymbolAtLocation(read).ValueDeclaration
		module := sourceStagedModuleOwner(binding)
		producer, known := work.memberNodes[module]
		if !known {
			t.Fatal("original module owner absent")
		}
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		if !work.stageNativeInputCall(facts, producer, binding.Initializer(), owner) {
			t.Fatal("original initializer producer unavailable")
		}
		ordinary := len(facts[producer].staged.operationUses)
		source, described := work.describeStagedCallResultSource(facts, caller, read, owner)
		if !described || !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
			t.Fatal("original captured read unavailable")
		}
		id, required := work.requireOperation(facts, source.request)
		if !required {
			t.Fatal("captured DATA requirement refused")
		}
		work.prepareOperationUses(facts, owner)
		data, available := work.stagedCallResultData(source.request)
		initializer, delivered := work.stagedCallResultData(stagedResultSourceRequest(binding.Initializer(), module, nil))
		if !delivered || !initializer.delta.extracted || len(initializer.delta.exposures) != 1 || initializer.delta.exposures[0].endpoint.expression != binding.Initializer() {
			t.Fatal("original initializer DATA producer not delivered")
		}
		state := &work.operations[id.index]
		if !available || !data.delta.extracted || len(data.delta.exposures) != 1 || data.delta.exposures[0].endpoint.expression != binding.Initializer() || len(data.delta.required) != 1 || data.delta.required[0].producer.declaration != module || len(state.moduleInputs) != 1 || state.moduleInputs[0].producer != producer || state.moduleInputs[0].declaration != module {
			t.Fatal("captured DATA lost original initializer/availability association")
		}
		if len(facts[producer].staged.operationUses) != ordinary || len(facts[caller].summary.Calls) != 0 {
			t.Fatal("captured availability activated or reenrolled the initializer")
		}
		forged := work.operationRecipes[source.request.producer]
		forged.delta = cloneOperationDelta(forged.delta)
		forged.delta.required[0].producer.declaration = declaration
		forged.delta.required[0].consumer = declaration
		if validStagedCallResultRecipe(forged) {
			t.Fatal("captured read borrowed the function owner for its module producer")
		}
		dependency := work.stagedRequired[sourceStagedDependencyKey{caller, state.moduleInputs[0].edge}]
		if dependency == nil || dependency.operation != read || dependency.cut != source.request.cut || dependency.consumed != 0 || facts[producer].staged.ready || work.closedOperationDependencies()[id.index] {
			t.Fatal("DATA fabricated initializer body delivery")
		}
		var missing []callableFacts
		for i, fact := range facts {
			if i != producer {
				missing = append(missing, cloneProjectCallableFact(fact))
			}
		}
		fresh := registerCallableEffectWork(missing)
		fresh.operationGeneration = owner.values.generation
		freshID, accepted := fresh.requireOperation(missing, source.request)
		if !accepted {
			t.Fatal("typed unavailable initializer was invalidated")
		}
		fresh.prepareOperationUses(missing, owner)
		current := fresh.operations[freshID.index]
		if current.delta.extracted || current.resultProjection != nil || len(current.moduleInputs) != 1 || current.moduleInputs[0].producer != -1 || current.moduleInputs[0].declaration != module || fresh.closedOperationDependencies()[freshID.index] {
			t.Fatal("missing original module producer completed captured DATA")
		}
	})
}

func TestStagedModuleBindingSourceBoundaries(t *testing.T) {
	for _, fixture := range []struct {
		name, source string
		described    bool
	}{
		{"mutable_module", `let shared=()=>window.name;function factory(){return shared}export function invoke(){return factory()}`, false},
		{"other_activation", `function outer(){const shared=()=>window.name;function factory(){return shared}return factory()}export function invoke(){return outer()}`, false},
		{"unprovided_literal", `const shared={callback:()=>window.name};function factory(){return shared}export function invoke(){return factory()}`, true},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			withStagedReturnProgram(t, fixture.source, func(owner *executableBodyOwner, call *ast.Node) {
				facts := stagedReturnSourceFacts(ast.GetSourceFileOfNode(call))
				work := registerCallableEffectWork(facts)
				work.prepareOperationUses(facts, owner)
				declaration := owner.checker.GetSymbolAtLocation(call.Expression()).ValueDeclaration
				caller := work.memberNodes[declaration]
				read := declaration.Body().AsBlock().Statements.Nodes[0].AsReturnStatement().Expression
				source, described := work.describeStagedCallResultSource(facts, caller, read, owner)
				if described != fixture.described {
					t.Fatalf("binding source admission=%v", described)
				}
				if !described {
					return
				}
				if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: source.request.producer, callResult: source}) {
					t.Fatal("original binding source registration")
				}
				id, required := work.requireOperation(facts, source.request)
				if !required {
					t.Fatal("pending source requirement")
				}
				work.prepareOperationUses(facts, owner)
				state := work.operations[id.index]
				if state.delta.extracted || len(state.delta.exposures) != 0 || len(state.delta.residuals) != 0 || work.closedOperationDependencies()[id.index] {
					t.Fatal("unprovided module DATA became a value, unknown or completion")
				}
			})
		})
	}
}

// Demand a separate original New source inside the same module partition. Its
// unsupported iterable phase stays pending after actual canonical extraction.
// The callback initializer's DATA can close without settling that module fact.
func TestStagedModuleBindingIndependentSourcePending(t *testing.T) {
	const source = `function browser(){return window.name}export let invoke:()=>()=>string;{const callback=browser;function factory(){return callback}function run(){return factory()}invoke=run;new WeakMap<object,object>([])}`
	withStagedReturnProgram(t, source, func(owner *executableBodyOwner, call *ast.Node) {
		file := ast.GetSourceFileOfNode(call)
		facts := stagedReturnSourceFacts(file)
		for index := range facts {
			facts[index].callSymbols = make(map[string]ast.SymbolId)
			facts[index].callExpressions = make(map[string]*ast.Node)
			facts[index].contextReferences = make(map[string]*ast.Node)
		}
		work := registerCallableEffectWork(facts)
		restore := registerWriterInputFacts(owner, facts)
		defer restore()
		factory := owner.checker.GetSymbolAtLocation(call.Expression()).ValueDeclaration
		caller := work.memberNodes[factory]
		read := factory.Body().AsBlock().Statements.Nodes[0].AsReturnStatement().Expression
		binding := owner.checker.GetSymbolAtLocation(read).ValueDeclaration
		module := sourceStagedModuleOwner(binding)
		producer := work.memberNodes[module]
		var construction *ast.Node
		walkNode(module, func(node *ast.Node) bool {
			if ast.IsNewExpression(node) {
				construction = node
			}
			return true
		})
		root, registered := work.registerStagedConstructionEffects(facts, producer, construction, owner)
		if !registered {
			t.Fatal("independent original construction source absent")
		}
		pending, required := work.requireOperation(facts, root)
		if !required {
			t.Fatal("independent source demand unavailable")
		}
		symbols, nodes := make(map[ast.SymbolId]int), make(map[*ast.Node]int)
		for index, fact := range facts {
			nodes[fact.node] = index
			if !runtimeModuleEvaluation(fact.node) {
				if symbol := callableDeclarationSymbol(fact.node, owner.checker); symbol != nil {
					symbols[ast.GetSymbolId(symbol)] = index
				}
			}
		}
		bindCallableAliases(file, symbols, owner.checker)
		syntactic := collectSyntacticCallableTargets(facts)
		bindSyntacticCallableAliases(file, syntactic, symbols, owner.checker)
		imports, contexts := collectExternalImportBindings(file, owner.checker), collectContextBindings(file, owner.checker)
		for {
			task, available := work.nextExtraction()
			if !available {
				break
			}
			if task.operation.index != 0 {
				work.extractOperation(facts, task, owner)
				continue
			}
			index := task.callable
			collectDirectCallableEffects(&facts[index], index, facts, symbols, syntactic, nodes, file, owner.checker, nil, nil, imports, contexts, assetAnalysis{}, owner, &work)
			work.finishExtraction(facts, index)
		}
		result, described := work.describeStagedCallResultSource(facts, caller, read, owner)
		if !described || !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: result.request.producer, callResult: result}) {
			t.Fatal("original captured source absent")
		}
		id, required := work.requireOperation(facts, result.request)
		if !required {
			t.Fatal("binding DATA demand absent")
		}
		unfinished := resolveCallableEffectsWithWork(facts, owner, &work)
		closed := work.closedOperationDependencies()
		state := work.operations[id.index]
		if !state.delta.extracted || !closed[id.index] || closed[pending.index] || !facts[producer].staged.ready || !facts[producer].staged.operationsPending || facts[producer].staged.settled || facts[caller].staged.settled || len(unfinished) == 0 || stagedPublicationError(unfinished) == "" {
			t.Fatal("local binding DATA discharged independent module work")
		}
		dependency := work.stagedRequired[sourceStagedDependencyKey{caller, state.moduleInputs[0].edge}]
		if dependency == nil || dependency.invalid || dependency.projectionPending || dependency.consumed == 0 || dependency.consumed != work.stagedRevisions[producer] {
			t.Fatal("module pending control lacked authentic canonical delivery")
		}
		projection := callableAnalysisFromFacts(file, facts, nil)
		if len(projection.pending) == 0 || len(projection.summaries) != 0 {
			t.Fatal("pending module work published callable summaries")
		}
	})

}

// Cached descriptions preserve original module ownership, but not a DATA
// subscriber, source projection or consumed module revision in a fresh graph.
func checkStagedModuleBindingClone(t *testing.T, session *Session) {
	t.Helper()
	for _, project := range session.projects {
		if project.callableCache == nil {
			continue
		}
		owner := project.callableCache.owner
		var facts []callableFacts
		for _, analysis := range project.callableCache.bySource {
			for _, fact := range analysis.facts {
				facts = append(facts, cloneProjectCallableFact(fact))
			}
		}
		work := registerCallableEffectWork(facts)
		work.operationGeneration = owner.values.generation
		for caller, fact := range facts {
			if fact.summary.Name != "read" || fact.sourceFile.FileName() != "/virtual/module-binding.ts" {
				continue
			}
			read := fact.node.Body().AsBlock().Statements.Nodes[0].AsReturnStatement().Expression
			request := stagedBindingResultRequest(read, fact.node)
			if _, available := work.stagedCallResultData(request); available {
				t.Fatal("clone inherited module DATA delivery")
			}
			id, required := work.requireOperation(facts, request)
			if !required || work.operations[id.index].resultProjection != nil || work.closedOperationDependencies()[id.index] {
				t.Fatal("clone inherited current binding/module observation")
			}
			work.initializePropagation(facts)
			work.prepareOperationUses(facts, owner)
			data, available := work.stagedCallResultData(request)
			state := &work.operations[id.index]
			if !available || !data.delta.extracted || len(data.delta.exposures) != 1 || !work.closedOperationDependencies()[id.index] || len(state.moduleInputs) != 1 {
				t.Fatal("original binding source did not renew cloned module DATA")
			}
			input := state.moduleInputs[0]
			dependency := work.stagedRequired[sourceStagedDependencyKey{caller, input.edge}]
			if dependency == nil || dependency.consumed == 0 || dependency.consumed != work.stagedRevisions[input.producer] {
				t.Fatal("fresh module canonical revision not consumed")
			}
			dependency.consumed = 0
			if work.closedOperationDependencies()[id.index] {
				t.Fatal("module DATA paid an unconsumed canonical revision")
			}
			work.refreshMemberSourceModules(facts, caller)
			if !work.closedOperationDependencies()[id.index] {
				t.Fatal("current original module revision did not renew availability")
			}
			dependency.projectionPending = true
			if work.closedOperationDependencies()[id.index] {
				t.Fatal("module DATA paid an unavailable canonical projection")
			}
			return
		}
	}
	t.Fatal("completed module binding source absent")
}
