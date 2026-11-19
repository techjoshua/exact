package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// appendImplicitAccessorEffects models the ordinary operations that read an object's values
// without a property-access expression. Enumeration of keys alone does not invoke getters.
func appendImplicitAccessorEffects(fact *callableFacts, node *ast.Node, targets map[*ast.Node]int, source *ast.SourceFile, typeChecker *checker.Checker, bindings map[ast.SymbolId]*ast.Node, owner *executableBodyOwner, work *callableEffectWork, facts []callableFacts) {
	if work != nil && fact.normalInputs == nil && len(bindings) == 0 && ast.IsNewExpression(node) {
		if consumer, known := work.memberNodes[fact.node]; known && work.stageConstructionEffects(facts, consumer, node, owner) {
			return
		}
	}
	visitImplicitAccessors(node, typeChecker, bindings, owner, fact.node, fact.nativeCalls, func(candidates accessorCandidates) {
		appendOpaqueAccessorEffect(fact, candidates)
		appendSourceValueWrites(fact, candidates, typeChecker)
		appendAccessorTargets(fact, node, candidates, targets, source)
	}, fact.normalInputs)
}

// visitImplicitAccessors shares value-reading operations with eager module placement.
// Enumeration of class prototype properties does not execute their accessors.
func visitImplicitAccessors(node *ast.Node, typeChecker *checker.Checker, bindings map[ast.SymbolId]*ast.Node, owner *executableBodyOwner, consumer *ast.Node, receipts []*sourceNativeInvocation, visit func(accessorCandidates), normal ...*sourceValueInputs) {
	var query *sourceValueQuery
	if len(normal) == 1 && normal[0] != nil {
		var values *sourceValueOwner
		if owner != nil {
			values = owner.values
		}
		if values == nil {
			values = newSourceValueOwner(typeChecker)
		}
		query = &sourceValueQuery{owner: values, executable: owner, effectOwner: consumer, inputs: normal[0], remaining: 4096, active: make(map[*ast.Node]bool), reading: node, operation: &sourceOperationContext{node: node, owner: consumer, inputs: normal[0]}}
	} else {
		// Only these expressions and binding patterns can perform an implicit
		// read here. A normal invocation may still need its enclosing work ledger.
		switch node.Kind {
		case ast.KindNewExpression, ast.KindBinaryExpression, ast.KindVariableDeclaration, ast.KindSpreadAssignment, ast.KindCallExpression:
		default:
			visit(accessorCandidates{})
			return
		}
		query = newSourceDependencyQuery(node, typeChecker, owner, consumer)
		defer query.publishDependencyStatistics()
	}
	result := accessorCandidates{}
	finish := query.normalWork(&result, node)
	defer func() { finish.finish(&result); visit(result) }()
	if !query.dependenciesOnly {
		query.returnObservation = &sourceReturnObservation{owner: consumer, reader: node, frame: query.inputs, receipts: receipts}
	}
	if ast.IsNewExpression(node) {
		query.standardConstructionSource = node // original reached descent only
		query.retainThenOperation(node, nil, &result)
		mergeAccessorCandidates(&result, query.invocation(node, nil))
	}
	bound := make(sourceValueBindings)
	for id, value := range bindings {
		bound[id] = []sourceValue{{node: value}}
	}
	assignment := ast.IsBinaryExpression(node) && nativeAssignmentTargetRole(node.AsBinaryExpression().Left) == nativeAssignmentPattern && ast.IsObjectLiteralExpression(node.AsBinaryExpression().Left)
	if assignment {
		query.assignmentPatternReads(node, bound, &result)
		return
	}
	if ast.IsVariableDeclaration(node) && ast.IsObjectBindingPattern(node.Name()) {
		query.bindPattern(node.Name(), query.originsAt(node.Initializer(), node, bound, &result), bound, &result, accessorRead)
	}
	visitImplicitAccessorQueries(node, typeChecker, func(receiver *ast.Node, path []string, name string, mode accessorTraversal) accessorCandidates {
		return query.accessors(receiver, path, name, mode, bound, nil)
	}, func(candidates accessorCandidates) { mergeAccessorCandidates(&result, candidates) })
}

