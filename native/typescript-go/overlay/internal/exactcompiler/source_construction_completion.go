package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceConstructionFieldRead borrows the original source field-demand interval.
// It can refuse a completed-construction prerequisite for that field's own this
// Get. It supplies no instance, value, normal prefix or completion permission.
type sourceConstructionFieldRead struct {
	owner               *sourceValueQuery
	site, target, field *ast.Node
	inputs              *sourceValueInputs
}

// withConstructionFieldRead owns one synchronous source-demand header. Clearing
// the local header revokes retained pointers before the enclosing field returns.
func (q *sourceValueQuery) withConstructionFieldRead(site, target *ast.Node, inputs *sourceValueInputs, consume func()) {
	previousInputs, previousField := q.inputs, q.constructionFieldRead
	field := sourceConstructionFieldRead{owner: q, site: site, target: target, field: inputs.declaration, inputs: inputs}
	q.inputs, q.constructionFieldRead = inputs, &field
	if !ast.IsNewExpression(site) {
		q.constructionFieldRead = nil
	}
	defer func() {
		field = sourceConstructionFieldRead{}
		q.inputs, q.constructionFieldRead = previousInputs, previousField
	}()
	consume()
}

func (q *sourceValueQuery) sourceConstructionFieldReceiver(site, target *ast.Node) bool {
	field := q.constructionFieldRead
	if !q.dependenciesOnly || field == nil || field.owner != q || field.site != site || field.target != target || field.inputs == nil || q.inputs != field.inputs {
		return false
	}
	declaration := field.inputs.declaration
	if declaration == nil || field.field == nil || !ast.IsPropertyDeclaration(field.field) || field.field.Parent != target {
		return false
	}
	if q.protectedMember == nil || !ast.IsPropertyAccessExpression(q.protectedMember) && !ast.IsElementAccessExpression(q.protectedMember) {
		return false
	}
	receiver, _ := accessorReceiver(q.protectedMember)
	return receiver != nil && receiver.Kind == ast.KindThisKeyword && helperOwnsReceiver(receiver, declaration)
}

// enterConstructionFieldBody advances an already bound source this-call or Get.
// The original field interval remains live and owns the restoration. No body
// entry, receiver identity, default execution or normal permission is inferred.
func (q *sourceValueQuery) enterConstructionFieldBody(parent, inputs *sourceValueInputs) func() {
	field := q.constructionFieldRead
	if !q.dependenciesOnly || field == nil || field.owner != q || parent == nil || field.inputs != parent || inputs == nil || q.inputs != inputs || inputs.deferredBody || inputs.declaration == nil || inputs.declaration.Parent != field.target || ast.HasSyntacticModifier(inputs.declaration, ast.ModifierFlagsStatic) {
		return func() {}
	}
	var callee *ast.Node
	if ast.IsMethodDeclaration(inputs.declaration) {
		call := inputs.invocation
		if call == nil || !ast.IsCallExpression(call) {
			return func() {}
		}
		callee = unwrapSourceCallableReference(call.AsCallExpression().Expression)
	} else if ast.IsGetAccessorDeclaration(inputs.declaration) {
		// The Get's effect use can be an outer consumer. Keep it unchanged and
		// qualify the explicit requested member against the selected getter.
		callee = q.protectedMember
		selected := sourceCallableReferenceSymbol(callee, q.owner.checker)
		if inputs.get == nil || !field.rawReceiver(inputs.get.receiver) || selected == nil || selected != q.owner.checker.GetSymbolAtLocation(inputs.declaration.Name()) {
			return func() {}
		}
	} else {
		return func() {}
	}
	if !ast.IsPropertyAccessExpression(callee) && !ast.IsElementAccessExpression(callee) {
		return func() {}
	}
	receiver, _ := accessorReceiver(callee)
	if receiver == nil || receiver.Kind != ast.KindThisKeyword || !helperOwnsReceiver(receiver, parent.declaration) {
		return func() {}
	}
	values := inputs.bindings[0]
	if len(values) != 1 {
		return func() {}
	}
	if !field.rawReceiver(values[0]) {
		return func() {}
	}
	field.inputs = inputs
	return func() {
		if field.owner == q {
			field.inputs = parent
		}
	}
}

func (field *sourceConstructionFieldRead) rawReceiver(value sourceValue) bool {
	// The existing syntax-carrier refusal rejects every normal/adapted marker.
	// Captures and containers are also excluded from this exact raw receiver.
	return value.node == field.site && len(value.path) == 0 && value.capture == nil && value.rest == nil && value.copied == nil && !value.undefined && calleeSyntaxCarrier(value)
}

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
	// Selecting a field initializer's callee can read this same construction.
	// A nested negative proof cannot establish abruptness. Retain MAY without
	// treating the receiver, another class or any inputs as a completed instance.
	if q.provingConstructionCompletion {
		return true
	}
	q.provingConstructionCompletion = true
	defer func() { q.provingConstructionCompletion = false }()
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
