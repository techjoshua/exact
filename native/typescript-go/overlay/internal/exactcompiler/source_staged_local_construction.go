package exactcompiler

import (
	"fmt"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// These are conditional lexical SOURCE roles. They do not name a runtime
// activation, returned-closure B, native allocation or current callee receipt.
type sourceConstructionCaptureSource struct {
	role     sourceRelativeRole
	binding  *ast.Node
	required sourceStagedOperationRequest
}
type sourceConstructionCallableSource struct {
	parent                    sourceStagedOperationRequest // Actual original construction DATA supplier.
	callable, owner, creation *ast.Node
	generation                *projectGeneration
	captures                  []sourceConstructionCaptureSource
	unsupported               bool
}
type sourceConstructionCaptureValue struct {
	role         sourceRelativeRole
	required     sourceStagedOperationRequest
	alternatives []sourceStagedOperationAlternative
	pending      bool
}
type sourceConstructionCallableValue struct {
	source   *sourceConstructionCallableSource
	captures []sourceConstructionCaptureValue
	pending  bool
}

func constructionResultRequest(binding, owner *ast.Node) sourceStagedOperationRequest {
	initializer := binding.Initializer()
	return sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: owner, operation: initializer, kind: relativeDemandDirectExposure, selector: sourceStagedOperationSelector{occurrence: initializer, association: binding, field: "construction-data"}}, consumer: owner, use: initializer, cut: sourceRelativeCut{operation: initializer, use: initializer, reading: initializer}, edge: fmt.Sprintf("construction-data:%d", initializer.Pos())}
}
func constructionEffectsRequest(fact *callableFacts, node *ast.Node) (sourceStagedOperationRequest, bool) {
	return sourceStagedOccurrenceRequest(fact, node, relativeDemandEffects, fmt.Sprintf("%s:evaluation:%d", fact.summary.ID, node.Pos()))
}

func localConstructionBindingSyntax(binding, owner *ast.Node) bool {
	return binding != nil && owner != nil && ast.IsFunctionLike(owner) && ast.IsVariableDeclaration(binding) && binding.Name() != nil && ast.IsIdentifier(binding.Name()) && binding.Initializer() != nil && enclosingCallableNode(binding) == owner && binding.Parent != nil && ast.IsVariableDeclarationList(binding.Parent) && binding.Parent.Flags&ast.NodeFlagsConst != 0
}
func localConstructionBinding(binding, owner *ast.Node, values *sourceValueOwner) bool {
	if binding == nil || owner == nil || values == nil || !ast.IsFunctionLike(owner) || !ast.IsVariableDeclaration(binding) || binding.Name() == nil || !ast.IsIdentifier(binding.Name()) || binding.Initializer() == nil || enclosingCallableNode(binding) != owner || binding.Parent == nil || !ast.IsVariableDeclarationList(binding.Parent) || binding.Parent.Flags&ast.NodeFlagsConst == 0 {
		return false
	}
	file := ast.GetSourceFileOfNode(binding)
	if file == nil || file.IsDeclarationFile || values.program.GetSourceFile(file.FileName()) != file {
		return false
	}
	index := values.index(file)
	if index.incomplete || index.normalDynamicScope {
		return false
	}
	symbol := values.checker.GetSymbolAtLocation(binding.Name())
	return symbol != nil && symbol.ValueDeclaration == binding && !values.bindingWritten(symbol) && sourceStagedOccurrenceOwned(binding.Initializer(), owner)
}

