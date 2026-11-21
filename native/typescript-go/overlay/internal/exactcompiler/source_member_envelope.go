package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// confinedEnvelope proves lifetime confinement for this one direct-return receiver,
// not purity, execution identity or completeness of any field value. Anonymous literal
// construction cannot publish its containing object. A synchronous direct return then
// initializes a private const without a user hook. Every reference must keep it private.
// The existing selected call/creator and protected Get delimit the transfer being proved.
// Nothing is cached on an allocation node, so repeated activations remain distinct.
func (query *sourceValueQuery) confinedEnvelope(origin *ast.Node, projection []string, name string, mode accessorTraversal, result *accessorCandidates) bool {
	if mode != accessorRead || len(projection) != 0 || query.protectedMember == nil || query.freshReturnCall == nil || !query.charge(result, origin) || !ast.IsObjectLiteralExpression(origin) {
		return false
	}
	fields := make(map[string]bool)
	for _, property := range origin.AsObjectLiteralExpression().Properties.Nodes {
		if !query.charge(result, property) || !ast.IsPropertyAssignment(property) && !ast.IsShorthandPropertyAssignment(property) || property.Name() == nil || ast.IsComputedPropertyName(property.Name()) {
			return false
		}
		key := callableNameText(property.Name())
		if key == "" || key == "__proto__" {
			return false
		}
		fields[key] = true
	}
	if !fields[name] {
		return false
	}
	factory := enclosingCallableNode(origin)
	if !envelopeSynchronousFunction(factory) || query.active[factory] {
		return false
	}
	creator := query.creators[factory]
	if creator.returning != origin || creator.invocation != query.freshReturnCall {
		return false
	}
	returned := query.envelopeOuterExpression(origin, result)
	if returned == nil || returned.Parent == nil || !ast.IsReturnStatement(returned.Parent) || returned.Parent.AsReturnStatement().Expression != returned {
		return false
	}
	for node := returned.Parent; node != factory; node = node.Parent {
		if node == nil || !query.charge(result, node) || ast.IsTryStatement(node) && node.AsTryStatement().FinallyBlock != nil {
			return false
		}
	}
	call := query.envelopeOuterExpression(creator.invocation, result)
	if call == nil || call.Parent == nil || !ast.IsVariableDeclaration(call.Parent) {
		return false
	}
	local := call.Parent
	if local.Initializer() != call || !ast.IsIdentifier(local.Name()) || local.Parent == nil || !ast.IsVariableDeclarationList(local.Parent) || local.Parent.Flags&ast.NodeFlagsConst == 0 {
		return false
	}
	receiver := enclosingCallableNode(local)
	if !envelopeSynchronousFunction(receiver) || !ast.IsExternalModule(ast.GetSourceFileOfNode(local)) {
		return false
	}
	member := query.protectedMember
	root, key := accessorReceiver(member)
	symbol := query.owner.checker.GetSymbolAtLocation(local.Name())
	if symbol == nil || len(symbol.Declarations) != 1 || symbol.Declarations[0] != local || query.owner.bindingWritten(symbol) || !ast.IsIdentifier(root) || query.owner.checker.GetSymbolAtLocation(root) != symbol || key != name || enclosingCallableNode(member) != receiver {
		return false
	}
	// Normal sibling continuation is conditional on this read occurring. It does
	// not put an unrelated indexed call into this activation or prove its absence.
	statement := member
	for statement != nil && !ast.IsStatement(statement) {
		if !query.charge(result, statement) {
			return false
		}
		statement = statement.Parent
	}
	declarationStatement := local.Parent.Parent
	if statement == nil || declarationStatement == nil || !ast.IsVariableStatement(declarationStatement) || statement.Parent != declarationStatement.Parent || !ast.IsBlock(statement.Parent) || declarationStatement.End() > statement.Pos() {
		return false
	}
	region := query.owner.index(ast.GetSourceFileOfNode(local)).operationRegions[receiver]
	if region == nil {
		return false
	}
	// Inventory includes empty closures. A closure or direct eval could access the
	// local without an explicit identifier reference, so this subset rejects both.
	for _, node := range region.lexicalChildren {
		query.charge(result, node)
		return false
	}
	for _, node := range region.hazards {
		query.charge(result, node)
		return false
	}
	for _, node := range region.members {
		if !query.charge(result, node) {
			return false
		}
		if ast.IsCallExpression(node) {
			callee := unwrapSourceCallableReference(node.AsCallExpression().Expression)
			if ast.IsIdentifier(callee) && callee.Text() == "eval" {
				return false
			}
		}
	}
	seenRead := false
	for _, reference := range region.references {
		if !query.charge(result, reference) {
			return false
		}
		bound := query.owner.checker.GetSymbolAtLocation(reference)
		if reference.Parent != nil && ast.IsShorthandPropertyAssignment(reference.Parent) {
			bound = query.owner.checker.GetShorthandAssignmentValueSymbol(reference.Parent)
		}
		if bound == nil && reference.Text() == local.Name().Text() {
			return false
		}
		if bound != symbol {
			continue
		}
		get := reference.Parent
		if get == nil || !ast.IsPropertyAccessExpression(get) && !ast.IsElementAccessExpression(get) || get.Expression() != reference {
			return false
		}
		_, field := accessorReceiver(get)
		read, write := accessorEvaluationMode(get)
		if !fields[field] || !read || write {
			return false
		}
		if ast.IsElementAccessExpression(get) {
			key := unwrapSourceCallableReference(get.AsElementAccessExpression().ArgumentExpression)
			if !ast.IsStringLiteral(key) && !ast.IsNumericLiteral(key) {
				return false
			}
		}
		outer := query.envelopeOuterExpression(get, result)
		if outer == nil {
			return false
		}
		parent := outer.Parent
		if parent != nil && (ast.IsCallExpression(parent) && parent.AsCallExpression().Expression == outer || ast.IsNewExpression(parent) && parent.Expression() == outer || ast.IsTaggedTemplateExpression(parent) && parent.AsTaggedTemplateExpression().Tag == outer) {
			// A member invocation passes the containing envelope as this.
			return false
		}
		seenRead = seenRead || get == member
	}
	return seenRead
}

