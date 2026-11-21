package exactcompiler

import (
	"path/filepath"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// frameworkInputSymbol reads an already selected package declaration, never an
// implementation body or a newly loaded module. The package owns these symbol
// exports; arbitrary same-named application declarations are not contracts.
func (q *sourceValueQuery) frameworkInputSymbol(view sourceFrameworkStorageView, name string) (string, *ast.Symbol) {
	source := ast.GetSourceFileOfNode(view.declaration)
	if source == nil || q.owner == nil || q.owner.program == nil {
		return "", nil
	}
	path := filepath.Join(filepath.Dir(source.FileName()), "..", "internal", "symbols.d.ts")
	symbols := q.owner.program.GetSourceFile(path)
	if symbols == nil || !symbols.IsDeclarationFile {
		return "", nil
	}
	module := q.owner.checker.GetSymbolAtLocation(symbols.AsNode())
	if module == nil {
		return "", nil
	}
	for _, symbol := range q.owner.checker.GetExportsAndPropertiesOfModule(module) {
		if symbol.Name != name || symbol.ValueDeclaration == nil || ast.GetSourceFileOfNode(symbol.ValueDeclaration) != symbols {
			continue
		}
		value := q.owner.checker.GetTypeOfSymbol(symbol)
		if value != nil && value.Flags()&checker.TypeFlagsUniqueESSymbol != 0 {
			return checker.GetPropertyNameFromType(value), symbol
		}
	}
	return "", nil
}

// declaredCallbackInputEffects adds the authenticated framework's implicit MAY
// Gets inside the existing original invocation consumer. It receives the actual
// prepared alternatives and caller bindings; no second query, callee acquisition
// or result projection is performed. Native callback handling remains unchanged.
func (q *sourceValueQuery) declaredCallbackInputEffects(call *ast.Node, bindings sourceValueBindings, prepared sourcePreparedInvocation, result *accessorCandidates) {
	q.nativeCallbackInputEffects(call, bindings, prepared, result)
	q.componentMapCallbackEffects(call, bindings, prepared, result)
	if !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil {
		return
	}
	declaration := reactiveObjectsViewDeclaration(call, prepared.declarations, q.executable)
	if declaration == nil {
		return
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 1 || ast.IsSpreadElement(actuals[0]) {
		return
	}
	part := accessorCandidates{}
	q.withActiveInvocation(call, func() {
		inputs := q.bindInputs(declaration, call, bindings, &part)
		if inputs == nil || len(declaration.Parameters()) == 0 {
			part.valueIncomplete = true
			return
		}
		symbol := q.owner.checker.GetSymbolAtLocation(declaration.Parameters()[0].Name())
		if symbol == nil {
			part.valueIncomplete = true
			return
		}
		values := inputs.bindings[ast.GetSymbolId(symbol)]
		input, gap := q.describeFrameworkViewInput(call, declaration, values)
		view, valid := describeReactiveObjectsStorageView(call, prepared.declarations, input, gap, q.relativeInputCut(call), q.executable)
		if !valid {
			return
		}
		// The runtime contract permits transformed/unknown results and Throw. This
		// residual is additive even while real argument/selection work stays pending.
		name := "framework input"
		if q.effectOwner != nil && q.effectOwner.Name() != nil {
			name = callableNameText(q.effectOwner.Name())
		}
		part.environmentEffects = append(part.environmentEffects, frameworkRuntimeMay(view, q.effectOwner, name))
		for _, value := range values {
			// A declaration-relative formal is retained symbolically. Inspecting its
			// absent value would confuse definition Effects with normal input proof.
			if value.node != nil && ast.IsIdentifier(value.node) {
				s := q.owner.checker.GetSymbolAtLocation(value.node)
				if s != nil && s.ValueDeclaration != nil && ast.IsParameterDeclaration(s.ValueDeclaration) {
					continue
				}
			}
			for _, name := range []string{"proxyMarker", "rawTarget"} {
				key, property := q.frameworkInputSymbol(view, name)
				if property == nil {
					part.valueIncomplete = true
					continue
				}
				get := &sourceGetInputs{operation: call, receiver: value, symbol: property, propertyKey: key}
				// An explicit original Get is lent only to its canonical
				// one-key projection. The generic binding helper's name-form
				// read is a different shape and correctly refuses this loan.
				effects := q.accessorsAtGet(value.node, []string{key}, "", accessorRead, bindings, nil, get, value)
				mergeAccessorCandidates(&part, effects)
			}
		}
	})
	// Keep all original known getter/Proxy/capture/environment contributions and
	// uncertainty in the very same result consumed by the three fact appenders.
	mergeAccessorCandidates(result, part)
}

// componentMapCallbackEffects supplies possible items to the original list
// callbacks. This uses the existing array and callback readers and publishes
// only Effects. It grants no iterator closure, completion or result identity.
func (q *sourceValueQuery) componentMapCallbackEffects(call *ast.Node, bindings sourceValueBindings, prepared sourcePreparedInvocation, result *accessorCandidates) {
	if !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil ||
		q.dependencyUse != call || q.reading != call || q.sourceEffects.issuer != q {
		return
	}
	access := unwrapSourceCallableReference(call.Expression())
	name, member, dynamic := checkedComponentProtocolMember(access, q.owner.checker)
	if name != "map" || !member || dynamic || prepared.acquired.sourceCallable {
		return
	}
	args := restrictedInvocationArguments(call.AsCallExpression())
	if len(args) != 3 {
		return
	}
	array := q.confinedArrayArgumentSyntax(args[0], false)
	if array == nil {
		return
	}
	hasGetter := false
	for _, item := range array.AsArrayLiteralExpression().Elements.Nodes {
		if !q.charge(result, item) || !ast.IsObjectLiteralExpression(item) {
			return
		}
		for _, field := range item.AsObjectLiteralExpression().Properties.Nodes {
			if !q.charge(result, field) {
				return
			}
			hasGetter = hasGetter || ast.IsGetAccessorDeclaration(field)
		}
	}
	if !hasGetter || !q.componentMapUsesDeclaredMethod(access, result) {
		return
	}
	part := accessorCandidates{}
	var items []sourceValue
	for _, receiver := range q.originsAt(args[0], call, bindings, &part) {
		if receiver.node != array || len(receiver.path) != 0 || receiver.normal != nil ||
			receiver.native != nil || receiver.acquired != nil {
			continue
		}
		get := &sourceGetInputs{operation: call, receiver: receiver, propertyKey: "*",
			arrayIndexMay: &sourceArrayIndexMay{owner: q, operation: call, receiver: array}}
		items = append(items, q.bindingPropertyAtGet(receiver, "*", bindings, &part, accessorAcquire, get)...)
	}
	if len(items) == 0 {
		return
	}
	q.withActiveInvocation(call, func() {
		// A possible initial item contributes effects. A body probe cannot
		// publish a completed invocation to an original source observer.
		prior := q.sourceEffects
		q.sourceEffects = sourceEffectsObserver{}
		defer func() { q.sourceEffects = prior }()
		for ordinal, argument := range args[1:] {
			body := unwrapSourceCallableReference(argument)
			if body == nil || !ast.IsArrowFunction(body) || len(body.Parameters()) != 1 ||
				body.Parameters()[0].AsParameterDeclaration().DotDotDotToken != nil {
				return
			}
			inputs := &sourceValueInputs{declaration: body, invocation: call,
				bindings: make(sourceValueBindings), defaults: make(map[*ast.Node]sourceDefaultInput)}
			for id, values := range bindings {
				inputs.bindings[id] = values
			}
			callback := accessorCandidates{}
			q.installParameterInput(body.Parameters()[0], items, inputs, &callback)
			q.consumeOrdinaryBody(call, body, inputs.bindings, inputs, nil, &callback)
			q.adoptSourceMayEffects(call, callback, result)
			result.environmentEffects = append(result.environmentEffects, callback.environmentEffects...)
			result.contextEffects = append(result.contextEffects, callback.contextEffects...)
			// Item selection precedes rendering. The initial item still
			// describes the render input when the key preserves it.
			if ordinal == 0 {
				if !componentMapCallbackPreservesItems(body, callback) {
					return
				}
				if block := body.Body(); ast.IsBlock(block) &&
					q.completionFor(block, inputs.bindings, true).outcomes == sourceReturnThrow {
					return
				}
			}
		}
	})
}

// componentMapUsesDeclaredMethod checks the selected component's own receiver
// references through the existing source index. A mutable or escaped receiver
// retains ordinary callee analysis.
func (q *sourceValueQuery) componentMapUsesDeclaredMethod(access *ast.Node, result *accessorCandidates) bool {
	var component *ast.Node
	for scope := access.Parent; scope != nil; scope = scope.Parent {
		if _, owned := q.owner.components[scope]; owned {
			component = scope
			break
		}
	}
	if component == nil || !helperOwnsReceiver(access, component) ||
		!portableDeclaredMethod(nativeReceiverMemberSymbol(access, q.owner.checker)) {
		return false
	}
	index := q.owner.index(ast.GetSourceFileOfNode(component))
	if index.incomplete {
		return false
	}
	for _, region := range index.operationRegions {
		for _, receiver := range region.receivers {
			if receiver.Pos() < component.Pos() || receiver.End() > component.End() ||
				!helperOwnsReceiver(receiver, component) {
				continue
			}
			if !q.charge(result, receiver) {
				return false
			}
			member := receiver.Parent
			if member == nil || !ast.IsAccessExpression(member) || member.Expression() != receiver {
				return false
			}
			_, key := accessorReceiver(member)
			if key == "" || key == "map" {
				read, write := accessorEvaluationMode(member)
				if !read || write {
					return false
				}
			}
		}
	}
	return true
}

// componentMapCallbackPreservesItems uses the already observed callback body.
// Borrowing the initial item must preserve possible writes and user entry.
func componentMapCallbackPreservesItems(body *ast.Node, callback accessorCandidates) bool {
	return !callback.opaque && !callback.receiverIncomplete && !callback.fieldReceiverIncomplete &&
		len(callback.fieldFallbacks) == 0 && len(callback.callFallbacks) == 0 &&
		len(callback.writes) == 0 && len(callback.reflective) == 0 && len(callback.nativeCalls) == 0 &&
		len(callback.effects) == 1 && callback.effects[0].declaration == body &&
		len(callback.fieldCalls) == 1 && callback.fieldCalls[0].target == body && callback.fieldCalls[0].complete
}
