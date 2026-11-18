package exactcompiler

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Pause the original canonical dispatcher at the first New's entry. The prior
// unchanged module partitions use the production collector and operation queue,
// then the actual construction entry must adopt before legacy fallback. All
// original deferred declarations remain registered and indexed.
func TestStagedModuleMapActivationOriginalSourceQueue(t *testing.T) {
	testStagedModuleMapSourceQueue(t, true)
}

// Actual import extraction outside this per-file work cannot publish its
// initialization inside the graph. The selected declaration stays a valid
// pending obligation until a merged graph binds its real producer.
func TestStagedModuleMapActivationPerFileImportComparison(t *testing.T) {
	testStagedModuleMapSourceQueue(t, false)
}

func testStagedModuleMapSourceQueue(t *testing.T, includeImportedFacts bool) {
	t.Helper()
	const id = "/virtual/component-abi/opaque-operation.ts"
	const contract = "/virtual/component/contract-versions.ts"
	sources := map[string]string{
		id:                                writerInputOpaqueComposition,
		contract:                          `export const componentContractVersion=6;`,
		"/virtual/component/contracts.ts": `export type ComponentDomainIdentity={readonly executionRoot:string};export type ComponentDomain=ComponentDomainIdentity;`,
	}
	project, diagnostics, err := newProjectStateWithSources(Request{Kind: "analyze", ID: id, Source: writerInputOpaqueComposition, Diagnostics: "semantic"}, id, sources)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), id, writerInputOpaqueComposition)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	for _, diagnostic := range generation.checker.GetDiagnostics(context.Background(), generation.sourceFile) {
		if converted := projectDiagnostic(diagnostic); hasErrorDiagnostic([]Diagnostic{converted}) {
			t.Fatal(converted)
		}
	}
	owner := newExecutableBodyOwner(project, generation.checker)
	file := generation.sourceFile
	facts := stagedReturnSourceFacts(file)
	for index := range facts {
		fact := &facts[index]
		fact.callSymbols = make(map[string]ast.SymbolId)
		fact.callExpressions = make(map[string]*ast.Node)
		fact.contextReferences = make(map[string]*ast.Node)
		if runtimeVariableInitializer(fact.node) {
			if declaration, plan, ok := preflightModuleInitializer(owner, fact.node); ok {
				fact.initializerDeclaration, fact.initializerPlan = declaration, plan
			}
		}
	}
	dependency := project.program.GetSourceFile(contract)
	if dependency == nil {
		t.Fatal("original runtime import source missing")
	}
	// This is the actual imported initializer extraction, not a supplied ready
	// flag or a no-entry law inferred from module availability.
	imported := collectCallableEffects(dependency, owner.checker, nil, nil, nil, nil, assetAnalysis{}, owner)
	if len(imported.pending) != 0 || len(imported.facts) == 0 {
		t.Fatal("original imported initializer did not extract")
	}
	if includeImportedFacts {
		facts = append(facts, imported.facts...)
	}
	work := registerCallableEffectWork(facts)
	work.initializePropagation(facts)
	nodeTargets := make(map[*ast.Node]int, len(facts))
	symbolTargets := make(map[ast.SymbolId]int)
	for index, fact := range facts {
		nodeTargets[fact.node] = index
		if !runtimeModuleEvaluation(fact.node) {
			if symbol := callableDeclarationSymbol(fact.node, owner.checker); symbol != nil {
				symbolTargets[ast.GetSymbolId(symbol)] = index
			}
		}
	}
	bindCallableAliases(file, symbolTargets, owner.checker)
	syntacticTargets := collectSyntacticCallableTargets(facts)
	bindSyntacticCallableAliases(file, syntacticTargets, symbolTargets, owner.checker)
	imports := collectExternalImportBindings(file, owner.checker)
	contexts := collectContextBindings(file, owner.checker)
	restore := registerWriterInputFacts(owner, facts)
	defer restore()
	installBuildingInitializers(owner, file, facts)
	var originalNew *ast.Node
	for _, event := range owner.values.summary(file.AsNode()).normal {
		if ast.IsNewExpression(event.node) && event.fold == nil && event.phase == nil && event.operand == nil {
			originalNew = event.node
			break
		}
	}
	if originalNew == nil {
		t.Fatal("original module New occurrence missing")
	}
	newOwner := work.memberNodes[sourceStagedModuleOwner(originalNew)]
	for work.extractionHead < len(work.extractionQueue) {
		next := work.extractionQueue[work.extractionHead]
		if next.operation.index == 0 && (next.callable == newOwner || !runtimeModuleEvaluation(facts[next.callable].node)) {
			break // The remaining canonical tasks stay queued and unready.
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
		collectDirectCallableEffects(&facts[index], index, facts, symbolTargets, syntacticTargets, nodeTargets, file, owner.checker, nil, nil, imports, contexts, assetAnalysis{}, owner, &work)
		work.finishExtraction(facts, index)
	}
	work.prepareOperationUses(facts, owner)
	adoptedNew := work.stageConstructionEffects(facts, newOwner, originalNew, owner)
	if !includeImportedFacts {
		work.prepareOperationUses(facts, owner)
		closed := work.closedOperationDependencies()
		admission := work.operationDependencyReadiness(true)
		unbound := false
		for index := 1; index < len(work.operations); index++ {
			state := &work.operations[index]
			source := work.operationRecipes[state.key].nativeGet
			if source == nil || source.kind != sourceNativeObjectDefineProperties || state.key.selector.field != "eager-inputs" || len(source.moduleSources) == 0 {
				continue
			}
			unbound = true
			if state.invalid || !state.delta.extracted || closed[index] || !admission[index] {
				t.Fatal("selected external initializer invalidated source admission or acquired publication", state.invalid, state.delta.extracted, closed[index], admission[index])
			}
			if len(state.moduleInputs) != len(source.moduleSources) {
				t.Fatal("selected external initializer requirement was dropped")
			}
			for _, input := range state.moduleInputs {
				selected := false
				for _, original := range source.moduleSources {
					selected = selected || input.declaration == original.declaration
				}
				_, registered := work.memberNodes[input.declaration]
				if !selected || registered || input.producer != -1 || input.edge == "" || ast.GetSourceFileOfNode(input.declaration) != dependency || !runtimeModuleEvaluation(input.declaration) {
					t.Fatal("unbound requirement lost its exact selected external source", input)
				}
			}
			root, issued := work.operationIDs[source.request.producer]
			consumer := work.memberNodes[source.request.consumer]
			if !issued || work.operations[root.index].invalid || closed[root.index] || !facts[consumer].staged.operationsPending || facts[consumer].staged.settled {
				t.Fatal("per-file source completed before imported initialization delivery")
			}
		}
		if !unbound {
			t.Fatal("original selected external initializer was not retained")
		}
		for index, fact := range facts {
			if fact.sourceFile != file || ast.IsFunctionLike(fact.node) && (fact.staged.ready || work.extractionPhases[index] != callableExtractionQueued) {
				t.Fatal("per-file work merged an import fact or entered a deferred canonical body")
			}
		}
		return
	}
	if !adoptedNew {
		t.Fatal("original module New source entry refused before legacy fallback")
	}
	work.prepareOperationUses(facts, owner)
	closed := work.closedOperationDependencies()
	var mapSource *sourceStagedNativeGetSource
	newClosed := false
	for index, fact := range facts {
		if ast.IsFunctionLike(fact.node) && (fact.staged.ready || work.extractionPhases[index] != callableExtractionQueued) {
			t.Fatal("source control entered a deferred canonical body")
		}
		if !runtimeModuleEvaluation(fact.node) || fact.sourceFile != file {
			continue
		}
		for _, use := range fact.staged.operationUses {
			id, adopted := work.operationIDs[use.request.producer]
			if !adopted || !closed[id.index] {
				t.Fatal("original module consumer did not close", use.request.producer.operation.Pos(), use.request.producer.selector.field)
			}
			recipe := work.operationRecipes[use.request.producer]
			newClosed = newClosed || recipe.constructionEffects != nil
			if recipe.nativeGet != nil && recipe.nativeGet.kind == sourceNativeObjectDefineProperties {
				mapSource = work.operationRecipes[nativeRootDebtRequest(recipe.nativeGet, "algorithm").producer].nativeGet
			}
		}
	}
	if mapSource == nil || mapSource.descriptorMap == nil || !newClosed {
		t.Fatal("original module map/New ordinary consumers missing")
	}
	own := work.operationRecipes[stagedMapProtocolPhaseRequest(mapSource, "own-writers").producer]
	write, reflective, protocol, outer, importsRetained, entry, has, get := false, false, false, false, false, false, false, false
	for _, required := range own.delta.required {
		id, issued := work.operationIDs[required.producer]
		c := work.operationRecipes[required.producer].memberSource
		if !issued || !closed[id.index] || c == nil || c.coverage == nil || c.coverage.origin != mapSource.descriptorMap.descriptors.expression {
			t.Fatal("actual original enum C missing or unclosed")
		}
		for _, child := range c.coverage.required {
			childID, delivered := work.operationIDs[child.producer]
			s := work.operationRecipes[child.producer].memberSource
			if !delivered || !closed[childID.index] || s == nil {
				t.Fatal("original enum source child undelivered", child.producer.selector.field)
			}
			if proof := s.moduleExcluded; proof != nil {
				write = write || s.candidate.region != nil && ast.IsAssignmentExpression(s.candidate.operation, false)
				reflective = reflective || s.candidate.region != nil && s.candidate.reflective
				protocol = protocol || s.candidate.region != nil && s.candidate.protocol
				outer = outer || proof.notEntered != nil && nodeInside(proof.source.read, proof.notEntered) && proof.source.read != proof.notEntered
				importsRetained = importsRetained || len(s.moduleImports) != 0
			}
		}
	}
	for key, recipe := range work.operationRecipes {
		s := recipe.memberSource
		if s == nil || s.coverage == nil || s.parent.producer.operation != mapSource.request.producer.operation || work.memberCoverageObserved[key] != work.operationGeneration {
			continue
		}
		entry = entry || stagedMapEntryMemberParent(s.parent)
		if _, phase, valid := stagedFieldMemberParent(s.parent); valid {
			has = has || phase == stagedFieldObservationHas
			get = get || phase == stagedFieldObservationGet
		}
	}
	if !write || !reflective || !protocol || !outer || !importsRetained || !entry || !has || !get {
		t.Fatal("original module enum/entry/field delivery incomplete", write, reflective, protocol, outer, importsRetained, entry, has, get)
	}
}

