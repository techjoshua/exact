package exactcompiler

import (
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/printer"
)

// planComponentTargets records the single target-local proof shared by task lowering, contract
// emission, capability selection, and renderer entry lowering. No later pass should reconstruct
// these execution or server-lane decisions from component facts.
func planComponentTargets(
	sourceFile *ast.SourceFile,
	components []Component,
	tasks []Task,
	resumptions []ComponentResumption,
	compatibilityEnabled bool,
) {
	for index := range components {
		component := &components[index]
		componentNode := componentSourceNode(sourceFile, *component)
		if componentNode == nil {
			continue
		}
		execution := projectComponentExecution(component.Execution, TargetServer)
		serverSurface := projectServerComponentSurface(componentNode, *component, tasks)
		hasResumption := component.Placement == "isomorphic" &&
			componentHasResumption(component.ID, resumptions)
		directResumption := hasResumption &&
			directServerResumptionSupported(component.ID, resumptions)
		usesCompatibility := compatibilityEnabled && componentUsesJSXInterop(*component, componentNode)
		hasLifecycle := serverSurface.ServerLifecycle
		unsupportedSurface := serverSurface.Reactivity || serverSurface.Refs ||
			serverSurface.ServerLifecycle
		abi := componentRuntimeABI(
			*component,
			serverSurface,
			execution,
			hasLifecycle,
			false,
			usesCompatibility,
			component.CompiledRender,
		)
		directABI := componentABICompiledRender | componentABITasks | componentABICollections |
			componentABIContexts
		tasksSupported := true
		for _, task := range tasks {
			if task.Component == component.Name && !directServerTaskSupported(task) {
				tasksSupported = false
				break
			}
		}
		directServer := (!hasResumption || directResumption) && !usesCompatibility &&
			!component.DynamicComponents && !unsupportedSurface && tasksSupported && abi&^directABI == 0
		component.TargetPlan = ComponentTargetPlan{
			ClientExecution:      projectComponentExecution(component.Execution, TargetClient),
			ServerExecution:      execution,
			ClientSurface:        component.Surface,
			ServerSurface:        serverSurface,
			DeferredTaskProps:    deferredServerTaskProps(*component, execution, componentNode, tasks),
			DirectServer:         directServer,
			DirectServerFrame:    directServer && len(execution.Transitions) == 0,
			GenericServerRuntime: component.Placement != "client" && !directServer,
		}
	}
}

func componentTargetSurface(component Component, target Target) ComponentSurfacePlan {
	if target == TargetServer {
		return component.TargetPlan.ServerSurface
	}
	return component.TargetPlan.ClientSurface
}

// projectServerComponentSurface removes only capability uses whose complete expression is erased
// by server lowering. Requirements propagated from external helpers remain conservative because
// their call-site reachability cannot be recovered from a target-neutral boolean summary.
func projectServerComponentSurface(
	componentNode *ast.Node,
	component Component,
	tasks []Task,
) ComponentSurfacePlan {
	result := component.ForwardedSurface
	clientLifecycle := componentClientLifecycleCallbackSpans(componentNode)
	clientTasks := make([]SourceSpan, 0)
	for _, task := range tasks {
		if task.Component != component.Name || task.Placement != "client" {
			continue
		}
		if task.Length != 0 {
			clientTasks = append(clientTasks, SourceSpan{Start: task.Start, Length: task.Length})
		}
		if task.WorkLength != 0 {
			clientTasks = append(clientTasks, SourceSpan{Start: task.WorkStart, Length: task.WorkLength})
		}
	}
	walkNode(componentNode, func(node *ast.Node) bool {
		if insideSourceSpans(node.Pos(), clientLifecycle) || withinAnySourceSpan(node, clientTasks) {
			return false
		}
		if serverErasesJSXAttribute(node, componentNode) {
			return false
		}
		name, member, dynamic := componentProtocolMember(node)
		if !member {
			return true
		}
		mergeComponentSurfaceMember(&result, name, dynamic)
		return true
	})
	return result
}