// envelopeOuterExpression permits erased/parenthesized wrappers only. Calls,
// assignment and comma expressions cannot hide an intermediate publication.
func (query *sourceValueQuery) envelopeOuterExpression(node *ast.Node, result *accessorCandidates) *ast.Node {
	for node != nil && node.Parent != nil && unwrapSourceCallableReference(node.Parent) == node {
		if !query.charge(result, node.Parent) {
			return nil
		}
		node = node.Parent
	}
	return node
}

func envelopeSynchronousFunction(node *ast.Node) bool {
	return node != nil && ast.IsFunctionDeclaration(node) && node.Body() != nil && !ast.HasSyntacticModifier(node, ast.ModifierFlagsAsync) && node.AsFunctionDeclaration().AsteriskToken == nil
}

// ownsLiteralBindingSlot recognizes the original single-field binding Get on
// a directly initialized literal. The container has no other reference.
// The selected value and its later uses retain their ordinary ownership.
func (query *sourceValueQuery) ownsLiteralBindingSlot(origin *ast.Node, projection []string, name string, mode accessorTraversal) bool {
	element := query.protectedMember
	if mode != accessorRead && mode != accessorAcquire || !ast.IsObjectLiteralExpression(origin) ||
		element == nil || !ast.IsBindingElement(element) {
		return false
	}
	if name == "" && len(projection) == 1 {
		name = projection[0]
	} else if name == "" || len(projection) != 0 {
		return false
	}
	pattern := element.Parent
	if pattern == nil || !ast.IsObjectBindingPattern(pattern) || len(pattern.AsBindingPattern().Elements.Nodes) != 1 ||
		pattern.Parent == nil || !ast.IsVariableDeclaration(pattern.Parent) || pattern.Parent.Initializer() != origin {
		return false
	}
	binding := element.AsBindingElement()
	if !ast.IsIdentifier(binding.Name()) || binding.DotDotDotToken != nil || binding.Initializer != nil ||
		binding.PropertyName != nil && ast.IsComputedPropertyName(binding.PropertyName) {
		return false
	}
	key, known := bindingSegment(pattern, element, 0)
	if !known || key != name || key == "__proto__" {
		return false
	}
	fields := origin.AsObjectLiteralExpression().Properties.Nodes
	return len(fields) == 1 && ast.IsPropertyAssignment(fields[0]) &&
		fields[0].Name() != nil && !ast.IsComputedPropertyName(fields[0].Name()) &&
		callableNameText(fields[0].Name()) == key
}

