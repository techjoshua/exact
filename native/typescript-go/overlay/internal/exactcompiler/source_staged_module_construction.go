package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedModuleConstruction describes only original static construction
// operands. It is neither a current object nor an initializer execution receipt.
// Unsupported siblings remain in the inventory and keep extraction pending.
type sourceStagedModuleConstruction struct {
	localOwner                   *ast.Node
	creationEffects              sourceStagedOperationRequest
	scalar                       *sourceRelativeEndpoint
	scalarCallable               *sourceConstructionCallableSource
	request                      sourceStagedOperationRequest
	binding, initializer, module *ast.Node
	generation                   *projectGeneration
	fields                       []sourceStagedModuleConstructionField
	unsupported                  bool
}
type sourceStagedModuleConstructionField struct {
	callable          *sourceConstructionCallableSource
	property, operand *ast.Node
	name              string
	ordinal           int
	required          sourceStagedOperationRequest
	literal           *sourceRelativeEndpoint
}

// A value is the conditional DATA delivered by the original operand producers.
// It retains real creating associations verbatim; a module cell has no invented
// creating activation. Currentness belongs to the containing operation/reader.
type sourceStagedModuleConstructionValue struct {
	source  *sourceStagedModuleConstruction
	fields  []sourceStagedModuleConstructionFieldValue
	pending bool
}
type sourceStagedModuleConstructionFieldValue struct {
	ordinal      int
	alternatives []sourceStagedOperationAlternative
	pending      bool
}

func cloneModuleConstruction(s *sourceStagedModuleConstruction) *sourceStagedModuleConstruction {
	if s == nil {
		return nil
	}
	c := *s
	c.scalarCallable = cloneConstructionCallableSource(s.scalarCallable)
	if s.scalar != nil {
		e := cloneSourceRelativeEndpoint(*s.scalar)
		c.scalar = &e
	}
	c.fields = append([]sourceStagedModuleConstructionField(nil), s.fields...)
	for i := range c.fields {
		c.fields[i].callable = cloneConstructionCallableSource(s.fields[i].callable)
		if s.fields[i].literal != nil {
			e := cloneSourceRelativeEndpoint(*s.fields[i].literal)
			c.fields[i].literal = &e
		}
	}
	return &c
}
func sameModuleConstruction(a, b *sourceStagedModuleConstruction) bool {
	if a == b {
		return true
	}
	if a == nil || b == nil || !sameOperationRequest(a.request, b.request) || a.localOwner != b.localOwner || !sameOperationRequest(a.creationEffects, b.creationEffects) || !sameConstructionCallableSource(a.scalarCallable, b.scalarCallable) || (a.scalar == nil) != (b.scalar == nil) || a.scalar != nil && !sameOperationEndpoint(*a.scalar, *b.scalar) || a.binding != b.binding || a.initializer != b.initializer || a.module != b.module || a.generation != b.generation || a.unsupported != b.unsupported || len(a.fields) != len(b.fields) {
		return false
	}
	for i, x := range a.fields {
		y := b.fields[i]
		if !sameConstructionCallableSource(x.callable, y.callable) || x.property != y.property || x.operand != y.operand || x.name != y.name || x.ordinal != y.ordinal || !sameOperationRequest(x.required, y.required) || (x.literal == nil) != (y.literal == nil) {
			return false
		}
		if x.literal != nil && !sameOperationEndpoint(*x.literal, *y.literal) {
			return false
		}
	}
	return true
}
func cloneModuleConstructionValue(v *sourceStagedModuleConstructionValue) *sourceStagedModuleConstructionValue {
	if v == nil {
		return nil
	}
	c := *v
	c.source = cloneModuleConstruction(v.source)
	c.fields = append([]sourceStagedModuleConstructionFieldValue(nil), v.fields...)
	for i := range c.fields {
		delta := cloneOperationDelta(sourceStagedOperationDelta{exposures: v.fields[i].alternatives})
		c.fields[i].alternatives = delta.exposures
	}
	return &c
}
func sameModuleConstructionValue(a, b *sourceStagedModuleConstructionValue) bool {
	if a == b {
		return true
	}
	if a == nil || b == nil || a.pending != b.pending || !sameModuleConstruction(a.source, b.source) || len(a.fields) != len(b.fields) {
		return false
	}
	for i, x := range a.fields {
		y := b.fields[i]
		if x.ordinal != y.ordinal || x.pending != y.pending || !operationPrefix(x.alternatives, y.alternatives, sameOperationAlternative) || !operationPrefix(y.alternatives, x.alternatives, sameOperationAlternative) {
			return false
		}
	}
	return true
}