func serverErasesJSXAttribute(node *ast.Node, componentNode *ast.Node) bool {
	for current := node; current != nil && current != componentNode; current = current.Parent {
		if !ast.IsJsxAttribute(current) {
			continue
		}
		return interactiveJSXAttribute(jsxAttributeText(current.AsJsxAttribute().Name()))
	}
	return false
}

func mergeComponentSurfaceMember(surface *ComponentSurfacePlan, name string, dynamic bool) {
	if dynamic {
		surface.Logging = true
		surface.Localization = true
		surface.Refs = true
		surface.Contexts = true
		surface.Reactivity = true
		surface.ServerLifecycle = true
		return
	}
	switch name {
	case "log":
		surface.Logging = true
	case "intl":
		surface.Localization = true
	case "ref", "readRef", "refs":
		surface.Refs = true
	case "hasContext", "getContext", "setContext":
		surface.Contexts = true
	case "reactive":
		surface.Reactivity = true
	case "onUnmount", "onRender", "own":
		surface.ServerLifecycle = true
	}
}

func directServerTaskSupported(task Task) bool {
	if task.Placement == "client" {
		return true
	}
	if directServerSetupComputation(task) {
		return true
	}
	return !task.Invoked && !task.Detached && task.KeyLength == 0 &&
		(task.Readiness == "" || task.Readiness == "blocking" || !task.Async) &&
		len(task.Contexts) == 0
}

func componentTargetExecution(component Component, target Target) ComponentExecution {
	if target == TargetServer {
		return component.TargetPlan.ServerExecution
	}
	return component.TargetPlan.ClientExecution
}

// componentExecutionMetadata emits the compact canonical subgraph on both
// target facets so each runtime can optimize without importing its opposite.
func componentExecutionMetadata(
	factory *printer.NodeFactory,
	execution ComponentExecution,
	compact bool,
) *ast.Node {
	ports := make([]*ast.Node, 0, len(execution.Ports))
	for _, port := range execution.Ports {
		ports = append(ports, contractArray(factory,
			contractString(factory, port.Kind),
			contractString(factory, port.Path),
			contractString(factory, port.Direction),
		))
	}
	transitions := make([]*ast.Node, 0, len(execution.Transitions))
	for _, transition := range execution.Transitions {
		transitions = append(transitions, contractArray(factory,
			contractString(factory, transition.ID),
			contractString(factory, transition.TaskID),
			contractString(factory, transition.Activation),
			contractString(factory, transition.Placement),
			contractString(factory, transition.Readiness),
			contractString(factory, transition.Concurrency),
			contractNumberArray(factory, transition.Inputs),
			contractNumberArray(factory, transition.Outputs),
		))
	}
	reactive := make([]*ast.Node, 0, len(execution.Reactive))
	for _, binding := range execution.Reactive {
		reactive = append(reactive, contractObject(factory, true,
			contractProperty(factory, "name", contractString(factory, binding.Name)),
			contractProperty(factory, "provenance", contractString(factory, binding.Provenance)),
			contractProperty(factory, "allocation", contractString(factory, binding.Allocation)),
			contractProperty(factory, "dependencies", stringMetadata(factory, binding.Dependencies)),
		))
	}
	properties := []*ast.Node{
		contractProperty(factory, "version", contractNumber(factory, execution.Version)),
		contractProperty(factory, "ports", contractArray(factory, ports...)),
		contractProperty(factory, "transitions", contractArray(factory, transitions...)),
	}
	if !compact {
		properties = append(properties, contractProperty(factory, "reactive", contractArray(factory, reactive...)))
	}
	return contractObject(factory, true, properties...)
}