// visitImplicitAccessorQueries shares syntax demands while the caller owns substitution and budget.
func visitImplicitAccessorQueries(node *ast.Node, typeChecker *checker.Checker, query func(*ast.Node, []string, string, accessorTraversal) accessorCandidates, visit func(accessorCandidates)) {
	var receivers []*ast.Node
	if ast.IsSpreadAssignment(node) {
		receivers = append(receivers, node.AsSpreadAssignment().Expression)
	}
	if ast.IsCallExpression(node) {
		call := node.AsCallExpression()
		expression := unwrapSourceCallableReference(call.Expression)
		if expression != nil && ast.IsPropertyAccessExpression(expression) && call.Arguments != nil {
			member := expression.AsPropertyAccessExpression()
			receiver := unwrapSourceCallableReference(member.Expression)
			if receiver != nil && ast.IsIdentifier(receiver) && standardLibraryCallRoot(expression, typeChecker) {
				name := member.Name().Text()
				if receiver.Text() == "Object" && (name == "values" || name == "entries" || name == "assign") {
					start := 0
					if name == "assign" {
						start = 1
					}
					if start < len(call.Arguments.Nodes) {
						receivers = append(receivers, call.Arguments.Nodes[start:]...)
					}
				}
				if receiver.Text() == "JSON" && name == "stringify" && len(call.Arguments.Nodes) > 0 {
					candidates := query(call.Arguments.Nodes[0], nil, "", accessorSerialize)
					visit(candidates)
				}
			}
		}
	}
	for _, receiver := range receivers {
		candidates := query(receiver, nil, "", accessorEnumerate)
		visit(candidates)
	}
}

// bindPattern owns binding-time reads for formals and local declarations. Identifier
// binding acquires no property. Patterns acquire each selected value before descending,
// so unused names still execute getters and a copied rest never rereads its source.
// Queries for binding reads do not consume the resulting values.
// Their existing environment walker owns initializer/default evaluation. Acquisition consumers
// additionally need bound origins for body demands. Missing value provenance must not replace
// a known initializer's platform requirement with unknown execution. Neither mode grants
// performed-write authority.
func (query *sourceValueQuery) bindPattern(pattern *ast.Node, values []sourceValue, bound sourceValueBindings, result *accessorCandidates, mode accessorTraversal) {
	query.bindInputPattern(pattern, values, bound, result, mode, nil)
}

// bindInputPattern retains nested default activation in the same input plan as formals.
func (query *sourceValueQuery) bindInputPattern(pattern *ast.Node, values []sourceValue, bound sourceValueBindings, result *accessorCandidates, mode accessorTraversal, inputs *sourceValueInputs) {
	query.bindInputPatternUsing(pattern, values, bound, result, mode, inputs, query.bindingProperty)
}

