package exactcompiler

import (
	"unsafe"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceConstructedInstance owns one actual default-class construction. Its
// pointer is occurrence identity. Inputs and publisher are live borrows, revoked
// by the original normal owner, and must never enter detached or cached facts.
type sourceConstructedInstance struct {
	authority            sourceNormalAuthority
	mode                 string
	sourceFile           *ast.SourceFile
	site, target, caller *ast.Node
	entry                *sourceNormalOccurrence
	publisher            *sourceNormalOperation
	inputs               *sourceValueInputs
	state                sourceOperationDisposition
	fields               []sourceConstructedField
	ownComplete          bool
}

// sourceConstructedField is an actual committed DefineField data property.
// All three descriptor attributes are true. Prototype accessors are separate.
type sourceConstructedField struct {
	key        string
	definition *ast.Node
	observed   sourceResultObservation
}

// sourceConstructionMayPrefix borrows an original New's committed prefix while
// a later field is only possible. It supplies no current value, presence proof,
// execution receipt or publication right and expires with the synchronous query.
type sourceConstructionMayPrefix struct {
	instance  *sourceConstructedInstance
	field     *ast.Node
	completed int
}

func (prefix *sourceConstructionMayPrefix) live(q *sourceValueQuery) bool {
	if prefix == nil || q.constructionMay != prefix || q.operation != nil || !prefix.instance.live(q) || prefix.instance.state != sourceOperationInProgress || prefix.instance.publisher.state != sourceOperationInProgress || !prefix.indexedField(q) {
		return false
	}
	selected := prefix.instance.publisher.selected
	return selected != nil && len(selected.declarations) == 1 && selected.declarations[0] == prefix.instance.target
}

// indexedField checks source membership and order only. It grants no execution
// or borrowed value authority without live's original publisher/lifetime checks.
func (prefix *sourceConstructionMayPrefix) indexedField(q *sourceValueQuery) bool {
	if prefix == nil || prefix.instance == nil || q == nil || q.owner == nil || q.owner.program == nil || prefix.completed != len(prefix.instance.fields) || prefix.field == nil || !ast.IsPropertyDeclaration(prefix.field) || prefix.field.Parent != prefix.instance.target {
		return false
	}
	source := ast.GetSourceFileOfNode(prefix.field)
	if source == nil || source != ast.GetSourceFileOfNode(prefix.instance.target) || q.owner.program.GetSourceFile(source.FileName()) != source {
		return false
	}
	index := q.owner.index(source)
	if index.incomplete || index.normalOccurrences[prefix.field] == nil {
		return false
	}
	return prefix.completed == 0 || prefix.instance.fields[prefix.completed-1].definition.Pos() < prefix.field.Pos()
}

func (instance *sourceConstructedInstance) live(q *sourceValueQuery) bool {
	if instance == nil || instance.authority.program == nil || instance.authority.checker == nil || instance.authority.generation == nil || !instance.authority.generation.active || instance.authority.executable == nil || !instance.authority.valid(q) || instance.mode != descriptorEffectMode || instance.sourceFile == nil || instance.sourceFile != ast.GetSourceFileOfNode(instance.site) || q.owner.program.GetSourceFile(instance.sourceFile.FileName()) != instance.sourceFile || instance.inputs == nil || instance.inputs.declaration != instance.caller || instance.inputs.operationLifetime == nil || instance.inputs.operations[instance.site] != instance.publisher || instance.publisher == nil || instance.publisher.state != sourceOperationInProgress && instance.publisher.state != sourceOperationConsumed || instance.publisher.entry != instance.entry || instance.entry == nil || !instance.entry.once || instance.entry.node != instance.site || instance.publisher.population != instance.inputs.population || instance.inputs.population == nil || instance.inputs.population.entries[instance.site] != instance.entry {
		return false
	}
	if len(instance.publisher.output.values) != 1 || instance.publisher.output.values[0].value.instance != instance {
		return false
	}
	return instance.state == sourceOperationInProgress || instance.state == sourceOperationConsumed && instance.ownComplete && !instance.publisher.output.incomplete && instance.publisher.output.effects == sourceEffectsAccounted
}

// constructionFieldDomain admits an indexed field region only through the actual
// allocating occurrence. A class declaration is never installed as a callable.
func (q *sourceValueQuery) constructionFieldDomain(inputs *sourceValueInputs, node *ast.Node) bool {
	if inputs == nil || inputs.population == nil || !ast.IsPropertyDeclaration(inputs.declaration) || inputs.population.root != inputs.declaration {
		return false
	}
	values := inputs.bindings[0]
	if len(values) != 1 || len(values[0].path) != 0 {
		return false
	}
	instance := values[0].instance
	entry := inputs.population.entries[node]
	return instance.live(q) && inputs.declaration.Parent == instance.target && entry != nil && entry.region == inputs.declaration && entry.once
}

// prepareConstructionPhase saves genuine callee alternatives before arguments.
// Unsupported alternatives remain unknown. Argument evaluation still belongs to
// the shared normal walk and cannot be skipped by constructor refusal.
func (q *sourceValueQuery) prepareConstructionPhase(phase sourceNormalPhase, bindings sourceValueBindings, result *accessorCandidates) {
	slot := q.normalOperation(phase.node, true)
	if slot == nil {
		result.opaque, result.valueIncomplete = true, true
		return
	}
	if phase.role == sourceNormalAdmit {
		return
	}
	if phase.role == sourceNormalSelect {
		if slot.selected != nil || slot.state != sourceOperationPending {
			return
		}
		slot.selected = q.selectSourceConstruction(phase.node, bindings, result)
		return
	}
	if phase.role == sourceNormalArgumentEnd {
		observed := q.normalArgumentObservation(phase.argument, bindings, result)
		slot.actuals = append(slot.actuals, sourceNormalActual{node: phase.argument, observed: observed})
	}
}

// selectSourceConstruction shares the existing executable/immutable local value
// selection for actual and MAY New consumers. It neither evaluates arguments
// nor creates a normal operation or construction receipt.
func (q *sourceValueQuery) selectSourceConstruction(site *ast.Node, bindings sourceValueBindings, result *accessorCandidates) *sourcePreparedInvocation {
	return q.selectSourceConstructionReference(site.Expression(), site, bindings, result)
}

// selectSourceConstructionReference preserves selected executable ownership for
// New and inherited constructor dependencies without allocating an instance.
func (q *sourceValueQuery) selectSourceConstructionReference(reference, site *ast.Node, bindings sourceValueBindings, result *accessorCandidates) *sourcePreparedInvocation {
	if q.dependenciesOnly {
		previous := q.initializing
		q.initializing = site
		defer func() { q.initializing = previous }()
	}
	selected := &sourcePreparedInvocation{scope: q.acquireCallableScope(bindings, result)}
	q.lendStandardConstructionSelection(site, selected)
	if possibleProxyReference(q.owner, reference) {
		part := q.accessors(reference, nil, "", accessorAcquire, bindings, nil)
		selected.acquired = selectionProjection(part)
		mergeAccessorCandidates(result, part)
		for _, v := range part.values {
			if v.node != nil && len(v.path) == 0 && (ast.IsClassDeclaration(v.node) || ast.IsClassExpression(v.node)) && !ast.GetSourceFileOfNode(v.node).IsDeclarationFile {
				selected.declarations = append(selected.declarations, v.node)
				selected.base.selected = true
			}
		}
		return selected
	}
	// Use the existing executable definition owner before generic value
	// origins, whose declaration projection deliberately models callables.
	if definition, owned := q.executable.definition(reference); owned {
		selected.base.invocationOwned = true
		if sourceConstructorDefinition(definition) {
			selected.declarations = []*ast.Node{definition}
		}
		return selected
	}
	// A real authored constructor reference with unavailable output must
	// refuse rather than fall into the neutral non-Promise fallback.
	symbol := sourceCallableReferenceSymbol(reference, q.owner.checker)
	if symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = q.sourceAlias(symbol, result)
	}
	if symbol != nil && symbol.ValueDeclaration != nil {
		source := ast.GetSourceFileOfNode(symbol.ValueDeclaration)
		declaration := symbol.ValueDeclaration
		sourceClass := ast.IsClassDeclaration(declaration) || ast.IsVariableDeclaration(declaration) && declaration.Initializer() != nil && ast.IsClassExpression(unwrapSourceCallableReference(declaration.Initializer()))
		selected.base.selected = source != nil && !source.IsDeclarationFile && sourceClass
	}

	var values []sourceValue
	if q.dependenciesOnly {
		// Abstract acquisition preserves source alternatives without demanding
		// a normal callee output. Executable ownership above still takes priority.
		part := q.accessors(reference, nil, "", accessorAcquire, bindings, nil)
		mergeAccessorCandidates(result, part)
		selected.base.valueIncomplete = part.opaque || part.valueIncomplete || part.receiverIncomplete
		selected.acquired = selectionProjection(part)
		values = part.values
	} else {
		values = q.originsAt(reference, site, bindings, result)
	}
	for _, value := range values {
		if !q.charge(result, site) {
			break
		}
		if value.node != nil && ast.IsIdentifier(value.node) && len(value.path) == 0 {
			symbol := q.owner.checker.GetSymbolAtLocation(value.node)
			if symbol != nil && !q.owner.bindingWritten(symbol) && symbol.ValueDeclaration != nil && ast.IsClassDeclaration(symbol.ValueDeclaration) && ast.GetSourceFileOfNode(symbol.ValueDeclaration) == ast.GetSourceFileOfNode(site) {
				value.node = symbol.ValueDeclaration
			}
		}
		if len(value.path) != 0 || !sourceConstructorDefinition(value.node) {
			selected.base.valueIncomplete = true
			continue
		}
		selected.declarations = append(selected.declarations, value.node)
	}
	return selected
}

