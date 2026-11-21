package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceMapKeyInput carries possible keys for one original native callback.
// It describes source Gets only. The callback and any later consumer of its
// returned value still use the existing invocation and result owners.
type sourceMapKeyInput struct {
	parameter *ast.Node
	keys      []string
}

func (q *sourceValueQuery) sourceMapKeys(operand *ast.Node) []string {
	if q.inputs == nil || q.inputs.mapKey == nil || !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil {
		return nil
	}
	operand = unwrapSourceCallableReference(operand)
	if operand == nil || !ast.IsIdentifier(operand) || enclosingCallableNode(operand) != q.inputs.declaration {
		return nil
	}
	if symbol := q.owner.checker.GetSymbolAtLocation(operand); symbol != nil && symbol.ValueDeclaration == q.inputs.mapKey.parameter {
		return q.inputs.mapKey.keys
	}
	return nil
}

func (q *sourceValueQuery) mapIndexParameter(callback *ast.Node) *ast.Node {
	if callback == nil || !ast.IsArrowFunction(callback) || len(callback.Parameters()) != 1 {
		return nil
	}
	parameter := callback.Parameters()[0]
	name := parameter.Name()
	if !ast.IsIdentifier(name) || parameter.Initializer() != nil || parameter.AsParameterDeclaration().DotDotDotToken != nil {
		return nil
	}
	symbol := q.owner.checker.GetSymbolAtLocation(name)
	uses, known := q.mapKeySourceUses(symbol, parameter)
	if !known {
		return nil
	}
	hasIndexRead := false
	for _, use := range uses {
		operand := use.node
		for operand.Parent != nil && unwrapSourceCallableReference(operand.Parent) == use.node {
			operand = operand.Parent
		}
		member := operand.Parent
		if member == nil {
			continue
		}
		if planMutationOperation(member).target == operand || nativeAssignmentPatternTarget(operand) ||
			ast.IsForInOrOfStatement(member) && member.AsForInOrOfStatement().Initializer == operand {
			return nil
		}
		if ast.IsElementAccessExpression(member) && member.AsElementAccessExpression().ArgumentExpression == operand && enclosingCallableNode(member) == callback {
			if read, write := accessorEvaluationMode(member); read && !write {
				hasIndexRead = true
			}
		}
	}
	if !hasIndexRead {
		return nil
	}
	return parameter
}

func mapKeyInput(parameter *ast.Node, elements []sourceValue) *sourceMapKeyInput {
	var keys []string
	for _, value := range elements {
		if value.node == nil || len(value.path) != 0 || value.normal != nil || value.acquired != nil || value.undefined {
			return nil
		}
		key := mapLiteralKey(value.node)
		if key == "" || key == "*" {
			return nil
		}
		if !slices.Contains(keys, key) {
			keys = append(keys, key)
		}
	}
	if len(keys) == 0 {
		return nil
	}
	return &sourceMapKeyInput{parameter: parameter, keys: keys}
}

func mapLiteralKey(node *ast.Node) string {
	node = unwrapSourceCallableReference(node)
	if node != nil && (ast.IsStringLiteral(node) || ast.IsNumericLiteral(node)) {
		return node.Text()
	}
	return ""
}

func (q *sourceValueQuery) mapKeySourceUses(symbol *ast.Symbol, declaration *ast.Node) ([]sourcePrivateUse, bool) {
	if symbol == nil || symbol.ValueDeclaration != declaration {
		return nil, false
	}
	index := q.owner.index(ast.GetSourceFileOfNode(declaration))
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete || len(index.privateUses.unresolved[declaration.Name().Text()]) != 0 {
		return nil, false
	}
	id := ast.GetSymbolId(symbol)
	return index.privateUses.uses[id], !index.normalExported[id]
}

// mapKeyArraySyntax names a confined literal candidate. A freeze call still
// needs the actual selected native alternative and source input relationship.
func (q *sourceValueQuery) mapKeyArraySyntax(operand *ast.Node, iterationOnly bool) *ast.Node {
	operand = unwrapSourceCallableReference(operand)
	if operand == nil {
		return nil
	}
	if ast.IsArrayLiteralExpression(operand) {
		return operand
	}
	if !ast.IsIdentifier(operand) {
		return nil
	}
	symbol := q.owner.checker.GetSymbolAtLocation(operand)
	if symbol == nil || symbol.ValueDeclaration == nil {
		return nil
	}
	declaration := symbol.ValueDeclaration
	if !ast.IsVariableDeclaration(declaration) || declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 || ast.GetSourceFileOfNode(declaration) != ast.GetSourceFileOfNode(operand) {
		return nil
	}
	uses, known := q.mapKeySourceUses(symbol, declaration)
	if !known {
		return nil
	}
	for _, use := range uses {
		if use.node == operand {
			continue
		}
		outer := use.node.Parent
		if !iterationOnly || outer == nil || !ast.IsForOfStatement(outer) || outer.AsForInOrOfStatement().Expression != use.node {
			return nil
		}
	}
	literal := unwrapSourceCallableReference(declaration.Initializer())
	if literal != nil && ast.IsArrayLiteralExpression(literal) {
		return literal
	}
	return nil
}