func (query *sourceValueQuery) bindInputPatternUsing(pattern *ast.Node, values []sourceValue, bound sourceValueBindings, result *accessorCandidates, mode accessorTraversal, inputs *sourceValueInputs, property func([]sourceValue, string, sourceValueBindings, *accessorCandidates, accessorTraversal) []sourceValue) {
	values = query.sealInitializerValues(values, result)
	if pattern == nil || !query.charge(result, pattern) {
		return
	}
	if ast.IsIdentifier(pattern) {
		if symbol := query.owner.checker.GetSymbolAtLocation(pattern); symbol != nil {
			bound[ast.GetSymbolId(symbol)] = values
		}
		return
	}
	if !ast.IsObjectBindingPattern(pattern) && !ast.IsArrayBindingPattern(pattern) {
		result.opaque = true
		return
	}
	if len(values) == 0 {
		result.opaque = true
	}
	if ast.IsArrayBindingPattern(pattern) {
		if mode == accessorRead {
			return
		}
		// Indexed source facts do not prove iterator identity, consumption or closing.
		// Retain known source iterator bodies without interpreting the iterator protocol.
		result.opaque = true
		for _, value := range values {
			if !query.charge(result, value.node) {
				break
			}
			if value.node != nil && ast.IsObjectLiteralExpression(value.node) && len(value.path) == 0 {
				for _, member := range value.node.AsObjectLiteralExpression().Properties.Nodes {
					if !query.charge(result, member) {
						break
					}
					if member.Name() == nil || !ast.IsComputedPropertyName(member.Name()) {
						continue
					}
					key := member.Name().AsComputedPropertyName().Expression
					if ast.IsPropertyAccessExpression(key) && key.AsPropertyAccessExpression().Name().Text() == "iterator" && standardLibraryCallRoot(key, query.owner.checker) {
						if ast.IsGetAccessorDeclaration(member) || ast.IsMethodDeclaration(member) && (member.AsMethodDeclaration().AsteriskToken == nil || len(pattern.AsBindingPattern().Elements.Nodes) > 0) {
							result.retainCallableEffect(pattern, member)
						}
					}
				}
			}
		}
	}
	excluded := make(map[string]bool)
	for index, binding := range pattern.AsBindingPattern().Elements.Nodes {
		if !query.charge(result, binding) {
			return
		}
		if !ast.IsBindingElement(binding) {
			continue
		}
		element := binding.AsBindingElement()
		key, finite := bindingSegment(pattern, binding, index)
		if property := element.PropertyName; property != nil && ast.IsComputedPropertyName(property) {
			computed := property.AsComputedPropertyName().Expression
			result.producers = append(result.producers, computed)
			key = sourceLiteralMemberName(computed)
			finite = key != ""
		}
		var selected []sourceValue
		if ast.IsArrayBindingPattern(pattern) {
			// There is no positional proof for a custom or inherited iterator here.
			selected = []sourceValue{{}}
		} else if element.DotDotDotToken != nil {
			if mode == accessorRead {
				for _, value := range values {
					mergeAccessorCandidates(result, query.accessors(value.node, value.path, "", accessorEnumerate, bound, nil))
				}
			} else {
				selected = query.bindingRest(values, excluded, bound, result)
			}
		} else {
			if !finite {
				result.opaque = true
			}
			previousField := query.protectedMember
			query.protectedMember = binding
			field := accessorCandidates{}
			selected = property(values, key, bound, &field, mode)
			mergeAccessorCandidates(result, field)
			query.protectedMember = previousField
			excluded[key] = true
		}
		if mode == accessorAcquire {
			selected = query.bindingDefault(selected, element.Initializer, bound, result, inputs)
		}
		query.bindInputPatternUsing(element.Name(), selected, bound, result, mode, inputs, property)
	}
}

// bindingProperty separates the property read from the acquired value. In particular,
// a getter returning an object is executed now, and later uses refer to its result.
func (query *sourceValueQuery) bindingProperty(values []sourceValue, key string, bound sourceValueBindings, result *accessorCandidates, mode accessorTraversal) []sourceValue {
	return query.bindingPropertyOperation(values, key, bound, result, mode, query.protectedMember)
}