// Keep the original module prefix and all three original deferred writers.
// Only the fixture's invocation driver is replaced, so this control reaches
// the original map/New partitions without executing the later writer journey.
func TestStagedModuleMapActivationOriginalPartition(t *testing.T) {
	end := strings.Index(writerInputOpaqueComposition, "\n\nexport function invoke()")
	if end < 0 {
		t.Fatal("original fixture driver missing")
	}
	source := writerInputOpaqueComposition[:end] + "\nexport function invoke(){return emptyOperationPrototype}"
	f := newExecutableFixture(t, map[string]string{"entry.ts": `export {invoke} from './component-abi/opaque-operation.js';`})
	for name, contents := range map[string]string{
		"component-abi/opaque-operation.ts": source,
		"component/contract-versions.ts":    `export const componentContractVersion=6;`,
		"component/contracts.ts":            `export type ComponentDomainIdentity={readonly executionRoot:string};export type ComponentDomain=ComponentDomainIdentity;`,
	} {
		path := filepath.Join(f.root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(contents), 0600); err != nil {
			t.Fatal(err)
		}
		f.files[name] = contents
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		request := f.request("compile", "component-abi/opaque-operation.ts")
		request.Target = target
		response := f.session.Execute(request)
		if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
			t.Fatal(target, response.Error, response.Diagnostics)
		}
		mapOwned, deferredWrite, reflectiveWrite, deferredProtocol, outerNotEntered, imported, fieldPrefix, entryPrefix := false, false, false, false, false, false, false, false
		for _, project := range f.session.projects {
			if project.callableCache == nil {
				continue
			}
			for _, fact := range project.callableCache.merged.facts {
				if runtimeModuleEvaluation(fact.node) && fact.sourceFile.FileName() == request.ID {
					if !fact.staged.settled || fact.staged.operationsPending {
						t.Fatal("original module consumer did not settle")
					}
					for _, effect := range fact.summary.EffectSources {
						if effect.Environment == "browser" || effect.Environment == "unknown" {
							t.Fatal("module enum entered a deferred original writer", effect)
						}
					}
				}
				for _, recipe := range fact.staged.operationRecipes {
					if recipe.nativeGet != nil && recipe.nativeGet.descriptorMap != nil && recipe.key == recipe.nativeGet.descriptorMap.protocol.producer && runtimeModuleEvaluation(recipe.key.declaration) {
						mapOwned = mapOwned || recipe.mapProtocol != nil && recipe.delta.extracted && len(recipe.mapProtocol.entries) == 2
					}
					s := recipe.memberSource
					if s == nil || s.moduleExcluded == nil || !runtimeModuleEvaluation(s.parent.consumer) || s.candidate.region == nil && !s.candidate.protocol {
						continue
					}
					proof := s.moduleExcluded
					if !proof.supported || !proof.accounted || proof.source.cut != s.candidate.cut || !sameOperationRequest(proof.source.request, s.parent) || len(proof.required) == 0 {
						t.Fatal("original exclusion lost its exact prefix/required producers")
					}
					imported = imported || len(s.moduleImports) != 0
					fieldPrefix = fieldPrefix || strings.HasPrefix(s.parent.producer.selector.field, "field-member:")
					entryPrefix = entryPrefix || s.parent.producer.selector.field == "descriptor-entry-get"
					if s.parent.producer.selector != (sourceStagedOperationSelector{}) || !ast.IsCallExpression(proof.source.read) {
						continue
					}
					operation := s.candidate.operation
					deferredWrite = deferredWrite || s.candidate.region != nil && ast.IsAssignmentExpression(operation, false)
					reflectiveWrite = reflectiveWrite || s.candidate.region != nil && !s.candidate.protocol && ast.IsCallExpression(operation)
					deferredProtocol = deferredProtocol || s.candidate.region != nil && s.candidate.protocol
					outerNotEntered = outerNotEntered || s.candidate.region == nil && ast.IsCallExpression(operation) && nodeInside(proof.source.read, operation) && operation != proof.source.read && proof.notEntered == operation
				}
			}
		}
		if !mapOwned || !deferredWrite || !reflectiveWrite || !deferredProtocol || !outerNotEntered || !imported || !fieldPrefix || !entryPrefix {
			t.Fatal("original map conversion lost an enum/entry/field source connection", mapOwned, deferredWrite, reflectiveWrite, deferredProtocol, outerNotEntered, imported, fieldPrefix, entryPrefix)
		}
		// The imports retain their real module boundary in emitted source.
		outputRoot := t.TempDir()
		dependency := filepath.Join(outputRoot, "component")
		if err := os.MkdirAll(dependency, 0700); err != nil {
			t.Fatal(err)
		}
		// The output is written in the same relative partition as its input.
		module := filepath.Join(outputRoot, "component-abi", "opaque-operation.mts")
		if err := os.MkdirAll(filepath.Dir(module), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(module, []byte(response.Code), 0600); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dependency, "contract-versions.js"), []byte(`export const componentContractVersion=6;`), 0600); err != nil {
			t.Fatal(err)
		}
		runner := `import assert from'node:assert/strict';import{pathToFileURL}from'node:url';globalThis.window=new Proxy({},{get(){throw new Error('deferred browser work')}});globalThis.document=new Proxy({},{get(){throw new Error('deferred callback')}});const m=await import(pathToFileURL(process.argv[1]).href);const p=m.invoke();assert.equal(Object.isFrozen(p),true);assert.equal(p[Symbol.for('@exactjs/opaque-target-operation')],true);assert.equal(p[Symbol.for('@exactjs/opaque-component-input-generation')],6);`
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		output, err := exec.CommandContext(ctx, "node", "--experimental-strip-types", "--input-type=module", "-e", runner, module).CombinedOutput()
		cancel()
		if err != nil {
			t.Fatal(err, string(output))
		}
	}
}

