package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// taskResourceLoweringPlan shares generation ownership across activated and
// invoked work. Only analyzed source sites authorize ownership or signal injection.
type taskResourceLoweringPlan struct {
	resources map[string]TaskResource
	signals   taskSignalLowering
	releases  map[string]taskResourceRelease
}

// newTaskResourceLoweringPlan indexes analyzed source identities without
// executing initializers or transferring runtime ownership.
func newTaskResourceLoweringPlan(resourcesInput []TaskResource, signalsInput []TaskSignalCall) taskResourceLoweringPlan {
	releases := make(map[string]taskResourceRelease)
	resources := make(map[string]TaskResource, len(resourcesInput))
	for _, resource := range resourcesInput {
		resources[fmt.Sprintf("%d:%d", resource.Start, resource.Length)] = resource
		for _, release := range resource.ReleaseCalls {
			releases[nodeSpanKey(release.Call)] = release
		}
	}
	signals := make(map[string]TaskSignalCall, len(signalsInput))
	for _, call := range signalsInput {
		signals[fmt.Sprintf("%d:%d", call.Start, call.Length)] = call
	}
	return taskResourceLoweringPlan{resources: resources, signals: taskSignalLowering{calls: signals}, releases: releases}
}

// taskSignalLowering applies analyzed cancellation arguments inside an existing
// pending call. The pending call still owns selection and optional short-circuiting.
type taskSignalLowering struct {
	calls        map[string]TaskSignalCall
	signal       *ast.Node
	directServer bool
}

func (signals taskSignalLowering) arguments(lowering *jsxLowering, source *ast.Node, arguments []*ast.Node) []*ast.Node {
	if len(signals.calls) != 0 {
		if call, exists := signals.calls[nodeSpanKey(source)]; exists {
			return lowering.lowerTaskSignalArguments(arguments, call, signals.signal, signals.directServer)
		}
	}
	return arguments
}

// lowerTaskResourceRelease relinquishes fallback ownership only after the
// authored release executes, retaining optional selection and pending receivers.
func (lowering *jsxLowering) lowerTaskResourceRelease(node, signal, pendingState *ast.Node, visitor *ast.NodeVisitor, plan taskResourceLoweringPlan) *ast.Node {
	if release, exists := plan.releases[nodeSpanKey(node)]; exists {
		if release.directReceiver {
			return lowering.lowerDirectTaskResourceRelease(node, release, signal, visitor)
		}
		if ast.IsCallExpression(node) && node.AsCallExpression().QuestionDotToken != nil {
			call := node.AsCallExpression()
			method := lowering.taskHelperCall("taskResourceReleaseMethod", lowering.names.taskResourceReleaseMethod,
				[]*ast.Node{signal, visitor.VisitNode(release.Value), visitor.VisitNode(call.Expression)})
			return lowering.factory.UpdateCallExpression(call, method, call.QuestionDotToken, call.TypeArguments, visitor.VisitNodes(call.Arguments), call.Flags)
		}
		// Pending-state lowering can own this native call too. Preserve its
		// result transform inside the executed release marker rather than
		// letting either transformation bypass the other's ownership work.
		var call *ast.Node
		if pendingState != nil {
			call = lowering.pendingStateOperation(node, pendingState, visitor, plan.signals)
		}
		if call == nil {
			call = visitor.VisitEachChild(node)
		}
		return lowering.taskHelperCall("releaseTaskResource", lowering.names.taskResourceRelease, []*ast.Node{signal, visitor.VisitNode(release.Value), call})
	}
	return nil
}

// lowerPendingTaskResource keeps the already-lowered acquisition and registers
// its result when the source site has an analyzed disposal contract.
func (lowering *jsxLowering) lowerPendingTaskResource(source, value, signal, context *ast.Node, plan taskResourceLoweringPlan) *ast.Node {
	if !ast.IsCallExpression(source) || len(plan.resources) == 0 {
		return value
	}
	if resource, exists := plan.resources[nodeSpanKey(source)]; exists && resource.Kind == "owned" {
		return lowering.lowerOwnedTaskResource(value, signal, context, resource)
	}
	return value
}

