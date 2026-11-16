package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// This transcript is local to the graph which actually observed every native
// method/prototype branch. It is neither a cached source description nor a
// value/brand proof. The opaque issuer prevents structural copies from issuing.
type sourceStagedHasInstanceNativeDefault struct {
	issuer     *sourceStagedHasInstanceNativeIssuer
	root       sourceStagedOperationRequest
	cut        sourceRelativeCut
	generation *projectGeneration
	epoch      *sourceStagedOperationEpoch
	branches   []sourceStagedHasInstanceNativeBranch
	required   []sourceStagedOperationRequest
	revisions  [2]uint64 // Original rhs-input and @@hasInstance Get publication.
	coverage   []*sourceStagedMemberCoverage
}

type sourceStagedHasInstanceNativeIssuer struct {
	proof *sourceStagedHasInstanceNativeDefault
}

type sourceStagedHasInstanceNativeBranch struct {
	receiver, acquired, method, prototype *ast.Node
}

func (work *callableEffectWork) recordHasInstanceNativeDefault(root sourceStagedOperationRequest, cut sourceRelativeCut, branches []sourceStagedHasInstanceNativeBranch, required []sourceStagedOperationRequest) {
	if len(branches) == 0 || len(required) == 0 || work.operationGeneration == nil {
		return
	}
	id := work.operationIDs[root.producer]
	if id.epoch != work.operationEpoch || id.index == 0 || work.operations[id.index].hasInstance == nil {
		return
	}
	proof := &sourceStagedHasInstanceNativeDefault{root: root, cut: cut, generation: work.operationGeneration, epoch: work.operationEpoch, branches: append([]sourceStagedHasInstanceNativeBranch(nil), branches...), required: append([]sourceStagedOperationRequest(nil), required...)}
	for index, role := range []string{"rhs-input", "has-instance-get"} {
		request := stagedHasInstanceRequest(root, role)
		phase := work.operationIDs[request.producer]
		if phase.index == 0 || phase.epoch != work.operationEpoch || !work.operations[phase.index].delta.extracted || work.operations[phase.index].revision == 0 {
			return
		}
		proof.revisions[index] = work.operations[phase.index].revision
	}
	for _, request := range required {
		recipe := work.operationRecipes[request.producer]
		if !validStagedMemberCoverageRecipe(recipe) || !sameOperationRequest(request, recipe.memberSource.request) || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
			return
		}
		proof.coverage = append(proof.coverage, recipe.memberSource.coverage)
	}
	proof.issuer = &sourceStagedHasInstanceNativeIssuer{proof: proof}
	work.operations[id.index].hasInstance.nativeDefault = proof
	work.queueHasFreshTargets(root)
}

func (work *callableEffectWork) currentHasInstanceNativeDefault(root sourceStagedOperationRequest) *sourceStagedHasInstanceNativeDefault {
	id := work.operationIDs[root.producer]
	if id.index == 0 || id.epoch != work.operationEpoch || work.operations[id.index].hasInstance == nil {
		return nil
	}
	proof := work.operations[id.index].hasInstance.nativeDefault
	expected := sourceRelativeCut{operation: root.use, reading: root.use}
	if runtimeModuleEvaluation(root.consumer) {
		expected.use = root.use
	}
	if proof == nil || proof.issuer == nil || proof.issuer.proof != proof || !sameOperationRequest(proof.root, root) || proof.cut != expected || proof.epoch != work.operationEpoch || proof.generation != work.operationGeneration || len(proof.branches) == 0 || len(proof.coverage) != len(proof.required) {
		return nil
	}
	for _, branch := range proof.branches {
		for _, node := range []*ast.Node{branch.receiver, branch.method, branch.prototype} {
			if node == nil || !standardLibrarySource(ast.GetSourceFileOfNode(node)) {
				return nil
			}
		}
		if branch.acquired == nil || !sourceStagedOccurrenceOwned(branch.acquired, root.consumer) {
			return nil
		}
	}
	for index, role := range []string{"rhs-input", "has-instance-get"} {
		phase := work.operationIDs[stagedHasInstanceRequest(root, role).producer]
		if phase.index == 0 || phase.epoch != work.operationEpoch || work.operations[phase.index].revision != proof.revisions[index] || !work.operations[phase.index].delta.extracted {
			return nil
		}
	}
	for index, request := range proof.required {
		recipe := work.operationRecipes[request.producer]
		if !validStagedMemberCoverageRecipe(recipe) || recipe.memberSource.coverage != proof.coverage[index] || !sameOperationRequest(recipe.memberSource.request, request) || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
			return nil
		}
	}
	return proof
}