// A primitive type annotation cannot pay actual object key conversion, and an
// available import cannot pay its runtime initialization. Both controls retain
// the original module map partition and its original deferred writer bodies.
func TestStagedModuleMapActivationUnrepresentedEntry(t *testing.T) {
	end := strings.Index(writerInputOpaqueComposition, "\n\nexport function invoke()")
	if end < 0 {
		t.Fatal("original fixture driver missing")
	}
	base := writerInputOpaqueComposition[:end] + "\nexport function invoke(){return emptyOperationPrototype}"
	for _, row := range []struct{ name, source, contract string }{
		{"object key coercion", "declare function moduleEntry():void;" + strings.Replace(base, "Symbol.for('@exactjs/opaque-target-operation')", "({toString(){window.name;moduleEntry();return 'identity'}} as unknown as symbol)", 1), `export const componentContractVersion=6;`},
		{"runtime import entry", base, `declare function moduleEntry():void;window.name;moduleEntry();export const componentContractVersion=6;`},
	} {
		t.Run(row.name, func(t *testing.T) {
			f := newExecutableFixture(t, map[string]string{
				"entry.ts":    row.source,
				"contract.ts": row.contract,
			})
			// Keep the original import relationships while selecting these fixture
			// source files. The type-only dependency supplies no runtime proof.
			f.files["entry.ts"] = strings.ReplaceAll(strings.ReplaceAll(row.source, "../component/contract-versions.js", "./contract.js"), "../component/contracts.js", "./contracts.js")
			f.files["contracts.ts"] = `export type ComponentDomainIdentity={readonly executionRoot:string};export type ComponentDomain=ComponentDomainIdentity;`
			for name, contents := range f.files {
				if err := os.WriteFile(filepath.Join(f.root, name), []byte(contents), 0600); err != nil {
					t.Fatal(err)
				}
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				request := f.request("compile", "entry.ts")
				request.Target = target
				response := f.session.Execute(request)
				if response.Error == "" && !hasErrorDiagnostic(response.Diagnostics) || response.Code != "" {
					t.Fatal("unrepresented user entry acquired ordinary module completion", target, response.Error, response.Diagnostics)
				}
				for _, project := range f.session.projects {
					if project.callableCache == nil {
						continue
					}
					for _, fact := range project.callableCache.merged.facts {
						for _, recipe := range fact.staged.operationRecipes {
							s := recipe.memberSource
							if s != nil && s.moduleExcluded != nil && s.moduleExcluded.supported && s.moduleExcluded.accounted && s.candidate.region != nil && s.moduleExcluded.source.read == s.parent.producer.operation && ast.IsCallExpression(s.parent.producer.operation) && ast.GetSourceFileOfNode(s.parent.consumer).FileName() == request.ID {
								t.Fatal("unrepresented conversion/import borrowed a module exclusion")
							}
						}
					}
				}
			}
		})
	}
}