// sourceConstructorDefinition qualifies a selected source body, never a signature.
func sourceConstructorDefinition(node *ast.Node) bool {
	return node != nil && (ast.IsClassDeclaration(node) || ast.IsClassExpression(node) || ast.IsFunctionLike(node) && node.Body() != nil) && !ast.GetSourceFileOfNode(node).IsDeclarationFile
}

// retainSourceConstructorEffects belongs to original New selection, before
// any single-target allocation or possible-native refusal. A selected authored
// constructor keeps its MAY graph edge even beside other/unknown alternatives.
// It supplies no receiver, constructor execution or normal completion receipt.
func (q *sourceValueQuery) retainSourceConstructorEffects(site *ast.Node, selected *sourcePreparedInvocation, result *accessorCandidates) {
	if selected == nil {
		return
	}
	for _, target := range selected.declarations {
		q.charge(result, site)
		if target == nil || !ast.IsClassDeclaration(target) && !ast.IsClassExpression(target) || ast.GetSourceFileOfNode(target).IsDeclarationFile {
			continue
		}
		q.recordEstimatedCost(len(target.Members()))
		if constructor := ast.GetFirstConstructorWithBody(target); constructor != nil {
			result.retainCallableEffect(site, constructor)
		}
	}
}

// defaultClassMembers qualifies the plan, never evaluates initializers.
// Original selection owns constructor MAY effects before this shape refusal.
// Eager static/key/decorator work stays on the class-definition owner.
func (q *sourceValueQuery) defaultClassMembers(site, target *ast.Node, result *accessorCandidates) ([]*ast.Node, bool) {
	var class *ast.ClassLikeBase
	if ast.IsClassDeclaration(target) {
		class = &target.AsClassDeclaration().ClassLikeBase
	} else if ast.IsClassExpression(target) {
		class = &target.AsClassExpression().ClassLikeBase
	} else {
		return nil, false
	}
	if class.HeritageClauses != nil || ast.HasDecorators(target) || q.owner.program == nil || !q.owner.program.Options().GetUseDefineForClassFields() {
		return nil, false
	}
	var fields []*ast.Node
	for _, member := range class.Members.Nodes {
		if ast.IsConstructorDeclaration(member) {
			return nil, false
		}
		if !q.charge(result, member) || ast.IsConstructorDeclaration(member) || ast.HasDecorators(member) || ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic|ast.ModifierFlagsPrivate|ast.ModifierFlagsProtected|ast.ModifierFlagsAmbient|ast.ModifierFlagsAbstract) || member.Name() == nil || ast.IsComputedPropertyName(member.Name()) || member.Name().Kind == ast.KindPrivateIdentifier {
			return nil, false
		}
		if ast.IsPropertyDeclaration(member) {
			fields = append(fields, member)
		} else if !ast.IsMethodDeclaration(member) && !ast.IsGetAccessorDeclaration(member) && !ast.IsSetAccessorDeclaration(member) {
			return nil, false
		}
	}
	return fields, true
}