// lowerOwnedTaskResource registers the evaluated value with its generation.
// Resources with authored release sites use the context to track relinquishment.
func (lowering *jsxLowering) lowerOwnedTaskResource(value, signal, context *ast.Node, resource TaskResource) *ast.Node {
	arguments := []*ast.Node{signal, value}
	if resource.Disposal != "" {
		arguments = append(
			arguments,
			lowering.factory.NewStringLiteral(
				resource.Disposal,
				ast.TokenFlagsNone,
			),
		)
	}
	if len(resource.ReleaseCalls) != 0 {
		arguments[0] = context
		return lowering.taskHelperCall("ownReleasableTaskResource", lowering.names.taskReleasableResource, arguments)
	}
	return lowering.taskHelperCall(
		"ownTaskResource",
		lowering.names.taskResource,
		arguments,
	)
}

// lowerPlannedTaskResource supplies the same disposal and cancellation helpers
// to every execution path without changing the authored operation's result.
func (lowering *jsxLowering) lowerPlannedTaskResource(node, signal, context *ast.Node, visitor *ast.NodeVisitor, directServer bool, plan taskResourceLoweringPlan) *ast.Node {
	key := nodeSpanKey(node)
	if resource, exists := plan.resources[key]; exists {
		if resource.Kind == "owned" {
			// A typed acquisition may require both argument adaptation and cleanup.
			// Lower the authored call once before registering its returned resource.
			if call, takesSignal := plan.signals.calls[key]; takesSignal {
				value := lowering.lowerTaskSignalCall(node, call, signal, visitor, directServer)
				return lowering.lowerOwnedTaskResource(value, signal, context, resource)
			}
		}
		return lowering.lowerTaskResource(node, resource, signal, context, visitor, directServer)
	}
	if call, exists := plan.signals.calls[key]; exists {
		return lowering.lowerTaskSignalCall(node, call, signal, visitor, directServer)
	}
	return nil
}

// lowerTaskResourceCallable retains generation ownership for ordinary closures
// inside invoked work. Their authored await and mutation semantics remain with
// their existing owners, while the analyzed resource sites share this signal.
func (lowering *jsxLowering) lowerTaskResourceCallable(callable, signal, context *ast.Node, plan taskResourceLoweringPlan) *ast.Node {
	var visitor *ast.NodeVisitor
	visitor = ast.NewNodeVisitor(func(node *ast.Node) *ast.Node {
		if result := lowering.lowerTaskResourceRelease(node, signal, nil, visitor, plan); result != nil {
			return result
		}
		if result := lowering.lowerPlannedTaskResource(node, signal, context, visitor, false, plan); result != nil {
			return result
		}
		return visitor.VisitEachChild(node)
	}, &lowering.factory.NodeFactory, ast.NodeVisitorHooks{})
	return visitor.VisitNode(callable)
}

// lowerDirectTaskResourceRelease selects an acquired receiver once before its
// method and arguments. The existing release bridge preserves native results,
// optional calls and fallback cleanup after an unsuccessful authored release.
func (lowering *jsxLowering) lowerDirectTaskResourceRelease(node *ast.Node, release taskResourceRelease, signal *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	call := node.AsCallExpression()
	receiver := lowering.factory.NewIdentifier(lowering.uniqueMutationName("__exactResource"))
	var method *ast.Node
	if ast.IsPropertyAccessExpression(call.Expression) {
		access := call.Expression.AsPropertyAccessExpression()
		method = lowering.factory.UpdatePropertyAccessExpression(access, receiver, access.QuestionDotToken, access.Name(), access.Flags)
	} else {
		access := call.Expression.AsElementAccessExpression()
		method = lowering.factory.UpdateElementAccessExpression(access, receiver, access.QuestionDotToken, visitor.VisitNode(access.ArgumentExpression), access.Flags)
	}
	bridge := lowering.taskHelperCall("taskResourceReleaseMethod", lowering.names.taskResourceReleaseMethod, []*ast.Node{signal, receiver, method})
	body := lowering.factory.UpdateCallExpression(call, bridge, call.QuestionDotToken, call.TypeArguments, visitor.VisitNodes(call.Arguments), call.Flags)
	selection := lowering.factory.NewArrowFunction(nil, nil, lowering.factory.NewNodeList([]*ast.Node{
		lowering.factory.NewParameterDeclaration(nil, nil, receiver, nil, lowering.taskDependencyType(release.Value), nil),
	}), nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken), body)
	return lowering.factory.NewCallExpression(lowering.factory.NewParenthesizedExpression(selection), nil, nil, lowering.factory.NewNodeList([]*ast.Node{visitor.VisitNode(release.Value)}), ast.NodeFlagsNone)
}

// taskResourceRelease is a private source witness for executed release tracking.
type taskResourceRelease struct {
	directReceiver bool
	Call           *ast.Node
	Value          *ast.Node
}
