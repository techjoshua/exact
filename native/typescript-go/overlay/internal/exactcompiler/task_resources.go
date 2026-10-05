package exactcompiler

import (
	"regexp"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

var exactOwnAnnotation = regexp.MustCompile(`@exact\s+own(?:\s|[*\/]|$)`)
var exactCleanupAnnotation = regexp.MustCompile(
	`@exact\s+cleanup(?:\s*=\s*|\s+)([A-Za-z_$][A-Za-z0-9_$]*)`,
)
var exactCleanupMarker = regexp.MustCompile(`@exact\s+cleanup(?:\s|[*\/]|$)`)
var abortSignalType = regexp.MustCompile(`(?:^|\W)AbortSignal(?:$|\W)`)

type resourceCandidate struct {
	kind        string
	disposal    string
	description string
}

// collectTaskResources identifies compiler-owned cancellation and disposal
// sites inside one task generation. Explicit cleanup remains authored and an
// escaping owned value is diagnosed rather than silently extending its life.
func collectTaskResources(
	work *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) ([]TaskResource, []TaskSignalCall, []string) {
	resources := []TaskResource{}
	signalCalls := []TaskSignalCall{}
	diagnostics := []string{}
	walkNode(work, func(node *ast.Node) bool {
		if node != work && isCallableNode(node) && taskResourceCleanupCallable(node, work, typeChecker) {
			cleanupSignals, cleanupDiagnostics := collectTaskCleanupResources(node, sourceFile, typeChecker)
			signalCalls = append(signalCalls, cleanupSignals...)
			diagnostics = append(diagnostics, cleanupDiagnostics...)
			return false
		}
		if ast.IsCallExpression(node) {
			if signal, ok := taskSignalCall(node, sourceFile, typeChecker); ok {
				signalCalls = append(signalCalls, signal)
			}
		}
		candidate, ok := taskResourceCandidate(node, sourceFile, typeChecker)
		if !ok {
			return true
		}
		ownership := taskResourceOwnership(work, node, candidate, typeChecker)
		switch ownership {
		case "owned":
			resources = append(resources, TaskResource{
				ReleaseCalls: taskResourceReleaseCalls(work, node, candidate, typeChecker),
				Kind:         candidate.kind,
				Disposal:     candidate.disposal,
				Description:  candidate.description,
				Start:        node.Pos(),
				Length:       node.End() - node.Pos(),
			})
		case "escape", "unproven":
			description := candidate.description
			if description == "" {
				description = candidate.kind
			}
			message := "error: task-owned " + description + " escapes its task generation. Keep the resource local or move it to a deliberately longer-lived owner"
			if ownership == "unproven" {
				message = "error: task-owned " + description + " has unproven ownership in a compound initializer. Keep the resource in a direct local binding, or create and register a Disposable or AsyncDisposable inside a helper using the task context"
			}
			diagnostics = append(diagnostics, message)
		}
		return true
	})
	return resources, signalCalls, diagnostics
}

func taskResourceCandidate(
	node *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) (resourceCandidate, bool) {
	expression := resourceTarget(node)
	if expression == nil {
		return resourceCandidate{}, false
	}
	name := resourceTargetName(expression)
	native := taskNativeResourceName(expression, typeChecker)
	if native != "" {
		name = native
	} else if isCanonicalResourceName(name) {
		// A custom factory may share a platform name. Its typed or annotated
		// ownership contract still applies, without native API rewriting.
		name = ""
	}
	if ast.IsNewExpression(node) {
		switch name {
		case "MutationObserver", "ResizeObserver", "IntersectionObserver":
			return resourceCandidate{kind: "observer"}, true
		case "WebSocket", "EventSource", "BroadcastChannel":
			return resourceCandidate{
				kind: "owned", disposal: "close", description: name,
			}, true
		case "Worker":
			return resourceCandidate{
				kind: "owned", disposal: "terminate", description: name,
			}, true
		}
		if disposal, description := disposableResult(node, typeChecker); disposal != "" ||
			description != "" {
			return resourceCandidate{
				kind: "owned", disposal: disposal, description: description,
			}, true
		}
		return resourceCandidate{}, false
	}
	switch name {
	case "setTimeout":
		return resourceCandidate{kind: "timeout"}, true
	case "setInterval":
		return resourceCandidate{kind: "interval"}, true
	case "requestAnimationFrame":
		return resourceCandidate{kind: "animation-frame"}, true
	case "requestIdleCallback":
		return resourceCandidate{kind: "idle-callback"}, true
	case "fetch":
		return resourceCandidate{kind: "fetch"}, true
	case "subscribe":
		disposal := subscriptionDisposal(node, typeChecker)
		if disposal != "" {
			return resourceCandidate{
				kind: "owned", disposal: disposal, description: "subscription",
			}, true
		}
	}
	if annotated, ok := annotatedOwnedResource(node, typeChecker); ok {
		return annotated, true
	}
	return resourceCandidate{}, false
}

func resourceTarget(node *ast.Node) *ast.Node {
	if ast.IsCallExpression(node) {
		return node.AsCallExpression().Expression
	}
	if ast.IsNewExpression(node) {
		return node.AsNewExpression().Expression
	}
	return nil
}

func resourceTargetName(expression *ast.Node) string {
	if ast.IsPropertyAccessExpression(expression) {
		name := expression.AsPropertyAccessExpression().Name()
		if name != nil {
			return name.Text()
		}
	}
	if ast.IsIdentifier(expression) {
		return expression.Text()
	}
	return ""
}

func isCanonicalResourceName(name string) bool {
	switch name {
	case "MutationObserver", "ResizeObserver", "IntersectionObserver",
		"WebSocket", "EventSource", "BroadcastChannel", "Worker",
		"setTimeout", "setInterval", "requestAnimationFrame",
		"requestIdleCallback", "fetch":
		return true
	default:
		return false
	}
}

func annotatedOwnedResource(
	node *ast.Node,
	typeChecker *checker.Checker,
) (resourceCandidate, bool) {
	if !ast.IsCallExpression(node) {
		return resourceCandidate{}, false
	}
	call := node.AsCallExpression()
	if !safeCallableTypeQuery(call.Expression) {
		return resourceCandidate{}, false
	}
	signature := typeChecker.GetResolvedSignature(node)
	if signature == nil || signature.Declaration() == nil {
		return resourceCandidate{}, false
	}
	declaration := signature.Declaration()
	declarationSource := ast.GetSourceFileOfNode(declaration)
	if declarationSource == nil {
		return resourceCandidate{}, false
	}
	text := sourceText(declarationSource, declaration)
	cleanup := ""
	if match := exactCleanupAnnotation.FindStringSubmatch(text); len(match) == 2 {
		cleanup = match[1]
	}
	owned := exactOwnAnnotation.MatchString(text)
	result := typeChecker.GetReturnTypeOfSignature(signature)
	if cleanup == "" && !owned {
		return resourceCandidate{}, false
	}
	description := "annotated resource"
	if result != nil {
		description = typeChecker.TypeToString(result)
	}
	if cleanup != "" {
		return resourceCandidate{
			kind: "owned", disposal: cleanup, description: description,
		}, true
	}
	if result != nil {
		if cleanup = annotatedCleanupMethod(result, typeChecker); cleanup != "" {
			return resourceCandidate{
				kind: "owned", disposal: cleanup, description: description,
			}, true
		}
	}
	if result != nil && len(typeChecker.GetSignaturesOfType(result, checker.SignatureKindCall)) != 0 {
		return resourceCandidate{
			kind: "owned", disposal: "call", description: "owned cleanup function",
		}, true
	}
	if disposal, disposable := disposableResult(node, typeChecker); disposable != "" || disposal != "" {
		return resourceCandidate{kind: "owned", disposal: disposal, description: description}, true
	}
	return resourceCandidate{}, false
}

func annotatedCleanupMethod(
	result *checker.Type,
	typeChecker *checker.Checker,
) string {
	for _, property := range typeChecker.GetPropertiesOfType(result) {
		for _, declaration := range property.Declarations {
			declarationSource := ast.GetSourceFileOfNode(declaration)
			if declarationSource != nil &&
				exactCleanupMarker.MatchString(sourceText(declarationSource, declaration)) {
				return property.Name
			}
		}
	}
	return ""
}

func taskResourceOwnership(
	work *ast.Node,
	resource *ast.Node,
	candidate resourceCandidate,
	typeChecker *checker.Checker,
) string {
	if directTaskContextCleanup(work, resource, typeChecker) {
		return "explicit"
	}
	registration := taskContextResourceRegistration(work, resource, typeChecker, "own")
	value := resource
	if registration != nil {
		value = registration
	}
	for current := value.Parent; current != nil && current != work; current = current.Parent {
		if ast.IsVariableDeclaration(current) || isCallableNode(current) {
			break
		}
		if ast.IsCallExpression(current) || ast.IsNewExpression(current) {
			return "escape"
		}
	}
	declaration := enclosingVariableDeclaration(value, work)
	if declaration != nil && (ast.IsVarUsing(declaration) || ast.IsVarAwaitUsing(declaration)) {
		return "explicit"
	}
	if declaration == nil {
		if directResourceEscape(value) {
			return "escape"
		}
		if registration != nil {
			return "explicit"
		}
		return "owned"
	}
	initializer := unwrapRenderExpression(declaration.AsVariableDeclaration().Initializer)
	for ast.IsAwaitExpression(initializer) {
		initializer = unwrapRenderExpression(initializer.AsAwaitExpression().Expression)
	}
	if initializer != value {
		return "unproven"
	}
	name := declaration.Name()
	if name == nil || !ast.IsIdentifier(name) {
		return "escape"
	}
	references, proven := taskResourceLocalReferences(work, name, typeChecker)
	if !proven {
		return "escape"
	}
	explicit := registration != nil
	escaped := false
	for _, node := range references {
		if taskResourceReturnedCapture(node, work, typeChecker) {
			escaped = true
			break
		}
		if taskContextResourceRegistration(work, node, typeChecker, "own") != nil {
			continue
		}
		if taskNativeResourceReleaseReference(node, candidate, typeChecker) {
			continue
		}
		if explicitResourceCleanup(node, candidate.disposal, typeChecker) {
			continue
		}
		if resourceReferenceEscapes(node, work, candidate.disposal) {
			escaped = true
			break
		}
	}
	if escaped {
		return "escape"
	}
	if explicit {
		return "explicit"
	}
	return "owned"
}

func directTaskContextCleanup(work *ast.Node, resource *ast.Node, typeChecker *checker.Checker) bool {
	return taskContextResourceRegistration(work, resource, typeChecker, "cleanup") != nil
}

// Registration preserves the current generation's ownership. An own() result
// remains the original value, so its result still needs normal escape analysis.
func taskContextResourceRegistration(work, resource *ast.Node, typeChecker *checker.Checker, method string) *ast.Node {
	parameters := work.Parameters()
	if len(parameters) == 0 {
		return nil
	}
	finalName := parameters[len(parameters)-1].AsParameterDeclaration().Name()
	if finalName == nil || !ast.IsIdentifier(finalName) {
		return nil
	}
	argument := resource
	for argument.Parent != nil && (ast.IsParenthesizedExpression(argument.Parent) || ast.IsAsExpression(argument.Parent) || ast.IsNonNullExpression(argument.Parent) || ast.IsSatisfiesExpression(argument.Parent) || (method == "cleanup" && ast.IsAwaitExpression(argument.Parent))) {
		argument = argument.Parent
	}
	parent := argument.Parent
	if parent == nil || !ast.IsCallExpression(parent) || len(parent.AsCallExpression().Arguments.Nodes) != 1 || parent.AsCallExpression().Arguments.Nodes[0] != argument {
		return nil
	}
	target := parent.AsCallExpression().Expression
	var receiver *ast.Node
	name := ""
	if ast.IsPropertyAccessExpression(target) {
		access := target.AsPropertyAccessExpression()
		receiver, name = access.Expression, access.Name().Text()
	} else if ast.IsElementAccessExpression(target) {
		access := target.AsElementAccessExpression()
		key := unwrapRenderExpression(access.ArgumentExpression)
		if ast.IsStringLiteral(key) || ast.IsNoSubstitutionTemplateLiteral(key) {
			receiver, name = access.Expression, key.Text()
		}
	}
	if name != method || !ast.IsIdentifier(receiver) {
		return nil
	}
	expected := typeChecker.GetSymbolAtLocation(finalName)
	actual := typeChecker.GetSymbolAtLocation(receiver)
	if expected != nil && actual != nil && ast.GetSymbolId(expected) == ast.GetSymbolId(actual) {
		return parent
	}
	return nil
}

func enclosingVariableDeclaration(node *ast.Node, work *ast.Node) *ast.Node {
	for current := node.Parent; current != nil && current != work; current = current.Parent {
		if ast.IsVariableDeclaration(current) {
			return current
		}
		if isCallableNode(current) {
			break
		}
	}
	return nil
}

func directResourceEscape(resource *ast.Node) bool {
	parent := resource.Parent
	for parent != nil && (ast.IsAwaitExpression(parent) ||
		ast.IsParenthesizedExpression(parent)) {
		parent = parent.Parent
	}
	if parent == nil {
		return true
	}
	if ast.IsExpressionStatement(parent) {
		return false
	}
	if ast.IsPropertyAccessExpression(parent) &&
		parent.AsPropertyAccessExpression().Expression == resource {
		return false
	}
	return true
}

func resourceReferenceEscapes(
	reference *ast.Node,
	work *ast.Node,
	disposal string,
) bool {
	parent := reference.Parent
	if parent == nil {
		return true
	}
	if (ast.IsPropertyAccessExpression(parent) && parent.AsPropertyAccessExpression().Expression == reference) ||
		(ast.IsElementAccessExpression(parent) && parent.AsElementAccessExpression().Expression == reference) {
		return false
	}
	if disposal == "call" && ast.IsCallExpression(parent) &&
		parent.AsCallExpression().Expression == reference {
		return false
	}
	for current := parent; current != nil && current != work; current = current.Parent {
		if ast.IsTypeOfExpression(current) || ast.IsVoidExpression(current) ||
			(ast.IsPrefixUnaryExpression(current) && current.AsPrefixUnaryExpression().Operator == ast.KindExclamationToken) {
			// These operations consume a reference and expose only a primitive.
			// Captured callbacks are checked before their result flow reaches here.
			return false
		}
		if ast.IsReturnStatement(current) {
			return true
		}
		if isCallableNode(current) {
			continue
		}
		if ast.IsBinaryExpression(current) {
			// Strict comparison consumes identity and returns a Boolean. Its result
			// cannot transfer this resource through an enclosing assignment or call.
			switch current.AsBinaryExpression().OperatorToken.Kind {
			case ast.KindEqualsEqualsEqualsToken, ast.KindExclamationEqualsEqualsToken:
				return false
			}
		}
		if ast.IsCallExpression(current) || ast.IsNewExpression(current) ||
			ast.IsBinaryExpression(current) || ast.IsPropertyAssignment(current) || ast.IsShorthandPropertyAssignment(current) ||
			ast.IsArrayLiteralExpression(current) {
			return true
		}
	}
	return false
}

func taskSignalCall(
	node *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) (TaskSignalCall, bool) {
	if !ast.IsCallExpression(node) {
		return TaskSignalCall{}, false
	}
	call := node.AsCallExpression()
	if taskNativeResourceName(call.Expression, typeChecker) == "fetch" {
		return TaskSignalCall{
			Parameter: 1, Mode: "options",
			Start: node.Pos(), Length: node.End() - node.Pos(),
		}, true
	}
	return signatureSignalCall(node, typeChecker)
}

// signatureSignalCall uses the selected overload, so unrelated signatures cannot
// authorize injecting an argument into the authored call. Event option unions
// retain the native Boolean capture alternative through the event-specific helper.
func signatureSignalCall(node *ast.Node, typeChecker *checker.Checker) (TaskSignalCall, bool) {
	call := node.AsCallExpression()
	if !safeCallableTypeQuery(call.Expression) {
		return TaskSignalCall{}, false
	}
	signature := typeChecker.GetResolvedSignature(node)
	if signature == nil {
		return TaskSignalCall{}, false
	}
	argumentCount := 0
	if call.Arguments != nil {
		argumentCount = len(call.Arguments.Nodes)
	}
	for index, parameter := range signature.Parameters() {
		if index >= argumentCount && signature.MinArgumentCount() > argumentCount {
			continue
		}
		parameterType := typeChecker.GetTypeOfSymbolAtLocation(parameter, call.Expression)
		if parameterType == nil {
			continue
		}
		parameterType = typeChecker.GetNonNullableType(parameterType)
		if acceptsAbortSignal(parameterType, typeChecker) {
			return TaskSignalCall{Parameter: index, Mode: "direct", Start: node.Pos(), Length: node.End() - node.Pos()}, true
		}
		members := []*checker.Type{parameterType}
		if parameterType.Flags()&checker.TypeFlagsUnion != 0 {
			members = parameterType.Types()
		}
		options, capture := false, false
		for _, member := range members {
			capture = capture || member.Flags()&checker.TypeFlagsBooleanLike != 0
			options = options || acceptsAbortSignal(typeChecker.GetTypeOfPropertyOfType(member, "signal"), typeChecker)
		}
		if options {
			return TaskSignalCall{Parameter: index, Mode: "options", EventOptions: capture && index == 2 && resourceTargetName(call.Expression) == "addEventListener", Start: node.Pos(), Length: node.End() - node.Pos()}, true
		}
	}
	return TaskSignalCall{}, false
}

func safeCallableTypeQuery(expression *ast.Node) bool {
	if ast.IsIdentifier(expression) {
		return true
	}
	if !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	return ast.IsIdentifier(expression.AsPropertyAccessExpression().Expression)
}

func acceptsAbortSignal(value *checker.Type, typeChecker *checker.Checker) bool {
	if value == nil {
		return false
	}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		for _, member := range value.Types() {
			if member.Flags()&(checker.TypeFlagsUndefined|checker.TypeFlagsNull) == 0 && !acceptsAbortSignal(member, typeChecker) {
				return false
			}
		}
		return true
	}
	display := typeChecker.TypeToString(value)
	return abortSignalType.MatchString(display) &&
		typeChecker.GetPropertyOfType(value, "signal") == nil
}
