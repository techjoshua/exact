package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// definePropertiesCallEffects retains getter dependencies for standard property
// definition and creation calls. It supplies neither an installed field nor a
// completed descriptor conversion.
// The original invocation retains all of its uncertainty and authored siblings.
func (query *sourceValueQuery) definePropertiesCallEffects(node *ast.Node, prepared sourcePreparedInvocation, bindings sourceValueBindings, result *accessorCandidates) {
	// This is the top-level original dependency Call only. Nested writer
	// probes and normal/result acquisition retain their existing paths.
	if !query.dependenciesOnly || query.operation != nil || query.sourceEffects.issuer != query || query.dependencyUse != node {
		return
	}
	callable := enclosingCallableNode(node)
	switch {
	case callable != nil:
		if query.reading != node || query.effectOwner != callable {
			return
		}
	case query.reading == node:
		if query.effectOwner != nil && !sourceStagedOccurrenceOwned(node, query.effectOwner) {
			return
		}
	default:
		// Definition availability asks for effects on the direct initializer.
		if query.effectOwner != nil || query.reading == nil ||
			!ast.IsVariableDeclaration(query.reading) || query.reading.Initializer() != node {
			return
		}
	}
	if query.retainSoleDescriptorMapGetter(node, prepared.acquired, bindings, result) || callable == nil && (query.effectOwner != nil || query.reading != node) {
		return
	}
	selected, single := false, false
	for _, value := range prepared.acquired.values {
		selected = selected || value.native != nil && value.native.kind == sourceNativeObjectDefineProperties
		single = single || value.native != nil && value.native.kind == sourceNativeObjectDefineProperty
	}
	if !ast.IsCallExpression(node) {
		return
	}
	call := node.AsCallExpression()
	actuals := restrictedInvocationArguments(call)
	if single && len(actuals) == 3 && !ast.IsSpreadElement(actuals[0]) && !ast.IsSpreadElement(actuals[1]) && !ast.IsSpreadElement(actuals[2]) {
		callee := unwrapSourceCallableReference(call.Expression)
		if (ast.IsPropertyAccessExpression(callee) || ast.IsElementAccessExpression(callee)) && call.QuestionDotToken == nil {
			_, method := accessorReceiver(callee)
			if method == "defineProperty" {
				descriptor := unwrapSourceCallableReference(actuals[2])
				literal := ast.IsObjectLiteralExpression(descriptor)
				if !literal && ast.IsIdentifier(descriptor) {
					symbol := query.owner.checker.GetSymbolAtLocation(descriptor)
					if symbol != nil && len(symbol.Declarations) == 1 {
						declaration := symbol.Declarations[0]
						if ast.IsVariableDeclaration(declaration) {
							list := declaration.Parent
							initializer := unwrapSourceCallableReference(declaration.Initializer())
							literal = list != nil && ast.IsVariableDeclarationList(list) &&
								list.Flags&ast.NodeFlagsConst != 0 && declaration.End() < node.Pos() &&
								enclosingCallableNode(declaration) == query.effectOwner &&
								initializer != nil && ast.IsObjectLiteralExpression(initializer)
						}
					}
				}
				if literal {
					// A local const stabilizes the supplied binding, not its fields.
					// Pass the original argument so shared source Has/Get preserves
					// current writers, creating scope and the descriptor receiver.
					// No normal frame, completed Get or field immutability follows.
					query.normalizeDescriptorSourceFields(node, sourceValue{node: descriptor}, bindings, result)
				}
			}
		}
	}

	// Adapted and spread vectors retain their existing owner. This finite
	// direct-Call contribution must not reinterpret an adapter's raw arguments.
	if call.QuestionDotToken != nil || len(actuals) != 2 || ast.IsSpreadElement(actuals[0]) || ast.IsSpreadElement(actuals[1]) {
		return
	}
	callee := unwrapSourceCallableReference(call.Expression)
	if !ast.IsPropertyAccessExpression(callee) && !ast.IsElementAccessExpression(callee) {
		return
	}
	_, method := accessorReceiver(callee)
	create := query.standardCreateDescriptorMap(call) != nil
	if !create && !(selected && method == "defineProperties") {
		return // call/apply adapters must use their own supplied-vector owner.
	}
	argument := unwrapSourceCallableReference(actuals[1])
	if !ast.IsObjectLiteralExpression(argument) {
		return // Other input producers retain their existing protocol owner.
	}
	maps, admitted := query.actualArgumentValues(node, argument, result)
	if !admitted {
		maps = query.originsAt(argument, query.boundInputAcquisition(argument, node), bindings, result)
	}
	for _, value := range maps {
		// Only the finite original map supplies field names. Actual reads below
		// still use its acquired receiver and the existing writer/Get owners.
		if value.node == nil || len(value.path) != 0 || !ast.IsObjectLiteralExpression(value.node) {
			continue
		}
		for _, member := range value.node.AsObjectLiteralExpression().Properties.Nodes {
			if !query.charge(result, member) {
				return
			}
			if member.Name() == nil || !(ast.IsPropertyAssignment(member) && ast.IsObjectLiteralExpression(unwrapSourceCallableReference(member.Initializer())) || create && ast.IsGetAccessorDeclaration(member)) {
				continue
			}
			if ast.IsComputedPropertyName(member.Name()) {
				if !ast.IsPropertyAssignment(member) || len(value.node.AsObjectLiteralExpression().Properties.Nodes) != 1 {
					continue // Multiple-entry identity/collisions retain the old path.
				}
				key := member.Name().AsComputedPropertyName().Expression
				checked := query.owner.checker.GetTypeAtLocation(key)
				primitive := checked != nil
				if primitive {
					for _, part := range checked.Distributed() {
						primitive = primitive && part.Flags()&(checker.TypeFlagsStringLike|checker.TypeFlagsNumberLike|checker.TypeFlagsESSymbolLike) != 0
					}
				}
				if primitive {
					// The sole own entry cannot be overwritten by another key.
					// Preserve its actual creating scope; the eager owner alone
					// evaluates the key and any coercion/Throw. No key is acquired.
					query.withProxySourceScope(value, bindings, func(scope sourceValueBindings) {
						descriptor := sourceValue{node: unwrapSourceCallableReference(member.Initializer())}
						query.normalizeDescriptorSourceFields(node, descriptor, scope, result)
					})
				}
				continue
			}
			name := callableNameText(member.Name())
			if name == "__proto__" && ast.IsPropertyAssignment(member) {
				continue // A prototype initializer is not an enumerable own entry.
			}
			descriptors := query.bindingPropertyOperation([]sourceValue{value}, name, bindings, result, accessorAcquire, node)
			for _, descriptor := range descriptors {
				// Reuse ordered source Has/Get MAY. Without an installed issuer
				// it retains known donors and opaque phases, never a successful Get.
				if descriptor.node != nil && len(descriptor.path) == 0 && ast.IsObjectLiteralExpression(descriptor.node) {
					query.normalizeDescriptorSourceFields(node, descriptor, bindings, result)
				}
			}
		}
	}
}

