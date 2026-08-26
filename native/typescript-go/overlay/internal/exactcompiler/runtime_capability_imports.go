package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type jsxRuntimeNames struct {
	element                   string
	componentElement          string
	keyedElement              string
	preparedRenderProgram     string
	preparedServerProgram     string
	prepareRenderProgram      string
	bindProgramText           string
	bindProgramChild          string
	bindProgramLists          string
	bindProgramKeyedChild     string
	bindProgramProperties     string
	bindComponentUpdate       string
	bindWideComponentUpdate   string
	applyProgramText          string
	applyProgramProperties    string
	beginProgramClaims        string
	claimProgramElement       string
	claimElementPath          string
	claimProgramText          string
	claimProgramChild         string
	claimProgramKeyedChild    string
	claimProgramProperty      string
	enterProgramElement       string
	leaveProgramElement       string
	bindingTarget             string
	fragment                  string
	target                    string
	expression                string
	forwardedExpression       string
	componentOutput           string
	serverComponentOutput     string
	issueServerComponent      string
	dynamic                   string
	dynamicComponent          string
	serverDynamicComponent    string
	dynamicComponentValue     string
	boundary                  string
	finiteBoundary            string
	asyncSiblings             string
	serverSlot                string
	keyedServerSlot           string
	clientProps               string
	derived                   string
	activationDependency      string
	peek                      string
	readState                 string
	writeState                string
	updateState               string
	updateStateResult         string
	deleteState               string
	write                     string
	update                    string
	updateResult              string
	abortOptions              string
	taskSignal                string
	taskTimeout               string
	taskInterval              string
	taskAnimation             string
	taskIdle                  string
	taskObserver              string
	taskFetch                 string
	taskResource              string
	taskAwait                 string
	serverTaskAwait           string
	serverTaskTimeout         string
	taskMutation              string
	stageTaskMutation         string
	taskCollectionMutation    string
	taskContinuation          string
	dispatchContinuation      string
	registerContexts          string
	inspectionSource          string
	defineTask                string
	bindTask                  string
	invokeTask                string
	activateTask              string
	activateComputation       string
	bindCompiledLatest        string
	activateCompiledLatest    string
	activateServerTask        string
	taskOptions               string
	taskCombined              string
	delete                    string
	arrayMutation             string
	collectionMutation        string
	componentRegistry         string
	enhancements              string
	omitEnhancementProps      string
	componentLog              string
	componentIntl             string
	directSsrRef              string
	directSsrReadRef          string
	directSsrRoot             string
	registerLifecycle         string
	registerRender            string
	ownResource               string
	interop                   string
	timeActivation            string
	createTimeActivation      string
	constructRenderComponent  string
	constructTaskComponent    string
	constructDurableComponent string
	renderClosedSsr           string
	renderClosedHydratableSsr string

	renderClosedUnmarkedSsr string
}

type runtimeImportGroupID string

const (
	runtimeRender                   runtimeImportGroupID = "render"
	runtimeReactivity               runtimeImportGroupID = "reactivity"
	runtimeTasks                    runtimeImportGroupID = "tasks"
	runtimeInspection               runtimeImportGroupID = "inspection"
	runtimeRegistry                 runtimeImportGroupID = "registry"
	runtimeEnhancements             runtimeImportGroupID = "enhancements"
	runtimeDynamicComponents        runtimeImportGroupID = "dynamic-components"
	runtimeLogging                  runtimeImportGroupID = "logging"
	runtimeLocalization             runtimeImportGroupID = "localization"
	runtimeModal                    runtimeImportGroupID = "modal"
	runtimeUnsafeHTML               runtimeImportGroupID = "unsafe-html"
	runtimeStructuralBoundaries     runtimeImportGroupID = "structural-boundaries"
	runtimeTarget                   runtimeImportGroupID = "target"
	runtimeTime                     runtimeImportGroupID = "time"
	runtimeLists                    runtimeImportGroupID = "lists"
	runtimeRefs                     runtimeImportGroupID = "refs"
	runtimeDirectSSRRefs            runtimeImportGroupID = "direct-ssr-refs"
	runtimeComponentExecution       runtimeImportGroupID = "component-execution"
	runtimeCollections              runtimeImportGroupID = "collections"
	runtimeRenderProgram            runtimeImportGroupID = "render-program"
	runtimeContexts                 runtimeImportGroupID = "contexts"
	runtimeLifecycle                runtimeImportGroupID = "lifecycle"
	runtimeComponentReactivity      runtimeImportGroupID = "component-reactivity"
	runtimeFrameworkLifecycle       runtimeImportGroupID = "framework-lifecycle"
	runtimeServerComponentExecution runtimeImportGroupID = "server-component-execution"
	runtimeGenericSSRComponents     runtimeImportGroupID = "generic-ssr-components"
	runtimeSSRStructuralBoundaries  runtimeImportGroupID = "ssr-structural-boundaries"
	runtimeSSRResumptionBoundaries  runtimeImportGroupID = "ssr-resumption-boundaries"
	runtimeSSREnhancements          runtimeImportGroupID = "ssr-enhancements"
	runtimeCompilerClosedSSR        runtimeImportGroupID = "compiler-closed-ssr"
	runtimeServerRenderStructure    runtimeImportGroupID = "server-render-structure"
	runtimeRenderConstruction       runtimeImportGroupID = "render-construction"
	runtimeTaskConstruction         runtimeImportGroupID = "task-construction"
	runtimeDurableConstruction      runtimeImportGroupID = "durable-construction"
)

