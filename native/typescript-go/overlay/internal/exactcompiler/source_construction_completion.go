package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceInitializerMayComplete uses the canonical selected-input relation and
// existing body completion projection. Unmodeled expressions and unknown targets
// retain a possible normal continuation. No execution receipt is established.
func (q *sourceValueQuery) sourceInitializerMayComplete(node *ast.Node, bindings sourceValueBindings) bool {
	node = unwrapSourceCallableReference(node)
	if node == nil || !ast.IsCallExpression(node) {
		return true
	}
	selected, body, normal := false, false, false
	q.consumeInvocation(node, bindings, sourceInvocationConsumer{
		selection: func(complete bool) { selected = complete },
		body: func(target *ast.Node, captures sourceValueBindings, inputs *sourceValueInputs, invocation *ast.Node, result *accessorCandidates) {
			body = true
			previous := q.inputs
			q.inputs = inputs
			defer func() { q.inputs = previous; releaseNormalOperations(inputs) }()
			async, ordinary := ordinaryResultCategory(target)
			if async || !ordinary {
				normal = true
				return
			}
			outcomes := q.completionFor(target.Body(), captures, true).outcomes
			normal = normal || outcomes&(sourceReturnNormal|sourceReturnValue|sourceReturnUnknown) != 0
		},
		resolver:     func(*ast.Node, []*ast.Node, bool, sourceValueBindings, *accessorCandidates) { normal = true },
		native:       func(*sourceNativeInvocation, *accessorCandidates) { normal = true },
		construction: func(sourceInvocationBody, *accessorCandidates) { normal = true },
	})
	return !selected || !body || normal
}

// A definitely abrupt field prefix prevents every subsequent value consumer.
// This does not issue an instance or a Normal-completion capability.
func (q *sourceValueQuery) sourceConstructionFieldsMayComplete(target *ast.Node, bindings sourceValueBindings) bool {
	// Decorator replacement remains an independent possible continuation.
	if ast.HasDecorators(target) {
		return true
	}
	if constructor := ast.GetFirstConstructorWithBody(target); constructor != nil {
		outcomes := q.completionFor(constructor.Body(), bindings, true).outcomes
		if outcomes&(sourceReturnNormal|sourceReturnValue|sourceReturnUnknown) == 0 {
			return false
		}
	}
	for _, member := range target.Members() {
		if !q.charge(&accessorCandidates{}, member) {
			return true
		}
		if ast.IsPropertyDeclaration(member) && !ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) && !q.sourceInitializerMayComplete(member.Initializer(), bindings) {
			return false
		}
	}
	return true
}

// Only ordinary function declarations and expressions have [[Construct]].
// Arrow, method, async and generator bodies are deferred or nonconstructible.
func sourceFunctionConstructible(target *ast.Node) bool {
	if !ast.IsFunctionDeclaration(target) && !ast.IsFunctionExpression(target) {
		return false
	}
	async, ordinary := ordinaryResultCategory(target)
	return !async && ordinary
}