func (query *sourceValueQuery) bindingPropertyOperation(values []sourceValue, key string, bound sourceValueBindings, result *accessorCandidates, mode accessorTraversal, operation *ast.Node) []sourceValue {
	// Inventory projection shares the pattern traversal but is not a Get. Publish
	// demand dispositions only here, from this actual operation's alternatives.
	parent := result
	field := accessorCandidates{}
	result = &field
	defer func() {
		if operation != nil && ast.IsBindingElement(operation) {
			demand := query.operationFieldDemand(operation, key)
			if !query.dependenciesOnly {
				// Preserve the original normal captured-slot request. Source-only
				// nested coverage cannot widen its top-level receipt contract.
				pattern := operation.Parent
				if pattern != nil && ast.IsObjectBindingPattern(pattern) {
					if declaration := pattern.Parent; declaration != nil && ast.IsVariableDeclaration(declaration) {
						demand, _ = query.fieldDemand(operation, declaration.Initializer(), key)
					}
				}
			}
			if demand.declaration != nil {
				covered := false
				if query.dependenciesOnly {
					// Source substitution covers this Get's effects, without an
					// own-slot receipt or a normal value/descriptor certificate.
					covered = field.sourceOwned && !field.fieldReceiverIncomplete
				} else {
					covered = query.fieldSlotsCover(operation, key, values, field.ownSlots, &field)
				}
				fulfilled := len(values) > 0 && covered && !field.opaque && !field.valueIncomplete && !field.receiverIncomplete
				field.fieldOutcomes = append(field.fieldOutcomes, sourceFieldOutcome{demand: demand, fulfilled: fulfilled})
			}
		}
		mergeAccessorCandidates(parent, field)
	}()
	var selected []sourceValue
	for _, value := range values {
		if !query.charge(result, value.node) {
			break
		}
		if query.missingFieldGet(value, key, operation, result) {
			selected = append(selected, sourceValue{})
			continue
		}
		if value.normal != nil {
			scope, admitted := query.normalValueScope(value, result)
			if !admitted {
				result.opaque = true
				continue
			}
			func() {
				previous := query.creators
				defer func() { query.creators = previous }()
				query.creators = scope.creators
				selected = append(selected, query.bindingPropertyAtGet(value, key, scope.bindings, result, mode, query.normalFieldGet(value, key, operation, result))...)
			}()
			continue
		}
		if value.copied != nil {
			if entries, exists := value.copied[key]; exists {
				selected = append(selected, entries...)
			} else {
				selected = append(selected, sourceValue{undefined: true})
			}
			continue
		}
		if value.node == nil || value.undefined {
			result.opaque = true
			selected = append(selected, sourceValue{})
			continue
		}
		selected = append(selected, query.bindingPropertyAtGet(value, key, bound, result, mode, nil)...)
	}
	return selected
}

// bindingPropertyAtGet shares one operation-local descriptor proof between the
// effect read and value acquisition. It never repeats the lifetime inventory.
func (query *sourceValueQuery) bindingPropertyAtGet(value sourceValue, key string, bound sourceValueBindings, result *accessorCandidates, mode accessorTraversal, get *sourceGetInputs) []sourceValue {
	var selected []sourceValue
	value.normal = nil
	read := query.accessorsAtGet(value.node, nil, key, accessorRead, bound, nil, get, value)
	mergeAccessorCandidates(result, read)
	path := []string{key}
	if mode == accessorRead {
		// The current read uses a relative key under the admitted alternative.
		// Recursion publishes its full residual path and original metadata.
		value.path = append(append([]string(nil), value.path...), key)
		selected = append(selected, value)
		return selected
	}
	acquired := query.accessorsAtGet(value.node, path, "", accessorAcquire, bound, nil, get, value)
	// A closed literal with no own member supplies the ordinary absent value.
	// Spreads, computed names and intervening writes cannot use this shortcut.
	if len(acquired.values) == 0 && !read.opaque && ast.IsObjectLiteralExpression(value.node) && len(value.path) == 0 && key != "" {
		absent, closed := true, true
		var data, initializedAt *ast.Node
		for _, member := range value.node.AsObjectLiteralExpression().Properties.Nodes {
			if !query.charge(result, member) {
				absent, closed = false, false
				break
			}
			if member.Name() == nil || ast.IsComputedPropertyName(member.Name()) || callableNameText(member.Name()) == "__proto__" {
				absent, closed = false, false
				continue
			}
			if callableNameText(member.Name()) == key {
				absent = false
				initializedAt = member
				if ast.IsPropertyAssignment(member) {
					data = member.AsPropertyAssignment().Initializer
				} else if ast.IsShorthandPropertyAssignment(member) {
					data = member.Name()
				}
			}
		}
		if closed && data != nil {
			// An own data read adds no execution of the value's contents. Retain its
			// acquired input origin when a native or symbolic value has no finite result.
			acquired.opaque = false
			acquired.values = query.originsAt(data, initializedAt, bound, &acquired)
		}
		if absent {
			selected = append(selected, sourceValue{undefined: true})
			return selected
		}
	}
	// The read can be complete while its returned value remains unknown. An unused
	// binding does not consume that value's members or require callable identity.
	if !read.opaque && read.sourceOwned && len(read.declarations) > 0 && len(acquired.values) == 0 {
		acquired.opaque = false
	}
	mergeAccessorCandidates(result, acquired)
	selected = append(selected, acquired.values...)
	// Incompleteness belongs beside known alternatives, not only to an empty
	// result. Dropping it here would make later consumers see an exhaustive set.
	if len(acquired.values) == 0 || acquired.valueIncomplete {
		selected = append(selected, sourceValue{})
	}
	return selected
}

