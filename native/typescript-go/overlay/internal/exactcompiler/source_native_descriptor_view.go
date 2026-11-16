package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"slices"
)

// projectNativeDescriptorView preserves the native result operator. Neither its
// input target nor a projected field is promoted to a raw/native object origin.
func projectNativeDescriptorView(view sourceNativeDescriptorView, path []string) sourceNativeDescriptorView {
	copy := cloneDescriptorRetrieval(&view.source)
	view.source = *copy
	for position := range view.inputs {
		view.inputs[position] = cloneDescriptorInputData(view.inputs[position])
	}
	view.projection = append(append([]string(nil), view.projection...), path...)
	return view
}

func sameNativeDescriptorView(a, b *sourceNativeDescriptorView) bool {
	return a == b || a != nil && b != nil && a.method == b.method && sameOperationRequest(a.delivery, b.delivery) && sameDescriptorRetrieval(&a.source, &b.source) && slices.Equal(a.projection, b.projection) && sameDescriptorInputData(a.inputs[0], b.inputs[0]) && sameDescriptorInputData(a.inputs[1], b.inputs[1])
}

// retainNativeDescriptorView transports conditional descriptor/absence and
// field provenance. It acquires no ordinary return, presence, receiver, identity
// or freshness. Consumers without a represented view rule keep their own debt.
func (q *sourceValueQuery) retainNativeDescriptorView(view sourceNativeDescriptorView, path []string, name string, mode accessorTraversal, instance bool, result *accessorCandidates, callerBindings ...sourceValueBindings) {
	if q == nil || q.owner == nil || q.owner.generation == nil || !q.owner.generation.active || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || view.source.generation != q.owner.generation {
		result.valueIncomplete = true
		return
	}
	projected := projectNativeDescriptorView(view, path)
	if name != "" {
		projected.projection = append(projected.projection, name)
	}
	result.values = append(result.values, sourceValue{descriptorView: &projected})
	result.valueIncomplete = true
	if instance || mode != accessorAcquire || len(projected.projection) != 0 {
		result.opaque = true // Strong field/call/prototype consumers cannot erase the marker.
	}
	if !instance && len(projected.projection) == 1 && (mode == accessorAcquire || mode == accessorRead || mode == accessorInvoke) {
		if !q.descriptorFieldDonors(projected, result) {
			// An unavailable input/creation projection remains compiler work. Opacity
			// cannot masquerade as a complete set of known source donors.
			if q.stagedMember != nil {
				q.stagedMember.represented = false
			}
		}
	}
	if q.calleeWriteInventory != nil {
		q.calleeWriteInventory.unknown = true
	}
}