// standardCreateDescriptorMap selects the literal map shared by the creation
// effects and a later named read of the created object.
func (query *sourceValueQuery) standardCreateDescriptorMap(call *ast.CallExpression) *ast.Node {
	if call.QuestionDotToken != nil || call.Arguments == nil || len(call.Arguments.Nodes) != 2 || ast.IsSpreadElement(call.Arguments.Nodes[0]) {
		return nil
	}
	mapping := unwrapSourceCallableReference(call.Arguments.Nodes[1])
	if !ast.IsObjectLiteralExpression(mapping) {
		return nil
	}
	receiver, method := sourceLiteralMemberReference(call.Expression)
	if method != "create" || !ast.IsIdentifier(receiver) || receiver.Text() != "Object" || !standardLibraryCallRoot(call.Expression, query.owner.checker) {
		return nil
	}
	return mapping
}

// retainCreatedGetter associates a named read with an installed literal getter.
// Descriptor conversion has already run at the creating call.
func (query *sourceValueQuery) retainCreatedGetter(call *ast.Node, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates) {
	if !query.dependenciesOnly || mode&accessorNoGet != 0 {
		return
	}
	if len(projection) == 1 && name == "" {
		name = projection[0]
	} else if len(projection) != 0 {
		return
	}
	if name == "" || name == "__proto__" {
		return
	}
	mapping := query.standardCreateDescriptorMap(call.AsCallExpression())
	if mapping == nil {
		return
	}
	for _, entry := range mapping.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, entry) {
			return
		}
		if !ast.IsPropertyAssignment(entry) || ast.IsComputedPropertyName(entry.Name()) || callableNameText(entry.Name()) != name {
			continue
		}
		descriptor := unwrapSourceCallableReference(entry.Initializer())
		if !ast.IsObjectLiteralExpression(descriptor) {
			continue
		}
		for _, field := range descriptor.AsObjectLiteralExpression().Properties.Nodes {
			if !query.charge(result, field) {
				return
			}
			if field.Name() == nil || ast.IsComputedPropertyName(field.Name()) || callableNameText(field.Name()) != "get" {
				continue
			}
			body := field
			switch {
			case ast.IsPropertyAssignment(field):
				body = unwrapSourceCallableReference(field.Initializer())
			case ast.IsShorthandPropertyAssignment(field):
				body = field.Name()
			case ast.IsMethodDeclaration(field):
			default:
				continue
			}
			query.reflectiveSourceGet(body, call, name, &sourceGetInputs{operation: query.protectedMember, receiver: sourceValue{node: call}}, bindings, result)
		}
	}
}

