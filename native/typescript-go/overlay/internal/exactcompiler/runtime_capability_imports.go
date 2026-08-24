package exactcompiler

import (
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

type jsxRuntimeNames struct {
	element                string
	componentElement       string
	keyedElement           string
	renderProgram          string
	preparedRenderProgram  string
	prepareRenderProgram   string
	bindProgramText        string
	bindProgramChild       string
	bindProgramLists       string
	bindProgramKeyedChild  string
	bindProgramProperties  string
	bindProgramState       string
	bindComponentUpdate    string
	applyProgramText       string
	applyProgramProperties string
	beginProgramClaims     string
	claimProgramElement    string
	claimElementPath       string
	claimProgramText       string
	claimProgramChild      string
	claimProgramKeyedChild string
	claimProgramProperty   string
	enterProgramElement    string
	leaveProgramElement    string
	bindingTarget          string
	fragment               string
	target                 string
	expression             string
	forwardedExpression    string
	componentOutput        string
	serverComponentOutput  string
	issueServerComponent   string
	dynamic                string
	dynamicComponent       string
	serverDynamicComponent string
	dynamicComponentValue  string
	boundary               string
	finiteBoundary         string
	asyncSiblings          string
	serverSlot             string
	keyedServerSlot        string
	clientProps            string
	derived                string
	peek                   string
	write                  string
	update                 string
	updateResult           string
	abortOptions           string
	taskSignal             string
	taskTimeout            string
	taskInterval           string
	taskAnimation          string
	taskIdle               string
	taskObserver           string
	taskFetch              string
	taskResource           string
	taskAwait              string
	serverTaskAwait        string
	serverTaskTimeout      string
	taskMutation           string
	stageTaskMutation      string
	taskCollectionMutation string
	taskContinuation       string
	dispatchContinuation   string
	registerContexts       string
	inspectionSource       string
	defineTask             string
	bindTask               string
	invokeTask             string
	activateTask           string
	activateComputation    string
	bindCompiledLatest     string
	activateCompiledLatest string
	activateServerTask     string
	taskOptions            string
	taskCombined           string
	delete                 string
	arrayMutation          string
	collectionMutation     string
	componentRegistry      string
	enhancements           string
	omitEnhancementProps   string
	componentLog           string
	registerLifecycle      string
	registerRender         string
	ownResource            string
	interop                string
	timeActivation         string
	createTimeActivation   string
}

func (lowering *jsxLowering) runtimeImports(root *ast.Node) []*ast.Node {
	type importGroup struct {
		module     string
		specifiers []*ast.Node
	}
	renderRuntimeModule := "@exactjs/core/runtime/render"
	taskRuntimeModule := "@exactjs/core/runtime/tasks"
	if lowering.target == TargetServer {
		renderRuntimeModule = "@exactjs/core/framework/server-render-structure"
		for _, component := range lowering.components {
			if component.Placement != "client" && !component.DirectServer {
				renderRuntimeModule = "@exactjs/core/framework/render-structure"
				break
			}
		}
		taskRuntimeModule = "@exactjs/core/framework/server-task-helpers"
	}
	groups := []importGroup{
		{module: renderRuntimeModule},
		{module: "@exactjs/core/runtime/reactivity"},
		{module: taskRuntimeModule},
		{module: "@exactjs/core/runtime/inspection"},
		{module: "@exactjs/core/runtime/registry"},
		{module: "@exactjs/core/runtime/enhancements"},
		{module: "@exactjs/core/runtime/dynamic-components"},
		{module: "@exactjs/core/runtime/logging"},
		{module: "@exactjs/core/runtime/localization"},
		{module: "@exactjs/dom/runtime/modal"},
		{module: "@exactjs/dom/runtime/unsafe-html"},
		{module: "@exactjs/dom/runtime/structural-boundaries"},
		{module: "@exactjs/dom/runtime/target"},
		{module: "@exactjs/time/internal"},
		{module: "@exactjs/core/runtime/lists"},
		{module: "@exactjs/core/runtime/refs"},
		{module: "@exactjs/core/runtime/component-execution"},
		{module: "@exactjs/core/runtime/collections"},
		{module: "@exactjs/dom/runtime/render-program"},
		{module: "@exactjs/core/runtime/contexts"},
		{module: "@exactjs/core/runtime/lifecycle"},
		{module: "@exactjs/core/runtime/component-reactivity"},
		{module: "@exactjs/core/framework/component-lifecycle"},
		{module: "@exactjs/core/framework/server-component-execution"},
		{module: "@exactjs/ssr/runtime/generic-components"},
		{module: "@exactjs/ssr/runtime/structural-boundaries"},
		{module: "@exactjs/ssr/runtime/resumption-boundaries"},
	}
	add := func(group int, imported string, local string) {
		groups[group].specifiers = append(
			groups[group].specifiers,
			lowering.importSpecifier(imported, local),
		)
	}
	helpers := []struct {
		imported string
		local    string
		group    int
	}{
		{"createCompiledVNode", lowering.names.element, 0},
		{"createCompiledComponentVNode", lowering.names.componentElement, 0},
		{"keyCompiledVNode", lowering.names.keyedElement, 0},
		{"createCompiledRenderProgram", lowering.names.renderProgram, 0},
		{"createPreparedRenderProgram", lowering.names.preparedRenderProgram, 0},
		{"prepareCompiledRenderProgram", lowering.names.prepareRenderProgram, 0},
		{"createCompiledFragment", lowering.names.fragment, 0},
		{"createCompiledTarget", lowering.names.target, 0},
		{"createExpression", lowering.names.expression, 0},
		{"createForwardedExpression", lowering.names.forwardedExpression, 0},
		{"componentExecutionValueForHost", lowering.names.componentOutput, 16},
		{"serverComponentExecutionValueForHost", lowering.names.serverComponentOutput, 23},
		{"issueServerComponentVNode", lowering.names.issueServerComponent, 23},
		{"createDynamicChild", lowering.names.dynamic, 0},
		{"createCompiledDynamicComponent", lowering.names.dynamicComponent, 6},
		{"createServerDynamicComponent", lowering.names.serverDynamicComponent, 6},
		{"dynamicComponentValue", lowering.names.dynamicComponentValue, 6},
		{"createServerBoundary", lowering.names.boundary, 0},
		{"markFiniteClientBoundary", lowering.names.finiteBoundary, 0},
		{"markIndependentAsyncSiblings", lowering.names.asyncSiblings, 0},
		{"createServerSlot", lowering.names.serverSlot, 0},
		{"createKeyedServerSlot", lowering.names.keyedServerSlot, 0},
		{"createDerived", lowering.names.derived, 1},
		{"peek", lowering.names.peek, 1},
		{"writeReactiveLazy", lowering.names.write, 1},
		{"updateReactiveValue", lowering.names.update, 1},
		{"updateReactiveValueWithResult", lowering.names.updateResult, 1},
		{"deleteReactiveValue", lowering.names.delete, 1},
		{"mutateReactiveArray", lowering.names.arrayMutation, 1},
		{"mutateReactiveCollection", lowering.names.collectionMutation, 1},
		{"awaitServerComponentTask", lowering.names.serverTaskAwait, 23},
		{"serverComponentTaskTimeout", lowering.names.serverTaskTimeout, 23},
		{"createCompiledComponentRegistry", lowering.names.componentRegistry, 4},
		{"createEnhancementNode", lowering.names.enhancements, 5},
		{"omitKnownProps", lowering.names.omitEnhancementProps, 5},
		{"componentLogMethod", lowering.names.componentLog, 7},
		{"registerComponentLifecycleHandler", lowering.names.registerLifecycle, 22},
		{"registerComponentRenderHandler", lowering.names.registerRender, 22},
		{"ownComponentResource", lowering.names.ownResource, 22},
		{"activateServerComponentTaskForHost", lowering.names.activateServerTask, 23},
		{"createTimeActivation", lowering.names.createTimeActivation, 13},
		{"bindCompiledProgramText", lowering.names.bindProgramText, 18},
		{"bindCompiledProgramChild", lowering.names.bindProgramChild, 18},
		{"bindCompiledProgramLists", lowering.names.bindProgramLists, 18},
		{"bindCompiledProgramKeyedChild", lowering.names.bindProgramKeyedChild, 18},
		{"bindCompiledProgramProperties", lowering.names.bindProgramProperties, 18},
		{"bindCompiledProgramState", lowering.names.bindProgramState, 18},
		{"bindCompiledComponentUpdate", lowering.names.bindComponentUpdate, 18},
		{"applyCompiledProgramText", lowering.names.applyProgramText, 18},
		{"applyCompiledProgramProperties", lowering.names.applyProgramProperties, 18},
		{"beginCompiledProgramClaims", lowering.names.beginProgramClaims, 18},
		{"claimCompiledProgramElement", lowering.names.claimProgramElement, 18},
		{"claimCompiledProgramElementPath", lowering.names.claimElementPath, 18},
		{"claimCompiledProgramText", lowering.names.claimProgramText, 18},
		{"claimCompiledProgramChild", lowering.names.claimProgramChild, 18},
		{"claimCompiledProgramKeyedChild", lowering.names.claimProgramKeyedChild, 18},
		{"claimCompiledProgramProperty", lowering.names.claimProgramProperty, 18},
		{"enterCompiledProgramElement", lowering.names.enterProgramElement, 18},
		{"leaveCompiledProgramElement", lowering.names.leaveProgramElement, 18},
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
			group := 2
			if imported == "markExactInspectionSource" {
				group = 3
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
	source := lowering.sourceFile.Text()
	localizationUsed := lowering.componentLocalization ||
		containsComponentSurfaceUse(root, "intl") ||
		strings.Contains(source, "this.intl")
	loggingSurfaceUsed := containsComponentSurfaceUse(
		root,
		"log",
	) || strings.Contains(source, "this.log")
	listUsed := lowering.listCapabilityUsed
	for _, component := range lowering.components {
		if component.Lists {
			listUsed = true
			break
		}
	}
	refsUsed := containsComponentSurfaceUse(root, "ref", "readRef", "refs") ||
		strings.Contains(source, "this.ref") || strings.Contains(source, "this.readRef") ||
		strings.Contains(source, "this.refs")
	contextsUsed := containsComponentSurfaceUse(
		root,
		"hasContext",
		"getContext",
		"setContext",
	) || containsCoreContextComponentImport(
		root,
		lowering.sourceFile,
		lowering.checker,
	) || strings.Contains(source, "this.hasContext") || strings.Contains(source, "this.getContext") ||
		strings.Contains(source, "this.setContext")
	lifecycleUsed := containsComponentSurfaceUse(
		root,
		"onMount", "onActivate", "onDeactivate", "onUnmount", "onRender", "own",
	)
	componentReactivityUsed := containsComponentSurfaceUse(
		root,
		"reactive",
	) || strings.Contains(source, "this.reactive")
	executionUsed := lowering.contractProjection != ComponentContractProjectionHydrate
	if executionUsed {
		executionUsed = false
		for _, component := range lowering.components {
			if !(lowering.target == TargetServer && component.DirectServer) &&
				len(projectComponentExecution(component.Execution, lowering.target).Transitions) != 0 {
				executionUsed = true
				break
			}
		}
	}
	genericServerRuntimeUsed := false
	if lowering.target == TargetServer {
		for _, component := range lowering.components {
			if component.Placement != "client" && !component.DirectServer {
				genericServerRuntimeUsed = true
				break
			}
		}
	}
	modalBindingUsed := containsIdentifier(root, "__exactModalOpen")
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
	serverResumptionBoundariesUsed := lowering.target == TargetServer &&
		len(lowering.continuationComponents) != 0
	targetUsed := lowering.target != TargetServer &&
		(containsIdentifier(root, lowering.names.target) ||
			containsCompiledTargetCall(lowering.sourceFile, lowering.checker))
	collectionsUsed := false
	for _, component := range lowering.components {
		if component.Collections && !(lowering.target == TargetServer && component.DirectServer) {
			collectionsUsed = true
			break
		}
	}
	result := make([]*ast.Node, 0, len(groups))
	for index, group := range groups {
		if len(group.specifiers) == 0 {
			if (index == 2 && (interopUsed || interactionUsed)) ||
				(group.module == "@exactjs/core/runtime/logging" && loggingSurfaceUsed) ||
				(group.module == "@exactjs/core/runtime/localization" && localizationUsed) ||
				(group.module == "@exactjs/core/runtime/lists" && listUsed) ||
				(group.module == "@exactjs/core/runtime/refs" && refsUsed) ||
				(group.module == "@exactjs/dom/runtime/modal" && modalBindingUsed) ||
				(group.module == "@exactjs/dom/runtime/unsafe-html" && unsafeHTMLUsed) ||
				(group.module == "@exactjs/dom/runtime/structural-boundaries" && structuralBoundariesUsed) ||
				(group.module == "@exactjs/dom/runtime/target" && targetUsed) ||
				(group.module == "@exactjs/core/runtime/component-execution" && executionUsed) ||
				(group.module == "@exactjs/core/runtime/collections" && collectionsUsed) ||
				(group.module == "@exactjs/core/runtime/contexts" && contextsUsed) ||
				(group.module == "@exactjs/core/runtime/lifecycle" && lifecycleUsed) ||
				(group.module == "@exactjs/core/runtime/component-reactivity" && componentReactivityUsed) ||
				(group.module == "@exactjs/ssr/runtime/generic-components" && genericServerRuntimeUsed) ||
				(group.module == "@exactjs/ssr/runtime/structural-boundaries" && serverStructuralBoundariesUsed) ||
				(group.module == "@exactjs/ssr/runtime/resumption-boundaries" && serverResumptionBoundariesUsed) {
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
		element:                allocate("__exactVNode"),
		componentElement:       allocate("__exactComponentVNode"),
		keyedElement:           allocate("__exactKeyedVNode"),
		renderProgram:          allocate("__exactRenderProgram"),
		preparedRenderProgram:  allocate("__exactPreparedRenderProgram"),
		prepareRenderProgram:   allocate("__exactPrepareRenderProgram"),
		bindProgramText:        allocate("__exactBindProgramText"),
		bindProgramChild:       allocate("__exactBindProgramChild"),
		bindProgramLists:       allocate("__exactBindProgramLists"),
		bindProgramKeyedChild:  allocate("__exactBindProgramKeyedChild"),
		bindProgramProperties:  allocate("__exactBindProgramProperties"),
		bindProgramState:       allocate("__exactBindProgramState"),
		bindComponentUpdate:    allocate("__exactBindComponentUpdate"),
		applyProgramText:       allocate("__exactApplyProgramText"),
		applyProgramProperties: allocate("__exactApplyProgramProperties"),
		beginProgramClaims:     allocate("__exactBeginProgramClaims"),
		claimProgramElement:    allocate("__exactClaimProgramElement"),
		claimElementPath:       allocate("__exactClaimProgramElementPath"),
		claimProgramText:       allocate("__exactClaimProgramText"),
		claimProgramChild:      allocate("__exactClaimProgramChild"),
		claimProgramKeyedChild: allocate("__exactClaimProgramKeyedChild"),
		claimProgramProperty:   allocate("__exactClaimProgramProperty"),
		enterProgramElement:    allocate("__exactEnterProgramElement"),
		leaveProgramElement:    allocate("__exactLeaveProgramElement"),
		bindingTarget:          allocate("__exactBindingTarget"),
		fragment:               allocate("__exactFragment"),
		target:                 allocate("__exactTarget"),
		expression:             allocate("__exactExpression"),
		forwardedExpression:    allocate("__exactForwardedExpression"),
		componentOutput:        allocate("__exactComponentOutput"),
		serverComponentOutput:  allocate("__exactServerComponentOutput"),
		issueServerComponent:   allocate("__exactIssueServerComponent"),
		dynamic:                allocate("__exactDynamic"),
		dynamicComponent:       allocate("__exactDynamicComponent"),
		serverDynamicComponent: allocate("__exactServerDynamicComponent"),
		dynamicComponentValue:  allocate("__exactDynamicComponentValue"),
		boundary:               allocate("__exactBoundary"),
		finiteBoundary:         allocate("__exactFiniteBoundary"),
		asyncSiblings:          allocate("__exactAsyncSiblings"),
		serverSlot:             allocate("__exactServerSlot"),
		keyedServerSlot:        allocate("__exactKeyedServerSlot"),
		clientProps:            allocate("__exactElementProps"),
		derived:                allocate("__exactDerived"),
		peek:                   allocate("__exactPeek"),
		write:                  allocate("__exactWrite"),
		update:                 allocate("__exactUpdate"),
		updateResult:           allocate("__exactUpdateResult"),
		abortOptions:           allocate("__exactAbortOptions"),
		taskSignal:             allocate("__exactSignal"),
		taskTimeout:            allocate("__exactTaskTimeout"),
		taskInterval:           allocate("__exactTaskInterval"),
		taskAnimation:          allocate("__exactTaskAnimationFrame"),
		taskIdle:               allocate("__exactTaskIdleCallback"),
		taskObserver:           allocate("__exactTaskObserver"),
		taskFetch:              allocate("__exactTaskFetch"),
		taskResource:           allocate("__exactTaskResource"),
		taskOptions:            allocate("__exactTaskOptionsSignal"),
		taskCombined:           allocate("__exactTaskCombinedSignal"),
		taskAwait:              allocate("__exactTaskAwait"),
		serverTaskAwait:        allocate("__exactServerTaskAwait"),
		serverTaskTimeout:      allocate("__exactServerTaskTimeout"),
		taskMutation:           allocate("__exactTaskMutation"),
		stageTaskMutation:      allocate("__exactStageTaskMutation"),
		taskCollectionMutation: allocate("__exactTaskCollectionMutation"),
		taskContinuation:       allocate("__exactContinuationTask"),
		dispatchContinuation:   allocate("__exactDispatchContinuation"),
		registerContexts:       allocate("__exactRegisterContinuationContexts"),
		inspectionSource:       allocate("__exactInspectionSource"),
		defineTask:             allocate("__exactDefineTask"),
		bindTask:               allocate("__exactBindTask"),
		invokeTask:             allocate("__exactInvokeTask"),
		activateTask:           allocate("__exactActivateTask"),
		activateComputation:    allocate("__exactActivateComputation"),
		bindCompiledLatest:     allocate("__exactBindClientLatestTask"),
		activateCompiledLatest: allocate("__exactActivateClientLatestTask"),
		activateServerTask:     allocate("__exactActivateServerTask"),
		delete:                 allocate("__exactDelete"),
		arrayMutation:          allocate("__exactArrayMutation"),
		collectionMutation:     allocate("__exactCollectionMutation"),
		componentRegistry:      allocate("__exactComponentRegistry"),
		enhancements:           allocate("__exactEnhancements"),
		omitEnhancementProps:   allocate("__exactOmitEnhancementProps"),
		componentLog:           allocate("__exactComponentLog"),
		registerLifecycle:      allocate("__exactRegisterLifecycle"),
		registerRender:         allocate("__exactRegisterRender"),
		ownResource:            allocate("__exactOwnResource"),
		interop:                allocate("__exactInteropComponent"),
		timeActivation:         allocate("__exactTimeRange"),
		createTimeActivation:   allocate("__exactCreateTimeActivation"),
	}
}