// bindingDefault selects only undefined inputs. Unknown inputs retain both alternatives
// and incompleteness. Null, false, zero and empty strings do not select a default.
func (query *sourceValueQuery) bindingDefault(values []sourceValue, initializer *ast.Node, bound sourceValueBindings, result *accessorCandidates, inputs *sourceValueInputs) []sourceValue {
	if initializer == nil {
		return values
	}
	var alternatives []sourceValue
	for _, value := range values {
		node := unwrapSourceCallableReference(value.node)
		branch := node != nil && ast.IsConditionalExpression(node)
		if node != nil && ast.IsBinaryExpression(node) {
			op := node.AsBinaryExpression().OperatorToken.Kind
			branch = op == ast.KindBarBarToken || op == ast.KindAmpersandAmpersandToken || op == ast.KindQuestionQuestionToken
		}
		if branch {
			acquired := query.accessors(node, value.path, "", accessorAcquire, bound, nil)
			mergeAccessorCandidates(result, acquired)
			alternatives = append(alternatives, acquired.values...)
			if acquired.opaque || len(acquired.values) == 0 {
				alternatives = append(alternatives, sourceValue{})
			}
		} else {
			alternatives = append(alternatives, value)
		}
	}
	var selected []sourceValue
	useDefault := len(values) == 0
	conditional := false
	for _, value := range alternatives {
		node := unwrapSourceCallableReference(value.node)
		undefined := value.undefined || node != nil && (ast.IsVoidExpression(node) || ast.IsIdentifier(node) && query.owner.checker.IsUndefinedSymbol(query.owner.checker.GetSymbolAtLocation(node)))
		if undefined {
			useDefault = true
			continue
		}
		selected = append(selected, value)
		if node == nil || len(value.path) != 0 || ast.IsIdentifier(node) || ast.IsCallExpression(node) {
			useDefault = true
			conditional = true
		}
	}
	conditional = conditional || useDefault && len(selected) > 0
	if inputs != nil {
		if _, recorded := inputs.defaults[initializer]; !recorded {
			inputs.order = append(inputs.order, initializer)
		}
		inputs.defaults[initializer] = sourceDefaultInput{conditional: conditional}
	} else {
		result.opaque = result.opaque || conditional
	}
	if useDefault {
		if inputs != nil {
			snapshot := make(sourceValueBindings, len(bound))
			for id, terms := range bound {
				if !query.charge(result, initializer) {
					break
				}
				snapshot[id] = terms
			}
			inputs.defaults[initializer] = sourceDefaultInput{bindings: snapshot, conditional: conditional}
		}
		if inputs == nil {
			result.producers = append(result.producers, initializer)
		}
		// Acquiring a default's value is distinct from executing its getter. An unknown
		// return value is consumed only by a later projection, just like bindingProperty.
		acquired := accessorCandidates{}
		var values []sourceValue
		if observed, admitted := query.consumeDefaultPlan(initializer, inputs, bound, &acquired); admitted {
			values = query.observedArgumentValues(observed, result)
		} else {
			values = query.originsAt(initializer, initializer, bound, &acquired)
		}
		if (ast.IsPropertyAccessExpression(unwrapSourceCallableReference(initializer)) || ast.IsElementAccessExpression(unwrapSourceCallableReference(initializer))) && (inputs == nil || query.normalBindingCall != inputs.invocation) {
			receiver, key := accessorReceiver(unwrapSourceCallableReference(initializer))
			read := query.accessors(receiver, nil, key, accessorRead, bound, nil)
			if !read.opaque && read.sourceOwned && len(values) == 0 {
				acquired.opaque = false
			}
			mergeAccessorCandidates(&acquired, read)
		}
		mergeAccessorCandidates(result, acquired)
		if len(values) == 0 {
			values = []sourceValue{{}}
		}
		selected = append(selected, values...)
	}
	return selected
}

