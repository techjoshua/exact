package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// localPushArgument contributes a possible stored value only to a read through
// the original indexed selection. A creator at a repeated site cannot identify
// a sibling object observed elsewhere. Ordinary member writers remain active.
func (q *sourceValueQuery) localPushArgument(origin *ast.Node, result *accessorCandidates) *ast.Node {
	d := origin.Parent
	if !ast.IsIdentifier(d.Name()) || d.Initializer() != origin || d.Parent.Flags&ast.NodeFlagsConst == 0 || enclosingCallableNode(d) == nil {
		return nil
	}
	symbol := q.owner.checker.GetSymbolAtLocation(d.Name())
	if symbol == nil {
		return nil
	}
	index := q.owner.index(ast.GetSourceFileOfNode(origin))
	if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete || len(index.privateUses.unresolved[d.Name().Text()]) != 0 {
		return nil
	}
	uses := index.privateUses.uses[ast.GetSymbolId(symbol)]
	if len(uses) < 2 {
		return nil
	}
	block := d.Parent.Parent.Parent
	if !ast.IsBlock(block) {
		return nil
	}
	member := uses[0].node.Parent
	if !ast.IsPropertyAccessExpression(member) || member.Expression() != uses[0].node || member.Name().Text() != "push" {
		return nil
	}
	call := member.Parent
	if d.End() > call.Pos() || !ast.IsCallExpression(call) || call.Expression() != member || len(call.AsCallExpression().Arguments.Nodes) != 1 || !ast.IsExpressionStatement(call.Parent) {
		return nil
	}
	body := call.Parent.Parent
	if body != block && (!ast.IsBlock(body) || !ast.IsForOfStatement(body.Parent) || body.Parent.AsForInOrOfStatement().Statement != body || body.Parent.Parent != block) {
		return nil
	}
	arg := call.AsCallExpression().Arguments.Nodes[0]
	method := q.owner.checker.GetSymbolAtLocation(member.Name())
	if !ast.IsObjectLiteralExpression(arg) || method == nil || standardArrayMemberValue(origin, method.ValueDeclaration, member).native == nil {
		return nil
	}
	read := q.localPushRead(q.reading, symbol, result)
	if read == nil || call.End() > read.Pos() {
		return nil
	}
	for _, use := range uses[1:] {
		if !q.charge(result, use.node) {
			return nil
		}
		outer := use.node
		if member := outer.Parent; ast.IsElementAccessExpression(member) && member.Expression() == outer {
			key := member.AsElementAccessExpression().ArgumentExpression
			if !ast.IsNumericLiteral(key) || key.Text() != "0" {
				return nil
			}
			if member.Parent != nil && plainStagedAssignment(member.Parent) && member.Parent.AsBinaryExpression().Left == member {
				statement := member.Parent.Parent
				if read.End() < member.Pos() && ast.IsExpressionStatement(statement) && statement.Parent == block {
					continue
				}
				return nil
			}
			outer = member
			for ast.IsPropertyAccessExpression(outer.Parent) && outer.Parent.Expression() == outer {
				outer = outer.Parent
			}
		} else if outer.Pos() <= read.End() {
			return nil
		}
		binding := outer.Parent
		if !ast.IsVariableDeclaration(binding) || binding.Initializer() != outer || !ast.IsIdentifier(binding.Name()) || binding.Parent.Flags&ast.NodeFlagsConst == 0 || !ast.IsVariableStatement(binding.Parent.Parent) || binding.Parent.Parent.Parent != block {
			return nil
		}
	}
	if !q.localPushFieldStable(index, arg, symbol, result) {
		return nil
	}
	return arg
}