type runtimeImportGroup struct {
	id         runtimeImportGroupID
	module     string
	specifiers []*ast.Node
}

type runtimeImportHelper struct {
	imported string
	local    string
	group    runtimeImportGroupID
}

func (lowering *jsxLowering) runtimeImports(root *ast.Node) []*ast.Node {
	const serverRenderRuntimeModule = "@exactjs/core/framework/server-render-structure"
	renderRuntimeModule := "@exactjs/core/runtime/render"
	taskRuntimeModule := "@exactjs/core/runtime/tasks"
	if lowering.target == TargetServer {
		renderRuntimeModule = serverRenderRuntimeModule
		for _, component := range lowering.components {
			if component.TargetPlan.GenericServerRuntime {
				renderRuntimeModule = "@exactjs/core/framework/render-structure"
				break
			}
		}
		taskRuntimeModule = "@exactjs/core/framework/server-task-helpers"
	}
	groups := []runtimeImportGroup{
		{id: runtimeRender, module: renderRuntimeModule},
		{id: runtimeReactivity, module: "@exactjs/core/runtime/reactivity"},
		{id: runtimeTasks, module: taskRuntimeModule},
		{id: runtimeInspection, module: "@exactjs/core/runtime/inspection"},
		{id: runtimeRegistry, module: "@exactjs/core/runtime/registry"},
		{id: runtimeEnhancements, module: "@exactjs/core/runtime/enhancements"},
		{id: runtimeDynamicComponents, module: "@exactjs/core/runtime/dynamic-components"},
		{id: runtimeLogging, module: "@exactjs/core/runtime/logging"},
		{id: runtimeLocalization, module: "@exactjs/core/runtime/localization"},
		{id: runtimeModal, module: "@exactjs/dom/runtime/modal"},
		{id: runtimeUnsafeHTML, module: "@exactjs/dom/runtime/unsafe-html"},
		{id: runtimeStructuralBoundaries, module: "@exactjs/dom/runtime/structural-boundaries"},
		{id: runtimeTarget, module: "@exactjs/dom/runtime/target"},
		{id: runtimeTime, module: "@exactjs/time/internal"},
		{id: runtimeLists, module: "@exactjs/core/runtime/lists"},
		{id: runtimeRefs, module: "@exactjs/core/runtime/refs"},
		{id: runtimeDirectSSRRefs, module: "@exactjs/ssr/runtime/direct-refs"},
		{id: runtimeComponentExecution, module: "@exactjs/core/runtime/component-execution"},
		{id: runtimeCollections, module: "@exactjs/core/runtime/collections"},
		{id: runtimeRenderProgram, module: "@exactjs/dom/runtime/render-program"},
		{id: runtimeContexts, module: "@exactjs/core/runtime/contexts"},
		{id: runtimeLifecycle, module: "@exactjs/core/runtime/lifecycle"},
		{id: runtimeComponentReactivity, module: "@exactjs/core/runtime/component-reactivity"},
		{id: runtimeFrameworkLifecycle, module: "@exactjs/core/framework/component-lifecycle"},
		{id: runtimeRenderConstruction, module: "@exactjs/core/runtime/component-construction/render"},
		{id: runtimeTaskConstruction, module: "@exactjs/core/runtime/component-construction/task"},
		{id: runtimeDurableConstruction, module: "@exactjs/core/runtime/component-construction/durable"},
		{id: runtimeServerComponentExecution, module: "@exactjs/core/framework/server-component-execution"},
		{id: runtimeGenericSSRComponents, module: "@exactjs/ssr/runtime/generic-components"},
		{id: runtimeSSRStructuralBoundaries, module: "@exactjs/ssr/runtime/structural-boundaries"},
		{id: runtimeSSRResumptionBoundaries, module: "@exactjs/ssr/runtime/resumption-boundaries"},
		{id: runtimeSSREnhancements, module: "@exactjs/ssr/runtime/enhancements"},
		{id: runtimeCompilerClosedSSR, module: "@exactjs/ssr/runtime/compiler-closed"},
	}
	preparedServerProgramGroup := runtimeRender
	if lowering.target == TargetServer &&
		renderRuntimeModule != serverRenderRuntimeModule {
		groups = append(groups, runtimeImportGroup{
			id:     runtimeServerRenderStructure,
			module: serverRenderRuntimeModule,
		})
		preparedServerProgramGroup = runtimeServerRenderStructure
	}
	groupByID := make(map[runtimeImportGroupID]*runtimeImportGroup, len(groups))
	for index := range groups {
		groupByID[groups[index].id] = &groups[index]
	}
	add := func(groupID runtimeImportGroupID, imported string, local string) {
		group := groupByID[groupID]
		if group == nil {
			panic("missing runtime import group " + string(groupID))
		}
		group.specifiers = append(
			group.specifiers,
			lowering.importSpecifier(imported, local),
		)
	}
	helpers := []runtimeImportHelper{
		{"createCompiledVNode", lowering.names.element, runtimeRender},
		{"createCompiledComponentVNode", lowering.names.componentElement, runtimeRender},
		{"keyCompiledVNode", lowering.names.keyedElement, runtimeRender},
		{"createPreparedRenderProgram", lowering.names.preparedRenderProgram, runtimeRender},
		{"createPreparedServerRenderProgram", lowering.names.preparedServerProgram, preparedServerProgramGroup},
		{"prepareCompiledRenderProgram", lowering.names.prepareRenderProgram, runtimeRender},
		{"createCompiledFragment", lowering.names.fragment, runtimeRender},
		{"createCompiledTarget", lowering.names.target, runtimeRender},
		{"createExpression", lowering.names.expression, runtimeRender},
		{"createForwardedExpression", lowering.names.forwardedExpression, runtimeRender},
		{"componentExecutionValueForHost", lowering.names.componentOutput, runtimeComponentExecution},
		{"serverComponentExecutionValueForHost", lowering.names.serverComponentOutput, runtimeServerComponentExecution},
		{"issueServerComponentVNode", lowering.names.issueServerComponent, runtimeServerComponentExecution},
		{"createDynamicChild", lowering.names.dynamic, runtimeRender},
		{"createCompiledDynamicComponent", lowering.names.dynamicComponent, runtimeDynamicComponents},
		{"createServerDynamicComponent", lowering.names.serverDynamicComponent, runtimeDynamicComponents},
		{"dynamicComponentValue", lowering.names.dynamicComponentValue, runtimeDynamicComponents},
		{"createServerBoundary", lowering.names.boundary, runtimeRender},
		{"markFiniteClientBoundary", lowering.names.finiteBoundary, runtimeRender},
		{"markIndependentAsyncSiblings", lowering.names.asyncSiblings, runtimeRender},
		{"createServerSlot", lowering.names.serverSlot, runtimeRender},
		{"createKeyedServerSlot", lowering.names.keyedServerSlot, runtimeRender},
		{"createDerived", lowering.names.derived, runtimeReactivity},
		{"createTrackedContinuationDependency", lowering.names.activationDependency, runtimeTasks},
		{"peek", lowering.names.peek, runtimeReactivity},
		{"readIndexedReactiveSlot", lowering.names.readState, runtimeReactivity},
		{"writeIndexedReactiveLazy", lowering.names.writeState, runtimeReactivity},
		{"updateIndexedReactiveValue", lowering.names.updateState, runtimeReactivity},
		{"updateIndexedReactiveValueWithResult", lowering.names.updateStateResult, runtimeReactivity},
		{"deleteIndexedReactiveValue", lowering.names.deleteState, runtimeReactivity},
		{"writeReactiveLazy", lowering.names.write, runtimeReactivity},
		{"updateReactiveValue", lowering.names.update, runtimeReactivity},
		{"updateReactiveValueWithResult", lowering.names.updateResult, runtimeReactivity},
		{"deleteReactiveValue", lowering.names.delete, runtimeReactivity},
		{"mutateReactiveArray", lowering.names.arrayMutation, runtimeReactivity},
		{"mutateReactiveCollection", lowering.names.collectionMutation, runtimeReactivity},
		{"awaitServerComponentTask", lowering.names.serverTaskAwait, runtimeServerComponentExecution},
		{"serverComponentTaskTimeout", lowering.names.serverTaskTimeout, runtimeServerComponentExecution},
		{"createCompiledComponentRegistry", lowering.names.componentRegistry, runtimeRegistry},
		{"createEnhancementNode", lowering.names.enhancements, runtimeEnhancements},
		{"omitKnownProps", lowering.names.omitEnhancementProps, runtimeEnhancements},
		{"componentLogMethod", lowering.names.componentLog, runtimeLogging},
		{"componentIntl", lowering.names.componentIntl, runtimeLocalization},
		{"directSsrRef", lowering.names.directSsrRef, runtimeDirectSSRRefs},
		{"directSsrReadRef", lowering.names.directSsrReadRef, runtimeDirectSSRRefs},
		{"directSsrRoot", lowering.names.directSsrRoot, runtimeDirectSSRRefs},
		{"registerComponentLifecycleHandler", lowering.names.registerLifecycle, runtimeFrameworkLifecycle},
		{"registerComponentRenderHandler", lowering.names.registerRender, runtimeFrameworkLifecycle},
		{"ownComponentResource", lowering.names.ownResource, runtimeFrameworkLifecycle},
		{"activateServerComponentTaskForHost", lowering.names.activateServerTask, runtimeServerComponentExecution},
		{"createTimeActivation", lowering.names.createTimeActivation, runtimeTime},
		{"constructRenderComponentInstance", lowering.names.constructRenderComponent, runtimeRenderConstruction},
		{"constructTaskComponentInstance", lowering.names.constructTaskComponent, runtimeTaskConstruction},
		{"constructDurableComponentInstance", lowering.names.constructDurableComponent, runtimeDurableConstruction},
		{"bindCompiledProgramText", lowering.names.bindProgramText, runtimeRenderProgram},
		{"bindCompiledProgramChild", lowering.names.bindProgramChild, runtimeRenderProgram},
		{"bindCompiledProgramLists", lowering.names.bindProgramLists, runtimeRenderProgram},
		{"bindCompiledProgramKeyedChild", lowering.names.bindProgramKeyedChild, runtimeRenderProgram},
		{"bindCompiledProgramProperties", lowering.names.bindProgramProperties, runtimeRenderProgram},
		{"bindCompiledComponentUpdate", lowering.names.bindComponentUpdate, runtimeRenderProgram},
		{"bindCompiledWideComponentUpdate", lowering.names.bindWideComponentUpdate, runtimeRenderProgram},
		{"applyCompiledProgramText", lowering.names.applyProgramText, runtimeRenderProgram},
		{"applyCompiledProgramProperties", lowering.names.applyProgramProperties, runtimeRenderProgram},
		{"beginCompiledProgramClaims", lowering.names.beginProgramClaims, runtimeRenderProgram},
		{"claimCompiledProgramElement", lowering.names.claimProgramElement, runtimeRenderProgram},
		{"claimCompiledProgramElementPath", lowering.names.claimElementPath, runtimeRenderProgram},
		{"claimCompiledProgramText", lowering.names.claimProgramText, runtimeRenderProgram},
		{"claimCompiledProgramChild", lowering.names.claimProgramChild, runtimeRenderProgram},
		{"claimCompiledProgramKeyedChild", lowering.names.claimProgramKeyedChild, runtimeRenderProgram},
		{"claimCompiledProgramProperty", lowering.names.claimProgramProperty, runtimeRenderProgram},
		{"enterCompiledProgramElement", lowering.names.enterProgramElement, runtimeRenderProgram},
		{"leaveCompiledProgramElement", lowering.names.leaveProgramElement, runtimeRenderProgram},
		{"renderCompilerClosedToStringAsync", lowering.names.renderClosedSsr, runtimeCompilerClosedSSR},
		{"renderCompilerClosedToHydratableStringAsync", lowering.names.renderClosedHydratableSsr, runtimeCompilerClosedSSR},
		{"renderCompilerClosedUnmarkedToStringAsync", lowering.names.renderClosedUnmarkedSsr, runtimeCompilerClosedSSR},
	}
	for _, helper := range helpers {
		used := containsIdentifier(root, helper.local)
		if helper.imported == "createDynamicChild" &&
			containsIdentifier(root, lowering.names.expression) {
			used = true
		}
		if used {
			add(helper.group, helper.imported, helper.local)
		}
	}
	taskHelperOrder := []string{
		"withAbortSignal",
		"ownTaskResource",
		"taskAnimationFrame",
		"taskFetch",
		"taskIdleCallback",
		"taskInterval",
		"taskObserver",
		"taskTimeout",
		"withTaskSignal",
		"combineTaskSignal",
		"taskAwait",
		"taskMutation",
		"stageTaskMutation",
		"mutateTaskCollection",
		"markComponentContinuationTask",
		"dispatchComponentContinuation",
		"registerComponentContinuationContexts",
		"markExactInspectionSource",
		"defineTask",
		"bindTaskForHost",
		"invokeTask",
		"activateTaskForHost",
		"activateComputationForHost",
		"bindCompiledClientLatestTaskForHost",
		"activateCompiledClientLatestTaskForHost",
	}
	for _, imported := range taskHelperOrder {
		if local, used := lowering.taskHelpers[imported]; used {
			if !containsIdentifier(root, local) {
				continue
			}
			group := runtimeTasks
			if imported == "markExactInspectionSource" {
				group = runtimeInspection
			}
			add(group, imported, local)
		}
	}
	interopUsed := lowering.interop != nil && containsIdentifier(root, lowering.names.interop)
	interactionUsed := containsInteractionRuntimeUse(root)
	if !interactionUsed && lowering.target != TargetServer {
		for _, component := range lowering.components {
			if component.Interactions {
				interactionUsed = true
				break
			}
		}
	}
	localizationUsed := lowering.componentLocalization ||
		containsComponentSurfaceUse(root, "intl")
	loggingSurfaceUsed := containsComponentSurfaceUse(
		root,
		"log",
	)
	listUsed := lowering.listCapabilityUsed
	for _, component := range lowering.components {
		if component.Lists {
			listUsed = true
			break
		}
	}
	refsUsed := containsComponentSurfaceUse(root, "ref", "readRef", "refs")
	contextsUsed := containsComponentSurfaceUse(
		root,
		"hasContext",
		"getContext",
		"setContext",
	) || containsCoreContextComponentImport(
		root,
		lowering.sourceFile,
		lowering.checker,
	)
	lifecycleUsed := containsComponentSurfaceUse(
		root,
		"onMount", "onActivate", "onDeactivate", "onUnmount", "onRender", "own",
	)
	componentReactivityUsed := containsComponentSurfaceUse(
		root,
		"reactive",
	)
	for _, component := range lowering.components {
		surface := componentTargetSurface(component, lowering.target)
		localizationUsed = localizationUsed || surface.Localization
		loggingSurfaceUsed = loggingSurfaceUsed || surface.Logging
		refsUsed = refsUsed || surface.Refs
		contextsUsed = contextsUsed || surface.Contexts
		componentReactivityUsed = componentReactivityUsed || surface.Reactivity
	}
	if lowering.target == TargetServer {
		// Direct server frames implement the compiler-known context surface themselves. Install the
		// durable context capability only when a context-bearing component remains on the generic lane.
		contextsUsed = false
		refsUsed = false
		for _, component := range lowering.components {
			if component.TargetPlan.ServerSurface.Contexts && component.TargetPlan.GenericServerRuntime {
				contextsUsed = true
			}
			if component.TargetPlan.ServerSurface.Refs && component.TargetPlan.GenericServerRuntime {
				refsUsed = true
			}
		}
	}
	executionUsed := lowering.contractProjection != ComponentContractProjectionHydrate
	if executionUsed {
		executionUsed = false
		for _, component := range lowering.components {
			if !(lowering.target == TargetServer && component.TargetPlan.DirectServer) &&
				len(componentTargetExecution(component, lowering.target).Transitions) != 0 {
				executionUsed = true
				break
			}
		}
	}
	genericServerRuntimeUsed := false
	if lowering.target == TargetServer {
		for _, component := range lowering.components {
			if component.TargetPlan.GenericServerRuntime {
				genericServerRuntimeUsed = true
				break
			}
		}
	}
	modalBindingUsed := false
	if lowering.target != TargetServer {
		for _, binding := range lowering.formBindings {
			if binding.control == "modal" {
				modalBindingUsed = true
				break
			}
		}
	}
	unsafeHTMLUsed := lowering.target != TargetServer && containsUnsafeHTMLCall(
		lowering.sourceFile,
		lowering.checker,
	)
	structuralBoundariesUsed := lowering.target != TargetServer &&
		(partitionUsesStructuralBoundaries(lowering.partitionPlan) ||
			containsCoreStructuralBoundaryImport(root, lowering.sourceFile, lowering.checker) ||
			containsIdentifier(root, lowering.names.boundary) ||
			containsIdentifier(root, lowering.names.finiteBoundary) ||
			containsIdentifier(root, lowering.names.asyncSiblings) ||
			containsIdentifier(root, lowering.names.serverSlot) ||
			containsIdentifier(root, lowering.names.keyedServerSlot))
	serverStructuralBoundariesUsed := lowering.target == TargetServer &&
		(containsCoreStructuralBoundaryImport(root, lowering.sourceFile, lowering.checker) ||
			containsIdentifier(root, lowering.names.boundary))
	serverResumptionBoundariesUsed := false
	if lowering.target == TargetServer {
		for _, component := range lowering.components {
			if component.Placement == "isomorphic" &&
				lowering.componentRetainsContinuation(component.ID) {
				serverResumptionBoundariesUsed = true
				break
			}
		}
	}
	if serverResumptionBoundariesUsed &&
		(containsIdentifier(root, lowering.names.renderClosedUnmarkedSsr) ||
			containsIdentifier(root, lowering.names.renderClosedHydratableSsr)) &&
		!containsIdentifier(root, lowering.names.renderClosedSsr) &&
		!lowering.universalSsrCallSurvives(root) &&
		!lowering.exportsServerComponent() {
		serverResumptionBoundariesUsed = false
	}
	serverEnhancementsUsed := lowering.target == TargetServer &&
		(containsIdentifier(root, lowering.names.enhancements) ||
			containsIdentifier(root, lowering.names.target))
	targetUsed := lowering.target != TargetServer &&
		(containsIdentifier(root, lowering.names.target) ||
			containsCompiledTargetCall(lowering.sourceFile, lowering.checker))
	collectionsUsed := false
	for _, component := range lowering.components {
		if component.Collections && !(lowering.target == TargetServer && component.TargetPlan.DirectServer) {
			collectionsUsed = true
			break
		}
	}
	result := make([]*ast.Node, 0, len(groups))
	for _, group := range groups {
		if len(group.specifiers) == 0 {
			if (group.id == runtimeTasks && (interopUsed || interactionUsed)) ||
				(group.id == runtimeLogging && loggingSurfaceUsed) ||
				(group.id == runtimeLocalization && localizationUsed) ||
				(group.id == runtimeLists && listUsed) ||
				(group.id == runtimeRefs && refsUsed) ||
				(group.id == runtimeModal && modalBindingUsed) ||
				(group.id == runtimeUnsafeHTML && unsafeHTMLUsed) ||
				(group.id == runtimeStructuralBoundaries && structuralBoundariesUsed) ||
				(group.id == runtimeTarget && targetUsed) ||
				(group.id == runtimeComponentExecution && executionUsed) ||
				(group.id == runtimeCollections && collectionsUsed) ||
				(group.id == runtimeContexts && contextsUsed) ||
				(group.id == runtimeLifecycle && lifecycleUsed) ||
				(group.id == runtimeComponentReactivity && componentReactivityUsed) ||
				(group.id == runtimeGenericSSRComponents && genericServerRuntimeUsed) ||
				(group.id == runtimeSSRStructuralBoundaries && serverStructuralBoundariesUsed) ||
				(group.id == runtimeSSRResumptionBoundaries && serverResumptionBoundariesUsed) ||
				(group.id == runtimeSSREnhancements && serverEnhancementsUsed) {
				declaration := lowering.factory.NewImportDeclaration(
					nil,
					nil,
					lowering.factory.NewStringLiteral(group.module, ast.TokenFlagsNone),
					nil,
				)
				ast.SetParentInChildren(declaration)
				result = append(result, declaration)
			}
			continue
		}
		declaration := lowering.factory.NewImportDeclaration(
			nil,
			lowering.factory.NewImportClause(
				ast.KindUnknown,
				nil,
				lowering.factory.NewNamedImports(
					lowering.factory.NewNodeList(group.specifiers),
				),
			),
			lowering.factory.NewStringLiteral(group.module, ast.TokenFlagsNone),
			nil,
		)
		ast.SetParentInChildren(declaration)
		result = append(result, declaration)
	}
	return result
}

