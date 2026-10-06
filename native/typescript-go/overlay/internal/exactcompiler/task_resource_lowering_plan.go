package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// taskResourceLoweringPlan shares generation ownership across activated and
// invoked work. Only analyzed source sites authorize ownership or signal injection.
type taskResourceLoweringPlan struct {
	resources map[string]TaskResource
	signals   map[string]TaskSignalCall
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
	return taskResourceLoweringPlan{resources: resources, signals: signals, releases: releases}
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
			call = lowering.pendingStateOperation(node, pendingState, visitor)
		}
		if call == nil {
			call = visitor.VisitEachChild(node)
		}
		return lowering.taskHelperCall("releaseTaskResource", lowering.names.taskResourceRelease, []*ast.Node{signal, visitor.VisitNode(release.Value), call})
	}
	return nil
}

// lowerPlannedTaskResource supplies the same disposal and cancellation helpers
// to every execution path without changing the authored operation's result.
func (lowering *jsxLowering) lowerPlannedTaskResource(node, signal, context *ast.Node, visitor *ast.NodeVisitor, directServer bool, plan taskResourceLoweringPlan) *ast.Node {
	if resource, exists := plan.resources[nodeSpanKey(node)]; exists {
		return lowering.lowerTaskResource(node, resource, signal, context, visitor, directServer)
	}
	if call, exists := plan.signals[nodeSpanKey(node)]; exists {
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