func (q *sourceValueQuery) confinedMapArray(call *ast.Node, receivers []sourceValue) *ast.Node {
	if len(receivers) != 1 || len(receivers[0].path) != 0 {
		return nil
	}
	receiver, _ := restrictedInvocationMember(unwrapSourceCallableReference(call.Expression()), q.owner.checker)
	literal := q.mapKeyArraySyntax(receiver, false)
	if literal == nil || literal != unwrapSourceCallableReference(receivers[0].node) {
		return nil
	}
	for _, entry := range literal.AsArrayLiteralExpression().Elements.Nodes {
		if key := mapLiteralKey(entry); key == "" || key == "*" {
			return nil
		}
	}
	return literal
}

// frozenMapKeyElements observes the existing selected Freeze input at the
// creation site. Dense literal primitive elements have no implicit Get donor.
// A refused selection or input leaves the ordinary open receiver path active.
func (q *sourceValueQuery) frozenMapKeyElements(receiver sourceValue, wantKeys bool, result *accessorCandidates) ([]sourceValue, bool) {
	call := receiver.node
	if !q.dependenciesOnly || q.operation != nil || q.returnObservation != nil || call == nil || !ast.IsCallExpression(call) || len(receiver.path) != 0 || q.active[call] {
		return nil, false
	}
	base, method := restrictedInvocationMember(call.Expression(), q.owner.checker)
	arguments := restrictedInvocationArguments(call.AsCallExpression())
	if base == nil || !ast.IsIdentifier(base) || base.Text() != "Object" || method != "freeze" || !standardLibraryCallRoot(call.Expression(), q.owner.checker) || len(arguments) != 1 {
		return nil, false
	}
	literal := q.mapKeyArraySyntax(arguments[0], true)
	if literal == nil {
		return nil, false
	}
	entries := literal.AsArrayLiteralExpression().Elements.Nodes
	if len(entries) != 0 && !wantKeys {
		return nil, false
	}
	for _, entry := range entries {
		if key := mapLiteralKey(entry); key == "" || key == "*" {
			return nil, false
		}
	}
	priorCreators, priorRead, priorInit, priorReturn := q.creators, q.reading, q.initializing, q.returning
	defer func() {
		q.creators, q.reading, q.initializing, q.returning = priorCreators, priorRead, priorInit, priorReturn
	}()
	var bindings sourceValueBindings
	if receiver.capture != nil {
		q.creators, bindings = receiver.capture.creators, receiver.capture.bindings
	}
	q.reading, q.initializing, q.returning = call, call, nil
	var elements []sourceValue
	known := false
	q.withActiveInvocation(call, func() {
		prepared, part := q.prepareInvocation(call, bindings)
		selected := prepared.acquired.candidates()
		if part.opaque || part.valueIncomplete || part.receiverIncomplete || selected.opaque || selected.valueIncomplete || selected.receiverIncomplete || len(selected.values) != 1 || selected.values[0].native == nil || selected.values[0].native.kind != sourceNativeObjectFreeze {
			return
		}
		count, matching := 0, false
		q.sourceFreezeRelationshipObserved(call, selected.values[0], bindings, true, func(sourceValue, sourceValueBindings) {}, &part, func(term sourceValue, _ sourceValueBindings, acquired *accessorCandidates) {
			count++
			matching = !acquired.opaque && !acquired.valueIncomplete && !acquired.receiverIncomplete && len(term.path) == 0 && unwrapSourceCallableReference(term.node) == literal
		})
		if count != 1 || !matching || part.opaque || part.receiverIncomplete {
			return
		}
		mergeAccessorCandidates(result, part)
		known = true
		for _, entry := range entries {
			elements = append(elements, sourceValue{node: unwrapSourceCallableReference(entry)})
		}
	})
	return elements, known
}