// The external atom must come from this binding's original Get and that Get's
// current runtime terminal. A formal/absent source or generic unknown role is
// not permission to replace compiler work by runtime effects.
func (work *callableEffectWork) hasInstanceExternalInput(root sourceStagedOperationRequest, owner *executableBodyOwner) bool {
	left := root.use.AsBinaryExpression().Left
	if !ast.IsIdentifier(left) {
		return false
	}
	reading := stagedBindingResultRequest(left, root.consumer)
	data, current := work.stagedCallResultData(reading)
	if !current || !data.delta.extracted {
		return false
	}
	binding := work.operationRecipes[reading.producer].callResult
	if binding == nil || binding.binding == nil || !ast.IsVariableDeclaration(binding.binding) || binding.generation != work.operationGeneration || stagedBindingDataDeclaration(left, root.consumer, owner) != binding.binding {
		return false
	}
	operation := binding.binding.Initializer()
	external := stagedExternalGetRoot(operation, root.consumer, owner)
	if external == nil {
		return false
	}
	value := stagedGetResultRequest(operation, root.consumer, "value", nil)
	recipe := work.operationRecipes[value.producer]
	if !validStagedGetResultRecipe(recipe) || !recipe.callResult.getResult.represented || work.memberCoverageObserved[recipe.key] != work.operationGeneration {
		return false
	}
	parent := work.operationRecipes[reading.producer]
	if len(parent.delta.required) != 1 || !sameOperationRequest(parent.delta.required[0], value) {
		return false
	}
	terminal := false
	for _, request := range work.operationRecipes[stagedGetResultRequest(operation, root.consumer, "effects", nil).producer].delta.required {
		candidate := work.operationRecipes[request.producer]
		if source := candidate.memberSource; source != nil && source.coverage != nil && source.coverage.origin == external && source.parent.producer.operation == operation && validStagedMemberCoverageRecipe(candidate) && source.generation == work.operationGeneration && work.memberCoverageObserved[candidate.key] == work.operationGeneration {
			terminal = true
		}
	}
	if !terminal {
		return false
	}
	for _, alternative := range data.delta.exposures {
		endpoint := alternative.endpoint
		if alternative.creating == nil && endpoint.kind == relativeEndpointRole && endpoint.role.kind == relativeRoleUnknown && endpoint.role.declaration == root.consumer && endpoint.producer == operation && endpoint.get == operation && len(endpoint.projection) == 0 {
			return true
		}
	}
	return false
}

func (work *callableEffectWork) refreshHasInstanceNativeDefault(facts []callableFacts, root sourceStagedOperationRequest, owner *executableBodyOwner) bool {
	proof := work.currentHasInstanceNativeDefault(root)
	if proof == nil || !work.hasInstanceExternalInput(root, owner) {
		return false
	}
	lhs := stagedHasInstanceRequest(root, "lhs-value")
	input := work.operationIDs[lhs.producer]
	if input.index == 0 || !work.operations[input.index].delta.extracted {
		return false
	}
	prototype := stagedHasInstanceRequest(root, "prototype")
	algorithm := stagedHasInstanceRequest(root, "algorithm")
	before := work.operations[work.operationIDs[prototype.producer].index].revision + work.operations[work.operationIDs[algorithm.producer].index].revision
	// Only the object branch can traverse a Proxy prototype. The primitive
	// branch returns without this protocol. No Boolean/identity is delivered.
	effect := environmentSource("unknown", "external instanceof prototype traversal", facts[work.memberNodes[root.consumer]].summary.Name)
	effect.Opaque = true
	delta := cloneOperationDelta(work.operationRecipes[prototype.producer].delta)
	delta.extracted = true
	delta.required = appendHasInstanceRequired(delta.required, lhs)
	retained := false
	for _, prior := range delta.effects {
		retained = retained || sameOperationEffect(prior, effect)
	}
	if !retained {
		delta.effects = append(delta.effects, effect)
	}
	work.publishHasInstancePhase(facts, root, "prototype", delta, owner)
	algorithmDelta := cloneOperationDelta(work.operationRecipes[algorithm.producer].delta)
	algorithmDelta.extracted = true
	algorithmDelta.required = appendHasInstanceRequired(algorithmDelta.required, lhs)
	work.publishHasInstancePhase(facts, root, "algorithm", algorithmDelta, owner)
	after := work.operations[work.operationIDs[prototype.producer].index].revision + work.operations[work.operationIDs[algorithm.producer].index].revision
	return before != after
}