// componentDefinitionMetadata emits the single compiler-owned executable description consumed
// while creating each durable state-machine instance.
func componentDefinitionMetadata(
	factory *printer.NodeFactory,
	instantiate *ast.Node,
	construct *ast.Node,
	execution ComponentExecution,
	deferredTaskProps []string,
	stateSlots []string,
	propsSlots []string,
	continuations []Continuation,
	hasResumption bool,
	serverPublicationName string,
	serverFrame *ast.Node,
	directResumption bool,
	hasInteractions bool,
	compatibility bool,
	dynamicComponents bool,
	collections bool,
	runtimeABI int,
	directServer bool,
	server bool,
	compact bool,
	updates *ast.Node,
) *ast.Node {
	state := append([]string{}, stateSlots...)
	props := append([]string{}, propsSlots...)
	tasks := []string{}
	capabilities := []string{}
	for _, transition := range execution.Transitions {
		tasks = append(tasks, transition.ID)
	}
	if len(tasks) != 0 {
		capabilities = append(capabilities, "tasks")
	}
	if len(continuations) != 0 {
		capabilities = append(capabilities, "continuations")
	}
	if hasResumption {
		capabilities = append(capabilities, "resumption")
	}
	if hasInteractions {
		capabilities = append(capabilities, "interactions")
	}
	if compatibility {
		capabilities = append(capabilities, "compatibility")
	}
	if dynamicComponents {
		capabilities = append(capabilities, "dynamic-components")
	}
	if collections {
		capabilities = append(capabilities, "collections")
	}
	if runtimeABI&componentABIContexts != 0 {
		capabilities = append(capabilities, "contexts")
	}
	reactive := make([]*ast.Node, 0, len(execution.Reactive))
	for _, binding := range execution.Reactive {
		reactive = append(reactive, contractObject(factory, true,
			contractProperty(factory, "name", contractString(factory, binding.Name)),
			contractProperty(factory, "provenance", contractString(factory, binding.Provenance)),
			contractProperty(factory, "allocation", contractString(factory, binding.Allocation)),
			contractProperty(factory, "dependencies", stringMetadata(factory, binding.Dependencies)),
		))
	}
	properties := []*ast.Node{
		contractProperty(factory, "version", contractNumber(factory, 1)),
		contractProperty(factory, "instantiate", instantiate),
		contractProperty(factory, "construct", construct),
		contractProperty(factory, "abi", contractNumber(factory, runtimeABI)),
		contractProperty(factory, "capabilities", stringMetadata(factory, capabilities)),
		contractProperty(factory, "state", stringMetadata(factory, state)),
		contractProperty(factory, "props", stringMetadata(factory, props)),
	}
	if updates != nil {
		properties = append(properties, contractProperty(factory, "updates", updates))
	}
	if server {
		properties = append(properties, contractProperty(
			factory,
			"server",
			serverComponentExecutionMetadata(
				factory,
				execution,
				deferredTaskProps,
				instantiate,
				directServer,
				dynamicComponents,
				serverPublicationName,
				serverFrame,
			),
		))
	}
	if !compact {
		properties = append(properties,
			contractProperty(factory, "tasks", stringMetadata(factory, tasks)),
			contractProperty(factory, "reactive", contractArray(factory, reactive...)),
			contractProperty(factory, "render", contractString(factory, "returned-function")),
		)
	}
	return contractObject(factory, true, properties...)
}

// serverComponentExecutionMetadata projects activation and dependency slices once at build time.
// The server renderer consumes this record directly instead of reconstructing a per-request DAG.
func serverComponentExecutionMetadata(
	factory *printer.NodeFactory,
	execution ComponentExecution,
	deferredTaskProps []string,
	instantiate *ast.Node,
	direct bool,
	dynamic bool,
	publicationName string,
	frame *ast.Node,
) *ast.Node {
	classification := "synchronous"
	if dynamic {
		classification = "dynamic"
	} else if len(execution.Transitions) != 0 {
		classification = "scheduled"
	}
	lane := "generic"
	if direct && classification != "dynamic" {
		lane = "direct"
	}
	properties := []*ast.Node{
		contractProperty(factory, "version", contractNumber(factory, 1)),
		contractProperty(factory, "classification", contractString(factory, classification)),
		contractProperty(factory, "lane", contractString(factory, lane)),
	}
	if len(deferredTaskProps) != 0 {
		properties = append(properties,
			contractProperty(factory, "deferredTaskProps", stringMetadata(factory, deferredTaskProps)),
		)
	}
	if lane == "direct" {
		properties = append(properties,
			contractProperty(factory, "render", instantiate),
		)
		if frame != nil {
			properties = append(properties, contractProperty(factory, "frame", frame))
		}
	}
	if publicationName != "" {
		properties = append(properties, contractProperty(factory, "publication", contractObject(
			factory,
			true,
			contractProperty(factory, "kind", contractString(factory, "resumption")),
			contractProperty(factory, "name", contractString(factory, publicationName)),
		)))
	}
	return contractObject(factory, true, properties...)
}