// universalSsrCallSurvives reports whether an authored public renderer call remains after closed
// call-site lowering. Import declarations themselves do not count as runtime uses.
func (lowering *jsxLowering) universalSsrCallSurvives(root *ast.Node) bool {
	found := false
	walkNode(root, func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return !found
		}
		_, supported := lowering.compilerClosedSsrCallee(node.AsCallExpression().Expression)
		if supported {
			found = true
			return false
		}
		return !found
	})
	return found
}

// exportsServerComponent keeps module-level capability installation when another module can render
// one of this artifact's server-capable components through a renderer selected at its own call site.
func (lowering *jsxLowering) exportsServerComponent() bool {
	for _, component := range lowering.components {
		if component.Exported && component.Placement != "client" {
			return true
		}
	}
	return false
}

func containsComponentSurfaceUse(root *ast.Node, names ...string) bool {
	accepted := make(map[string]struct{}, len(names))
	for _, name := range names {
		accepted[name] = struct{}{}
	}
	found := false
	walkNode(root, func(node *ast.Node) bool {
		name, componentMember, dynamic := componentProtocolMember(node)
		if !componentMember {
			return true
		}
		_, matched := accepted[name]
		found = matched || dynamic
		return !found
	})
	return found
}

func partitionUsesStructuralBoundaries(plan PartitionPlan) bool {
	for _, node := range plan.Nodes {
		if node.Kind == "readiness-boundary" ||
			(node.Kind == "region" && node.Reason == "Activity retention boundary") {
			return true
		}
	}
	return false
}