// constructMaySourceClass projects only the selected class's cached field
// demands. The outer prefix authorizes the destination, never this class's
// receiver or an actual allocation. Selection and all inputs are synchronous
// borrows, with no normal operations, returned values or publication receipts.
func (q *sourceValueQuery) constructMaySourceClass(site *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	result.opaque, result.valueIncomplete = true, true
	prefix := q.constructionMay
	if !prefix.live(q) || q.executable == nil || q.inputs == nil || !ast.IsPropertyDeclaration(q.inputs.declaration) || q.inputs.population == nil {
		return
	}
	entry := q.inputs.population.entries[site]
	if entry == nil || entry.node != site || entry.region != q.inputs.declaration || ast.GetSourceFileOfNode(site) != prefix.instance.sourceFile {
		return
	}
	// The executable owner reserves owned for selected module routes. Genuine
	// local classes use the same immutable value-origin fallback as actual New.
	reference := stableSourceCallableReference(site.Expression(), q.owner.checker)
	if reference == nil || !ast.IsIdentifier(reference) {
		return
	}
	symbol := q.owner.checker.GetSymbolAtLocation(reference)
	if symbol == nil || symbol.ValueDeclaration == nil || !q.executable.stableBody(symbol.ValueDeclaration) {
		return
	}
	declaration := symbol.ValueDeclaration
	if ast.IsVariableDeclaration(declaration) {
		declaration = unwrapSourceCallableReference(declaration.Initializer())
	}
	if declaration == nil || !ast.IsClassDeclaration(declaration) && !ast.IsClassExpression(declaration) || ast.GetSourceFileOfNode(declaration) != ast.GetSourceFileOfNode(site) || enclosingCallableNode(declaration) != enclosingCallableNode(site) {
		return
	}
	if !q.descriptorEffectAllocation(1, unsafe.Sizeof(sourcePreparedInvocation{}), result, site) {
		return
	}
	selected := q.selectSourceConstruction(site, bindings, result)
	if selected.base.valueIncomplete || len(selected.declarations) != 1 {
		return
	}
	target := selected.declarations[0]
	if target != declaration || q.active[target] {
		return
	}
	q.retainSourceConstructorEffects(site, selected, result)
	fields, supported := q.defaultClassMembers(site, target, result)
	if !supported {
		return
	}
	// Retain genuine lexical bindings and their creating scopes. The caller's
	// this is not the receiver of the conditional allocation.
	scope := selected.scope
	delete(scope.bindings, 0)
	previousInputs, previousCreators := q.inputs, q.creators
	defer func() { q.inputs, q.creators = previousInputs, previousCreators }()
	q.active[target] = true
	defer delete(q.active, target)
	part := accessorCandidates{}
	for _, field := range fields {
		if !q.descriptorEffectAllocation(1, unsafe.Sizeof(sourceValueInputs{}), &part, field) {
			break
		}
		inputs := &sourceValueInputs{declaration: field, invocation: site, bindings: scope.bindings, population: q.owner.normalPopulation(field), ownedFact: prefix.instance.inputs.ownedFact}
		if inputs.population == nil {
			part.opaque = true
			continue
		}
		q.inputs, q.creators = inputs, scope.creators
		q.consumeClassFieldDemands(prefix.instance, field, inputs, true, &part)
	}
	q.adoptConstructionMayEffects(site, part, result)
}