// The element selection and the descriptor writer can observe the wrapper at
// different times. Leave a possibly replaced field with the ordinary writers.
func (q *sourceValueQuery) localPushFieldStable(index sourceValueIndex, arg *ast.Node, array *ast.Symbol, result *accessorCandidates) bool {
	fields := arg.AsObjectLiteralExpression().Properties.Nodes
	if len(fields) != 1 {
		return false
	}
	field := fields[0]
	if (!ast.IsPropertyAssignment(field) && !ast.IsShorthandPropertyAssignment(field)) || !ast.IsIdentifier(field.Name()) || field.Name().Text() == "__proto__" {
		return false
	}
	key := field.Name().Text()
	assignments := index.memberAssignments(arg)
	for {
		write, ok := assignments.next()
		if !ok {
			break
		}
		_, written := accessorReceiver(write.left)
		if !q.charge(result, write.left) || written == key || written == "" || written == "*" {
			return false
		}
	}
	for _, calls := range [][]*ast.Node{index.originCalls[arg], index.dynamicCalls} {
		for _, call := range calls {
			if !q.charge(result, call) {
				return false
			}
			if !q.owner.reflectiveMutation(call.Expression()) {
				continue
			}
			c := call.AsCallExpression()
			if q.descriptorWriterCall(c) {
				written := sourceLiteralMemberName(unwrapSourceCallableReference(c.Arguments.Nodes[1]))
				if written != "" && written != key && q.pushDescriptorUsesArray(c.Arguments.Nodes[0], array, key, index, result) {
					continue
				}
			}
			return false
		}
	}
	return true
}

// A descriptor on another wrapper cannot justify observing this append. Match
// only direct inputs of a private local writer; its invocation and getter
// effects are still decided by ordinary call and member analysis.
func (q *sourceValueQuery) pushDescriptorUsesArray(target *ast.Node, array *ast.Symbol, key string, index sourceValueIndex, result *accessorCandidates) bool {
	if !ast.IsPropertyAccessExpression(target) || target.Name().Text() != key {
		return false
	}
	receiver := target.Expression()
	if q.localPushRead(receiver, array, result) != nil {
		return true
	}
	if !ast.IsIdentifier(receiver) {
		return false
	}
	param := q.owner.checker.GetSymbolAtLocation(receiver)
	if param == nil || param.ValueDeclaration == nil || param.ValueDeclaration.Kind != ast.KindParameter {
		return false
	}
	writer := param.ValueDeclaration.Parent
	if !ast.IsFunctionDeclaration(writer) || writer.Name() == nil || len(writer.Parameters()) != 1 || writer.Parameters()[0] != param.ValueDeclaration || enclosingCallableNode(writer) != enclosingCallableNode(array.ValueDeclaration) {
		return false
	}
	symbol := q.owner.checker.GetSymbolAtLocation(writer.Name())
	if symbol == nil {
		return false
	}
	uses := index.privateUses.uses[ast.GetSymbolId(symbol)]
	for _, use := range uses {
		call := use.node.Parent
		if !q.charge(result, call) || !ast.IsCallExpression(call) || call.Expression() != use.node || len(call.AsCallExpression().Arguments.Nodes) != 1 || q.localPushRead(call.AsCallExpression().Arguments.Nodes[0], array, result) == nil {
			return false
		}
	}
	return len(uses) != 0
}

// localPushRead follows immutable receiver aliases to the indexed selection
// observed by this dependency. Unrelated reads cannot borrow its stored value.
func (q *sourceValueQuery) localPushRead(start *ast.Node, array *ast.Symbol, result *accessorCandidates) *ast.Node {
	for n := start; n != nil && q.charge(result, n); {
		if ast.IsElementAccessExpression(n) && ast.IsIdentifier(n.Expression()) && q.owner.checker.GetSymbolAtLocation(n.Expression()) == array {
			return n
		}
		if ast.IsPropertyAccessExpression(n) {
			n = n.Expression()
			continue
		}
		if !ast.IsIdentifier(n) {
			break
		}
		s := q.owner.checker.GetSymbolAtLocation(n)
		if s == nil || s.ValueDeclaration == nil || !ast.IsVariableDeclaration(s.ValueDeclaration) || !ast.IsIdentifier(s.ValueDeclaration.Name()) || s.ValueDeclaration.Parent.Flags&ast.NodeFlagsConst == 0 || s.ValueDeclaration.End() > n.Pos() {
			break
		}
		n = s.ValueDeclaration.Initializer()
	}
	return nil
}