func containsCoreStructuralBoundaryImport(
	root *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	bindings := collectExternalImportBindings(sourceFile, typeChecker)
	for local, reference := range bindings.byName {
		if reference.moduleSpecifier == "@exactjs/core" &&
			(reference.exportName == "Activity" || reference.exportName == "Suspense") &&
			containsIdentifier(root, local) {
			return true
		}
	}
	found := false
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsPropertyAccessExpression(node) {
			return true
		}
		reference, exists := externalImportForExpression(node, bindings, typeChecker)
		found = exists && reference.moduleSpecifier == "@exactjs/core" &&
			(reference.exportName == "Activity" || reference.exportName == "Suspense")
		return !found
	})
	return found
}

func containsCoreContextComponentImport(
	root *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	bindings := collectExternalImportBindings(sourceFile, typeChecker)
	for local, reference := range bindings.byName {
		if reference.moduleSpecifier == "@exactjs/core" &&
			reference.exportName == "ErrorBoundary" &&
			containsIdentifier(root, local) {
			return true
		}
	}
	found := false
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsPropertyAccessExpression(node) {
			return true
		}
		reference, exists := externalImportForExpression(node, bindings, typeChecker)
		found = exists && reference.moduleSpecifier == "@exactjs/core" &&
			reference.exportName == "ErrorBoundary"
		return !found
	})
	return found
}