// constructSourceClass publishes only actual ordered field outputs. Missing
// output is a construction refusal, never an empty neutral successful instance.
func (q *sourceValueQuery) constructSourceClass(node *ast.Node, result *accessorCandidates) bool {
	slot := q.normalOperation(node, false)
	if slot == nil || slot.selected == nil || len(slot.selected.declarations) == 0 {
		if slot != nil && slot.selected != nil && slot.selected.base.selected {
			result.opaque, result.valueIncomplete = true, true
			if result.cause == nil {
				result.cause = node
			}
			return true
		}
		return false
	}
	refuse := func() {
		result.opaque, result.valueIncomplete = true, true
		if result.cause == nil {
			result.cause = node
		}
	}
	selected := slot.selected
	if selected.base.valueIncomplete || len(selected.declarations) != 1 || q.inputs == nil || q.inputs.operationLifetime == nil || slot.entry == nil || !slot.entry.once || !slot.authority.valid(q) {
		refuse()
		return true
	}
	target := selected.declarations[0]
	fields, supported := q.defaultClassMembers(node, target, result)
	if !supported || !q.descriptorEffectAllocation(0, unsafe.Sizeof(sourceConstructedInstance{}), result, node) || !q.descriptorEffectAllocation(len(fields), unsafe.Sizeof(sourceConstructedField{}), result, node) {
		refuse()
		return true
	}
	instance := &sourceConstructedInstance{authority: q.normalAuthority(), mode: descriptorEffectMode, sourceFile: ast.GetSourceFileOfNode(node), site: node, target: target, caller: q.inputs.declaration, entry: slot.entry, publisher: slot, inputs: q.inputs, state: sourceOperationInProgress, fields: make([]sourceConstructedField, 0, len(fields))}
	// Retain the allocating identity on its original slot while fields execute.
	// Only the field-domain relation can read this unfinished prefix.
	slot.output = sourceResultObservation{values: []sourceObservedValue{{value: sourceValue{node: node, instance: instance}, inputs: q.inputs, scope: selected.scope}}, incomplete: true, effects: sourceEffectsRefused}
	for index, field := range fields {
		observed, complete := q.constructField(instance, field, selected.scope, result)
		if !complete {
			// An accounted empty normal-result population proves no Normal
			// continuation. Unavailable values do not prove an abrupt completion.
			if observed.incomplete || observed.effects != sourceEffectsAccounted || len(observed.values) != 0 {
				for _, later := range fields[index+1:] {
					q.constructMayField(instance, later, selected.scope, result)
				}
			}
			instance.state = sourceOperationRefused
			refuse()
			return true
		}
		instance.fields = append(instance.fields, sourceConstructedField{key: callableNameText(field.Name()), definition: field, observed: observed})
	}
	if !q.descriptorEffectAllocation(len(instance.fields), unsafe.Sizeof(sourceConstructedField{}), result, node) {
		instance.state = sourceOperationRefused
		refuse()
		return true
	}
	instance.fields = append([]sourceConstructedField(nil), instance.fields...)
	instance.ownComplete, instance.state = true, sourceOperationConsumed
	slot.output.incomplete, slot.output.effects = false, sourceEffectsAccounted
	result.values = append(result.values, sourceValue{node: node, instance: instance})
	return true
}