func serverSetupTaskPropNames(execution ComponentExecution) []string {
	seen := make(map[string]struct{})
	result := []string{}
	for _, transition := range execution.Transitions {
		if transition.Activation != "setup" {
			continue
		}
		for _, input := range transition.Inputs {
			if input < 0 || input >= len(execution.Ports) || execution.Ports[input].Kind != "props" {
				continue
			}
			path := strings.TrimPrefix(execution.Ports[input].Path, "props.")
			if separator := strings.IndexByte(path, '.'); separator >= 0 {
				path = path[:separator]
			}
			if path == "" {
				continue
			}
			if _, exists := seen[path]; exists {
				continue
			}
			seen[path] = struct{}{}
			result = append(result, path)
		}
	}
	return result
}

// deferredServerTaskProps proves which setup-task inputs are never consumed by ordinary
// component construction or rendering. Only those props may retain dependency provenance while
// the component is instantiated; every other pending prop must settle first.
func deferredServerTaskProps(
	component Component,
	execution ComponentExecution,
	componentNode *ast.Node,
	tasks []Task,
) []string {
	candidates := serverSetupTaskPropNames(execution)
	if len(candidates) == 0 || componentNode == nil {
		return candidates
	}
	propsName := componentPropsParameterName(componentNode)
	if propsName == "" {
		return nil
	}
	candidateSet := make(map[string]struct{}, len(candidates))
	for _, name := range candidates {
		candidateSet[name] = struct{}{}
	}
	taskRanges := make([]SourceSpan, 0, len(tasks)*2)
	for _, task := range tasks {
		if task.Component != component.Name || task.Invoked ||
			(task.Placement != "server" && task.Placement != "isomorphic") {
			continue
		}
		if task.Length > 0 {
			taskRanges = append(taskRanges, SourceSpan{Start: task.Start, Length: task.Length})
		}
		if task.WorkLength > 0 {
			taskRanges = append(taskRanges, SourceSpan{Start: task.WorkStart, Length: task.WorkLength})
		}
	}
	direct := make(map[string]struct{})
	walkNode(componentNode, func(node *ast.Node) bool {
		name, ok := rootPropertyName(node, propsName)
		if !ok {
			return true
		}
		if _, candidate := candidateSet[name]; !candidate || withinAnySourceSpan(node, taskRanges) {
			return true
		}
		direct[name] = struct{}{}
		return true
	})
	result := make([]string, 0, len(candidates))
	for _, name := range candidates {
		if _, usedDirectly := direct[name]; !usedDirectly {
			result = append(result, name)
		}
	}
	return result
}

func componentPropsParameterName(componentNode *ast.Node) string {
	for _, parameter := range componentNode.Parameters() {
		name := parameter.Name()
		if name != nil && ast.IsIdentifier(name) && name.Text() != "this" {
			return name.Text()
		}
	}
	return ""
}

func rootPropertyName(node *ast.Node, receiver string) (string, bool) {
	switch {
	case ast.IsPropertyAccessExpression(node):
		member := node.AsPropertyAccessExpression()
		if ast.IsIdentifier(member.Expression) && member.Expression.Text() == receiver &&
			member.Name() != nil {
			return member.Name().Text(), true
		}
	case ast.IsElementAccessExpression(node):
		member := node.AsElementAccessExpression()
		if ast.IsIdentifier(member.Expression) && member.Expression.Text() == receiver &&
			member.ArgumentExpression != nil && ast.IsStringLiteral(member.ArgumentExpression) {
			return member.ArgumentExpression.Text(), true
		}
	}
	return "", false
}

func withinAnySourceSpan(node *ast.Node, spans []SourceSpan) bool {
	for _, span := range spans {
		if node.Pos() >= span.Start && node.End() <= span.Start+span.Length {
			return true
		}
	}
	return false
}