// This is the original canonical creation event grammar, not a NoUser law.
// Evaluated children are retained by independent semantic source requirements.
func sourceConstructionEventNode(node *ast.Node) bool {
	if node == nil || node.Parent == nil || !ast.IsVariableDeclaration(node.Parent) || node.Parent.Initializer() != node {
		return false
	}
	return ast.IsObjectLiteralExpression(node) || ast.IsFunctionExpression(node) || ast.IsArrowFunction(node) || sourcePrimitiveValue(node) && sourceInertValueCreation(node)
}
func describeLocalConstructionCallable(callable, creation, owner *ast.Node, values *sourceValueOwner) *sourceConstructionCallableSource {
	if values == nil || callable == nil || !isWriterInputCallable(callable) || !sourceStagedOccurrenceOwned(creation, owner) {
		return nil
	}
	out := &sourceConstructionCallableSource{callable: callable, owner: owner, creation: creation, generation: values.generation}
	if len(callable.Parameters()) != 0 {
		out.unsupported = true
	}
	walkNode(callable, func(node *ast.Node) bool {
		if ast.IsPartOfTypeNode(node) {
			return false
		}
		if node.Kind == ast.KindThisKeyword {
			out.unsupported = true
			return true
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		symbol := values.checker.GetSymbolAtLocation(node)
		if values.checker.IsUndefinedSymbol(symbol) {
			return true
		}
		if symbol == nil || symbol.ValueDeclaration == nil {
			out.unsupported = true
			return true
		}
		binding := symbol.ValueDeclaration
		if callable.Contains(binding) {
			return true
		}
		file := ast.GetSourceFileOfNode(binding)
		if file == nil || file.IsDeclarationFile || enclosingCallableNode(binding) == nil {
			return true
		} // Existing module/global source owner remains independent.
		if !localConstructionBinding(binding, owner, values) {
			out.unsupported = true
			return true
		}
		role := sourceRelativeRole{kind: relativeRoleCapture, declaration: callable, binding: binding}
		for _, prior := range out.captures {
			if prior.role == role {
				return true
			}
		}
		initializer := binding.Initializer()
		var required sourceStagedOperationRequest
		if ast.IsObjectLiteralExpression(initializer) || stagedSourceDataValue(initializer) {
			required = constructionResultRequest(binding, owner)
		} else if stagedDataSourceExpression(initializer) {
			required = stagedResultSourceRequest(initializer, owner, nil)
		} else {
			out.unsupported = true
			return true
		}
		out.captures = append(out.captures, sourceConstructionCaptureSource{role: role, binding: binding, required: required})
		return true
	})
	return out
}

func cloneConstructionCallableSource(s *sourceConstructionCallableSource) *sourceConstructionCallableSource {
	if s == nil {
		return nil
	}
	c := *s
	c.captures = append([]sourceConstructionCaptureSource(nil), s.captures...)
	return &c
}
func sameConstructionCallableSource(a, b *sourceConstructionCallableSource) bool {
	if a == b {
		return true
	}
	if a == nil || b == nil || !sameOperationRequest(a.parent, b.parent) || a.callable != b.callable || a.owner != b.owner || a.creation != b.creation || a.generation != b.generation || a.unsupported != b.unsupported || len(a.captures) != len(b.captures) {
		return false
	}
	for i, x := range a.captures {
		y := b.captures[i]
		if x.role != y.role || x.binding != y.binding || !sameOperationRequest(x.required, y.required) {
			return false
		}
	}
	return true
}
func cloneConstructionCallableValue(v *sourceConstructionCallableValue) *sourceConstructionCallableValue {
	if v == nil {
		return nil
	}
	c := *v
	c.source = cloneConstructionCallableSource(v.source)
	c.captures = append([]sourceConstructionCaptureValue(nil), v.captures...)
	for i := range c.captures {
		d := cloneOperationDelta(sourceStagedOperationDelta{exposures: v.captures[i].alternatives})
		c.captures[i].alternatives = d.exposures
	}
	return &c
}
func sameConstructionCallableValue(a, b *sourceConstructionCallableValue) bool {
	if a == b {
		return true
	}
	if a == nil || b == nil || a.pending != b.pending || !sameConstructionCallableSource(a.source, b.source) || len(a.captures) != len(b.captures) {
		return false
	}
	for i, x := range a.captures {
		y := b.captures[i]
		if x.role != y.role || x.pending != y.pending || !sameOperationRequest(x.required, y.required) || !operationPrefix(x.alternatives, y.alternatives, sameOperationAlternative) || !operationPrefix(y.alternatives, x.alternatives, sameOperationAlternative) {
			return false
		}
	}
	return true
}

// This separate SOURCE-effects grammar does not broaden native inertness or
// establish any normal completion. Stored bodies do not execute on creation;
// same-owner immutable lexical reads can throw but cannot invoke user code.
func sourceConstructionEffectsShape(node, owner *ast.Node, values *sourceValueOwner) bool {
	if node == nil || values == nil {
		return false
	}
	if !ast.IsObjectLiteralExpression(node) {
		return sourceInertValueCreation(node)
	}
	index := values.index(ast.GetSourceFileOfNode(node))
	if index.incomplete || index.normalDynamicScope {
		return false
	}
	for _, property := range node.AsObjectLiteralExpression().Properties.Nodes {
		if property.Name() == nil || ast.IsComputedPropertyName(property.Name()) || callableNameText(property.Name()) == "__proto__" {
			return false
		}
		if ast.IsMethodDeclaration(property) {
			continue
		}
		if !ast.IsPropertyAssignment(property) {
			return false
		}
		operand := property.AsPropertyAssignment().Initializer
		if sourceInertValueCreation(operand) {
			continue
		}
		if !ast.IsIdentifier(operand) {
			return false
		}
		symbol := values.checker.GetSymbolAtLocation(operand)
		if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil || values.bindingWritten(symbol) {
			return false
		}
		binding := symbol.ValueDeclaration
		file := ast.GetSourceFileOfNode(binding)
		if file == nil || file.IsDeclarationFile || values.program.GetSourceFile(file.FileName()) != file {
			return false
		}
		if ast.IsFunctionDeclaration(binding) {
			continue
		}
		if !localConstructionBinding(binding, owner, values) {
			return false
		}
	}
	return true
}

// describeLocalConstructionData is a passive factory on the genuine canonical
// source owner. The creation Effects descriptor is pending until the original
// collector visits that initializer; this factory issues no observation stamp.
func (work *callableEffectWork) describeLocalConstructionData(facts []callableFacts, binding, ownerNode *ast.Node, owner *executableBodyOwner) (*sourceStagedCallResultSource, bool) {
	if owner == nil || owner.values == nil || owner.project == nil || work.operationGeneration != owner.values.generation || !localConstructionBinding(binding, ownerNode, owner.values) || !sourceConstructionEventNode(binding.Initializer()) {
		return nil, false
	}
	index, known := work.memberNodes[ownerNode]
	publisher := owner.pendingMemberPublishers[ownerNode]
	if !known || publisher == nil || !publisher.live || publisher.fact != &facts[index] || facts[index].normalInputs != nil {
		return nil, false
	}
	initializer := binding.Initializer()
	request := constructionResultRequest(binding, ownerNode)
	effects, owned := constructionEffectsRequest(&facts[index], initializer)
	if !owned {
		return nil, false
	}
	if _, exists := work.operationRecipes[effects.producer]; !exists {
		source := &sourceStagedMemberSource{parent: effects, request: effects, generation: owner.values.generation, candidate: sourceStagedMemberCandidate{request: effects, operation: initializer, origin: initializer, region: ownerNode, protocol: true, cut: effects.cut}, protocolSource: &sourceStagedMemberProtocol{evaluation: &sourceStagedEvaluation{node: initializer, generation: owner.values.generation}}}
		if !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: effects.producer, memberSource: source}) {
			return nil, false
		}
	}
	plan := &sourceStagedModuleConstruction{request: request, binding: binding, initializer: initializer, localOwner: ownerNode, creationEffects: effects, generation: owner.values.generation}
	if ast.IsObjectLiteralExpression(initializer) {
		describeConstructionFields(plan, owner)
	} else if isWriterInputCallable(initializer) {
		plan.scalarCallable = describeLocalConstructionCallable(initializer, initializer, ownerNode, owner.values)
		if plan.scalarCallable != nil {
			plan.scalarCallable.parent = plan.request
		}
		plan.unsupported = plan.scalarCallable == nil || plan.scalarCallable.unsupported
	} else if stagedSourceDataValue(initializer) && !stagedCallReturnLiteralHasCapture(initializer, owner.values) {
		endpoint := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: initializer, producer: binding, get: initializer, cut: request.cut}
		plan.scalar = &endpoint
	} else {
		plan.unsupported = true
	}
	return &sourceStagedCallResultSource{request: request, declaration: ownerNode, generation: owner.values.generation, moduleConstruction: plan}, true
}
func validLocalConstructionDataRecipe(recipe sourceStagedOperationRecipe) bool {
	source := recipe.callResult
	if source == nil || source.moduleConstruction == nil {
		return false
	}
	s := source.moduleConstruction
	if !localConstructionBindingSyntax(s.binding, s.localOwner) || source.declaration != s.localOwner || source.binding != nil || source.operand != nil || source.getResult != nil || source.nativeDescriptor != nil || source.frameworkView != nil || source.nativeCall || source.constructedRoot.producer.operation != nil || source.generation != s.generation || recipe.key != s.request.producer || !sameOperationRequest(source.request, s.request) || !sameOperationRequest(s.request, constructionResultRequest(s.binding, s.localOwner)) || s.initializer != s.binding.Initializer() || s.module != nil || !sourceStagedOccurrenceOwned(s.initializer, s.localOwner) || s.creationEffects.producer.operation != s.initializer || s.creationEffects.producer.declaration != s.localOwner || s.creationEffects.producer.kind != relativeDemandEffects {
		return false
	}
	if recipe.memberSource != nil || recipe.nativeGet != nil || recipe.writer != nil || recipe.getter != nil || recipe.mapEntry != nil || recipe.mapProtocol != nil || recipe.returning != nil || recipe.constructed != nil || recipe.entryLaw != nil || recipe.declarationCall != nil || recipe.frameworkEffects != nil || recipe.assignment != nil || recipe.constructionEffects != nil || recipe.moduleArgument != nil || recipe.hasInstance != nil || recipe.constructedDisposition != nil || len(recipe.delta.effects)+len(recipe.delta.invoked)+len(recipe.delta.relative)+len(recipe.delta.residuals) != 0 {
		return false
	}
	if operationDeltaSize(recipe.delta) == 0 {
		return !recipe.delta.extracted
	}
	required := moduleConstructionRequired(s)
	if !operationPrefix(required, recipe.delta.required, sameOperationRequest) || !operationPrefix(recipe.delta.required, required, sameOperationRequest) {
		return false
	}
	if len(recipe.delta.exposures) == 0 {
		return !recipe.delta.extracted
	}
	if len(recipe.delta.exposures) != 1 || recipe.delta.exposures[0].creating != nil {
		return false
	}
	endpoint := recipe.delta.exposures[0].endpoint
	if s.scalar != nil {
		return recipe.delta.extracted && !s.unsupported && sameOperationEndpoint(endpoint, *s.scalar)
	}
	if s.scalarCallable != nil {
		return endpoint.kind == relativeEndpointConstructionCallable && endpoint.constructionCallable != nil && sameConstructionCallableSource(endpoint.constructionCallable.source, s.scalarCallable) && recipe.delta.extracted != endpoint.constructionCallable.pending
	}
	value := endpoint.moduleConstruction
	return ast.IsObjectLiteralExpression(s.initializer) && endpoint.kind == relativeEndpointModuleConstruction && endpoint.expression == nil && endpoint.producer == s.binding && endpoint.get == s.initializer && endpoint.cut == s.request.cut && value != nil && sameModuleConstruction(value.source, s) && len(value.fields) == len(s.fields) && recipe.delta.extracted != value.pending && (!s.unsupported || value.pending)
}