// constructField dispatches the indexed initializer once under its real field
// inputs, preserving lexical captures and a fresh constructing receiver. The
// allocating owner retains these inputs until its final result consumer exits.
func (q *sourceValueQuery) constructField(instance *sourceConstructedInstance, field *ast.Node, captured acquiredCallableScope, result *accessorCandidates) (sourceResultObservation, bool) {
	scope := q.copyCallableScope(captured, result)
	scope.bindings[0] = []sourceValue{{node: instance.site, instance: instance}}
	inputs := &sourceValueInputs{declaration: field, invocation: instance.site, bindings: scope.bindings, population: q.owner.normalPopulation(field), ownedFact: instance.inputs.ownedFact}
	if inputs.population == nil {
		return sourceResultObservation{incomplete: true}, false
	}
	beginNormalOperations(inputs)
	q.installNormalCaptures(inputs, instance.inputs, result)
	previousInputs, previousOperation, previousCreators := q.inputs, q.operation, q.creators
	q.inputs, q.operation, q.creators = inputs, &sourceOperationContext{owner: field, inputs: inputs}, scope.creators
	defer func() { q.inputs, q.operation, q.creators = previousInputs, previousOperation, previousCreators }()
	part := accessorCandidates{}
	q.consumeClassFieldDemands(instance, field, inputs, false, &part)
	observed := sourceResultObservation{effects: sourceEffectsAccounted}
	if field.Initializer() == nil {
		observed.values = []sourceObservedValue{{value: sourceValue{undefined: true}, inputs: inputs, scope: scope}}
	} else {
		// The initializer consumes receipts from this actual field population,
		// not the allocating caller's return observation. Receipt owners remain
		// their lexical callable, while frame identity selects this execution.
		previousObservation := q.returnObservation
		q.returnObservation = &sourceReturnObservation{kind: sourceRawNormalResult, owner: enclosingCallableNode(field.Initializer()), reader: field.Initializer(), frame: inputs, receipts: part.nativeCalls, normalCalls: part.normalCalls}
		observed = q.normalArgumentObservation(field.Initializer(), inputs.bindings, &part)
		q.returnObservation = previousObservation
	}
	mergeAccessorCandidates(result, part)
	complete := !part.opaque && !part.valueIncomplete && !observed.incomplete && len(observed.values) > 0
	if !complete {
		releaseNormalOperations(inputs)
		return observed, false
	}
	if !q.descriptorEffectAllocation(len(observed.values), unsafe.Sizeof(sourceObservedValue{}), result, field) {
		releaseNormalOperations(inputs)
		return sourceResultObservation{incomplete: true}, false
	}
	observed.values = append([]sourceObservedValue(nil), observed.values...)
	for i, original := range observed.values {
		if original.inputs == inputs {
			continue
		}
		if !q.descriptorEffectAllocation(1, unsafe.Sizeof(sourceObservedValue{}), result, field) {
			releaseNormalOperations(inputs)
			return sourceResultObservation{incomplete: true}, false
		}
		// DefineField owns the field frame's lifetime. The acquired wrapper
		// retains the producing Call's exact value/scope without rebinding its
		// captures or granting this field another execution publication.
		value := original.value
		value.acquired = &original
		observed.values[i] = sourceObservedValue{value: value, inputs: inputs, scope: q.copyCallableScope(scope, result)}
	}
	return observed, true
}