// These graph-local contributions come from the original creation and Class/Get
// owners. They describe conditional protocol Effects, never constructor output,
// prototype identity, completed execution, descriptor preservation or NoWrites.
type sourceStagedHasInstanceCreation struct {
	operation  *ast.Node
	endpoint   sourceRelativeEndpoint
	cut        sourceRelativeCut
	generation *projectGeneration
}

type sourceStagedHasInstanceClassDefault struct {
	definition, operation  *ast.Node
	receiver, prototypeGet sourceRelativeEndpoint
	cut                    sourceRelativeCut
	generation             *projectGeneration
	creating               *sourceStagedDeclarationCall
	required               []sourceStagedOperationRequest
}

type sourceStagedHasInstanceDefault struct {
	request                         sourceStagedOperationRequest
	class                           sourceStagedHasInstanceClassDefault
	creation                        sourceStagedHasInstanceCreation
	functionRoot, functionPrototype *ast.Node
	object                          sourceDemandStandardPremises
	generation                      *projectGeneration
}

// The actual immediate-value owner calls this after producing its source term.
// Looking at an inert expression elsewhere cannot issue the creation receipt.
func (q *sourceValueQuery) observeStagedHasInstanceCreation(value sourceValue) {
	b := q.stagedHasInstance
	if b == nil || b.creation == nil || b.issuer != q || b.owner != q.owner || b.generation != q.owner.generation || b.finished || !q.dependenciesOnly || q.inputs != nil || q.operation != nil || b.get == nil || b.get.operation == nil || !ast.IsBinaryExpression(b.get.operation) || b.cut != q.relativeInputCut(b.get.operation) {
		return
	}
	left := unwrapSourceCallableReference(b.get.operation.AsBinaryExpression().Left)
	if left == nil || value.node != left || !hasInstanceOrdinaryFunctionCreation(left) || !hasInstanceUnwrappedSourceValue(value) {
		return
	}
	b.creation(sourceStagedHasInstanceCreation{operation: b.get.operation, endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: left, producer: b.get.operation, cut: b.cut}, cut: b.cut, generation: b.generation})
}

func hasInstanceUnwrappedSourceValue(value sourceValue) bool {
	return value.node != nil && len(value.path) == 0 && value.normal == nil && value.acquired == nil && value.native == nil && value.instance == nil && value.adapter == nil && value.bound == nil && value.entrySlot == nil && value.initializerUse == nil && value.awaited == nil && value.ownedGetRow == nil && value.rest == nil && value.copied == nil
}

// The Class/Get owner lends the real selected receiver and current scope. A
// decorated/replaced source declaration cannot certify an ordinary class value.
// The class's own prototype slot is DATA conditional on that actual creation.
func (q *sourceValueQuery) observeStagedHasInstanceClassDefault(definition *ast.Node, get *sourceGetInputs, scope acquiredCallableScope) bool {
	if !q.liveStagedHasInstanceGet(get) || get.hasInstance.classDefault == nil || definition != get.receiver.node || !hasInstanceUnwrappedSourceValue(get.receiver) || !hasInstanceOrdinaryClassDefinition(definition) {
		return false
	}
	b := get.hasInstance
	member := q.stagedMember
	if member == nil || member.coverage == nil {
		return false
	}
	coverage := member.coverage
	if coverage.origin != definition || coverage.generation != q.owner.generation || coverage.cut != q.relativeInputCut(get.operation) || !coverage.extracted {
		return false
	}
	receiver := get.receiver
	if receiver.capture == nil && len(scope.creators) != 0 {
		receiver.capture = &scope
	}
	binding, gap := describeRelativeBoundValues([]sourceValue{receiver}, sourceRelativeRole{}, b.cut)
	if gap != relativeInputsSupported || binding.unknown || len(binding.pending) != 0 || len(binding.sources) != 1 {
		return false
	}
	endpoint := binding.sources[0]
	if endpoint.kind != relativeEndpointExpression || endpoint.expression != definition || len(endpoint.projection) != 0 {
		return false
	}
	endpoint.producer = get.operation
	proof := sourceStagedHasInstanceClassDefault{definition: definition, operation: get.operation, receiver: cloneSourceRelativeEndpoint(endpoint), prototypeGet: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: get.operation.AsBinaryExpression().Right, producer: get.operation, projection: []string{"prototype"}, cut: b.cut}, cut: b.cut, generation: b.generation, required: []sourceStagedOperationRequest{coverage.request}}
	return b.classDefault(get, proof)
}