func containsCompiledTargetCall(sourceFile *ast.SourceFile, typeChecker *checker.Checker) bool {
	bindings := collectExternalImportBindings(sourceFile, typeChecker)
	for _, reference := range bindings.byName {
		if reference.moduleSpecifier == "@exactjs/core/runtime/render" &&
			reference.exportName == "createCompiledTarget" {
			return true
		}
	}
	found := false
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		reference, exists := externalImportForExpression(
			node.AsCallExpression().Expression,
			bindings,
			typeChecker,
		)
		found = exists && reference.moduleSpecifier == "@exactjs/core/runtime/render" &&
			reference.exportName == "createCompiledTarget"
		return !found
	})
	return found
}

func containsUnsafeHTMLCall(sourceFile *ast.SourceFile, typeChecker *checker.Checker) bool {
	found := false
	bindings := collectExternalImportBindings(sourceFile, typeChecker)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsCallExpression(node) {
			return true
		}
		reference, exists := externalImportForExpression(
			node.AsCallExpression().Expression,
			bindings,
			typeChecker,
		)
		found = exists && reference.moduleSpecifier == "@exactjs/core" &&
			reference.exportName == "unsafeHtml"
		return !found
	})
	return found
}

func containsInteractionRuntimeUse(root *ast.Node) bool {
	found := false
	walkNode(root, func(node *ast.Node) bool {
		if !ast.IsPropertyAssignment(node) {
			return true
		}
		propertyName := node.AsPropertyAssignment().Name()
		if !ast.IsIdentifier(propertyName) && !ast.IsStringLiteral(propertyName) {
			return true
		}
		name := propertyName.Text()
		found = jsxEventAttribute(name) || strings.HasPrefix(name, "__exactBind")
		return !found
	})
	return found
}

