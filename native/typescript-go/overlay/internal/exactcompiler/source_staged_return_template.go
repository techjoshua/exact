package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedReturnTemplate describes conditional source exposure at an original
// return. It grants neither normal completion nor execution of the returned body.
// Capture declarations belong to this checker generation, never an acquired scope.
type sourceStagedReturnTemplate struct {
	declaration, returning, callable *ast.Node
	captures                         []sourceRelativeRole
	unknown                          bool
}

// describeStagedReturnTemplates uses the existing declaration walk's return
// inventory. Unsupported expressions remain explicit gaps beside known literals.
func describeStagedReturnTemplates(declaration *ast.Node, owner *sourceValueOwner) []sourceStagedReturnTemplate {
	if owner == nil || owner.checker == nil || declaration == nil || !ast.IsFunctionLike(declaration) {
		return nil
	}
	var templates []sourceStagedReturnTemplate
	for _, site := range owner.summary(declaration).returnSites {
		expression := site
		if ast.IsReturnStatement(site) {
			expression = site.Expression()
		}
		if expression == nil {
			continue
		}
		expression = unwrapSourceCallableReference(expression)
		template := sourceStagedReturnTemplate{declaration: declaration, returning: site, callable: expression}
		if !ast.IsArrowFunction(expression) && !ast.IsFunctionExpression(expression) {
			template.callable, template.unknown = nil, true
			templates = append(templates, template)
			continue
		}
		// Parameter initializers execute on later invocation and can close over
		// factory bindings or an arrow receiver just like the body.
		walkNode(expression, func(node *ast.Node) bool {
			if ast.IsPartOfTypeNode(node) {
				return false
			}
			var role sourceRelativeRole
			if node.Kind == ast.KindThisKeyword {
				// Ordinary functions obtain this at invocation. Arrows inherit the
				// nearest ordinary receiver, including through nested arrows.
				lexical := enclosingCallableNode(node)
				for lexical != nil && ast.IsArrowFunction(lexical) {
					lexical = enclosingCallableNode(lexical.Parent)
				}
				if lexical != nil && !expression.Contains(lexical) {
					role = sourceRelativeRole{kind: relativeRoleReceiver, declaration: lexical, lexical: true}
				}
			} else if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) && !isStaticPropertyName(node) {
				symbol := owner.checker.GetSymbolAtLocation(node)
				if owner.checker.IsUndefinedSymbol(symbol) {
					return true
				}
				if symbol == nil || symbol.ValueDeclaration == nil {
					template.unknown = true
					return true
				}
				binding := symbol.ValueDeclaration
				if !expression.Contains(binding) && enclosingCallableNode(binding) != nil {
					role = sourceRelativeRole{kind: relativeRoleCapture, declaration: expression, binding: binding}
				}
			}
			if role.kind != relativeRoleUnknown {
				for _, existing := range template.captures {
					if existing == role {
						return true
					}
				}
				template.captures = append(template.captures, role)
			}
			return true
		})
		templates = append(templates, template)
	}
	return templates
}

// sourceStagedReturnedCallable keeps the factory edge separate from later Call
// inputs. It is descriptive association, not an activation or exact instance ID.
type sourceStagedReturnedCallable struct {
	template sourceStagedReturnTemplate
	creating sourceRelativeBoundInputs
	endpoint sourceRelativeEndpoint
}

func instantiateStagedReturnTemplate(template sourceStagedReturnTemplate, creating sourceRelativeBoundInputs) (sourceStagedReturnedCallable, bool) {
	if template.callable == nil || template.declaration == nil || template.returning == nil || creating.declaration != template.declaration || creating.operation == nil {
		return sourceStagedReturnedCallable{}, false
	}
	copy := cloneSourceRelativeBoundInputs(creating)
	template.captures = append([]sourceRelativeRole(nil), template.captures...)
	endpoint := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: template.callable, producer: template.declaration, creation: creating.operation, returning: template.returning, cut: creating.cut}
	return sourceStagedReturnedCallable{template: template, creating: copy, endpoint: endpoint}, true
}