// componentRuntimeABI compacts compiler-proven execution needs into the hot construction record.
func componentRuntimeABI(
	component Component,
	surface ComponentSurfacePlan,
	execution ComponentExecution,
	hasLifecycle bool,
	hasInteractions bool,
	compatibility bool,
	compiledRender bool,
) int {
	abi := 0
	rangeOutput := compiledRender && component.ClientRangeOutput
	if compiledRender && !rangeOutput {
		abi |= componentABICompiledRender
	}
	if rangeOutput {
		abi |= componentABIRangeOutput
	}
	if hasLifecycle {
		abi |= componentABILifecycle
	}
	if component.Lists {
		abi |= componentABILists
	}
	if len(execution.Transitions) != 0 || hasInteractions || compatibility {
		abi |= componentABITasks
	}
	if component.Collections {
		abi |= componentABICollections
	}
	if surface.Contexts {
		abi |= componentABIContexts
	}
	return abi
}

// projectComponentExecution removes opposite-target transitions and compacts
// their now-unreachable ports before metadata reaches a physical artifact.
func projectComponentExecution(execution ComponentExecution, target Target) ComponentExecution {
	transitions := []ComponentTransition{}
	usedPorts := make(map[int]struct{})
	inputPorts := make(map[int]struct{})
	outputPorts := make(map[int]struct{})
	for _, transition := range execution.Transitions {
		if (target == TargetClient && transition.Placement == "server") ||
			(target == TargetServer &&
				(transition.Placement == "client" || transition.DirectServerSetup)) {
			continue
		}
		transitions = append(transitions, transition)
		for _, input := range transition.Inputs {
			usedPorts[input] = struct{}{}
			inputPorts[input] = struct{}{}
		}
		for _, output := range transition.Outputs {
			usedPorts[output] = struct{}{}
			outputPorts[output] = struct{}{}
		}
	}
	ports := []ComponentPort{}
	remap := make(map[int]int, len(usedPorts))
	for _, port := range execution.Ports {
		if _, used := usedPorts[port.Index]; !used {
			continue
		}
		oldIndex := port.Index
		port.Index = len(ports)
		remap[oldIndex] = port.Index
		_, input := inputPorts[oldIndex]
		_, output := outputPorts[oldIndex]
		switch {
		case input && output:
			port.Direction = "inout"
		case output:
			port.Direction = "output"
		default:
			port.Direction = "input"
		}
		ports = append(ports, port)
	}
	for index := range transitions {
		transitions[index].Inputs = remapComponentPorts(transitions[index].Inputs, remap)
		transitions[index].Outputs = remapComponentPorts(transitions[index].Outputs, remap)
	}
	return ComponentExecution{
		Version: execution.Version, Ports: ports, Transitions: transitions,
		Reactive: append([]ReactiveAllocation{}, execution.Reactive...),
	}
}

func remapComponentPorts(values []int, indexes map[int]int) []int {
	result := make([]int, 0, len(values))
	for _, value := range values {
		if mapped, exists := indexes[value]; exists {
			result = append(result, mapped)
		}
	}
	return result
}

func continuationDependencyMetadata(
	factory *printer.NodeFactory,
	dependencies []TaskDependency,
) []*ast.Node {
	values := make([]*ast.Node, 0, len(dependencies))
	for _, dependency := range dependencies {
		properties := []*ast.Node{
			contractProperty(factory, "index", contractNumber(factory, dependency.Index)),
			contractProperty(factory, "source", contractString(factory, dependency.Source)),
		}
		if dependency.Path != "" {
			properties = append(properties,
				contractProperty(factory, "path", contractString(factory, dependency.Path)),
			)
		}
		values = append(values, contractObject(factory, true, properties...))
	}
	return values
}

func contractNumber(factory *printer.NodeFactory, value int) *ast.Node {
	return factory.NewNumericLiteral(strconv.Itoa(value), ast.TokenFlagsNone)
}

func contractNumberArray(factory *printer.NodeFactory, values []int) *ast.Node {
	nodes := make([]*ast.Node, 0, len(values))
	for _, value := range values {
		nodes = append(nodes, contractNumber(factory, value))
	}
	return contractArray(factory, nodes...)
}