func describeModuleConstruction(binding, read, caller *ast.Node, owner *executableBodyOwner) *sourceStagedModuleConstruction {
	module := stagedBindingModuleOwner(binding, caller)
	if module == nil || owner == nil || owner.project == nil || owner.values == nil || owner.values.generation == nil || !owner.values.generation.active || owner.project.activeGeneration != owner.values.generation || stagedBindingDataDeclaration(read, caller, owner) != binding || !ast.IsObjectLiteralExpression(binding.Initializer()) {
		return nil
	}
	result := &sourceStagedModuleConstruction{request: stagedBindingResultRequest(read, caller), binding: binding, initializer: binding.Initializer(), module: module, generation: owner.values.generation}
	describeConstructionFields(result, owner)
	return result
}
func describeConstructionFields(result *sourceStagedModuleConstruction, owner *executableBodyOwner) {
	seen := make(map[string]bool)
	for ordinal, property := range result.initializer.AsObjectLiteralExpression().Properties.Nodes {
		name := property.Name()
		if name == nil || ast.IsComputedPropertyName(name) || (!ast.IsIdentifier(name) && !ast.IsStringLiteralLike(name)) {
			result.unsupported = true
			continue
		}
		key := name.Text()
		if key == "" || key == "__proto__" || seen[key] {
			result.unsupported = true
			continue
		}
		seen[key] = true
		var operand *ast.Node
		if ast.IsPropertyAssignment(property) {
			operand = property.AsPropertyAssignment().Initializer
		} else if ast.IsMethodDeclaration(property) {
			operand = property
		} else {
			result.unsupported = true
			continue
		}
		field := sourceStagedModuleConstructionField{property: property, operand: operand, name: key, ordinal: ordinal}
		if result.localOwner != nil && isWriterInputCallable(operand) {
			field.callable = describeLocalConstructionCallable(operand, result.initializer, result.localOwner, owner.values)
			if field.callable != nil {
				field.callable.parent = result.request
			}
			if field.callable == nil || field.callable.unsupported {
				result.unsupported = true
			}
		} else if stagedSourceDataValue(operand) && !stagedCallReturnLiteralHasCapture(operand, owner.values) {
			endpoint := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: operand, producer: property, get: operand, cut: sourceRelativeCut{operation: operand, use: operand, reading: operand}}
			field.literal = &endpoint
		} else if stagedDataSourceExpression(operand) {
			fieldOwner := result.module
			if result.localOwner != nil {
				fieldOwner = result.localOwner
			}
			field.required = stagedResultSourceRequest(operand, fieldOwner, nil)
		} else {
			result.unsupported = true
		}
		result.fields = append(result.fields, field)
	}
}
func moduleConstructionRequired(s *sourceStagedModuleConstruction) []sourceStagedOperationRequest {
	var required []sourceStagedOperationRequest
	if s.creationEffects.producer.operation != nil {
		required = appendEntryLawRequirement(required, s.creationEffects)
	}
	addCaptures := func(callable *sourceConstructionCallableSource) {
		if callable != nil {
			for _, capture := range callable.captures {
				required = appendEntryLawRequirement(required, capture.required)
			}
		}
	}
	addCaptures(s.scalarCallable)
	for _, field := range s.fields {
		addCaptures(field.callable)
		if field.required.producer.operation != nil {
			required = appendEntryLawRequirement(required, field.required)
		}
	}
	return required
}
func validModuleConstructionBindingRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	if source == nil || source.moduleConstruction == nil || source.binding == nil {
		return false
	}
	s := source.moduleConstruction
	if s.binding != source.binding || s.initializer != source.binding.Initializer() || s.module != stagedBindingModuleOwner(source.binding, recipe.key.declaration) || s.generation != source.generation || !sameOperationRequest(s.request, source.request) || !ast.IsObjectLiteralExpression(s.initializer) {
		return false
	}
	properties := s.initializer.AsObjectLiteralExpression().Properties.Nodes
	if len(s.fields) != len(properties) && !s.unsupported {
		return false
	}
	seen := make(map[string]bool)
	for _, field := range s.fields {
		if field.ordinal < 0 || field.ordinal >= len(properties) || properties[field.ordinal] != field.property || field.property.Name() == nil || ast.IsComputedPropertyName(field.property.Name()) || field.name != field.property.Name().Text() || field.name == "__proto__" || seen[field.name] {
			return false
		}
		seen[field.name] = true
		var operand *ast.Node
		if ast.IsPropertyAssignment(field.property) {
			operand = field.property.AsPropertyAssignment().Initializer
		} else if ast.IsMethodDeclaration(field.property) {
			operand = field.property
		} else {
			return false
		}
		if field.operand != operand {
			return false
		}
		if field.literal != nil {
			expected := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: operand, producer: field.property, get: operand, cut: sourceRelativeCut{operation: operand, use: operand, reading: operand}}
			if !stagedSourceDataValue(operand) || field.required.producer.operation != nil || !sameOperationEndpoint(*field.literal, expected) {
				return false
			}
		} else if field.required.producer.operation != nil {
			if !stagedDataSourceExpression(operand) || !sameOperationRequest(field.required, stagedResultSourceRequest(operand, s.module, nil)) {
				return false
			}
		} else if !s.unsupported {
			return false
		}
	}
	required := moduleConstructionRequired(s)
	if operationDeltaSize(recipe.delta) == 0 {
		return !recipe.delta.extracted
	}
	if !operationPrefix(required, recipe.delta.required, sameOperationRequest) || !operationPrefix(recipe.delta.required, required, sameOperationRequest) {
		return false
	}
	if len(recipe.delta.exposures) == 0 {
		return !recipe.delta.extracted
	}
	if len(recipe.delta.exposures) != 1 {
		return false
	}
	e := recipe.delta.exposures[0]
	v := e.endpoint.moduleConstruction
	if e.creating != nil || e.endpoint.kind != relativeEndpointModuleConstruction || e.endpoint.expression != nil || e.endpoint.producer != source.binding || e.endpoint.get != recipe.key.operation || e.endpoint.cut != source.request.cut || v == nil || !sameModuleConstruction(v.source, s) || len(v.fields) != len(s.fields) || recipe.delta.extracted == v.pending {
		return false
	}
	if s.unsupported && !v.pending {
		return false
	}
	for i, field := range s.fields {
		value := v.fields[i]
		if value.ordinal != field.ordinal {
			return false
		}
		if value.pending && !v.pending {
			return false
		}
		if field.literal != nil {
			if value.pending || len(value.alternatives) != 1 || value.alternatives[0].creating != nil || !sameOperationEndpoint(value.alternatives[0].endpoint, *field.literal) {
				return false
			}
		}
	}
	return true
}