func hasInstanceOrdinaryClassDefinition(definition *ast.Node) bool {
	if definition == nil || (!ast.IsClassDeclaration(definition) && !ast.IsClassExpression(definition)) || len(sourceDefinitionDecorators(definition)) != 0 || ast.GetCombinedModifierFlags(definition)&ast.ModifierFlagsAmbient != 0 {
		return false
	}
	var members []*ast.Node
	if ast.IsClassDeclaration(definition) {
		members = definition.AsClassDeclaration().Members.Nodes
	} else {
		members = definition.AsClassExpression().Members.Nodes
	}
	for _, member := range members {
		if len(sourceDefinitionDecorators(member)) != 0 {
			return false
		}
	}
	file := ast.GetSourceFileOfNode(definition)
	return file != nil && !file.IsDeclarationFile && !standardLibrarySource(file)
}

// Creating associations are consumed only from current work facts. Equal
// metadata, a guessed factory Call or a fabricated delivered edge cannot supply
// the class-source association retained by the original Get's receiver.
func (work *callableEffectWork) acceptHasInstanceClassDefault(facts []callableFacts, q *sourceValueQuery, get *sourceGetInputs, proof sourceStagedHasInstanceClassDefault) bool {
	if !q.liveStagedHasInstanceGet(get) || proof.generation != work.operationGeneration || proof.operation != get.operation || proof.cut != q.relativeInputCut(get.operation) || proof.receiver.expression != get.receiver.node || len(proof.required) != 1 {
		return false
	}
	required := proof.required[0]
	recipe := work.operationRecipes[required.producer]
	if !validStagedMemberCoverageRecipe(recipe) || work.memberCoverageObserved[required.producer] != proof.generation || !sameOperationRequest(required, recipe.memberSource.request) {
		return false
	}
	if proof.receiver.creation != nil {
		found := false
		for caller := range facts {
			for _, call := range facts[caller].staged.calls {
				if call.invocation.operation != proof.receiver.creation || !validStagedMemberActivationCall(call, enclosingCallableNode(proof.definition.Parent), proof.receiver.creation) {
					continue
				}
				if call.inputs == nil && call.sourceInputs == nil {
					continue
				}
				copy := call
				copy.invocation = cloneStagedWriterInvocation(call.invocation)
				proof.creating = &copy
				found = true
				break
			}
			if found {
				break
			}
		}
		if !found {
			return false
		}
	}
	copy := proof
	copy.required = append([]sourceStagedOperationRequest(nil), proof.required...)
	copy.receiver = cloneSourceRelativeEndpoint(proof.receiver)
	copy.prototypeGet = cloneSourceRelativeEndpoint(proof.prototypeGet)
	get.hasInstance.defaultClass = &copy
	return true
}

// completeHasInstanceDefault consumes the two original source contributions.
// Its standard Function/Object links are conditional initial premises. Every
// writer/prototype/open source remains a required child of the existing phase.
func (work *callableEffectWork) completeHasInstanceDefault(root sourceStagedOperationRequest, class *sourceStagedHasInstanceClassDefault, creation *sourceStagedHasInstanceCreation, q *sourceValueQuery) (*sourceStagedHasInstanceDefault, bool) {
	if class == nil || creation == nil || class.generation != q.owner.generation || creation.generation != q.owner.generation || class.operation != root.use || creation.operation != root.use || class.cut != creation.cut || !hasInstanceOrdinaryClassDefinition(class.definition) || !hasInstanceUnwrappedCreation(*creation, root.use) {
		return nil, false
	}
	function := q.owner.checker.GetGlobalSymbol("Function", ast.SymbolFlagsValue, nil)
	if function == nil || function.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(function.ValueDeclaration)) {
		return nil, false
	}
	prototype := q.owner.checker.GetPropertyOfType(q.owner.checker.GetTypeOfSymbol(function), "prototype")
	if prototype == nil || prototype.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(prototype.ValueDeclaration)) {
		return nil, false
	}
	_, key := q.nativeWellKnownKey("hasInstance", &accessorCandidates{})
	if key == nil {
		return nil, false
	}
	object := q.stagedConditionalObjectPrototype(key.ValueDeclaration)
	if object.root == nil || object.prototype == nil || !object.ordinaryLink || !object.terminalNull {
		return nil, false
	}
	proof := &sourceStagedHasInstanceDefault{request: stagedHasInstanceRequest(root, "prototype"), class: *class, creation: *creation, functionRoot: function.ValueDeclaration, functionPrototype: prototype.ValueDeclaration, object: object, generation: q.owner.generation}
	proof.class.required = append([]sourceStagedOperationRequest(nil), class.required...)
	proof.class.receiver = cloneSourceRelativeEndpoint(class.receiver)
	proof.class.prototypeGet = cloneSourceRelativeEndpoint(class.prototypeGet)
	proof.creation.endpoint = cloneSourceRelativeEndpoint(creation.endpoint)
	return proof, validStagedHasInstanceDefault(proof, root, q.owner.generation)
}