// consumeClassFieldDemands shares the cached normal plan. Inventory consumption
// omits actual phase/operand publication and uses the existing MAY demand owner.
// It never reevaluates a field already consumed by the actual prefix.
func (q *sourceValueQuery) consumeClassFieldDemands(destinationInstance *sourceConstructedInstance, field *ast.Node, inputs *sourceValueInputs, may bool, part *accessorCandidates) {
	for _, demand := range q.owner.summary(field).normal {
		if may {
			if demand.fold == nil && demand.phase == nil && !demand.visitOnly {
				q.executeDemand(demand.node, field, inputs.bindings, part, nil, inputs)
			}
		} else if demand.fold != nil {
			q.consumeNormalFold(*demand.fold, part)
		} else if demand.phase != nil {
			q.consumeNormalPhase(*demand.phase, inputs.bindings, part)
		} else if demand.operand != nil {
			q.consumeNormalOperand(*demand.operand, field, inputs.bindings, part, inputs)
		} else if !demand.visitOnly {
			q.executeDemand(demand.node, field, inputs.bindings, part, nil, inputs)
		}
		if demand.fold == nil && demand.phase == nil && demand.operand == nil && demand.node != nil && ast.IsIdentifier(demand.node) {
			if possible, _ := q.reachable(demand.node, inputs.bindings); possible {
				// The selected class owns field membership. The original live
				// allocating prefix authorizes only this effect destination,
				// never a nested class receiver or another publication.
				destination := inputs.ownedFact
				if destination != nil && destinationInstance.live(q) && destination == destinationInstance.inputs.ownedFact && destination.node == q.effectOwner && destination.normalInputs != nil && destination.normalInputs.ownedFact == destination && destination.normalInputs.operationLifetime != nil {
					beforeSources, beforeContexts := len(destination.summary.DirectEffectSources), len(destination.directContext)
					appendDirectReferenceEffects(destination, demand.node, ast.GetSourceFileOfNode(demand.node), q.owner.checker, q.executable)
					q.recordEstimatedCost(len(destination.summary.DirectEffectSources) - beforeSources + len(destination.directContext) - beforeContexts)
				}
			}
		}
	}
}