func (lowering *jsxLowering) interopImport(root *ast.Node) *ast.Node {
	if lowering.interop == nil ||
		lowering.interop.AdapterModule == "" ||
		lowering.interop.AdapterExport == "" ||
		!containsIdentifier(root, lowering.names.interop) {
		return nil
	}
	result := lowering.factory.NewImportDeclaration(
		nil,
		lowering.factory.NewImportClause(
			ast.KindUnknown,
			nil,
			lowering.factory.NewNamedImports(
				lowering.factory.NewNodeList([]*ast.Node{
					lowering.importSpecifier(
						lowering.interop.AdapterExport,
						lowering.names.interop,
					),
				}),
			),
		),
		lowering.factory.NewStringLiteral(
			lowering.interop.AdapterModule,
			ast.TokenFlagsNone,
		),
		nil,
	)
	ast.SetParentInChildren(result)
	return result
}

func containsIdentifier(root *ast.Node, name string) bool {
	found := false
	walkNode(root, func(node *ast.Node) bool {
		if ast.IsIdentifier(node) && node.Text() == name {
			found = true
			return false
		}
		return !found
	})
	return found
}

func (lowering *jsxLowering) importSpecifier(
	imported string,
	local string,
) *ast.Node {
	return lowering.factory.NewImportSpecifier(
		false,
		lowering.factory.NewIdentifier(imported),
		lowering.factory.NewIdentifier(local),
	)
}