// confinedLocalGetter excludes unrelated receiver writers for one own getter.
// The Get and its result still go through their original value and effect consumers.
func (query *sourceValueQuery) confinedLocalGetter(origin *ast.Node, projection []string, name string, mode accessorTraversal, result *accessorCandidates) bool {
	if mode != accessorAcquire && mode != accessorRead || !ast.IsObjectLiteralExpression(origin) {
		return false
	}
	if name == "" && len(projection) == 1 {
		name = projection[0]
	} else if name == "" || len(projection) != 0 {
		return false
	}
	properties := origin.AsObjectLiteralExpression().Properties.Nodes
	if len(properties) != 1 || !ast.IsGetAccessorDeclaration(properties[0]) {
		return false
	}
	getter := properties[0]
	if getter.Name() == nil || ast.IsComputedPropertyName(getter.Name()) || callableNameText(getter.Name()) != name {
		return false
	}
	local := origin.Parent
	if local == nil || !ast.IsVariableDeclaration(local) || local.Initializer() != origin ||
		!ast.IsIdentifier(local.Name()) || local.Parent == nil || !ast.IsVariableDeclarationList(local.Parent) ||
		local.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(local) == nil {
		return false
	}
	file := ast.GetSourceFileOfNode(origin)
	if !ast.IsExternalModule(file) {
		return false
	}
	index := query.owner.index(file)
	references := index.privateUses
	if index.incomplete || index.normalDynamicScope || references == nil || !references.complete {
		return false
	}
	symbol := query.owner.checker.GetSymbolAtLocation(local.Name())
	if symbol == nil || len(symbol.Declarations) != 1 || symbol.Declarations[0] != local ||
		len(references.unresolved[local.Name().Text()]) != 0 {
		return false
	}
	uses := references.uses[ast.GetSymbolId(symbol)]
	if len(uses) == 0 {
		return false
	}
	for _, use := range uses {
		ref := use.node
		field := ref.Parent
		if !query.charge(result, ref) || field == nil || !ast.IsPropertyAccessExpression(field) ||
			field.Expression() != ref || field.Name().Text() != name {
			return false
		}
		read, write := accessorEvaluationMode(field)
		if !read || write {
			return false
		}
		outer := query.envelopeOuterExpression(field, result)
		if outer == nil {
			return false
		}
		if parent := outer.Parent; parent != nil && (ast.IsCallExpression(parent) && parent.Expression() == outer ||
			ast.IsNewExpression(parent) && parent.Expression() == outer ||
			ast.IsTaggedTemplateExpression(parent) && parent.AsTaggedTemplateExpression().Tag == outer) {
			return false // A member invocation can pass the literal as its receiver.
		}
	}
	confined := true
	walkNode(getter, func(node *ast.Node) bool {
		confined = confined && query.charge(result, node) &&
			node.Kind != ast.KindThisKeyword && node.Kind != ast.KindSuperKeyword
		return confined
	})
	return confined
}