// stagedReturnedCaptureInput issues only a demanded capture at the later use.
// Mutable locals retain completed-activation association, including finally
// writes, as an explicit gap for the write producer. Raw binder values cannot
// close it. Formal captures select the original C0 edge through M03 D.
func stagedReturnedCaptureInput(value sourceStagedReturnedCallable, role sourceRelativeRole, use *ast.Node, projection []string) sourceRelativeInputPlan {
	gap := sourceRelativeInputPlan{unsupported: relativeInputsUnsupportedCapture, bindings: []sourceRelativeBinding{{target: role, unknown: true}}}
	found := false
	for _, capture := range value.template.captures {
		found = found || capture == role
	}
	if !found || use == nil || !ast.IsCallExpression(use) {
		return gap
	}
	if role.kind == relativeRoleReceiver && role.declaration == value.creating.declaration {
		return substituteSourceRelativeInvokedInput(value.creating, sourceRelativeRole{kind: relativeRoleReceiver, declaration: role.declaration, lexical: ast.IsArrowFunction(role.declaration)}, projection)
	}
	if role.binding != nil && ast.IsParameterDeclaration(role.binding) && enclosingCallableNode(role.binding) == value.creating.declaration {
		position := 0
		for _, parameter := range value.creating.declaration.Parameters() {
			if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
				continue
			}
			if parameter == role.binding {
				return substituteSourceRelativeInvokedInput(value.creating, sourceRelativeRole{kind: relativeRoleFormal, declaration: value.creating.declaration, slot: position}, projection)
			}
			position++
		}
	}
	endpoint := value.endpoint
	endpoint.kind, endpoint.role, endpoint.expression = relativeEndpointRole, role, nil
	endpoint.cut.use, endpoint.cut.invoking = use, use
	endpoint.projection = append([]string(nil), projection...)
	gap.bindings[0].sources = []sourceRelativeEndpoint{endpoint}
	return gap
}

// stagedReturnedOperationAlternative attaches the already registered creating
// edge. Conversion never reacquires the factory or manufactures binder delivery.
// Central work still owns eligibility, required disposition and publication.
func stagedReturnedOperationAlternative(value sourceStagedReturnedCallable, edge *sourceRelativeInputEdge) (sourceStagedOperationAlternative, bool) {
	if value.template.unknown || edge == nil || edge.request.declaration != value.creating.declaration || edge.request.operation != value.creating.operation || edge.request.use != value.creating.use || edge.request.cut != value.creating.cut {
		return sourceStagedOperationAlternative{}, false
	}
	return sourceStagedOperationAlternative{endpoint: cloneSourceRelativeEndpoint(value.endpoint), creating: edge}, true
}

