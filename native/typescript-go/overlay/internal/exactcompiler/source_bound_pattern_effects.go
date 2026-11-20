package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceFlatInputPattern identifies reads whose keys and exclusions are fixed
// by a local binding. Defaults and nested patterns need their own consumers.
func (q *sourceValueQuery) sourceFlatInputPattern(node *ast.Node) (*ast.Symbol, bool) {
	if !ast.IsVariableDeclaration(node) || !ast.IsObjectBindingPattern(node.Name()) || node.Initializer() == nil || !ast.IsIdentifier(node.Initializer()) {
		return nil, false
	}
	input := q.owner.checker.GetSymbolAtLocation(node.Initializer())
	if input == nil || input.ValueDeclaration == nil || !ast.IsParameterDeclaration(input.ValueDeclaration) ||
		input.ValueDeclaration.Parent != enclosingCallableNode(node) {
		return nil, false
	}
	index := q.owner.index(ast.GetSourceFileOfNode(node))
	elements := node.Name().AsBindingPattern().Elements.Nodes
	if index.incomplete || index.normalDynamicScope || len(index.bindings[ast.GetSymbolId(input)]) != 0 || len(elements) == 0 {
		return nil, false
	}
	for i, binding := range elements {
		element := binding.AsBindingElement()
		if !ast.IsIdentifier(element.Name()) || element.Initializer != nil ||
			element.PropertyName != nil && ast.IsComputedPropertyName(element.PropertyName) {
			return nil, false
		}
		if key, finite := bindingSegment(node.Name(), binding, i); element.DotDotDotToken == nil && (!finite || key == "") {
			return nil, false
		}
	}
	return input, true
}

// deferUnboundPatternEffects records the original binding operations separately.
// A supplied object can settle these debts only with matching edge coverage.
func (q *sourceValueQuery) deferUnboundPatternEffects(node *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	input, ok := q.sourceFlatInputPattern(node)
	if !ok || !q.dependenciesOnly || q.inputs != nil && q.inputs.invocation != nil {
		return false
	}
	if _, supplied := bindings[ast.GetSymbolId(input)]; supplied {
		return false
	}
	for i, binding := range node.Name().AsBindingPattern().Elements.Nodes {
		key, _ := bindingSegment(node.Name(), binding, i)
		if binding.AsBindingElement().DotDotDotToken != nil {
			key = "" // Copy has its own binding occurrence, separate from any Get.
		}
		result.fieldFallbacks = append(result.fieldFallbacks, q.boundPatternDemand(binding, input, key))
	}
	return true
}

func (q *sourceValueQuery) boundPatternDemand(binding *ast.Node, input *ast.Symbol, key string) sourceFieldDemand {
	return sourceFieldDemand{declaration: input.ValueDeclaration.Parent, operation: binding, slot: input.ValueDeclaration, key: key, use: q.effectUse(), consumer: q.effectOwner}
}

