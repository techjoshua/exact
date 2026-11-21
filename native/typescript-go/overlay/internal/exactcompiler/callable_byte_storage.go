package exactcompiler

import (
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// localByteStorageOperation recognizes scalar method calls on a component-local
// native allocation. Its original arguments are still visited. Escaping the
// receiver or replacing a method leaves member selection with the source query.
func localByteStorageOperation(node *ast.Node, owner *sourceValueOwner) bool {
	member := node
	if ast.IsCallExpression(node) {
		member = node.Expression()
	}
	if !ast.IsPropertyAccessExpression(member) || byteStorageNumericArguments(member.Name().Text()) == 0 || !ast.IsIdentifier(member.Expression()) || member.Parent == nil || !ast.IsCallExpression(member.Parent) || member.Parent.Expression() != member {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(member.Expression())
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return false
	}
	decl := symbol.ValueDeclaration
	if valid, known := owner.byteStorageOperations[decl]; known {
		return valid
	}
	value := unwrapSourceCallableReference(decl.Initializer())
	if value == nil || !ast.IsNewExpression(value) || decl.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(decl) == nil {
		return false
	}
	if !standardByteStorageConstruction(value, owner.checker) {
		return false
	}
	index := owner.index(ast.GetSourceFileOfNode(decl))
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete {
		return false
	}
	valid := true
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		if !scalarByteStorageUse(use.node, owner) {
			valid = false
			break
		}
	}
	if owner.byteStorageOperations == nil {
		owner.byteStorageOperations = make(map[*ast.Node]bool)
	}
	owner.byteStorageOperations[decl] = valid
	return valid
}

// Classify the selected constructor independently of authored same-name classes.
func standardByteStorageConstruction(value *ast.Node, c *checker.Checker) bool {
	return standardByteStorageConstructorReference(value.Expression(), c)
}

// An earlier const in the same source can retain the native constructor. Strict
// source ordering excludes cycles and keeps unresolved imports on their owner.
func standardByteStorageConstructorReference(reference *ast.Node, c *checker.Checker) bool {
	for reference = unwrapSourceCallableReference(reference); reference != nil && ast.IsIdentifier(reference); {
		symbol := c.GetSymbolAtLocation(reference)
		if symbol == nil || symbol.ValueDeclaration == nil {
			return false
		}
		declaration := symbol.ValueDeclaration
		if standardByteStorageName(reference.Text()) && standardLibrarySource(ast.GetSourceFileOfNode(declaration)) {
			return true
		}
		if !ast.IsVariableDeclaration(declaration) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 || declaration.End() > reference.Pos() || ast.GetSourceFileOfNode(declaration) != ast.GetSourceFileOfNode(reference) {
			return false
		}
		reference = unwrapSourceCallableReference(declaration.Initializer())
	}
	return false
}

// Each allowed use keeps the receiver private. fill returns its receiver, so
// only its discarded result qualifies. A slice or subarray returns a new view.
func scalarByteStorageUse(reference *ast.Node, owner *sourceValueOwner) bool {
	member := reference.Parent
	if member == nil || !ast.IsPropertyAccessExpression(member) || member.Expression() != reference || !nativeReceiverMemberDeclarations(member, owner.checker) {
		return false
	}
	call := member.Parent
	if call == nil || !ast.IsCallExpression(call) || call.Expression() != member {
		return false
	}
	if args := call.AsCallExpression().Arguments; args != nil {
		for _, arg := range args.Nodes {
			if ast.IsSpreadElement(arg) {
				return false
			}
		}
	}
	switch member.Name().Text() {
	case "fill":
		if call.Parent == nil || !ast.IsExpressionStatement(call.Parent) {
			return false
		}
	default:
		if byteStorageNumericArguments(member.Name().Text()) == 0 {
			return false
		}
	}
	return true
}

// The little-endian flag of a DataView operation uses ToBoolean, which never
// invokes a hook. Surplus arguments are evaluated without numeric conversion.
func byteStorageNumericArguments(method string) int {
	switch method {
	case "fill":
		return 3
	case "slice", "subarray":
		return 2
	}
	if len(method) > 3 && strings.HasPrefix(method, "get") {
		return 1
	}
	if len(method) > 3 && strings.HasPrefix(method, "set") {
		return 2
	}
	return 0
}

func hasByteStorageConversion(call *ast.Node, c *checker.Checker) bool {
	args := call.AsCallExpression().Arguments
	if args == nil {
		return false
	}
	count := byteStorageNumericArguments(call.Expression().Name().Text())
	for _, arg := range args.Nodes[:min(count, len(args.Nodes))] {
		if !checkedPrimitiveOperand(arg, c) {
			return true
		}
	}
	return false
}