// constructMayField adopts only potential effects into the original New batch.
// No normal lifetime is begun and no value/receipt from inventory is published.
func (q *sourceValueQuery) constructMayField(instance *sourceConstructedInstance, field *ast.Node, captured acquiredCallableScope, result *accessorCandidates) {
	if !q.descriptorEffectAllocation(1, unsafe.Sizeof(sourceConstructionMayPrefix{})+unsafe.Sizeof(sourceValueInputs{}), result, field) {
		return
	}
	scope := q.copyCallableScope(captured, result)
	scope.bindings[0] = []sourceValue{{node: instance.site, instance: instance}}
	inputs := &sourceValueInputs{declaration: field, invocation: instance.site, bindings: scope.bindings, population: q.owner.normalPopulation(field), ownedFact: instance.inputs.ownedFact}
	prefix := &sourceConstructionMayPrefix{instance: instance, field: field, completed: len(instance.fields)}
	previousInputs, previousOperation, previousCreators := q.inputs, q.operation, q.creators
	previousMay, previousObservation, previousCaller := q.constructionMay, q.returnObservation, q.callerInputs
	q.inputs, q.operation, q.creators = inputs, nil, scope.creators
	q.constructionMay, q.returnObservation, q.callerInputs = prefix, nil, nil
	defer func() {
		q.inputs, q.operation, q.creators = previousInputs, previousOperation, previousCreators
		q.constructionMay, q.returnObservation, q.callerInputs = previousMay, previousObservation, previousCaller
	}()
	if !prefix.live(q) {
		result.opaque, result.valueIncomplete = true, true
		return
	}
	q.installNormalCaptures(inputs, instance.inputs, result)
	part := accessorCandidates{}
	q.consumeClassFieldDemands(instance, field, inputs, true, &part)
	q.adoptConstructionMayEffects(field, part, result)
}

// adoptConstructionMayEffects transfers only conservative effects and write
// addresses into the requesting original New. No execution authority survives.
func (q *sourceValueQuery) adoptConstructionMayEffects(field *ast.Node, part accessorCandidates, result *accessorCandidates) {
	// Keep conservative graph edges and address-only writes, not any execution
	// fulfilment or returned-value/descriptor/Has/Get authority from inventory.
	result.opaque, result.valueIncomplete = true, true
	result.thenIncomplete = result.thenIncomplete || part.thenIncomplete
	if !q.descriptorEffectAllocation(len(part.effects), unsafe.Sizeof(sourceCallableEffect{}), result, field) || !q.descriptorEffectAllocation(len(part.writes), unsafe.Sizeof(sourceValueWrite{}), result, field) {
		return
	}
	for _, effect := range part.effects {
		result.effects = append(result.effects, sourceCallableEffect{declaration: effect.declaration, arrayMapCall: effect.arrayMapCall})
		q.recordFacts(1)
	}
	for _, write := range part.writes {
		if !q.descriptorEffectAllocation(len(write.value.path), unsafe.Sizeof(""), result, field) {
			continue
		}
		result.writes = append(result.writes, write.detached())
		q.recordFacts(1)
		q.recordEstimatedCost(len(write.value.path))
	}
}

func (q *sourceValueQuery) constructedOutput(node *ast.Node) (sourceResultObservation, bool) {
	slot := q.normalOperation(node, false)
	if slot == nil || len(slot.output.values) != 1 || slot.output.values[0].value.instance == nil {
		return sourceResultObservation{}, false
	}
	return normalGetOutput(slot), true
}