// completeBoundPatternEffects answers the operations of a terminal flat binding
// while its original invocation inputs are installed. The ordinary Get body
// consumer still owns every reached getter, including any opaque effects.
func (q *sourceValueQuery) completeBoundPatternEffects(declaration *ast.Node, inputs *sourceValueInputs, result *accessorCandidates) bool {
	call := inputs.invocation
	if call == nil || !ast.IsCallExpression(call) || q.operation != nil || q.returnObservation != nil ||
		q.sourceEffects.body != nil || q.owner.generation == nil || q.executable == nil || q.executable.project == nil ||
		q.executable.project.activeGeneration != q.owner.generation || inputs.deferredBody || len(inputs.order) != 0 {
		return false
	}
	body := declaration.Body()
	if body == nil || !ast.IsBlock(body) {
		return false
	}
	statements := body.AsBlock().Statements.Nodes
	parameters := declaration.Parameters()
	if len(parameters) != 1 || len(statements) != 2 || !ast.IsVariableStatement(statements[0]) || !ast.IsReturnStatement(statements[1]) {
		return false
	}
	list := statements[0].AsVariableStatement().DeclarationList.AsVariableDeclarationList()
	if len(list.Declarations.Nodes) != 1 {
		return false
	}
	pattern := list.Declarations.Nodes[0]
	input, valid := q.sourceFlatInputPattern(pattern)
	if !valid || input.ValueDeclaration != parameters[0] {
		return false
	}
	returned := unwrapSourceCallableReference(statements[1].Expression())
	if returned == nil || !ast.IsIdentifier(returned) {
		return false
	}
	selected := q.owner.checker.GetSymbolAtLocation(returned)
	if selected == nil || selected.ValueDeclaration == nil || selected.ValueDeclaration.Parent != pattern.Name() ||
		!ast.IsBindingElement(selected.ValueDeclaration) || selected.ValueDeclaration.AsBindingElement().DotDotDotToken != nil {
		return false
	}

	actuals := restrictedInvocationArguments(call.AsCallExpression())
	values := inputs.bindings[ast.GetSymbolId(input)]
	if len(actuals) != 1 || len(values) != 1 || values[0].node == nil || !ast.IsObjectLiteralExpression(values[0].node) ||
		values[0].node != unwrapSourceCallableReference(actuals[0]) || len(values[0].path) != 0 {
		return false
	}
	literal := values[0].node
	// Both source files must still be the executable generation's files.
	for _, node := range []*ast.Node{call, declaration} {
		file := ast.GetSourceFileOfNode(node)
		if file == nil || !ast.IsExternalModule(file) || q.owner.program.GetSourceFile(file.FileName()) != file {
			return false
		}
	}
	fields := literal.AsObjectLiteralExpression().Properties.Nodes
	names := make(map[string]*ast.Node, len(fields))
	var symbolField *ast.Node
	for _, field := range fields {
		name := field.Name()
		if name == nil || ast.IsNumericLiteral(name) || ast.IsSpreadAssignment(field) {
			return false
		}
		if ast.IsGetAccessorDeclaration(field) {
			safe := true
			walkNode(field, func(n *ast.Node) bool {
				safe = safe && n.Kind != ast.KindThisKeyword && n.Kind != ast.KindSuperKeyword && (!ast.IsIdentifier(n) || n.Text() != "eval")
				return safe
			})
			if !safe {
				return false // The fresh receiver could become observable before Copy.
			}
		}
		if ast.IsComputedPropertyName(name) {
			if symbolField != nil || !q.freshCopySymbolKey(name.Expression()) {
				return false
			}
			symbolField = field
			continue
		}
		key := callableNameText(name)
		if key == "" || key == "__proto__" || names[key] != nil {
			return false
		}
		// Numeric keys require the own-key index ordering before named keys.
		if key[0] >= '0' && key[0] <= '9' {
			if _, indexed := sourceArrayIndex(key); indexed {
				return false
			}
		}
		names[key] = field
	}
	elements := pattern.Name().AsBindingPattern().Elements.Nodes
	excluded := make(map[string]bool, len(elements))
	for i, binding := range elements {
		if binding.AsBindingElement().DotDotDotToken == nil {
			key, _ := bindingSegment(pattern.Name(), binding, i)
			if names[key] == nil {
				return false // Inherited getters keep their original lookup.
			}
		}
	}

	// All admission precedes effect consumption. The original source walk owns
	// creation and eager actual effects. Here only the binding's ordered Gets
	// run, including the enumerable symbol after the string keys.
	scope := inputs.dependencyScope
	if values[0].capture != nil {
		scope = *values[0].capture
	}
	get := func(operation, field *ast.Node) {
		if ast.IsGetAccessorDeclaration(field) {
			q.executeGetEffects(field, &sourceGetInputs{operation: operation, receiver: sourceValue{node: literal}}, scope, result)
		}
	}
	for i, binding := range elements {
		key, _ := bindingSegment(pattern.Name(), binding, i)
		if binding.AsBindingElement().DotDotDotToken == nil {
			get(binding, names[key])
			excluded[key] = true
		} else {
			key = ""
			for _, field := range fields {
				if !ast.IsComputedPropertyName(field.Name()) && !excluded[callableNameText(field.Name())] {
					get(binding, field)
				}
			}
			if symbolField != nil {
				get(binding, symbolField)
			}
		}
		result.fieldOutcomes = append(result.fieldOutcomes, sourceFieldOutcome{demand: q.boundPatternDemand(binding, input, key), fulfilled: true})
	}
	return true
}

// A const initialized by the standard Symbol constructor names a symbol key
// without depending on a structural type assertion or on a descriptor model.
func (q *sourceValueQuery) freshCopySymbolKey(key *ast.Node) bool {
	if key == nil || !ast.IsIdentifier(key) {
		return false
	}
	symbol := q.owner.checker.GetSymbolAtLocation(key)
	if symbol == nil {
		return false
	}
	binding := symbol.ValueDeclaration
	if binding == nil || !ast.IsVariableDeclaration(binding) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || binding.Initializer() == nil || !ast.IsCallExpression(binding.Initializer()) {
		return false
	}
	callee := binding.Initializer().Expression()
	return ast.IsIdentifier(callee) && callee.Text() == "Symbol" && standardLibraryCallRoot(callee, q.owner.checker)
}