// prepareModuleConstructionBinding runs inside the existing original binding
// producer after its canonical initializer/module requirement has been enrolled.
// All field requests join the unsealed prefix before any completed payload.
func (work *callableEffectWork) prepareModuleConstructionBinding(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	source := recipe.callResult
	if source == nil || source.moduleConstruction == nil || !sameModuleConstruction(source.moduleConstruction, describeModuleConstruction(source.binding, recipe.key.operation, recipe.key.declaration, owner)) {
		return
	}
	s := source.moduleConstruction
	producer, known := work.memberNodes[s.module]
	publisher := owner.pendingMemberPublishers[s.module]
	if !known || publisher == nil || !publisher.live || publisher.fact != &facts[producer] || source.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration {
		return
	}
	value := &sourceStagedModuleConstructionValue{source: cloneModuleConstruction(s), pending: s.unsupported}
	delta := sourceStagedOperationDelta{required: moduleConstructionRequired(s)}
	waiting := false
	for _, field := range s.fields {
		output := sourceStagedModuleConstructionFieldValue{ordinal: field.ordinal}
		if field.literal != nil {
			output.alternatives = []sourceStagedOperationAlternative{{endpoint: cloneSourceRelativeEndpoint(*field.literal)}}
		} else if field.required.producer.operation != nil {
			child, supported := work.describeStagedCallResultSource(facts, producer, field.operand, owner)
			if !supported || !sameOperationRequest(child.request, field.required) {
				return // No named child without a genuine semantic factory.
			} else {
				if _, registered := work.operationRecipes[child.request.producer]; !registered {
					if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: child.request.producer, callResult: child}) {
						return
					}
				}
				if !output.pending {
					if _, adopted := work.requireOperation(facts, child.request); !adopted {
						return
					} else if data, applied := work.stagedCallResultData(child.request); applied {
						output.pending = !data.delta.extracted
						for _, alternative := range data.delta.exposures {
							// Nested construction/cycles need their own consumer domain.
							// Do not recursively embed a growing pending payload.
							if alternative.endpoint.moduleConstruction != nil {
								output.pending = true
								continue
							}
							copy := cloneOperationDelta(sourceStagedOperationDelta{exposures: []sourceStagedOperationAlternative{alternative}})
							output.alternatives = append(output.alternatives, copy.exposures...)
						}
					} else {
						output.pending = true
					}
				}
			}
		} else {
			output.pending = true
		}
		waiting = waiting || field.required.producer.operation != nil && output.pending
		value.pending = value.pending || output.pending
		value.fields = append(value.fields, output)
	}
	delta.extracted = !value.pending
	// The endpoint payload is immutable once published. While genuine field
	// DATA is pending, publish required-only work so the existing queue wakes
	// this producer; do not replace a prior partial endpoint on later delivery.
	if !waiting {
		delta.exposures = []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointModuleConstruction, producer: source.binding, get: recipe.key.operation, cut: source.request.cut, moduleConstruction: value}}}
	}
	recipe.delta = delta
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, delta)
	}
}