// constructedRead consumes the actual finite own-data population. It preserves
// independent write uncertainty and never re-evaluates a field initializer.
func (q *sourceValueQuery) constructedRead(value sourceValue, path []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates, consume func(sourceObservedValue, []string), prototype func(*ast.Node, []string)) {
	instance := value.instance
	mayPrefix := q.constructionMay.live(q) && q.constructionMay.instance == instance
	if mode&accessorSet != 0 {
		result.opaque, result.valueIncomplete = true, true
		return
	}
	if !instance.live(q) || instance.state != sourceOperationConsumed && !mayPrefix && !q.constructionFieldDomain(q.inputs, q.reading) {
		result.opaque, result.valueIncomplete = true, true
		return
	}
	if mayPrefix {
		defer func() { result.opaque, result.valueIncomplete = true, true }()
	}
	path = append(append([]string(nil), value.path...), path...)
	lookupPath := append([]string(nil), path...)
	if len(path) == 0 && name == "" && mode == accessorAcquire {
		result.values = append(result.values, value)
		return
	}
	selected := name
	selectionKnown := name != "" || len(path) != 0
	if len(path) != 0 {
		selected = path[0]
		path = path[1:]
	}
	if instance.state == sourceOperationConsumed || mayPrefix {
		writes := accessorCandidates{}
		q.memberValuesAtGet(instance.site, nil, selected, mode, bindings, &writes, func(sourceValue) {}, sourceMemberOperationProof{}, nil)
		mergeAccessorCandidates(result, writes)
		if writes.opaque || writes.ownOperation || len(writes.values) != 0 {
			result.opaque, result.valueIncomplete = true, true
			if !mayPrefix {
				return
			}
		}
	}
	for i := range instance.fields {
		field := instance.fields[i]
		if selectionKnown && field.key != selected {
			continue
		}
		retainResultUncertainty(field.observed, result, sourceExecutionOutput)
		for _, observed := range field.observed.values {
			consume(observed, path)
		}
	}
	// Missing own data is not proof of prototype absence. Prototype acquisition
	// stays with the existing class/descriptor owner rather than a made-up value.
	if selectionKnown {
		for _, field := range instance.fields {
			if field.key == selected {
				return
			}
		}
		if mayPrefix {
			return
		} // An unfinished prefix proves no missing property absent.
		// Own absence is distinct from whole-property absence. The existing
		// selected class lookup owns prototype descriptors and actual Get effects.
		prototype(instance.target, lookupPath)
	}
}

// retainConstructedCallResult borrows a directly returned allocation until the
// original caller's result consumers exit. Its normal Call slot holds an
// incomplete value-only lifetime anchor, never another execution certificate.
// The original New keeps its identity, output and sole publication ownership.
func (q *sourceValueQuery) retainConstructedCallResult(call *ast.Node, body *sourceValueInputs, observed sourceResultObservation, result *accessorCandidates) bool {
	if body == nil || body.invocation != call || body.operationLifetime == nil || q.inputs == nil || q.inputs == body || q.inputs.operationLifetime == nil || observed.effects != sourceEffectsAccounted || !ast.IsCallExpression(call) {
		return false
	}
	slot := q.normalOperation(call, false)
	if slot == nil || slot.state != sourceOperationInProgress || !slot.authority.valid(q) || slot.population != q.inputs.population || slot.entry == nil || !slot.entry.once || slot.population == nil || slot.population.entries[call] != slot.entry {
		return false
	}
	var retained []sourceObservedValue
	for _, value := range observed.values {
		instance := value.value.instance
		if instance == nil || instance.inputs != body || value.inputs != body || instance.authority != slot.authority || !instance.live(q) {
			continue
		}
		if !q.descriptorEffectAllocation(1, unsafe.Sizeof(sourceObservedValue{}), result, call) {
			return false
		}
		retained = append(retained, value)
	}
	if len(retained) == 0 {
		return false
	}
	slot.output.values = append(slot.output.values, retained...)
	slot.output.incomplete, slot.output.effects = true, sourceEffectsUnaccounted
	return true
}

// releaseConstructedOutputs revokes before releasing nested field frames, so a
// copied/self-referential value cannot cause a recursive cleanup or escape.
func releaseConstructedOutputs(inputs *sourceValueInputs) {
	for node, slot := range inputs.operations {
		for _, observed := range slot.output.values {
			instance := observed.value.instance
			if instance == nil || instance.inputs == nil {
				continue
			}
			if instance.inputs != inputs {
				// Only the actual Call which adopted this body's returned output
				// can release its borrowed frame. Ordinary Get aliases cannot.
				body := instance.inputs
				if ast.IsCallExpression(node) && body.invocation == node && observed.inputs == body && slot.authority == instance.authority {
					releaseNormalOperations(body)
				}
				continue
			}
			instance.state = sourceOperationRefused
			instance.inputs = nil
			for _, field := range instance.fields {
				for _, value := range field.observed.values {
					if value.inputs != nil && value.inputs != inputs {
						releaseNormalOperations(value.inputs)
					}
				}
			}
		}
	}
}