// Async and generator functions have distinct intrinsic prototype chains.
// This contribution covers only the ordinary immediate function creation law.
func hasInstanceOrdinaryFunctionCreation(node *ast.Node) bool {
	if node == nil || (!ast.IsArrowFunction(node) && !ast.IsFunctionExpression(node)) || len(sourceDefinitionDecorators(node)) != 0 {
		return false
	}
	async, ordinary := ordinaryResultCategory(node)
	return ordinary && !async
}

func hasInstanceUnwrappedCreation(creation sourceStagedHasInstanceCreation, operation *ast.Node) bool {
	if operation == nil || !ast.IsBinaryExpression(operation) {
		return false
	}
	literal := unwrapSourceCallableReference(operation.AsBinaryExpression().Left)
	return hasInstanceOrdinaryFunctionCreation(literal) && creation.endpoint.kind == relativeEndpointExpression && creation.endpoint.expression == literal && creation.endpoint.producer == operation && len(creation.endpoint.projection) == 0 && creation.endpoint.creation == nil && creation.endpoint.returning == nil && creation.endpoint.cut == creation.cut
}

func validStagedHasInstanceDefault(proof *sourceStagedHasInstanceDefault, root sourceStagedOperationRequest, generation *projectGeneration) bool {
	if proof == nil || generation == nil || proof.generation != generation || proof.class.generation != generation || proof.creation.generation != generation || !sameOperationRequest(proof.request, stagedHasInstanceRequest(root, "prototype")) || proof.class.operation != root.use || proof.creation.operation != root.use || proof.class.cut != proof.creation.cut || !hasInstanceUnwrappedCreation(proof.creation, root.use) || !hasInstanceOrdinaryClassDefinition(proof.class.definition) || proof.class.receiver.expression != proof.class.definition || proof.class.receiver.cut != proof.class.cut || len(proof.class.required) != 1 {
		return false
	}
	live := sourceRelativeCut{operation: root.use, reading: root.use}
	if runtimeModuleEvaluation(root.consumer) {
		live.use = root.use
	}
	if proof.class.cut != live || proof.class.receiver.kind != relativeEndpointExpression || proof.class.receiver.producer != root.use || len(proof.class.receiver.projection) != 0 {
		return false
	}
	if proof.class.receiver.creation != nil {
		call := proof.class.creating
		if call == nil || !validStagedMemberActivationCall(*call, enclosingCallableNode(proof.class.definition.Parent), proof.class.receiver.creation) {
			return false
		}
	} else if proof.class.creating != nil {
		return false
	}
	get := proof.class.prototypeGet
	if get.kind != relativeEndpointExpression || get.expression != root.use.AsBinaryExpression().Right || get.producer != root.use || len(get.projection) != 1 || get.projection[0] != "prototype" || get.cut != proof.class.cut {
		return false
	}
	for _, node := range []*ast.Node{proof.functionRoot, proof.functionPrototype, proof.object.root, proof.object.member, proof.object.prototype} {
		if node == nil || !standardLibrarySource(ast.GetSourceFileOfNode(node)) {
			return false
		}
	}
	if !proof.object.rootData || !proof.object.memberData || !proof.object.prototypeData || !proof.object.ordinaryLink || !proof.object.terminalNull {
		return false
	}
	expected := stagedMemberCoverageRequest(root, proof.class.definition, proof.class.cut)
	if !sameOperationRequest(proof.class.required[0], expected) {
		return false
	}
	return true
}