// retainSoleDescriptorMapGetter retains the actual selector and the sole
// enumerable entry of a fresh map. The original Call still controls writes,
// throws, and descriptor completion. An unavailable module can make the
// selection opaque while leaving the originally acquired native alternative
// visible. Retain that alternative's effects alongside the uncertainty.
func (q *sourceValueQuery) retainSoleDescriptorMapGetter(node *ast.Node, acquired sourceSelectionProjection, bindings sourceValueBindings, result *accessorCandidates) bool {
	call := node.AsCallExpression()
	var mapping *ast.Node
	create := q.standardCreateDescriptorMap(call)
	if create != nil {
		actuals := restrictedInvocationArguments(call)
		if unwrapSourceCallableReference(actuals[0]).Kind != ast.KindNullKeyword {
			return false
		}
		mapping = create
	} else {
		if len(acquired.values) != 1 || acquired.receiverIncomplete || acquired.valueIncomplete {
			return false
		}
		native := acquired.values[0].native
		if native == nil || native.kind != sourceNativeObjectDefineProperties {
			return false
		}
		callee := unwrapSourceCallableReference(call.Expression)
		if !ast.IsAccessExpression(callee) {
			return false
		}
		_, method := accessorReceiver(callee)
		actuals := restrictedInvocationArguments(call)
		if method != "defineProperties" || call.QuestionDotToken != nil || len(actuals) != 2 {
			return false
		}
		target := unwrapSourceCallableReference(actuals[0])
		mapping = unwrapSourceCallableReference(actuals[1])
		if !ast.IsObjectLiteralExpression(target) || !sourceInertValueCreation(target) || !ast.IsObjectLiteralExpression(mapping) {
			return false
		}
	}
	entries := mapping.AsObjectLiteralExpression().Properties.Nodes
	if len(entries) != 1 {
		return false
	}
	entry := entries[0]
	if ast.IsGetAccessorDeclaration(entry) {
		if create != nil && !simpleCreatedDescriptorEntry(entry) {
			return false
		}
		get := &sourceGetInputs{operation: node, receiver: sourceValue{node: mapping}}
		observed := q.acquireGetResult(entry, get, q.acquireCallableScope(bindings, result), result)
		for _, returned := range observed.values {
			value := returned.value
			if len(value.path) == 0 && value.native == nil && value.normal == nil {
				if getter := soleDescriptorFieldGetter(value.node); getter != nil {
					get := &sourceGetInputs{operation: node, receiver: value}
					q.executeGetEffects(getter, get, returned.scope, result)
					if create != nil && !descriptorGetterHasEmptyMutationSyntax(getter) {
						result.opaque = true
					}
				}
			}
		}
		return true
	}
	if ast.IsPropertyAssignment(entry) && callableNameText(entry.Name()) != "__proto__" {
		desc := unwrapSourceCallableReference(entry.Initializer())
		if getter := soleDescriptorFieldGetter(desc); getter != nil && (create == nil || descriptorGetterHasEmptyMutationSyntax(getter)) {
			get := &sourceGetInputs{operation: node, receiver: sourceValue{node: desc}}
			q.executeGetEffects(getter, get, q.acquireCallableScope(bindings, result), result)
			return true
		}
	}
	return false
}

// soleDescriptorFieldGetter recognizes an original plain descriptor field.
func soleDescriptorFieldGetter(descriptor *ast.Node) *ast.Node {
	if !ast.IsObjectLiteralExpression(descriptor) {
		return nil
	}
	fields := descriptor.AsObjectLiteralExpression().Properties.Nodes
	if len(fields) != 1 || !ast.IsGetAccessorDeclaration(fields[0]) || ast.IsComputedPropertyName(fields[0].Name()) {
		return nil
	}
	for _, key := range reflectiveDescriptorKeys {
		if callableNameText(fields[0].Name()) == key {
			return fields[0]
		}
	}
	return nil
}

// simpleCreatedDescriptorEntry bounds the map Get to a plain returned descriptor.
// The Get still contributes its original body effects and acquired return scope.
func simpleCreatedDescriptorEntry(entry *ast.Node) bool {
	if entry.Body() == nil || !ast.IsBlock(entry.Body()) || ast.IsComputedPropertyName(entry.Name()) || !descriptorGetterHasEmptyMutationSyntax(entry) {
		return false
	}
	statements := entry.Body().AsBlock().Statements.Nodes
	if len(statements) != 1 || !ast.IsReturnStatement(statements[0]) {
		return false
	}
	descriptor := unwrapSourceCallableReference(statements[0].Expression())
	if descriptor == nil || !ast.IsObjectLiteralExpression(descriptor) {
		return false
	}
	fields := descriptor.AsObjectLiteralExpression().Properties.Nodes
	return len(fields) == 1 && (soleDescriptorFieldGetter(descriptor) != nil ||
		ast.IsPropertyAssignment(fields[0]) && !ast.IsComputedPropertyName(fields[0].Name()) &&
			callableNameText(fields[0].Name()) == "value")
}
