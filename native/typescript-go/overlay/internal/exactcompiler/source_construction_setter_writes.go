package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceConstructionSetterWrites belongs to one original constructor Effects walk.
// Recorded writes describe possible effects from the already selected Set body.
type sourceConstructionSetterWrites struct {
	owner        *sourceValueQuery
	constructor  *sourceValueInputs
	site, caller *ast.Node
	selection    *sourcePreparedInvocation
	writes       []sourceConstructionSetterWrite
}

type sourceConstructionSetterWrite struct {
	assignment, call *ast.Node
	scope            acquiredCallableScope
}

func (q *sourceValueQuery) constructionSetterRead(get *sourceGetInputs) bool {
	return get != nil && len(get.receiver.path) == 0 && q.directConstructionSetAt(get.receiver.node)
}

// directConstructionSetAt matches a member of the active constructor and its
// original allocation. A setter body or nested construction uses its own inputs.
func (q *sourceValueQuery) directConstructionSetAt(site *ast.Node) bool {
	frame := q.constructionSetterWrites
	return frame != nil && frame.owner == q && q.inputs == frame.constructor && frame.site == site &&
		q.protectedMember != nil && directConstructionSetterMember(q.protectedMember, frame.constructor.declaration)
}

func directConstructionSetterMember(target, constructor *ast.Node) bool {
	if !ast.IsPropertyAccessExpression(target) || target.Expression().Kind != ast.KindThisKeyword ||
		target.Parent == nil || !plainStagedAssignment(target.Parent) || target.Parent.AsBinaryExpression().Left != target {
		return false
	}
	statement := target.Parent.Parent
	return statement != nil && ast.IsExpressionStatement(statement) && statement.Parent == constructor.Body()
}

func (q *sourceValueQuery) consumeConstructionReflectiveSetter(body *ast.Node, get *sourceGetInputs, captures sourceValueBindings, result *accessorCandidates) bool {
	if !q.constructionSetterRead(get) || q.setterInput == nil || q.setterInput.target != q.protectedMember || q.setterInput.numericUpdate ||
		!ast.IsMethodDeclaration(body) && !ast.IsFunctionExpression(body) {
		return false
	}
	request := q.setterInput
	inputs := q.bindSourceSetterInputs(request, body, get.receiver, captures, result)
	q.withSourceReceiverInputs(request.operation, body, inputs, result, func() {
		q.consumeSourceBodyEffects(request.target, body, inputs.bindings, inputs, nil, result)
	})
	return true
}

func (q *sourceValueQuery) recordConstructionSetterWrite(call *ast.Node, inputs *sourceValueInputs, result *accessorCandidates) {
	frame := q.constructionSetterWrites
	if frame == nil || frame.owner != q || !ast.IsCallExpression(call) || inputs == nil || !q.sourceReceiverInputsLive(inputs, inputs.declaration) {
		return
	}
	assignment := q.sourceReceiver.operation
	if !plainStagedAssignment(assignment) || !directConstructionSetterMember(assignment.AsBinaryExpression().Left, frame.constructor.declaration) ||
		call.Parent == nil || !ast.IsExpressionStatement(call.Parent) || call.Parent.Parent != inputs.declaration.Body() ||
		len(inputs.declaration.Body().AsBlock().Statements.Nodes) != 1 ||
		!q.descriptorWriterCall(call.AsCallExpression()) {
		return
	}
	target := unwrapSourceCallableReference(call.AsCallExpression().Arguments.Nodes[0])
	if target == nil || target.Kind != ast.KindThisKeyword {
		return
	}
	frame.writes = append(frame.writes, sourceConstructionSetterWrite{assignment: assignment, call: call, scope: q.acquireCallableScope(inputs.bindings, result)})
}

func (q *sourceValueQuery) retainConstructionSetterWrites(origin *ast.Node, projection []string, name string, mode accessorTraversal, get *sourceGetInputs, result *accessorCandidates) {
	if mode&accessorSet == 0 || mode == accessorSetAcquire || origin == nil || !ast.IsClassLike(origin) || !q.constructionSetterRead(get) {
		return
	}
	frame := q.constructionSetterWrites
	if len(frame.writes) == 0 || origin != frame.constructor.declaration.Parent || !q.directConstructionSetterRHS(q.protectedMember.Parent.AsBinaryExpression().Right, frame.constructor.declaration) {
		return
	}
	current := *get
	current.operation = q.protectedMember
	get = &current
	for _, write := range frame.writes {
		if !consecutiveConstructorStatements(frame.constructor.declaration, write.assignment.Parent, q.protectedMember.Parent.Parent) {
			continue
		}
		part := accessorCandidates{}
		row := sourceMemberWriterInput{implicitMember: write.assignment, scope: write.scope, incomplete: true}
		q.memberWriterScope(row, func() {
			// The selected receiver was bound by the earlier Set of this same allocation.
			// The reflective owner still decides the selected key and accessor.
			_, possible := q.reflectiveMemberValueInScope(get.receiver.node, projection, name, write.call, accessorSet|accessorNoGet, row.scope.bindings, &part, get, &row, nil)
			if possible {
				part.opaque = true
			}
		})
		mergeAccessorCandidates(result, part)
	}
}

// Only consecutive constructor statements can use this source relationship.
// Intervening work can delete or redefine the prior descriptor.
func consecutiveConstructorStatements(constructor, first, second *ast.Node) bool {
	statements := constructor.Body().AsBlock().Statements.Nodes
	for i := 1; i < len(statements); i++ {
		if statements[i] == second {
			return statements[i-1] == first
		}
	}
	return false
}

// The receiving assignment must evaluate its RHS before calling the setter.
// A literal or a lexical parameter read cannot replace an installed descriptor.
func (q *sourceValueQuery) directConstructionSetterRHS(expression, constructor *ast.Node) bool {
	expression = unwrapSourceCallableReference(expression)
	if expression == nil {
		return false
	}
	if ast.IsLiteralExpression(expression) || expression.Kind == ast.KindTrueKeyword || expression.Kind == ast.KindFalseKeyword || expression.Kind == ast.KindNullKeyword {
		return true
	}
	if ast.IsIdentifier(expression) {
		symbol := q.owner.checker.GetSymbolAtLocation(expression)
		return symbol != nil && symbol.ValueDeclaration != nil && ast.IsParameterDeclaration(symbol.ValueDeclaration) && symbol.ValueDeclaration.Parent == constructor
	}
	return false
}
