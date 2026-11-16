package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// stageFieldGetterCaptureDemand describes an actual zero-argument Call through
// an immutable enclosing formal. Creating/storing the getter issues no demand.
// The original selected Get later owns substitution of this capture role.
func stageFieldGetterCaptureDemand(fact *callableFacts, call *ast.Node, owner *executableBodyOwner) (sourceRelativeInvokedInput, bool) {
	if owner == nil || owner.values == nil || fact.normalInputs != nil || fact.initializerPlan != nil || !ast.IsFunctionLike(fact.node) || !ast.IsExternalModule(fact.sourceFile) || call == nil || !ast.IsCallExpression(call) || enclosingCallableNode(call) != fact.node || !ast.IsIdentifier(call.Expression()) || call.AsCallExpression().QuestionDotToken != nil || len(restrictedInvocationArguments(call.AsCallExpression())) != 0 {
		return sourceRelativeInvokedInput{}, false
	}
	symbol := owner.checker.GetSymbolAtLocation(call.Expression())
	if symbol == nil || symbol.ValueDeclaration == nil {
		return sourceRelativeInvokedInput{}, false
	}
	role := sourceRelativeRole{kind: relativeRoleCapture, declaration: fact.node, binding: symbol.ValueDeclaration}
	if _, ok := fieldGetterCaptureFormal(role, enclosingCallableNode(fact.node.Parent), owner); !ok {
		return sourceRelativeInvokedInput{}, false
	}
	return sourceRelativeInvokedInput{kind: relativeDemandEffects, role: role, origin: call, cut: sourceRelativeCut{operation: call, reading: call}}, true
}

// fieldGetterCaptureFormal proves a declaration-relative input association at
// the operation-owned Get. It reads no actual argument or acquired capture map.
// Written bindings, other creators and dynamic scopes need their own producer.
func fieldGetterCaptureFormal(role sourceRelativeRole, declaration *ast.Node, owner *executableBodyOwner) (sourceRelativeRole, bool) {
	if owner == nil || owner.values == nil || role.kind != relativeRoleCapture || role.binding == nil || !ast.IsParameterDeclaration(role.binding) || declaration == nil || !ast.IsFunctionLike(declaration) || enclosingCallableNode(role.binding) != declaration || role.declaration == nil || enclosingCallableNode(role.declaration.Parent) != declaration {
		return sourceRelativeRole{}, false
	}
	name := role.binding.Name()
	if name == nil || !ast.IsIdentifier(name) || name.Text() == "this" || role.binding.Initializer() != nil && stagedLexicalDefaultFunction(role.binding, declaration, owner.values) == nil || role.binding.AsParameterDeclaration().DotDotDotToken != nil {
		return sourceRelativeRole{}, false
	}
	symbol := owner.checker.GetSymbolAtLocation(name)
	source := ast.GetSourceFileOfNode(declaration)
	index := owner.values.index(source)
	if symbol == nil || symbol.ValueDeclaration != role.binding || index.incomplete || index.normalDynamicScope || owner.values.bindingWritten(symbol) {
		return sourceRelativeRole{}, false
	}
	slot := 0
	for _, parameter := range declaration.Parameters() {
		if parameter.Name() != nil && ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		if parameter == role.binding {
			return sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: slot}, true
		}
		slot++
	}
	return sourceRelativeRole{}, false
}

// fieldGetterRelativeInputs augments the real receiver B envelope with C's
// operation-owned capture-to-formal source associations. These are not observed
// capture values. Default/rest/actual vector decisions remain with the original
// outer invocation binder. Pending writers are never manufactured as unknown.
func fieldGetterRelativeInputs(bound sourceRelativeBoundInputs, demand sourceStagedFieldEffectsDemand, getter callableFacts, owner *executableBodyOwner) sourceRelativeBoundInputs {
	relative := cloneSourceRelativeBoundInputs(bound)
	for _, role := range fieldGetterCaptureSourceRoles(getter, owner) {
		if role.kind != relativeRoleCapture {
			continue
		}
		binding := sourceRelativeBinding{target: role}
		formal, ok := fieldGetterCaptureFormal(role, demand.request.producer.declaration, owner)
		if !ok {
			binding.unknown = true
			relative.unsupported = relativeInputsUnsupportedCapture
		} else {
			binding.sources = []sourceRelativeEndpoint{{kind: relativeEndpointRole, role: formal, producer: demand.request.producer.operation, get: demand.request.producer.selector.occurrence, cut: bound.cut}}
		}
		found := false
		for _, prior := range relative.bindings {
			found = found || prior.target == binding.target
		}
		if !found {
			relative.bindings = append(relative.bindings, binding)
		}
	}
	return relative
}