// A species-producing method reads the actual instance constructor and then the
// constructor's species. A selected authored constructor can run ordinary code.
func (q *sourceValueQuery) byteStorageSpeciesEffects(call, operand *ast.Node, method string, bindings sourceValueBindings, result *accessorCandidates) {
	observe := func(receiver sourceValue) {
		if receiver.node == nil || len(receiver.path) != 0 || !ast.IsNewExpression(receiver.node) ||
			q.privateByteMemberReplaced(call, operand, receiver.node, method, bindings) {
			return
		}
		q.byteStorageReceiverSpecies(call, operand, receiver, bindings, result)
	}
	for _, receiver := range q.originsAt(operand, call, bindings, result) {
		if receiver.node != nil && len(receiver.path) == 0 && ast.IsCallExpression(receiver.node) {
			// The native Get consumes the returned allocation's constructor.
			// Keep its creating inputs through that source projection.
			acquired := q.accessorsAtGet(receiver.node, nil, "", accessorAcquire, bindings, nil, nil, receiver)
			mergeAccessorCandidates(result, candidatePublisherPayload(acquired))
			for _, alternative := range acquired.values {
				observe(alternative)
			}
			continue
		}
		observe(receiver)
	}
}

func (q *sourceValueQuery) byteStorageReceiverSpecies(call, operand *ast.Node, receiver sourceValue, bindings sourceValueBindings, result *accessorCandidates) {
	var inherited []sourceValue
	if !standardByteStorageConstruction(receiver.node, q.owner.checker) {
		previousCreators := q.creators
		selectedBindings := bindings
		if receiver.capture != nil {
			selectedBindings, q.creators = receiver.capture.bindings, receiver.capture.creators
		}
		defer func() { q.creators = previousCreators }()
		selected := q.selectSourceConstructionReference(receiver.node.Expression(), receiver.node, selectedBindings, result)
		for _, decl := range selected.declarations {
			if q.byteStorageSubclass(decl, receiver.node, selectedBindings, result, make(map[*ast.Node]bool)) {
				inherited = append(inherited, sourceValue{node: decl, capture: receiver.capture})
			}
		}
		if len(inherited) == 0 {
			return
		}
		q.creators = previousCreators
	}
	constructors := q.acquireImplicitMember(receiver, "constructor", nil, bindings, result)
	if len(inherited) > 0 && !q.privateByteMemberReplaced(call, operand, receiver.node, "constructor", bindings) {
		constructors.values = append(constructors.values, inherited...)
	}
	for _, constructor := range constructors.values {
		if constructor.node == nil || sourcePrimitiveValue(constructor.node) {
			continue
		}
		key, symbol := q.nativeSpeciesKey(result)
		if key == "" {
			result.opaque = true
			continue
		}
		species := q.acquireImplicitMember(constructor, key, symbol, bindings, result)
		for index, target := range species.values {
			if !sourceConstructorDefinition(target.node) || len(target.path) != 0 {
				continue
			}
			scope, acquired := species.callableScopes[index]
			if !acquired {
				scope = acquiredCallableScope{bindings: bindings, creators: q.creators}
			}
			if target.capture != nil {
				scope = *target.capture
			}
			if target.acquired != nil {
				scope = target.acquired.scope
			}
			selected := sourcePreparedInvocation{declarations: []*ast.Node{target.node}, scope: scope}
			q.retainSelectedConstructionDependencies(call, &selected, result)
			// The native algorithm supplies hidden construction inputs.
			result.opaque = true
		}
	}
}