// moduleConstructionFieldSources exposes only delivered field relationships.
// The enclosing input reader must already authenticate APPLIED DATA/currentness.
// Known names denote original source fields, not current own-property presence.
// Other consumers cannot interpret this marker as its target or a normal object.
func moduleConstructionFieldSources(endpoint sourceRelativeEndpoint, name string) ([]sourceStagedOperationAlternative, bool, bool) {
	value := endpoint.moduleConstruction
	if endpoint.kind != relativeEndpointModuleConstruction || value == nil || value.source == nil || value.source.generation == nil || !value.source.generation.active || value.source.generation.project == nil || value.source.generation.project.abandoned || value.source.generation.project.activeGeneration != value.source.generation || endpoint.expression != nil || endpoint.producer != value.source.binding || endpoint.get != value.source.request.producer.operation || endpoint.cut != value.source.request.cut || len(value.fields) != len(value.source.fields) {
		return nil, false, true
	}
	var alternatives []sourceStagedOperationAlternative
	known := false
	pending := value.pending
	for i, field := range value.source.fields {
		if field.name != name {
			continue
		}
		known = true
		entry := value.fields[i]
		if entry.ordinal != field.ordinal {
			return nil, false, true
		}
		copy := cloneOperationDelta(sourceStagedOperationDelta{exposures: entry.alternatives})
		alternatives = append(alternatives, copy.exposures...)
		pending = pending || entry.pending
	}
	return alternatives, known, pending
}