// planStagedReturnedCaptureInvocation consumes an already exposed alternative at
// an actual later Call. The creating edge supplies captures while later supplies
// invocation identity only. This does not bind later parameters or its receiver.
// Unsupported capture inputs require an unhandled central disposition. In
// particular, unknown does not close a completed-activation writer obligation.
func planStagedReturnedCaptureInvocation(alternative sourceStagedOperationAlternative, demand sourceRelativeInvokedInput, later sourceRelativeInvocation, owner *sourceValueOwner) sourceRelativeInputPlan {
	gap := sourceRelativeInputPlan{unsupported: relativeInputsUnsupportedCapture, bindings: []sourceRelativeBinding{{target: demand.role, unknown: true}}}
	endpoint, edge := alternative.endpoint, alternative.creating
	if owner == nil || owner.checker == nil || edge == nil || !edge.delivered || endpoint.kind != relativeEndpointExpression || len(endpoint.projection) != 0 || endpoint.expression == nil || !ast.IsArrowFunction(endpoint.expression) && !ast.IsFunctionExpression(endpoint.expression) || endpoint.creation != edge.request.operation || endpoint.cut != edge.request.cut || endpoint.producer != edge.request.declaration || demand.kind != relativeDemandEffects || demand.role.kind != relativeRoleCapture || demand.role.declaration != endpoint.expression || demand.origin == nil || !ast.IsCallExpression(demand.origin) || enclosingCallableNode(demand.origin) != endpoint.expression || endpoint.expression.Body() == nil || !endpoint.expression.Body().Contains(demand.origin) || demand.cut.operation != demand.origin || later.declaration != endpoint.expression || later.operation == nil || !ast.IsCallExpression(later.operation) || later.operation.AsCallExpression().QuestionDotToken != nil || later.cut.operation != later.operation || later.cut.use != later.use || !sameSourceRelativeInputEnvelope(edge.request, edge.relative) {
		return gap
	}
	// The identifier must be this captured binding's actual invocation target,
	// rather than another call in the same body or a dormant reference.
	target := demand.origin.Expression()
	if !ast.IsIdentifier(target) || demand.origin.AsCallExpression().QuestionDotToken != nil || demand.origin.AsCallExpression().Arguments != nil && len(demand.origin.AsCallExpression().Arguments.Nodes) != 0 || demand.role.binding == nil {
		return gap
	}
	symbol := owner.checker.GetSymbolAtLocation(target)
	if symbol == nil || symbol.ValueDeclaration != demand.role.binding {
		return gap
	}
	for _, template := range describeStagedReturnTemplates(edge.request.declaration, owner) {
		if template.callable != endpoint.expression || template.returning != endpoint.returning || template.unknown {
			continue
		}
		value, valid := instantiateStagedReturnTemplate(template, edge.relative)
		if !valid {
			return gap
		}
		if owner.bindingWritten(symbol) {
			// Written formals also belong to the completed-activation writer
			// owner. Substituting their original C0 donor would miss finally.
			pending := value.endpoint
			pending.kind, pending.role, pending.expression = relativeEndpointRole, demand.role, nil
			pending.cut.use, pending.cut.invoking = later.operation, later.operation
			gap.bindings[0].sources = []sourceRelativeEndpoint{pending}
			return gap
		}
		return stagedReturnedCaptureInput(value, demand.role, later.operation, nil)
	}
	return gap
}

// describeStagedReturnedCaptureDemand identifies a reached zero-argument Call
// through a returned literal's captured binding. It describes source demand only.
// Central extraction decides reachability and registration. A nested dormant
// callable, default activation or argument-bearing Call stays with its owner.
func describeStagedReturnedCaptureDemand(template sourceStagedReturnTemplate, call *ast.Node, owner *sourceValueOwner) (sourceRelativeInvokedInput, bool) {
	if owner == nil || owner.checker == nil || template.callable == nil || !ast.IsArrowFunction(template.callable) && !ast.IsFunctionExpression(template.callable) || call == nil || !ast.IsCallExpression(call) || enclosingCallableNode(call) != template.callable || template.callable.Body() == nil || !template.callable.Body().Contains(call) || call.AsCallExpression().QuestionDotToken != nil || !ast.IsIdentifier(call.Expression()) || call.AsCallExpression().Arguments != nil && len(call.AsCallExpression().Arguments.Nodes) != 0 {
		return sourceRelativeInvokedInput{}, false
	}
	symbol := owner.checker.GetSymbolAtLocation(call.Expression())
	if symbol == nil {
		return sourceRelativeInvokedInput{}, false
	}
	for _, role := range template.captures {
		if role.kind == relativeRoleCapture && role.binding == symbol.ValueDeclaration {
			return sourceRelativeInvokedInput{kind: relativeDemandEffects, role: role, origin: call, cut: sourceRelativeCut{operation: call, reading: call}}, true
		}
	}
	return sourceRelativeInvokedInput{}, false
}
