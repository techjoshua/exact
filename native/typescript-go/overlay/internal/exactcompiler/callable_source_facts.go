package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"sort"
)

// callableSourceFacts is canonical source preparation before any body task or
// operation observation. Its factories are the ordinary collector's existing
// factories, not guessed imported callable facts or a current graph receipt.
type callableSourceFacts struct {
	facts            []callableFacts
	componentByStart map[int]Component
	symbolTargets    map[ast.SymbolId]int
	syntacticTargets map[string]int
	nodeTargets      map[*ast.Node]int
	importBindings   externalImportBindings
	contextBindings  map[ast.SymbolId]ContextEffect
}

// prepareCallableSourceFacts retains the ordinary source factory and its exact
// source/import/component association. The caller separately owns registration,
// extraction, propagation, and publication; preparation performs none of them.
func prepareCallableSourceFacts(sourceFile *ast.SourceFile, typeChecker *checker.Checker, components []Component, owner *executableBodyOwner) callableSourceFacts {
	initializers := prepareCallableSourceInitializers(sourceFile, owner)
	return prepareCallableSourceInventory(sourceFile, typeChecker, components, owner, initializers)
}

// prepareCallableSourceInventory has no initializer/source-query preflight.
// Project collection freezes every canonical producer before that work starts.
func prepareCallableSourceInventory(sourceFile *ast.SourceFile, typeChecker *checker.Checker, components []Component, owner *executableBodyOwner, initializers map[*ast.Node]callableSourceInitializer) callableSourceFacts {
	prefixMode := [32]byte{}
	nodes := collectCallableNodes(sourceFile)
	sort.Slice(nodes, func(i, j int) bool { return nodes[i].Pos() < nodes[j].Pos() })
	facts := make([]callableFacts, 0, len(nodes))
	componentByStart := make(map[int]Component, len(components))
	for _, component := range components {
		componentByStart[component.Start] = component
	}
	symbolTargets := make(map[ast.SymbolId]int)
	importBindings := collectExternalImportBindings(sourceFile, typeChecker)
	// Reuse this analysis's selected components and imports before effect queries.
	// Settlement must not rediscover all component bodies for each returned value.
	if owner != nil && owner.values != nil {
		if owner.values.components == nil {
			owner.values.components = make(map[*ast.Node]externalImportBindings)
		}
		for _, node := range nodes {
			if _, component := componentByStart[node.Pos()]; component {
				owner.values.components[node] = importBindings
			}
		}
	}
	for _, node := range nodes {
		name, kind, exportNames := callableIdentity(node, componentByStart)
		index := len(facts)
		facts = append(facts, callableFacts{
			node:                   node,
			initializerPlan:        initializers[node].plan,
			initializerDeclaration: initializers[node].declaration,
			sourceFile:             sourceFile,
			descriptorMode:         prefixMode,
			summary: CallableSummary{
				ID: fmt.Sprintf(
					"callable:%s:%d",
					sourceFile.FileName(),
					node.Pos(),
				),
				Name:                name,
				Kind:                kind,
				ExportNames:         nonNilSlice(exportNames),
				DirectEffectSources: []EnvironmentEffectSource{},
				EffectSources:       []EnvironmentEffectSource{},
				Calls:               []CallEdge{},
				ArtifactTargets:     []string{},
				StateReads:          []StateEffect{},
				StateWrites:         []StateEffect{},
				Contexts:            []ContextEffect{},
			},
			callSymbols:       make(map[string]ast.SymbolId),
			ownedScalarCalls:  make(map[string]bool),
			callExpressions:   make(map[string]*ast.Node),
			contextReferences: make(map[string]*ast.Node),
		})
		// A declarator evaluation is not the callable stored in its binding.
		if kind != "module-initializer" {
			if symbol := callableDeclarationSymbol(node, typeChecker); symbol != nil && !ast.IsGetAccessorDeclaration(node) && !ast.IsSetAccessorDeclaration(node) {
				symbolTargets[ast.GetSymbolId(symbol)] = index
			}
			if binding := sourceCallableBinding(node); binding != nil {
				if symbol := typeChecker.GetSymbolAtLocation(binding.Name()); symbol != nil {
					symbolTargets[ast.GetSymbolId(symbol)] = index
				}
			}
		}
	}
	bindCallableAliases(sourceFile, symbolTargets, typeChecker)
	syntacticTargets := collectSyntacticCallableTargets(facts)
	nodeTargets := make(map[*ast.Node]int, len(facts))
	for index, fact := range facts {
		nodeTargets[fact.node] = index
	}
	bindSyntacticCallableAliases(
		sourceFile,
		syntacticTargets,
		symbolTargets,
		typeChecker,
	)
	contextBindings := collectContextBindings(sourceFile, typeChecker)

	return callableSourceFacts{facts: facts, componentByStart: componentByStart, symbolTargets: symbolTargets, syntacticTargets: syntacticTargets, nodeTargets: nodeTargets, importBindings: importBindings, contextBindings: contextBindings}
}

// callableSourceInitializer keeps the existing paired initializer description.
// It grants no frame, operation publication or stored value.
type callableSourceInitializer struct {
	declaration *ast.Node
	plan        *closedOwnGetterPlan
}

func prepareCallableSourceInitializers(sourceFile *ast.SourceFile, owner *executableBodyOwner) map[*ast.Node]callableSourceInitializer {
	initializers := make(map[*ast.Node]callableSourceInitializer)
	for _, statement := range sourceFile.Statements.Nodes {
		if !runtimeVariableInitializer(statement) {
			continue
		}
		if declaration, plan, ok := preflightModuleInitializer(owner, statement); ok {
			initializers[statement] = callableSourceInitializer{declaration: declaration, plan: plan}
		}
	}
	return initializers
}