// fieldGetterCaptureUseMapped admits only the actual demanded Call's pure role
// substitution. Merely reading/storing an unrelated capture or projecting a
// receiver does not acquire an invocation or returned-value capability here.
func fieldGetterCaptureUseMapped(node *ast.Node, body *ast.Node, inputs *sourceRelativeInputEdge, owner *executableBodyOwner) bool {
	if inputs == nil || node == nil {
		return false
	}
	role, data := fieldGetterReturnedCaptureRole(node, body, owner)
	if !data {
		if node.Parent == nil || !ast.IsCallExpression(node.Parent) || node.Parent.Expression() != node || node.Parent.AsCallExpression().QuestionDotToken != nil || len(restrictedInvocationArguments(node.Parent.AsCallExpression())) != 0 {
			return false
		}
		symbol := owner.checker.GetSymbolAtLocation(node)
		if symbol == nil || symbol.ValueDeclaration == nil {
			return false
		}
		role = sourceRelativeRole{kind: relativeRoleCapture, declaration: body, binding: symbol.ValueDeclaration}
	}
	endpoint, mapped := fieldGetterCaptureSource(inputs.relative, role)
	return mapped && endpoint.kind == relativeEndpointRole && endpoint.role.kind == relativeRoleFormal && endpoint.role.binding == nil && len(endpoint.projection) == 0
}

// fieldGetterInvokedCapturesEligible checks original invocation source roles.
// It supplies no receiver B or capture value; the original Get still
// validates its full mapped-input envelope after binding.
func fieldGetterInvokedCapturesEligible(getter callableFacts, declaration *ast.Node, owner *executableBodyOwner) bool {
	captured := false
	for _, role := range fieldGetterCaptureSourceRoles(getter, owner) {
		if role.kind != relativeRoleCapture {
			continue
		}
		captured = true
		if _, valid := fieldGetterCaptureFormal(role, declaration, owner); !valid {
			return false
		}
	}
	return captured
}

// fieldGetterCaptureSourceDemands describes original lexical invocation roles
// before canonical body extraction. It does not issue body execution or mutate
// the canonical demand list; the selected Get still requires that summary and B.
func fieldGetterCaptureSourceDemands(getter callableFacts, owner *executableBodyOwner) []sourceRelativeInvokedInput {
	demands := append([]sourceRelativeInvokedInput(nil), getter.staged.invoked...)
	if getter.node == nil || getter.node.Body() == nil {
		return demands
	}
	walkNode(getter.node.Body(), func(node *ast.Node) bool {
		if ast.IsFunctionLike(node) {
			return false
		}
		if !ast.IsCallExpression(node) {
			return true
		}
		demand, described := stageFieldGetterCaptureDemand(&getter, node, owner)
		if described {
			for _, prior := range demands {
				if prior == demand {
					return true
				}
			}
			demands = append(demands, demand)
		}
		return true
	})
	return demands
}

// fieldGetterReturnedCaptureRole describes DATA at an original getter return
// site. Returning the enclosing formal does not issue an invocation demand.
func fieldGetterReturnedCaptureRole(node, body *ast.Node, owner *executableBodyOwner) (sourceRelativeRole, bool) {
	var empty sourceRelativeRole
	if owner == nil || owner.values == nil || node == nil || !ast.IsIdentifier(node) || body == nil || !ast.IsGetAccessorDeclaration(body) || enclosingCallableNode(node) != body {
		return empty, false
	}
	returned := false
	for _, site := range owner.values.summary(body).returnSites {
		if ast.IsReturnStatement(site) && unwrapSourceCallableReference(site.Expression()) == node {
			returned = true
		}
	}
	if !returned {
		return empty, false
	}
	symbol := owner.checker.GetSymbolAtLocation(node)
	if symbol == nil || symbol.ValueDeclaration == nil {
		return empty, false
	}
	role := sourceRelativeRole{kind: relativeRoleCapture, declaration: body, binding: symbol.ValueDeclaration}
	_, valid := fieldGetterCaptureFormal(role, enclosingCallableNode(body.Parent), owner)
	return role, valid
}

// fieldGetterCaptureSourceRoles joins source role descriptions without turning
// a DATA return into an invoked-input atom. B and required bodies remain owned
// by the original selected Get, independently of these lexical associations.
func fieldGetterCaptureSourceRoles(getter callableFacts, owner *executableBodyOwner) []sourceRelativeRole {
	var roles []sourceRelativeRole
	appendRole := func(role sourceRelativeRole) {
		for _, prior := range roles {
			if prior == role {
				return
			}
		}
		roles = append(roles, role)
	}
	for _, demand := range fieldGetterCaptureSourceDemands(getter, owner) {
		appendRole(demand.role)
	}
	if getter.node != nil && ast.IsGetAccessorDeclaration(getter.node) {
		for _, site := range owner.values.summary(getter.node).returnSites {
			if ast.IsReturnStatement(site) {
				if role, valid := fieldGetterReturnedCaptureRole(unwrapSourceCallableReference(site.Expression()), getter.node, owner); valid {
					appendRole(role)
				}
			}
		}
	}
	return roles
}

// fieldGetterCaptureSource reads a lexical DATA association without issuing or
// substituting an invoked-role demand.
func fieldGetterCaptureSource(bound sourceRelativeBoundInputs, role sourceRelativeRole) (sourceRelativeEndpoint, bool) {
	if bound.unsupported == relativeInputsSupported {
		for _, binding := range bound.bindings {
			if binding.target == role && !binding.unknown && len(binding.pending) == 0 && len(binding.sources) == 1 {
				return binding.sources[0], true
			}
		}
	}
	return sourceRelativeEndpoint{}, false
}