func (work *callableEffectWork) constructionDependencySource(facts []callableFacts, request sourceStagedOperationRequest, owner *executableBodyOwner) (*sourceStagedCallResultSource, bool) {
	caller, known := work.memberNodes[request.producer.declaration]
	if !known {
		return nil, false
	}
	if request.producer.selector.field == "construction-data" {
		return work.describeLocalConstructionData(facts, request.producer.selector.association, request.producer.declaration, owner)
	}
	return work.describeStagedCallResultSource(facts, caller, request.producer.operation, owner)
}
func (work *callableEffectWork) constructionCallableValue(source *sourceConstructionCallableSource) *sourceConstructionCallableValue {
	if source == nil {
		return nil
	}
	value := &sourceConstructionCallableValue{source: cloneConstructionCallableSource(source), pending: source.unsupported}
	for _, capture := range source.captures {
		part := sourceConstructionCaptureValue{role: capture.role, required: capture.required}
		if data, applied := work.stagedCallResultData(capture.required); applied {
			delta := cloneOperationDelta(data.delta)
			part.alternatives = delta.exposures
			part.pending = !data.delta.extracted
			for _, alternative := range part.alternatives {
				if _, supported := constructionEndpointRoleRequirements(alternative.endpoint); !supported {
					part.pending = true
				}
			}
		} else {
			part.pending = true
		}
		value.pending = value.pending || part.pending
		value.captures = append(value.captures, part)
	}
	return value
}
func (work *callableEffectWork) prepareLocalConstructionData(facts []callableFacts, id sourceStagedOperationID, owner *executableBodyOwner) {
	recipe := work.operationRecipes[work.operations[id.index].key]
	source := recipe.callResult
	if !validLocalConstructionDataRecipe(recipe) || owner == nil || owner.values == nil || source.generation != work.operationGeneration || source.generation != owner.values.generation {
		return
	}
	s := source.moduleConstruction
	actual, supported := work.describeLocalConstructionData(facts, s.binding, s.localOwner, owner)
	if !supported || !sameModuleConstruction(actual.moduleConstruction, s) {
		return
	}
	required := moduleConstructionRequired(s)
	for _, request := range required {
		if request.producer.kind != relativeDemandEffects {
			child, supported := work.constructionDependencySource(facts, request, owner)
			if !supported || !sameOperationRequest(child.request, request) {
				return
			}
			if _, known := work.operationRecipes[request.producer]; !known && !work.registerOperationRecipe(facts, sourceStagedOperationRecipe{key: request.producer, callResult: child}) {
				return
			}
		}
		if _, adopted := work.requireOperation(facts, request); !adopted {
			return
		}
	}
	delta := sourceStagedOperationDelta{required: required}
	observed := work.memberCoverageObserved[s.creationEffects.producer] == work.operationGeneration
	if !observed {
		recipe.delta = delta
		if work.attachOperationSource(facts, recipe) {
			work.publishOperation(id, delta)
		}
		return
	}
	waiting := false
	if s.scalar != nil {
		delta.extracted = !s.unsupported
		delta.exposures = []sourceStagedOperationAlternative{{endpoint: cloneSourceRelativeEndpoint(*s.scalar)}}
	} else if s.scalarCallable != nil {
		value := work.constructionCallableValue(s.scalarCallable)
		waiting = value == nil || value.pending
		if !waiting {
			delta.extracted = true
			delta.exposures = []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointConstructionCallable, constructionCallable: value, producer: s.binding, get: s.initializer, cut: s.request.cut}}}
		}
	} else {
		value := &sourceStagedModuleConstructionValue{source: cloneModuleConstruction(s), pending: s.unsupported}
		for _, field := range s.fields {
			output := sourceStagedModuleConstructionFieldValue{ordinal: field.ordinal}
			if field.callable != nil {
				callable := work.constructionCallableValue(field.callable)
				output.pending = callable == nil || callable.pending
				if callable != nil {
					output.alternatives = []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointConstructionCallable, constructionCallable: callable, producer: field.property, get: field.operand, cut: s.request.cut}}}
				}
			} else if field.literal != nil {
				output.alternatives = []sourceStagedOperationAlternative{{endpoint: cloneSourceRelativeEndpoint(*field.literal)}}
			} else if field.required.producer.operation != nil {
				if data, applied := work.stagedCallResultData(field.required); applied {
					copy := cloneOperationDelta(data.delta)
					output.alternatives = copy.exposures
					output.pending = !data.delta.extracted
					for _, alternative := range output.alternatives {
						if _, supported := constructionEndpointRoleRequirements(alternative.endpoint); !supported {
							output.pending = true
						}
					}
				} else {
					output.pending = true
				}
			} else {
				output.pending = true
			}
			waiting = waiting || output.pending && (field.callable != nil || field.required.producer.operation != nil)
			value.pending = value.pending || output.pending
			value.fields = append(value.fields, output)
		}
		delta.extracted = !value.pending
		if !waiting {
			delta.exposures = []sourceStagedOperationAlternative{{endpoint: sourceRelativeEndpoint{kind: relativeEndpointModuleConstruction, moduleConstruction: value, producer: s.binding, get: s.initializer, cut: s.request.cut}}}
		}
	}
	recipe.delta = delta
	if work.attachOperationSource(facts, recipe) {
		work.publishOperation(id, delta)
	}
}