func allocateJSXRuntimeNames(sourceFile *ast.SourceFile) jsxRuntimeNames {
	used := make(map[string]struct{})
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsIdentifier(node) {
			used[node.Text()] = struct{}{}
		}
		return true
	})
	allocate := func(base string) string {
		if _, exists := used[base]; !exists {
			used[base] = struct{}{}
			return base
		}
		for suffix := 1; ; suffix++ {
			candidate := fmt.Sprintf("%s_%d", base, suffix)
			if _, exists := used[candidate]; !exists {
				used[candidate] = struct{}{}
				return candidate
			}
		}
	}
	return jsxRuntimeNames{
		element:                   allocate("__exactVNode"),
		componentElement:          allocate("__exactComponentVNode"),
		keyedElement:              allocate("__exactKeyedVNode"),
		preparedRenderProgram:     allocate("__exactPreparedRenderProgram"),
		preparedServerProgram:     allocate("__exactPreparedServerRenderProgram"),
		prepareRenderProgram:      allocate("__exactPrepareRenderProgram"),
		bindProgramText:           allocate("__exactBindProgramText"),
		bindProgramChild:          allocate("__exactBindProgramChild"),
		bindProgramLists:          allocate("__exactBindProgramLists"),
		bindProgramKeyedChild:     allocate("__exactBindProgramKeyedChild"),
		bindProgramProperties:     allocate("__exactBindProgramProperties"),
		bindComponentUpdate:       allocate("__exactBindComponentUpdate"),
		bindWideComponentUpdate:   allocate("__exactBindWideComponentUpdate"),
		applyProgramText:          allocate("__exactApplyProgramText"),
		applyProgramProperties:    allocate("__exactApplyProgramProperties"),
		beginProgramClaims:        allocate("__exactBeginProgramClaims"),
		claimProgramElement:       allocate("__exactClaimProgramElement"),
		claimElementPath:          allocate("__exactClaimProgramElementPath"),
		claimProgramText:          allocate("__exactClaimProgramText"),
		claimProgramChild:         allocate("__exactClaimProgramChild"),
		claimProgramKeyedChild:    allocate("__exactClaimProgramKeyedChild"),
		claimProgramProperty:      allocate("__exactClaimProgramProperty"),
		enterProgramElement:       allocate("__exactEnterProgramElement"),
		leaveProgramElement:       allocate("__exactLeaveProgramElement"),
		bindingTarget:             allocate("__exactBindingTarget"),
		fragment:                  allocate("__exactFragment"),
		target:                    allocate("__exactTarget"),
		expression:                allocate("__exactExpression"),
		forwardedExpression:       allocate("__exactForwardedExpression"),
		componentOutput:           allocate("__exactComponentOutput"),
		serverComponentOutput:     allocate("__exactServerComponentOutput"),
		issueServerComponent:      allocate("__exactIssueServerComponent"),
		dynamic:                   allocate("__exactDynamic"),
		dynamicComponent:          allocate("__exactDynamicComponent"),
		serverDynamicComponent:    allocate("__exactServerDynamicComponent"),
		dynamicComponentValue:     allocate("__exactDynamicComponentValue"),
		boundary:                  allocate("__exactBoundary"),
		finiteBoundary:            allocate("__exactFiniteBoundary"),
		asyncSiblings:             allocate("__exactAsyncSiblings"),
		serverSlot:                allocate("__exactServerSlot"),
		keyedServerSlot:           allocate("__exactKeyedServerSlot"),
		clientProps:               allocate("__exactElementProps"),
		derived:                   allocate("__exactDerived"),
		activationDependency:      allocate("__exactActivationDependency"),
		peek:                      allocate("__exactPeek"),
		readState:                 allocate("__exactReadState"),
		writeState:                allocate("__exactWriteState"),
		updateState:               allocate("__exactUpdateState"),
		updateStateResult:         allocate("__exactUpdateStateResult"),
		deleteState:               allocate("__exactDeleteState"),
		write:                     allocate("__exactWrite"),
		update:                    allocate("__exactUpdate"),
		updateResult:              allocate("__exactUpdateResult"),
		abortOptions:              allocate("__exactAbortOptions"),
		taskSignal:                allocate("__exactSignal"),
		taskTimeout:               allocate("__exactTaskTimeout"),
		taskInterval:              allocate("__exactTaskInterval"),
		taskAnimation:             allocate("__exactTaskAnimationFrame"),
		taskIdle:                  allocate("__exactTaskIdleCallback"),
		taskObserver:              allocate("__exactTaskObserver"),
		taskFetch:                 allocate("__exactTaskFetch"),
		taskResource:              allocate("__exactTaskResource"),
		taskOptions:               allocate("__exactTaskOptionsSignal"),
		taskCombined:              allocate("__exactTaskCombinedSignal"),
		taskAwait:                 allocate("__exactTaskAwait"),
		serverTaskAwait:           allocate("__exactServerTaskAwait"),
		serverTaskTimeout:         allocate("__exactServerTaskTimeout"),
		taskMutation:              allocate("__exactTaskMutation"),
		stageTaskMutation:         allocate("__exactStageTaskMutation"),
		taskCollectionMutation:    allocate("__exactTaskCollectionMutation"),
		taskContinuation:          allocate("__exactContinuationTask"),
		dispatchContinuation:      allocate("__exactDispatchContinuation"),
		registerContexts:          allocate("__exactRegisterContinuationContexts"),
		inspectionSource:          allocate("__exactInspectionSource"),
		defineTask:                allocate("__exactDefineTask"),
		bindTask:                  allocate("__exactBindTask"),
		invokeTask:                allocate("__exactInvokeTask"),
		activateTask:              allocate("__exactActivateTask"),
		activateComputation:       allocate("__exactActivateComputation"),
		bindCompiledLatest:        allocate("__exactBindClientLatestTask"),
		activateCompiledLatest:    allocate("__exactActivateClientLatestTask"),
		activateServerTask:        allocate("__exactActivateServerTask"),
		delete:                    allocate("__exactDelete"),
		arrayMutation:             allocate("__exactArrayMutation"),
		collectionMutation:        allocate("__exactCollectionMutation"),
		componentRegistry:         allocate("__exactComponentRegistry"),
		enhancements:              allocate("__exactEnhancements"),
		omitEnhancementProps:      allocate("__exactOmitEnhancementProps"),
		componentLog:              allocate("__exactComponentLog"),
		componentIntl:             allocate("__exactComponentIntl"),
		directSsrRef:              allocate("__exactDirectSsrRef"),
		directSsrReadRef:          allocate("__exactDirectSsrReadRef"),
		directSsrRoot:             allocate("__exactDirectSsrRoot"),
		registerLifecycle:         allocate("__exactRegisterLifecycle"),
		registerRender:            allocate("__exactRegisterRender"),
		ownResource:               allocate("__exactOwnResource"),
		interop:                   allocate("__exactInteropComponent"),
		timeActivation:            allocate("__exactTimeRange"),
		createTimeActivation:      allocate("__exactCreateTimeActivation"),
		constructRenderComponent:  allocate("__exactConstructRenderComponent"),
		constructTaskComponent:    allocate("__exactConstructTaskComponent"),
		constructDurableComponent: allocate("__exactConstructDurableComponent"),
		renderClosedSsr:           allocate("__exactRenderClosedSsr"),
		renderClosedHydratableSsr: allocate("__exactRenderClosedHydratableSsr"),

		renderClosedUnmarkedSsr: allocate("__exactRenderClosedUnmarkedSsr"),
	}
}
