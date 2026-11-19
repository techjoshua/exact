package exactcompiler

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The real realm read can return a Proxy. Its instanceof protocol may invoke
// user code even though the selected standard algorithm never Calls the value.
// This source check requires that external obligation, not a known WeakMap value.
func TestStagedGlobalStoreOriginalHasInstanceSource(t *testing.T) {
	f := newStagedGlobalStoreFixture(t)
	request := f.request("analyze", "component-abi/opaque-operation.ts")

	sources := make(map[string]string, len(f.files))
	for name, source := range f.files {
		sources[filepath.Join(f.root, name)] = source
	}
	project, diagnostics, err := newProjectStateWithSources(request, request.ID, sources)
	if err != nil {
		t.Fatal(err, diagnostics)
	}
	for _, diagnostic := range diagnostics {
		if converted := projectDiagnostic(diagnostic); hasErrorDiagnostic([]Diagnostic{converted}) {
			t.Fatal(converted)
		}
	}
	generation, err := project.advance(context.Background(), request.ID, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	file := generation.sourceFile
	owner := newExecutableBodyOwner(project, generation.checker)
	facts := stagedReturnSourceFacts(file)
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
	}
	importedFile := project.program.GetSourceFile(filepath.Join(f.root, "component/contract-versions.ts"))
	if importedFile == nil {
		t.Fatal("original runtime import missing")
	}
	imported := collectCallableEffects(importedFile, owner.checker, nil, nil, nil, nil, assetAnalysis{}, owner)
	if len(imported.pending) != 0 || len(imported.facts) == 0 {
		t.Fatal("original runtime import not extracted")
	}
	facts = append(facts, imported.facts...)
	work := registerCallableEffectWork(facts)
	work.initializePropagation(facts)
	nodes := make(map[*ast.Node]int, len(facts))
	symbols := make(map[ast.SymbolId]int)
	for i, fact := range facts {
		nodes[fact.node] = i
		if !runtimeModuleEvaluation(fact.node) {
			if symbol := callableDeclarationSymbol(fact.node, owner.checker); symbol != nil {
				symbols[ast.GetSymbolId(symbol)] = i
			}
		}
	}
	bindCallableAliases(file, symbols, owner.checker)
	syntax := collectSyntacticCallableTargets(facts)
	bindSyntacticCallableAliases(file, syntax, symbols, owner.checker)
	imports, contexts := collectExternalImportBindings(file, owner.checker), collectContextBindings(file, owner.checker)
	restore := registerWriterInputFacts(owner, facts)
	defer restore()
	installBuildingInitializers(owner, file, facts)
	drainModules := func(work *callableEffectWork, facts []callableFacts) {
		for work.extractionHead < len(work.extractionQueue) {
			next := work.extractionQueue[work.extractionHead]
			if next.operation.index == 0 && !runtimeModuleEvaluation(facts[next.callable].node) {
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
			i := task.callable
			collectDirectCallableEffects(&facts[i], i, facts, symbols, syntax, nodes, file, owner.checker, nil, nil, imports, contexts, assetAnalysis{}, owner, work)
			work.finishExtraction(facts, i)
		}
	}
	drainModules(&work, facts)
	// The module collector must issue ordering from its actual parent/child
	// Gets before conversion; passive replay and cached plans cannot supply it.
	var argumentOrder *sourceStagedNativeArgumentOrder
	for _, recipe := range work.operationRecipes {
		if recipe.nativeGet != nil && recipe.nativeGet.descriptorMap != nil && runtimeModuleEvaluation(recipe.key.declaration) {
			if proof := recipe.nativeGet.descriptorMap.argumentOrder; proof != nil {
				argumentOrder = proof
			}
		}
	}
	if argumentOrder == nil || argumentOrder.issuer != argumentOrder || argumentOrder.epoch != work.operationEpoch || argumentOrder.generation != owner.values.generation {
		t.Error("original module argument observation did not issue current map ordering")
	}
	var operation *ast.Node
	walkNode(file.AsNode(), func(node *ast.Node) bool {
		if ast.IsBinaryExpression(node) && node.AsBinaryExpression().OperatorToken.Kind == ast.KindInstanceOfKeyword {
			region := enclosingCallableNode(node)
			if region != nil && region.Name() != nil && region.Name().Text() == "sharedOpaqueOperationStore" {
				operation = node
			}
		}
		return true
	})
	if operation == nil {
		t.Fatal("original store instanceof missing")
	}
	caller := work.memberNodes[enclosingCallableNode(operation)]
	if !work.stageHasInstance(facts, caller, operation, owner) {
		t.Fatal("original operator not registered")
	}
	for work.refreshStagedCallResults(facts, owner) {
	}
	for _, recipe := range work.operationRecipes {
		if recipe.nativeGet == nil || recipe.nativeGet.descriptorMap == nil || recipe.nativeGet.descriptorMap.argumentOrder == nil {
			continue
		}
		plan := recipe.nativeGet.descriptorMap
		protocol := work.operationRecipes[plan.protocol.producer]
		if protocol.nativeGet == nil || protocol.nativeGet.descriptorMap == nil || protocol.nativeGet.descriptorMap.argumentSource == nil {
			t.Fatalf("original map protocol lost its argument source description: algorithmDescription=%t protocol=%t refined=%t required=%d", plan.argumentSource != nil, protocol.nativeGet != nil, protocol.mapProtocol != nil, len(protocol.delta.required))
		}
		request := stagedModuleArgumentRequest(protocol.nativeGet)
		source, registered := work.operationRecipes[request.producer]
		if !registered || !validStagedModuleArgumentRecipe(source) || !work.moduleArgumentTaskOwned(source) {
			t.Fatalf("original map source task not registered/adopted: registered=%t valid=%t owned=%t", registered, validStagedModuleArgumentRecipe(source), work.moduleArgumentTaskOwned(source))
		}
	}
	var root sourceStagedOperationRequest
	for _, recipe := range work.operationRecipes {
		if source := recipe.hasInstance; source != nil && source.role == "" && source.root.use == operation {
			root = source.root
		}
	}
	if root.producer.operation == nil {
		t.Fatal("original operator root absent")
	}
	lhs := work.operationRecipes[stagedHasInstanceRequest(root, "lhs-value").producer]
	if len(lhs.delta.required) != 1 || !sameOperationRequest(lhs.delta.required[0], stagedBindingResultRequest(operation.AsBinaryExpression().Left, root.consumer)) {
		t.Fatal("original lhs binding DATA dependency missing")
	}
	if !validStagedHasInstanceRecipe(lhs) || !lhs.delta.extracted {
		t.Fatal("original external Get result has no lhs source contribution")
	}
	binding := work.operationRecipes[lhs.delta.required[0].producer]
	if binding.callResult == nil || len(binding.delta.required) != 1 {
		t.Fatal("lhs lost its original Get DATA producer")
	}
	read := binding.callResult.binding.Initializer()
	getEffects := work.operationRecipes[stagedGetResultRequest(read, root.consumer, "effects", nil).producer]
	runtimeGet := false
	for _, effect := range getEffects.delta.effects {
		if effect.provenanceIncomplete {
			t.Fatal("actual external Get was published as compiler provenance debt")
		}
		runtimeGet = runtimeGet || effect.Environment == "unknown" && effect.Opaque
	}
	if !runtimeGet || !work.stagedGetResultAdmitted(read, root.consumer) {
		t.Fatal("external DATA had no current owning runtime Get Effects")
	}
	proof := work.currentHasInstanceNativeDefault(root)
	if proof == nil {
		t.Fatal("original method/prototype event did not issue a current native-default transcript")
	}
	for _, role := range []string{"prototype", "algorithm"} {
		phase := work.operationRecipes[stagedHasInstanceRequest(root, role).producer]
		if !phase.delta.extracted {
			t.Fatal("actual cumulative lhs DATA did not reach retained native protocol", role)
		}
	}
	for _, change := range []func(*sourceStagedHasInstanceNativeDefault){
		func(p *sourceStagedHasInstanceNativeDefault) { p.cut.initializing = operation },
		func(p *sourceStagedHasInstanceNativeDefault) { p.generation = new(projectGeneration) },
		func(p *sourceStagedHasInstanceNativeDefault) { p.root.use = operation.AsBinaryExpression().Right },
	} {
		prior := *proof
		change(proof)
		if work.currentHasInstanceNativeDefault(root) != nil {
			t.Fatal("wrong binary/cut/generation supplied native protocol receipt")
		}
		*proof = prior
	}
	id := work.operationIDs[root.producer]
	copy := *proof
	work.operations[id.index].hasInstance.nativeDefault = &copy
	if work.currentHasInstanceNativeDefault(root) != nil {
		t.Fatal("copied native transcript issued")
	}
	work.operations[id.index].hasInstance.nativeDefault = proof
	getID := work.operationIDs[stagedHasInstanceRequest(root, "has-instance-get").producer]
	work.operations[getID.index].revision++
	if work.currentHasInstanceNativeDefault(root) != nil {
		t.Fatal("stale source revision supplied a native transcript")
	}
	work.operations[getID.index].revision--
	clones := make([]callableFacts, len(facts))
	for index := range facts {
		clones[index] = cloneProjectCallableFact(facts[index])
	}
	for _, fact := range clones {
		for _, recipe := range fact.staged.operationRecipes {
			if recipe.nativeGet != nil && recipe.nativeGet.descriptorMap != nil && recipe.nativeGet.descriptorMap.argumentOrder != nil {
				t.Fatal("cloned source retained module argument ordering authority")
			}
		}
	}
	fresh := registerCallableEffectWork(clones)
	for key, recipe := range fresh.operationRecipes {
		if recipe.declarationCall != nil && fresh.declarationCallObserved[key] != nil {
			t.Fatal("fresh graph inherited a declaration source observation")
		}
	}
	if fresh.currentHasInstanceNativeDefault(root) != nil || fresh.hasInstanceExternalInput(root, owner) {
		t.Fatal("cloned descriptions inherited native or external DATA authority")
	}
	restoreFresh := registerWriterInputFacts(owner, clones)
	defer restoreFresh()
	fresh.initializePropagation(clones)
	// Work B matches project resolution: completed descriptions, no ordinary
	// module collector replay. Only the demanded source task can reissue order.
	uses, calls := make([]int, len(clones)), make([]int, len(clones))
	for index := range clones {
		uses[index], calls[index] = len(clones[index].staged.operationUses), len(clones[index].summary.Calls)
	}
	assertGlobalStoreRequestedInputSource(t, &fresh, clones, owner)
	if !fresh.stageHasInstance(clones, caller, operation, owner) {
		t.Fatal("fresh graph could not enter original HasInstance owner")
	}
	for fresh.refreshStagedCallResults(clones, owner) {
	}
	fieldViews := 0
	for _, recipe := range fresh.operationRecipes {
		if recipe.nativeGet == nil || recipe.nativeGet.descriptorEntry == nil || stagedDescriptorFieldIndex(recipe.key.selector.field) < 0 {
			continue
		}
		parent := stagedMapEntryFieldRequest(recipe.nativeGet.descriptorEntry, recipe.key.selector.field)
		reading, needed := stagedModuleArgumentFieldRequest(recipe.nativeGet, parent)
		if !needed {
			continue
		}
		order, _ := fresh.stagedModuleArgumentFieldOrder(recipe.nativeGet, parent)
		if order == nil || !operationContainsRequest(recipe.delta.required, reading) {
			t.Fatal("original field did not retain its current applied argument-source reader")
		}
		fieldViews++
		wrong := reading
		wrong.reading.selector.association = nil
		if fresh.validModuleArgumentReading(fresh.operationRecipes[reading.producer], wrong) {
			t.Fatal("unrelated field borrowed module argument source")
		}
		wrongNative := *recipe.nativeGet
		wrongNative.kind = sourceNativeObjectCreate
		invalid := recipe
		invalid.nativeGet = &wrongNative
		if validStagedMapFieldRecipe(invalid) {
			t.Fatal("non-map native source borrowed a map field")
		}
	}
	if fieldViews < len(reflectiveDescriptorKeys) {
		t.Fatal("original six field readers were not connected")
	}
	assertGlobalStoreFieldLookupIsolation(t, &fresh, clones, owner)
	renewedOrder := false
	for index := range clones {
		if !runtimeModuleEvaluation(clones[index].node) {
			continue
		}
		if len(clones[index].staged.operationUses) != uses[index] || len(clones[index].summary.Calls) != calls[index] {
			t.Fatal("source task duplicated ordinary use or invocation")
		}
		for _, recipe := range clones[index].staged.operationRecipes {
			if recipe.moduleArgument != nil && fresh.moduleArgumentSourceCurrent(recipe) && fresh.moduleArgumentTaskOwned(recipe) {
				renewedOrder = true
			}
		}
	}
	if !renewedOrder {
		t.Fatal("demanded source task did not reissue module argument observation")
	}
	current := fresh.currentHasInstanceNativeDefault(root)
	if current == nil || current == proof || !fresh.hasInstanceExternalInput(root, owner) {
		t.Fatal("fresh original Get/DATA/prototype observations did not reissue")
	}
	assertGlobalStoreDeclarationProtocols(t, &fresh, clones, owner)
	for _, recipe := range work.operationRecipes {
		if recipe.hasInstance != nil && sameOperationRequest(recipe.hasInstance.root, root) {
			for _, effect := range recipe.delta.effects {
				if effect.provenanceIncomplete {
					t.Fatal("unavailable source became runtime uncertainty", effect)
				}
			}
		}
	}
	assertGlobalStoreNativeArgumentProtocols(t, &fresh, clones, owner)
	assertGlobalStoreHasFreshTargets(t, &fresh, clones, owner)
	assertGlobalStoreEntryLawExclusions(t, &fresh, clones, owner)
}
