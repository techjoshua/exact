package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// bindProxyTrapInputs instantiates a possible native Get trap's source demands.
// The protocol supplies an object target and property key. Their definedness
// bypasses top-level defaults without establishing a concrete Proxy result or
// nested DATA property. Only an explicit original source reference establishes
// receiver definedness. Unanchored receivers include possible undefined from
// reflective callers. Keys remain abstract property keys.
func (q *sourceValueQuery) bindProxyTrapInputs(body *ast.Node, handler sourceValue, targets []sourceValue, captures sourceValueBindings, result *accessorCandidates, definedReceiver bool) *sourceValueInputs {
	return q.bindProxyProtocolInputs(body, handler, targets, captures, result, true, true, definedReceiver)
}

// bindProxyDescriptorInputs binds the two arguments actually supplied by
// [[GetOwnProperty]]. A third authored parameter is absent and its default
// remains owned by the ordinary binder. No ordinary property Get is performed.
func (q *sourceValueQuery) bindProxyDescriptorInputs(operation, body *ast.Node, handler sourceValue, targets []sourceValue, captures sourceValueBindings, result *accessorCandidates) *sourceValueInputs {
	inputs := q.bindProxyProtocolInputs(body, handler, targets, captures, result, true, true)
	// The real selected intrinsic supplies this protocol invocation. The source
	// body consumer receives the installed binder; it must not rebind the trap
	// as if the authored Object call's receiver were the handler.
	inputs.invocation = operation
	return inputs
}

// bindProxyProtocolInputs shares the existing source-only binding owner while
// preserving each native protocol's actual vector and default-definedness.
func (q *sourceValueQuery) bindProxyProtocolInputs(body *ast.Node, handler sourceValue, targets []sourceValue, captures sourceValueBindings, result *accessorCandidates, defined ...bool) *sourceValueInputs {
	inputs := &sourceValueInputs{declaration: body, invocation: q.invoking, bindings: make(sourceValueBindings, len(captures)+1), defaults: make(map[*ast.Node]sourceDefaultInput)}
	for id, values := range captures {
		if !q.charge(result, body) {
			return inputs
		}
		inputs.bindings[id] = values
	}
	if !ast.IsArrowFunction(body) {
		inputs.bindings[0] = []sourceValue{handler}
	}
	_, ordinary := ordinaryResultCategory(body)
	inputs.deferredBody = !ordinary
	if len(targets) == 0 {
		targets = []sourceValue{{}}
	}
	actuals := make([][]sourceValue, len(defined))
	for i := range actuals {
		actuals[i] = []sourceValue{{}}
	}
	if len(actuals) != 0 {
		actuals[0] = targets
	}
	position := 0
	for _, parameter := range body.Parameters() {
		if !q.charge(result, parameter) {
			break
		}
		if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
			continue
		}
		values := []sourceValue{{undefined: true}}
		supplied := position < len(actuals)
		if supplied {
			values = actuals[position]
		}
		if parameter.AsParameterDeclaration().DotDotDotToken != nil {
			rest := make([][]sourceValue, 0)
			if supplied {
				rest = actuals[position:]
			}
			values = []sourceValue{{node: parameter.Name(), rest: rest}}
			q.installParameterInput(parameter, values, inputs, result)
			break
		}
		if supplied && defined[position] {
			// The native protocol guarantees supplied arguments, not their nested
			// properties. Pattern binding still owns all nested reads/defaults.
			q.bindDefinedParameterInput(parameter, values, inputs, result)
		} else {
			q.installParameterInput(parameter, values, inputs, result)
		}
		q.owner.substitutions += len(values)
		q.recordFacts(len(values))
		if len(values) > q.owner.maxTerms {
			q.owner.maxTerms = len(values)
		}
		position++
	}
	return inputs
}

// publishProxySourceInputs publishes the real fixed native vector after its
// final invocation is installed. Target/key source alternatives already belong
// to this protocol binder; no ordinary call receiver or actual is reacquired.
func (q *sourceValueQuery) publishProxySourceInputs(operation, site *ast.Node, handler sourceValue, inputs *sourceValueInputs, supplied int) {
	if !q.dependenciesOnly || q.operation != nil || operation == nil || !ast.IsCallExpression(operation) || site == nil || !ast.IsNewExpression(site) || inputs == nil || inputs.invocation != operation || supplied < 2 || supplied > 3 {
		return
	}
	request := sourceRelativeInvocation{operation: operation, declaration: inputs.declaration, use: q.effectUse(), cut: q.relativeInputCut(operation), actualsKnown: true}
	receiver, gap := describeRelativeBoundValues([]sourceValue{handler}, sourceRelativeRole{kind: relativeRoleReceiver, declaration: inputs.declaration}, request.cut)
	if gap != relativeInputsSupported || receiver.unknown || len(receiver.pending) != 0 || len(receiver.sources) != 1 {
		return
	}
	request.receiver = cloneSourceRelativeEndpoint(receiver.sources[0])
	target := sourceRelativeEndpoint{kind: relativeEndpointUnknown, cut: request.cut}
	if actuals := site.AsNewExpression().Arguments; actuals != nil && len(actuals.Nodes) >= 1 && !ast.IsSpreadElement(actuals.Nodes[0]) {
		target = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actuals.Nodes[0], producer: operation, cut: request.cut}
	}
	request.actuals = append(request.actuals, sourceRelativeActual{ordinal: 0, endpoint: target})
	for position := 1; position < supplied; position++ {
		request.actuals = append(request.actuals, sourceRelativeActual{ordinal: position, endpoint: sourceRelativeEndpoint{kind: relativeEndpointUnknown, cut: request.cut}})
	}
	edge := &sourceRelativeInputEdge{}
	revoke, installed := q.beginSourceRelativeInputRequest(request, edge)
	if !installed {
		return
	}
	defer revoke()
	q.publishOriginalSourceInputs(inputs)
}
