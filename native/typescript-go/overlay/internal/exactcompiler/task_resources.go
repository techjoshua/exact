package exactcompiler

import (
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
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
				Kind:        candidate.kind,
				Disposal:    candidate.disposal,
				Description: candidate.description,
				Start:       node.Pos(),
				Length:      node.End() - node.Pos(),
			})
		case "escape":
			description := candidate.description
			if description == "" {
				description = candidate.kind
			}
			diagnostics = append(
				diagnostics,
				"error: task-owned "+description+
					" escapes its task generation; return an explicit cleanup or keep the resource local",
			)
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
	if name == "" {
		return resourceCandidate{}, false
	}
	if isCanonicalResourceName(name) {
		symbol := callTargetSymbol(expression, typeChecker)
		if symbol != nil && !symbolIsOutsideSource(symbol, sourceFile) {
			return resourceCandidate{}, false
		}
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

func subscriptionDisposal(node *ast.Node, typeChecker *checker.Checker) string {
	result := typeChecker.GetTypeAtLocation(node)
	if result == nil {
		return ""
	}
	if typeChecker.TypeHasCallOrConstructSignatures(result) {
		return "call"
	}
	for _, method := range []string{"unsubscribe", "dispose"} {
		if typeChecker.GetPropertyOfType(result, method) != nil {
			return method
		}
	}
	return ""
}

func disposableResult(
	node *ast.Node,
	typeChecker *checker.Checker,
) (string, string) {
	result := typeChecker.GetTypeAtLocation(node)
	if result == nil {
		return "", ""
	}
	display := typeChecker.TypeToString(result)
	for _, method := range []string{"dispose", "asyncDispose"} {
		if typeChecker.GetPropertyOfType(result, method) != nil {
			return "", display
		}
	}
	if strings.Contains(display, "Disposable") {
		return "", display
	}
	return "", ""
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
	targetType := typeChecker.GetTypeAtLocation(call.Expression)
	if targetType == nil {
		return resourceCandidate{}, false
	}
	cleanup := ""
	owned := false
	var result *checker.Type
	for _, signature := range typeChecker.GetSignaturesOfType(
		typeChecker.GetNonNullableType(targetType),
		checker.SignatureKindCall,
	) {
		declaration := signature.Declaration()
		if declaration == nil {
			continue
		}
		declarationSource := ast.GetSourceFileOfNode(declaration)
		if declarationSource == nil {
			continue
		}
		text := sourceText(declarationSource, declaration)
		if match := exactCleanupAnnotation.FindStringSubmatch(text); len(match) == 2 {
			cleanup = match[1]
		}
		owned = owned || exactOwnAnnotation.MatchString(text)
		if cleanup != "" || owned {
			result = typeChecker.GetReturnTypeOfSignature(signature)
			break
		}
	}
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
	if result != nil && typeChecker.TypeHasCallOrConstructSignatures(result) {
		return resourceCandidate{
			kind: "owned", disposal: "call", description: "owned cleanup function",
		}, true
	}
	if _, disposable := disposableResult(node, typeChecker); disposable != "" {
		return resourceCandidate{
			kind: "owned", description: description,
		}, true
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
	declaration := enclosingVariableDeclaration(resource, work)
	if declaration == nil {
		if directTaskContextCleanup(work, resource) ||
			(candidate.disposal == "call" && directTaskCleanup(work, resource)) {
			return "explicit"
		}
		if directResourceEscape(resource) {
			return "escape"
		}
		return "owned"
	}
	name := declaration.Name()
	if name == nil || !ast.IsIdentifier(name) {
		return "escape"
	}
	symbol := typeChecker.GetSymbolAtLocation(name)
	if symbol == nil {
		return "escape"
	}
	explicit := false
	escaped := false
	walkNode(work, func(node *ast.Node) bool {
		if escaped || !ast.IsIdentifier(node) || node == name {
			return true
		}
		reference := typeChecker.GetSymbolAtLocation(node)
		if reference == nil || ast.GetSymbolId(reference) != ast.GetSymbolId(symbol) {
			return true
		}
		if explicitResourceCleanup(node, candidate.disposal) {
			explicit = true
			return true
		}
		if resourceReferenceEscapes(node, work, candidate.disposal) {
			escaped = true
		}
		return true
	})
	if escaped {
		return "escape"
	}
	if explicit {
		return "explicit"
	}
	return "owned"
}

func directTaskContextCleanup(work *ast.Node, resource *ast.Node) bool {
	parameters := work.Parameters()
	if len(parameters) == 0 {
		return false
	}
	finalName := parameters[len(parameters)-1].AsParameterDeclaration().Name()
	if finalName == nil || !ast.IsIdentifier(finalName) {
		return false
	}
	parent := resource.Parent
	for parent != nil && (ast.IsAwaitExpression(parent) ||
		ast.IsParenthesizedExpression(parent)) {
		parent = parent.Parent
	}
	if parent == nil || !ast.IsCallExpression(parent) {
		return false
	}
	target := parent.AsCallExpression().Expression
	if !ast.IsPropertyAccessExpression(target) {
		return false
	}
	access := target.AsPropertyAccessExpression()
	return access.Name().Text() == "cleanup" &&
		ast.IsIdentifier(access.Expression) &&
		access.Expression.Text() == finalName.Text()
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

func directTaskCleanup(work *ast.Node, resource *ast.Node) bool {
	if resource.Parent == work {
		return true
	}
	return resource.Parent != nil && ast.IsReturnStatement(resource.Parent) &&
		resource.Parent.Parent != nil && resource.Parent.Parent.Parent == work
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

func explicitResourceCleanup(reference *ast.Node, disposal string) bool {
	parent := reference.Parent
	if parent == nil {
		return false
	}
	if disposal == "call" && ast.IsCallExpression(parent) &&
		parent.AsCallExpression().Expression == reference {
		return true
	}
	if !ast.IsPropertyAccessExpression(parent) ||
		parent.AsPropertyAccessExpression().Expression != reference {
		return false
	}
	method := parent.AsPropertyAccessExpression().Name().Text()
	if method != disposal && method != "close" && method != "terminate" &&
		method != "unsubscribe" && method != "dispose" && method != "cancel" {
		return false
	}
	return parent.Parent != nil && ast.IsCallExpression(parent.Parent) &&
		parent.Parent.AsCallExpression().Expression == parent
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
	if ast.IsPropertyAccessExpression(parent) &&
		parent.AsPropertyAccessExpression().Expression == reference {
		return false
	}
	if disposal == "call" && ast.IsCallExpression(parent) &&
		parent.AsCallExpression().Expression == reference {
		return false
	}
	for current := parent; current != nil && current != work; current = current.Parent {
		if ast.IsReturnStatement(current) {
			return true
		}
		if isCallableNode(current) {
			continue
		}
		if ast.IsCallExpression(current) || ast.IsNewExpression(current) ||
			ast.IsBinaryExpression(current) || ast.IsPropertyAssignment(current) ||
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
	name := resourceTargetName(call.Expression)
	if name == "fetch" {
		symbol := callTargetSymbol(call.Expression, typeChecker)
		if symbolIsOutsideSource(symbol, sourceFile) {
			return TaskSignalCall{
				Parameter: 1, Mode: "options",
				Start: node.Pos(), Length: node.End() - node.Pos(),
			}, true
		}
	}
	if name != "addEventListener" || !ast.IsPropertyAccessExpression(call.Expression) {
		return signatureSignalCall(node, typeChecker)
	}
	receiver := call.Expression.AsPropertyAccessExpression().Expression
	receiverName := strings.TrimSpace(sourceText(sourceFile, receiver))
	if receiverName == "window" || receiverName == "document" ||
		receiverName == "globalThis" {
		symbol := typeChecker.GetSymbolAtLocation(receiver)
		if symbolIsOutsideSource(symbol, sourceFile) {
			return TaskSignalCall{
				Parameter: 2, Mode: "options", EventOptions: true,
				Start: node.Pos(), Length: node.End() - node.Pos(),
			}, true
		}
	}
	receiverType := typeChecker.GetTypeAtLocation(receiver)
	if receiverType != nil &&
		typeChecker.GetPropertyOfType(receiverType, "removeEventListener") != nil {
		return TaskSignalCall{
			Parameter: 2, Mode: "options",
			Start: node.Pos(), Length: node.End() - node.Pos(),
		}, true
	}
	return TaskSignalCall{}, false
}

func signatureSignalCall(
	node *ast.Node,
	typeChecker *checker.Checker,
) (TaskSignalCall, bool) {
	call := node.AsCallExpression()
	if !safeCallableTypeQuery(call.Expression) {
		return TaskSignalCall{}, false
	}
	targetType := typeChecker.GetTypeAtLocation(call.Expression)
	if targetType == nil {
		return TaskSignalCall{}, false
	}
	signatures := typeChecker.GetSignaturesOfType(
		typeChecker.GetNonNullableType(targetType),
		checker.SignatureKindCall,
	)
	arguments := call.Arguments
	argumentCount := 0
	if arguments != nil {
		argumentCount = len(arguments.Nodes)
	}
	for _, signature := range signatures {
		for index, parameter := range signature.Parameters() {
			if index >= argumentCount && signature.MinArgumentCount() > argumentCount {
				continue
			}
			parameterType := typeChecker.GetTypeOfSymbolAtLocation(parameter, call.Expression)
			if parameterType != nil {
				parameterType = typeChecker.GetNonNullableType(parameterType)
			}
			mode := ""
			if acceptsAbortSignal(parameterType, typeChecker) {
				mode = "direct"
			} else if parameterType != nil {
				signalType := typeChecker.GetTypeOfPropertyOfType(parameterType, "signal")
				if acceptsAbortSignal(signalType, typeChecker) {
					mode = "options"
				}
			}
			if mode == "" {
				continue
			}
			return TaskSignalCall{
				Parameter: index,
				Mode:      mode,
				Start:     node.Pos(),
				Length:    node.End() - node.Pos(),
			}, true
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
	display := typeChecker.TypeToString(value)
	return abortSignalType.MatchString(display) &&
		typeChecker.GetPropertyOfType(value, "signal") == nil
}