// descriptorFieldDonors reads only original applied DATA alternatives carried
// by the view. It never evaluates the old actual AST or borrows callerBindings.
// Source creations/roles requiring a composition remain explicitly unsupported;
// already-known callable donors survive beside that unpaid source obligation.
func (q *sourceValueQuery) descriptorFieldDonors(view sourceNativeDescriptorView, result *accessorCandidates) bool {
	field := view.projection[0]
	if field != "value" && field != "get" && field != "set" {
		return true
	}
	key, keyKnown := descriptorInputLiteralKey(view.inputs[1])
	if !keyKnown {
		return false
	}
	represented := true
	for _, alternative := range view.inputs[0].alternatives {
		endpoint := alternative.endpoint
		if endpoint.kind == relativeEndpointModuleConstruction {
			// The original input DATA reader owns this detached construction and
			// its field children. A later reader never resolves its operand syntax.
			if alternative.creating != nil || len(endpoint.projection) != 0 || endpoint.creation != nil || endpoint.returning != nil {
				represented = false
				continue
			}
			fields, _, pending := moduleConstructionFieldSources(endpoint, key)
			represented = represented && !pending
			if field != "value" {
				// This construction producer admits data properties/methods only;
				// accessor syntax is explicitly pending in its original inventory.
				continue
			}
			for _, delivered := range fields {
				if !q.retainDescriptorDeliveredCallable(delivered, result) {
					represented = false
				}
			}
			continue
		}
		if alternative.creating != nil || endpoint.creation != nil || endpoint.returning != nil || len(endpoint.projection) != 0 || endpoint.kind != relativeEndpointExpression || endpoint.expression == nil || !ast.IsObjectLiteralExpression(endpoint.expression) {
			represented = false
			continue
		}
		// A module construction has no function activation to reinstall. Other
		// original source contexts need their actual published creating-role data.
		if enclosingCallableNode(endpoint.expression) != nil {
			represented = false
			continue
		}
		for _, member := range endpoint.expression.AsObjectLiteralExpression().Properties.Nodes {
			if ast.IsSpreadAssignment(member) || member.Name() == nil || ast.IsComputedPropertyName(member.Name()) {
				represented = false
				continue
			}
			if callableNameText(member.Name()) != key {
				continue
			}
			var callable *ast.Node
			switch field {
			case "value":
				if ast.IsMethodDeclaration(member) {
					callable = member
				}
				if ast.IsPropertyAssignment(member) && ast.IsFunctionLike(unwrapSourceCallableReference(member.Initializer())) {
					callable = unwrapSourceCallableReference(member.Initializer())
				}
				if ast.IsShorthandPropertyAssignment(member) || ast.IsPropertyAssignment(member) && callable == nil {
					represented = false
				}
			case "get":
				if ast.IsGetAccessorDeclaration(member) {
					callable = member
				}
			case "set":
				if ast.IsSetAccessorDeclaration(member) {
					callable = member
				}
			}
			if callable != nil {
				// This is a source callable declaration in the delivered module creation,
				// not the input object itself or a normal captured value. No reader scope
				// is attached, and its body remains dormant until an actual Call owner.
				result.values = append(result.values, sourceValue{node: callable})
			}
		}
	}
	return represented
}

func descriptorInputLiteralKey(input sourceDescriptorInputData) (string, bool) {
	key := ""
	if len(input.alternatives) == 0 {
		return "", false
	}
	for _, alternative := range input.alternatives {
		endpoint := alternative.endpoint
		if alternative.creating != nil || endpoint.kind != relativeEndpointExpression || endpoint.expression == nil || endpoint.creation != nil || endpoint.returning != nil || len(endpoint.projection) != 0 {
			return "", false
		}
		selected := sourceLiteralMemberName(unwrapSourceCallableReference(endpoint.expression))
		if selected == "" || key != "" && selected != key {
			return "", false
		}
		key = selected
	}
	return key, true
}

// retainDescriptorDeliveredCallable transports only a context-free callable
// source already supplied by a field DATA child. A creating association remains
// a typed alternative until an existing capture reader can consume that exact
// edge; dropping it or installing the later reader's bindings would lose debt.
func (q *sourceValueQuery) retainDescriptorDeliveredCallable(alternative sourceStagedOperationAlternative, result *accessorCandidates) bool {
	endpoint := alternative.endpoint
	if endpoint.kind == relativeEndpointConstructionCallable && endpoint.constructionCallable != nil && alternative.creating == nil && endpoint.creation == nil && endpoint.returning == nil && len(endpoint.projection) == 0 {
		// DATA owns the source-only Call-selection interest. Retrieval retains
		// the marker; this owner cannot materialize a raw arrow or captured B.
		q.retainConstructionCallable(endpoint.constructionCallable, nil, result)
		value := endpoint.constructionCallable
		return q.owner != nil && value.source != nil && value.source.generation == q.owner.generation && !value.pending && !value.source.unsupported
	}
	if alternative.creating != nil || endpoint.creation != nil || endpoint.returning != nil || len(endpoint.projection) != 0 || endpoint.kind != relativeEndpointExpression || endpoint.expression == nil {
		return false
	}
	if ast.IsFunctionLike(endpoint.expression) && endpoint.expression.Body() != nil {
		if enclosingCallableNode(endpoint.expression.Parent) != nil {
			return false // A local closure needs its genuine creating source reader.
		}
		result.values = append(result.values, sourceValue{node: endpoint.expression})
		return true
	}
	return stagedSourceDataValue(endpoint.expression) && !isWriterInputCallable(endpoint.expression)
}