// bindingRest enumerates finite own source keys with the pattern's exclusions. Copying
// preserves acquired value origins, never the source object's identity or getter ownership.
func (query *sourceValueQuery) bindingRest(values []sourceValue, excluded map[string]bool, bound sourceValueBindings, result *accessorCandidates) []sourceValue {
	copied := make(map[string][]sourceValue)
	for _, value := range values {
		if !query.charge(result, value.node) {
			break
		}
		if value.node == nil || !ast.IsObjectLiteralExpression(value.node) || len(value.path) != 0 {
			result.opaque = true
			continue
		}
		for _, member := range value.node.AsObjectLiteralExpression().Properties.Nodes {
			if !query.charge(result, member) {
				break
			}
			if member.Name() == nil || ast.IsComputedPropertyName(member.Name()) {
				result.opaque = true
				mergeAccessorCandidates(result, query.accessors(value.node, nil, "", accessorEnumerate, bound, nil))
				continue
			}
			key := callableNameText(member.Name())
			if !excluded[key] {
				copied[key] = query.bindingProperty([]sourceValue{value}, key, bound, result, accessorAcquire)
			}
		}
	}
	return []sourceValue{{copied: copied}}
}

// assignmentPatternReads acquires the RHS once and delegates each finite field
// Get to the ordinary binding-property owner under that alternative's original
// scope. Destinations are separate actual PutValue operations, not fake formals.
func (query *sourceValueQuery) assignmentPatternReads(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	assignment := node.AsBinaryExpression()
	acquired := accessorCandidates{}
	// The normal value/local/comma owner retains the actual successful occurrence
	// and original scope. Raw result observation remains transparent elsewhere.
	acquired.values = query.originsAt(assignment.Right, node, bindings, &acquired)
	mergeAccessorCandidates(result, acquired)
	if len(acquired.values) == 0 {
		result.opaque = true
	}
	for _, property := range assignment.Left.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, property) {
			return
		}
		if !ast.IsPropertyAssignment(property) || property.Name() == nil || ast.IsComputedPropertyName(property.Name()) {
			result.opaque = true
			continue
		}
		field := accessorCandidates{}
		for index, value := range acquired.values {
			scope, exists := acquired.callableScopes[index]
			if !exists {
				scope = query.acquireCallableScope(bindings, &field)
			}
			func() {
				previous := query.creators
				defer func() { query.creators = previous }()
				query.creators = scope.creators
				query.bindingPropertyOperation([]sourceValue{value}, callableNameText(property.Name()), scope.bindings, &field, accessorRead, property)
			}()
		}
		demand, _ := query.fieldDemand(property, assignment.Right, callableNameText(property.Name()))
		if demand.declaration != nil {
			field.fieldOutcomes = append(field.fieldOutcomes, sourceFieldOutcome{demand: demand, fulfilled: len(acquired.values) != 0 && !acquired.opaque && !acquired.receiverIncomplete && !acquired.valueIncomplete && query.fieldSlotsCover(property, callableNameText(property.Name()), acquired.values, field.ownSlots, &field)})
		}
		mergeAccessorCandidates(result, field)
		target := property.Initializer()
		if target == nil || !ast.IsIdentifier(target) && !ast.IsPropertyAccessExpression(target) && !ast.IsElementAccessExpression(target) {
			result.opaque = true
		}
	}
}
