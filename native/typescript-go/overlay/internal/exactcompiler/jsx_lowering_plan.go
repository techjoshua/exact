package exactcompiler

import (
	"strings"

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
	hasReactiveCapture := strings.Contains(sourceFile.Text(), ".reactive")
	derived, elidedDerived := planDerivedBindings(
		sourceFile,
		plan.reactiveBindings,
		plan.typeChecker,
	)
	if !hasJSX && len(plan.stateWrites) == 0 && len(plan.tasks) == 0 &&
		len(derived) == 0 && !hasReactiveCapture && len(plan.components) == 0 {
		return nil, false
	}
	lowering := &jsxLowering{
		sourceFile:               sourceFile,
		factory:                  factory,
		names:                    allocateJSXRuntimeNames(sourceFile),
		nodeIDs:                  expressionNodeIDs(sourceFile),
		writes:                   indexStateWrites(plan.stateWrites),
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
		collectionMaps:           make(map[string]collectionMapPlan),
		enhancementImports:       plan.enhancementImports,
		partitionPlan:            plan.partitionPlan,
		dynamicComponents:        plan.dynamicComponents,
		clientIslands:            plan.clientIslands,
		componentLocalization:    plan.componentLocalization,
	}
	lowering.indexCollectionMaps()
	return lowering, true
}
