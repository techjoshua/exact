package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/printer"
)

// jsxLoweringPlan is the immutable analysis handoff consumed by JSX emission. It keeps session
// orchestration independent from the mutable traversal state created for one source artifact.
type jsxLoweringPlan struct {
	stateWrites           []StateWrite
	stateReads            []StateRead
	reactiveBindings      []ReactiveBinding
	formBindings          map[int]formBinding
	componentBindings     map[int]componentBinding
	components            []Component
	tasks                 []Task
	operations            []InvokedTaskOperation
	continuations         []Continuation
	clientIslands         map[*ast.Node]clientElementIsland
	target                Target
	contractProjection    ComponentContractProjection
	serverComponents      bool
	instrumentInspection  bool
	typeChecker           *checker.Checker
	interop               *JSXInterop
	enhancementImports    enhancementImports
	partitionPlan         PartitionPlan
	dynamicComponents     map[int]dynamicComponentUseKind
	componentLocalization bool
}

// prepare creates the mutable traversal state only when the analyzed module needs JSX-owned work.
func (plan jsxLoweringPlan) prepare(
	sourceFile *ast.SourceFile,
	factory *printer.NodeFactory,
) (*jsxLowering, bool) {
	hasJSX := sourceFile.SubtreeFacts()&ast.SubtreeContainsJsx != 0
	derived, elidedDerived := planDerivedBindings(
		sourceFile,
		plan.reactiveBindings,
		plan.typeChecker,
	)
	if plan.target == TargetServer {
		// Render-consumer materialization is a client update optimization. Server
		// rendering executes the authored setup and render frame once, so keeping
		// these values as ordinary locals avoids both a reactive cell and a second
		// generated closure while preserving the declaration for every SSR lane.
		elidedDerived = map[int]ReactiveBinding{}
	}
	if !hasJSX && len(plan.stateWrites) == 0 && len(plan.tasks) == 0 &&
		len(derived) == 0 && len(plan.components) == 0 {
		return nil, false
	}
	lowering := &jsxLowering{
		sourceFile:               sourceFile,
		factory:                  factory,
		names:                    allocateJSXRuntimeNames(sourceFile),
		nodeIDs:                  expressionNodeIDs(sourceFile),
		writes:                   indexStateWrites(plan.stateWrites),
		stateReadSlots:           indexStateReadSlots(plan.components, plan.stateReads),
		propsReadSlots:           indexPropsReadSlots(plan.components, sourceFile, plan.typeChecker),
		stateWriteSlots:          indexStateWriteSlots(plan.components, plan.stateWrites),
		indexedStateReads:        make(map[*ast.Node]indexedStateRead),
		indexedPropsReads:        make(map[*ast.Node]indexedPropsRead),
		tasks:                    indexTasks(plan.tasks),
		invokedTasks:             indexInvokedTasks(plan.tasks),
		functionTasks:            indexFunctionTasks(plan.tasks),
		taskDefinitions:          indexFunctionTaskSymbols(plan.tasks, sourceFile, plan.typeChecker),
		taskDefinitionNames:      indexFunctionTaskNames(plan.tasks, sourceFile),
		operations:               indexInvokedTaskOperations(plan.operations),
		stateReads:               plan.stateReads,
		bindings:                 plan.reactiveBindings,
		formBindings:             plan.formBindings,
		componentBindings:        plan.componentBindings,
		checker:                  plan.typeChecker,
		taskHelpers:              make(map[string]string),
		materializedNames:        make(map[int]string),
		renderProgramDefinitions: make(map[int]string),
		componentUpdates:         make(map[string]*componentUpdateBuild),
		componentRangeOutputs:    make(map[string]struct{}),
		cachedDerivedNames:       make(map[int]string),
		derived:                  derived,
		elidedDerived:            elidedDerived,
		target:                   plan.target,
		contractProjection:       plan.contractProjection,
		serverComponents:         plan.serverComponents,
		instrumentInspection:     plan.instrumentInspection,
		interop:                  plan.interop,
		components:               componentIndexByName(plan.components),
		microComponents:          lexicalMicroComponentSymbols(sourceFile, plan.typeChecker),
		renderEdges:              indexRenderEdges(plan.components),
		contextWrites:            indexContinuationContextWrites(plan.continuations),
		continuationComponents:   indexContinuationComponents(plan.continuations),
		collectionMaps:           make(map[string]collectionMapPlan),
		enhancementImports:       plan.enhancementImports,
		partitionPlan:            plan.partitionPlan,
		dynamicComponents:        plan.dynamicComponents,
		clientIslands:            plan.clientIslands,
		recordedClientIslands:    make(map[string]struct{}),
		serverTaskSlices:         make(map[string]string),
		componentLocalization:    plan.componentLocalization,
		externalImports:          collectExternalImportBindings(sourceFile, plan.typeChecker),
		closedServerWriters:      make(map[string]struct{}),
	}
	lowering.indexComponentRangeOutputs()
	lowering.indexCollectionMaps()
	return lowering, true
}

// indexComponentRangeOutputs selects the component boundary as the update range when a client
// render function has reactive output but no JSX topology from which to build a finite program.
func (lowering *jsxLowering) indexComponentRangeOutputs() {
	if lowering.target != TargetClient {
		return
	}
	record := func(expression *ast.Node) {
		if expression == nil || containsJSX(expression) ||
			!lowering.hasReactiveComponentCapture(expression) {
			return
		}
		component, exists := lowering.componentContaining(expression)
		if exists {
			lowering.componentRangeOutputs[component.Name] = struct{}{}
		}
	}
	for _, render := range resolveComponentRenders(lowering.sourceFile) {
		if ast.IsArrowFunction(render.callable) {
			body := unwrapRenderExpression(render.callable.Body())
			if body != nil && !ast.IsBlock(body) {
				record(body)
			}
		}
		for _, returned := range directCallableReturns(render.callable) {
			record(unwrapRenderExpression(returned))
		}
	}
}

func indexContinuationComponents(continuations []Continuation) map[string]struct{} {
	components := make(map[string]struct{}, len(continuations))
	for _, continuation := range continuations {
		components[continuation.ComponentID] = struct{}{}
	}
	return components
}