// constructionEndpointRoleRequirements exposes only SOURCE dependencies already
// named by the immutable payload. A nested unresolved role is pending: this
// helper never substitutes the outer reader's bindings into a captured scope.
func constructionEndpointRoleRequirements(endpoint sourceRelativeEndpoint) ([]sourceStagedOperationRequest, bool) {
	var required []sourceStagedOperationRequest
	var visit func(sourceRelativeEndpoint, int) bool
	visit = func(endpoint sourceRelativeEndpoint, depth int) bool {
		if depth > 64 || endpoint.kind == relativeEndpointRole {
			return false
		}
		var callable *sourceConstructionCallableValue
		switch endpoint.kind {
		case relativeEndpointModuleConstruction:
			value := endpoint.moduleConstruction
			if value == nil || value.source == nil || value.pending {
				return false
			}
			required = appendEntryLawRequirement(required, value.source.request)
			for _, field := range value.fields {
				if field.pending {
					return false
				}
				for _, alternative := range field.alternatives {
					if !visit(alternative.endpoint, depth+1) {
						return false
					}
				}
			}
		case relativeEndpointConstructionCallable:
			callable = endpoint.constructionCallable
		}
		if callable != nil {
			if callable.source == nil || callable.pending || callable.source.unsupported || len(callable.captures) != len(callable.source.captures) {
				return false
			}
			required = appendEntryLawRequirement(required, callable.source.parent)
			for index, capture := range callable.captures {
				if capture.pending || capture.role != callable.source.captures[index].role || !sameOperationRequest(capture.required, callable.source.captures[index].required) {
					return false
				}
				required = appendEntryLawRequirement(required, capture.required)
				for _, alternative := range capture.alternatives {
					if !visit(alternative.endpoint, depth+1) {
						return false
					}
				}
			}
		} else if endpoint.kind == relativeEndpointConstructionCallable {
			return false
		}
		return true
	}
	valid := visit(endpoint, 0)
	return required, valid
}

// The semantic fingerprint excludes graph IDs and notification cursors. Exact
// original roles and full SOURCE requests remain part of cache invalidation.
func constructionCallableSourceFingerprint(source *sourceConstructionCallableSource) string {
	if source == nil {
		return ""
	}
	return fmt.Sprintf("|construction-callable:%#v:%p:%p:%p:%t:%#v", source.parent, source.callable, source.owner, source.creation, source.unsupported, source.captures)
}
func constructionCallableFingerprint(value *sourceConstructionCallableValue) string {
	if value == nil {
		return ""
	}
	text := constructionCallableSourceFingerprint(value.source) + fmt.Sprintf("|construction-callable-data:%t", value.pending)
	for _, capture := range value.captures {
		text += fmt.Sprintf("|construction-capture:%#v:%#v:%t:%#v", capture.role, capture.required, capture.pending, capture.alternatives)
	}
	return text
}
