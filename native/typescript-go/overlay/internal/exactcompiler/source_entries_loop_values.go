package exactcompiler

import (
	"strconv"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// enumerateEntryEffects keeps the lookup cut at the original native Call.
func (q *sourceValueQuery) enumerateEntryEffects(call, input *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	reading, initializing, member := q.reading, q.initializing, q.protectedMember
	q.reading, q.initializing, q.protectedMember = call, call, nil
	defer func() { q.reading, q.initializing, q.protectedMember = reading, initializing, member }()
	mergeAccessorCandidates(result, q.accessors(input, nil, "", accessorEnumerateEntries, bindings, nil))
}

// entriesLoopBindingValues follows a possible value slot of a yielded pair.
// Enumeration and iteration still own the effects of the original operations.
func (q *sourceValueQuery) entriesLoopBindingValues(binding, declaration *ast.Node, bindings sourceValueBindings, result *accessorCandidates) ([]sourceValue, bool) {
	call, input := q.entriesIterationSource(binding, declaration)
	if call == nil || q.active[call] {
		return nil, false
	}
	reading, initializing, protected := q.reading, q.initializing, q.protectedMember
	q.reading, q.initializing, q.protectedMember = call, call, nil
	defer func() { q.reading, q.initializing, q.protectedMember = reading, initializing, protected }()
	var source accessorCandidates
	q.withActiveInvocation(call, func() {
		source = q.accessors(input, nil, "", accessorEnumerateValues, bindings, nil)
	})
	if len(source.values) == 0 && !source.valueIncomplete && !source.receiverIncomplete && !source.opaque {
		return nil, false
	}
	result.opaque = result.opaque || source.valueIncomplete || source.receiverIncomplete || source.opaque
	// Every retained origin is conditional. An open sibling, absent key or
	// unobserved getter output cannot grant a closed iterable or normal value.
	result.valueIncomplete = true
	return append(source.values, sourceValue{}), true
}

func (q *sourceValueQuery) enumeratedEntryValues(value *ast.Node, bindings sourceValueBindings, result *accessorCandidates) {
	writers := q.owner.index(ast.GetSourceFileOfNode(value)).memberOrigins[value]
	collect := func(key string) {
		// An unordered write to the same known slot cannot supply a stable
		// yielded value description. The original enumeration still owns
		// such a property's Get and its independent effects.
		for _, write := range writers {
			if !q.charge(result, write.left) {
				return
			}
			_, path := effectArgumentRoot(write.left)
			if len(path) == 1 && sourceProjectionOverlap(path, []string{key}) &&
				!q.afterRead(write.left) && !q.sourceWritePrecedes(write.left, nil, bindings) {
				result.valueIncomplete = true
				return
			}
		}
		get := &sourceGetInputs{operation: q.reading, receiver: sourceValue{node: value}, propertyKey: key, ownConditional: true, enumerableString: true}
		part := q.accessorsAtGet(value, []string{key}, "", accessorAcquire, bindings, nil, get)
		var scope *acquiredCallableScope
		for _, term := range part.values {
			if term.capture == nil {
				if scope == nil {
					capture := q.acquireCallableScope(bindings, result)
					scope = &capture
				}
				term.capture = scope
			}
			result.values = append(result.values, term)
		}
	}
	if ast.IsArrayLiteralExpression(value) {
		for index, item := range value.AsArrayLiteralExpression().Elements.Nodes {
			if !q.charge(result, item) || ast.IsSpreadElement(item) {
				return
			}
			if !ast.IsOmittedExpression(item) {
				collect(strconv.Itoa(index))
			}
		}
		return
	}
	if !ast.IsObjectLiteralExpression(value) {
		return
	}
	for _, member := range value.AsObjectLiteralExpression().Properties.Nodes {
		if !q.charge(result, member) {
			return
		}
		if member.Name() == nil || ast.IsComputedPropertyName(member.Name()) {
			continue
		}
		key := callableNameText(member.Name())
		if key != "__proto__" && key != "" && key != "*" && !ast.IsSetAccessorDeclaration(member) {
			collect(key)
		}
	}
}

// The ForOf owns the real iterator and its two simple binding slots. Leave
// possible yielded values to their dependency consumers rather than binding
// either slot from a nonexistent lexical initializer.
func (q *sourceValueQuery) lazyEntriesIterationBinding(declaration *ast.Node) bool {
	if !q.dependenciesOnly || declaration.Initializer() != nil || !ast.IsArrayBindingPattern(declaration.Name()) {
		return false
	}
	binding := entriesIterationBinding(declaration.Parent)
	if binding == nil {
		return false
	}
	call, _ := q.entriesIterationSource(binding, declaration)
	return call != nil
}

// entriesIterationBinding recognizes just the direct value slot of a const
// pair pattern. Destructuring defaults and rest keep their own input owners.
func entriesIterationBinding(list *ast.Node) *ast.Node {
	if list == nil || !ast.IsVariableDeclarationList(list) || list.Flags&ast.NodeFlagsConst == 0 {
		return nil
	}
	declarations := list.AsVariableDeclarationList().Declarations.Nodes
	if len(declarations) != 1 || !ast.IsArrayBindingPattern(declarations[0].Name()) {
		return nil
	}
	elements := declarations[0].Name().AsBindingPattern().Elements.Nodes
	if len(elements) != 2 || elements[1] == nil || !ast.IsBindingElement(elements[1]) {
		return nil
	}
	key, value := elements[0], elements[1]
	if key != nil && !ast.IsOmittedExpression(key) && (!ast.IsBindingElement(key) || key.Name() != nil && !ast.IsIdentifier(key.Name()) || key.Initializer() != nil || key.AsBindingElement().DotDotDotToken != nil) {
		return nil
	}
	if value.Name() == nil || !ast.IsIdentifier(value.Name()) || value.Initializer() != nil || value.AsBindingElement().DotDotDotToken != nil {
		return nil
	}
	return value
}

func (q *sourceValueQuery) entriesIterationSource(binding, declaration *ast.Node) (call, input *ast.Node) {
	if declaration.Initializer() != nil || entriesIterationBinding(declaration.Parent) != binding {
		return nil, nil
	}
	call = unwrapSourceCallableReference(standardArrayLoopIterable(declaration, q.owner.checker))
	input = q.owner.standardEntriesArgument(call)
	if input == nil {
		return nil, nil
	}
	return call, input
}

// enumerationSymbolKey excludes only a represented standard symbol value.
// A type assertion can leave a string or number at the computed key site.
func (q *sourceValueQuery) enumerationSymbolKey(name *ast.Node, result *accessorCandidates) bool {
	key := unwrapSourceCallableReference(name.AsComputedPropertyName().Expression)
	c := q.owner.checker
	for key != nil && ast.IsIdentifier(key) {
		if !q.charge(result, key) {
			return false
		}
		symbol := c.GetSymbolAtLocation(key)
		if symbol == nil {
			return false
		}
		declaration := symbol.ValueDeclaration
		if declaration == nil || !ast.IsVariableDeclaration(declaration) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 ||
			ast.GetSourceFileOfNode(declaration) != ast.GetSourceFileOfNode(key) || declaration.End() > key.Pos() {
			return false
		}
		key = unwrapSourceCallableReference(declaration.Initializer())
	}
	if key == nil || !q.charge(result, key) {
		return false
	}
	if ast.IsCallExpression(key) {
		call := key.AsCallExpression()
		callee := unwrapSourceCallableReference(call.Expression)
		if callee == nil || ast.IsOptionalChain(key) || !standardLibraryCallRoot(callee, c) ||
			standardLibraryCallOwner(call, c) != "SymbolConstructor" {
			return false
		}
		if ast.IsIdentifier(callee) {
			return callee.Text() == "Symbol"
		}
		root, member := restrictedInvocationMember(callee, c)
		return root != nil && ast.IsIdentifier(root) && root.Text() == "Symbol" && member == "for"
	}
	if !ast.IsPropertyAccessExpression(key) || ast.IsOptionalChain(key) || !ast.IsIdentifier(key.Expression()) ||
		key.Expression().Text() != "Symbol" || !standardLibraryCallRoot(key, c) {
		return false
	}
	t := c.GetTypeAtLocation(key)
	return t != nil && t.Flags()&checker.TypeFlagsUniqueESSymbol != 0
}