// Recognize a straight-line override on a fresh private instance. All uses must
// be the call, the function assignment, or a descriptor for the distinct
// constructor key. Aliases, accessors on the method, deletes and later writes
// leave the standard alternative open.
func (q *sourceValueQuery) privateByteMemberReplaced(call, operand, origin *ast.Node, key string, bindings sourceValueBindings) bool {
	if !ast.IsIdentifier(operand) || call.Parent == nil || !ast.IsExpressionStatement(call.Parent) {
		return false
	}
	symbol := q.owner.checker.GetSymbolAtLocation(operand)
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return false
	}
	decl := symbol.ValueDeclaration
	if decl.Initializer() != origin || decl.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(decl) == nil {
		return false
	}
	index := q.owner.index(ast.GetSourceFileOfNode(call))
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete {
		return false
	}
	replaced := false
	for _, use := range index.privateUses.uses[ast.GetSymbolId(symbol)] {
		ref, parent := use.node, use.node.Parent
		if ref == operand {
			continue
		}
		if parent != nil && ast.IsCallExpression(parent) {
			op := parent.AsCallExpression()
			if op.Arguments != nil && len(op.Arguments.Nodes) == 3 && op.Arguments.Nodes[0] == ref && q.descriptorWriterCall(op) {
				written := sourceLiteralMemberName(op.Arguments.Nodes[1])
				if written == key && (key == "constructor" || byteStorageMethodDescriptor(op.Arguments.Nodes[2])) {
					// Reflect may return false. A reached direct Object write either
					// installs the slot or throws before reaching the method Call.
					root, _ := restrictedInvocationMember(op.Expression, q.owner.checker)
					if replaced || root == nil || !ast.IsIdentifier(root) || root.Text() != "Object" || !q.precedes(parent, call, bindings) {
						return false
					}
					replaced = true
					continue
				}
				if written == "constructor" {
					continue
				}
			}
		}
		if replaced || parent == nil || !ast.IsPropertyAccessExpression(parent) || parent.Expression() != ref ||
			parent.Name().Text() != key || parent.Parent == nil || !ast.IsBinaryExpression(parent.Parent) {
			return false
		}
		write := parent.Parent.AsBinaryExpression()
		statement := parent.Parent.Parent
		if write.Left != parent || write.OperatorToken.Kind != ast.KindEqualsToken ||
			!(ast.IsArrowFunction(write.Right) || ast.IsFunctionExpression(write.Right)) ||
			statement == nil || !ast.IsExpressionStatement(statement) || statement.Parent != call.Parent.Parent || statement.End() > call.Pos() {
			return false
		}
		replaced = true
	}
	return replaced
}

// Only a fresh literal function data descriptor proves the native method could
// not be returned by this definition. A getter can hand back the original.
func byteStorageMethodDescriptor(node *ast.Node) bool {
	if !ast.IsObjectLiteralExpression(node) {
		return false
	}
	properties := node.AsObjectLiteralExpression().Properties.Nodes
	if len(properties) != 1 || !ast.IsPropertyAssignment(properties[0]) || ast.IsComputedPropertyName(properties[0].Name()) {
		return false
	}
	definition := properties[0]
	return callableNameText(definition.Name()) == "value" && (ast.IsArrowFunction(definition.Initializer()) || ast.IsFunctionExpression(definition.Initializer()))
}

// The declared TypeScript method identifies a candidate native operation. Match
// the selected construction's heritage before attributing its default species.
func (q *sourceValueQuery) byteStorageSubclass(decl, site *ast.Node, bindings sourceValueBindings, result *accessorCandidates, seen map[*ast.Node]bool) bool {
	if seen[decl] || !(ast.IsClassDeclaration(decl) || ast.IsClassExpression(decl)) {
		return false
	}
	seen[decl] = true
	h := ast.GetClassExtendsHeritageElement(decl)
	if h == nil {
		return false
	}
	base := h.Expression()
	if standardByteStorageConstructorReference(base, q.owner.checker) {
		return true
	}
	for _, parent := range q.selectSourceConstructionReference(base, site, bindings, result).declarations {
		if q.byteStorageSubclass(parent, site, bindings, result, seen) {
			return true
		}
	}
	return false
}

// The inherited standard species getter returns the original constructor
// receiver. This is a dependency value for the native construction, with no
// normal getter output or instance receipt.
func (q *sourceValueQuery) inheritedByteStorageSpecies(value *ast.Node, receiver *sourceValue, get *sourceGetInputs, projection []string, name string, mode accessorTraversal, bindings sourceValueBindings, result *accessorCandidates) bool {
	if !q.dependenciesOnly || receiver == nil || receiver.node == nil || !ast.IsClassDeclaration(receiver.node) && !ast.IsClassExpression(receiver.node) ||
		get == nil || get.symbol == nil || get.symbol.Name != "species" || get.symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(get.symbol.ValueDeclaration)) ||
		len(projection) != 1 || name != "" || mode != accessorAcquire || !standardByteStorageConstructorReference(value, q.owner.checker) {
		return false
	}
	constructor := *receiver
	scope := q.acquireCallableScope(bindings, result)
	constructor.capture = &scope
	result.values = append(result.values, constructor)
	return true
}

// An authored declaration for the actual well-known symbol owns that slot and
// bypasses the native inherited getter. Structural SymbolConstructor types do
// not certify a shadowed Symbol value.
func sourceOwnByteStorageSpecies(member *ast.Node, get *sourceGetInputs, c *checker.Checker) bool {
	if get == nil || get.symbol == nil || get.symbol.Name != "species" || member.Name() == nil || !ast.IsComputedPropertyName(member.Name()) {
		return false
	}
	key := member.Name().AsComputedPropertyName().Expression
	if !ast.IsPropertyAccessExpression(key) {
		return false
	}
	root := key.Expression()
	return ast.IsIdentifier(root) && root.Text() == "Symbol" && standardLibraryValue(root, c) && c.GetSymbolAtLocation(key) == get.symbol
}
