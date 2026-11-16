package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

type activeModuleSourceDispatch uint8

const (
	activeModulePrefix activeModuleSourceDispatch = iota
	activeModuleCompleteAnalysis
	// Collect the normal canonical graph while keeping the first resolve owned
	// by the live inspection callback, for pending-before-initialization tests.
	activeModuleBeforeResolution
)

// withActiveModuleSourceWork owns the real selected program and generation through
// inspection. It collects imported initializers and the entry module with the
// existing dispatcher. The default preserves the original prefix stop; full
// analysis also collects canonical declaration-MAY summaries and performs its
// first normal resolution, without implying runtime body invocation. Actual
// stops/pending work are reported, never promoted to settled-graph authority.
// Supplied imports are pre-collected scalar fixtures; this helper does not model
// general multi-file Session merging.
func withActiveModuleSourceWork(t *testing.T, request Request, sources map[string]string, importedIDs []string, inspect func([]callableFacts, *callableEffectWork, *executableBodyOwner), modes ...activeModuleSourceDispatch) {
	withActiveModuleSourceWorkSetup(t, request, sources, importedIDs, nil, inspect, modes...)
}

// The optional setup observes the genuine registry before original extraction.
// It can wrap a live source callback without manufacturing source events.
func withActiveModuleSourceWorkSetup(t *testing.T, request Request, sources map[string]string, importedIDs []string, setup func([]callableFacts, *callableEffectWork, *executableBodyOwner), inspect func([]callableFacts, *callableEffectWork, *executableBodyOwner), modes ...activeModuleSourceDispatch) {
	t.Helper()
	mode := activeModulePrefix
	if len(modes) > 1 {
		t.Fatal("ambiguous source dispatch mode")
	}
	if len(modes) == 1 {
		mode = modes[0]
	}
	project, diagnostics, err := newProjectStateWithSources(request, request.ID, sources)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	file := generation.sourceFile
	for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), file) {
		if converted := projectDiagnostic(diagnostic); hasErrorDiagnostic([]Diagnostic{converted}) {
			t.Fatal(converted)
		}
	}
	owner := newExecutableBodyOwner(project, generation.checker)
	facts := stagedReturnSourceFacts(file)
	for i := range facts {
		fact := &facts[i]
		fact.callSymbols = make(map[string]ast.SymbolId)
		fact.ownedScalarCalls = make(map[string]bool)
		fact.callExpressions = make(map[string]*ast.Node)
		fact.contextReferences = make(map[string]*ast.Node)
		if runtimeVariableInitializer(fact.node) {
			if declaration, plan, ok := preflightModuleInitializer(owner, fact.node); ok {
				fact.initializerDeclaration, fact.initializerPlan = declaration, plan
			}
		}
	}
	for _, importedID := range importedIDs {
		importedFile := project.program.GetSourceFile(importedID)
		if importedFile == nil {
			t.Fatal("original runtime import missing", importedID)
		}
		imported := collectCallableEffects(importedFile, owner.checker, nil, nil, nil, nil, assetAnalysis{}, owner)
		if len(imported.pending) != 0 || len(imported.facts) == 0 {
			t.Fatal("original runtime import not extracted", importedID)
		}
		facts = append(facts, imported.facts...)
	}
	work := registerCallableEffectWork(facts)
	if mode == activeModulePrefix {
		work.initializePropagation(facts)
	}
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
	restore := registerWriterInputFacts(owner, facts, &work)
	defer restore()
	installBuildingInitializers(owner, file, facts)
	if setup != nil {
		setup(facts, &work, owner)
	}
	canonicalTasks, operationTasks := 0, 0
	stoppedDeferred := false
	for work.extractionHead < len(work.extractionQueue) {
		next := work.extractionQueue[work.extractionHead]
		if mode == activeModulePrefix && next.operation.index == 0 && !runtimeModuleEvaluation(facts[next.callable].node) {
			stoppedDeferred = true
			break
		}
		task, available := work.nextExtraction()
		if !available {
			break
		}
		if task.operation.index != 0 {
			operationTasks++
			work.extractOperation(facts, task, owner)
			continue
		}
		i := task.callable
		canonicalTasks++
		taskFile := file
		taskImports, taskContexts := imports, contexts
		if mode != activeModulePrefix && facts[i].sourceFile != file {
			taskFile = facts[i].sourceFile
			taskImports, taskContexts = collectExternalImportBindings(taskFile, owner.checker), collectContextBindings(taskFile, owner.checker)
		}
		collectDirectCallableEffects(&facts[i], i, facts, symbols, syntax, nodes, taskFile, owner.checker, nil, nil, taskImports, taskContexts, assetAnalysis{}, owner, &work)
		work.finishExtraction(facts, i)
	}
	pending := []sourceStagedPending(nil)
	if mode == activeModuleCompleteAnalysis {
		// This is the fresh graph's FIRST normal resolve, following the canonical
		// declaration collector; no cached/merged fact graph is resolved again.
		sealMapInputs(facts, nodes)
		for i := range facts {
			facts[i].directOwnedScalarBlocked = facts[i].directOwnedScalarBlocked || !directScalarHelper(&facts[i], owner.checker)
		}
		pending = resolveCallableEffectsWithWork(facts, owner, &work)
	}
	t.Logf("active module source mode=%d canonicalTasks=%d operationTasks=%d stoppedBeforeDeferred=%t remainingQueue=%d pending=%d", mode, canonicalTasks, operationTasks, stoppedDeferred, len(work.extractionQueue)-work.extractionHead, len(pending))
	inspect(facts, &work, owner)
}
