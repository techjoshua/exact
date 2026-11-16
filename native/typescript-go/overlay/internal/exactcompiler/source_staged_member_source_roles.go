package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedMemberSourceRoles describes original member source dependencies.
// No endpoint supplies current values, activation, selection or source coverage.
type sourceStagedMemberSourceRoles struct {
	operation, region  *ast.Node
	target, key, value sourceMemberEndpoint
}

// describeStagedMemberSourceRoles validates the original source vector once and
// delegates lexical classification to memberEndpoint. The query is temporary
// and never acquires inputs, receivers or RHS output. True is association only.
func describeStagedMemberSourceRoles(candidate sourceStagedMemberCandidate, owner *executableBodyOwner) (sourceStagedMemberSourceRoles, bool) {
	var plan sourceStagedMemberSourceRoles
	operation := candidate.operation
	if owner == nil || owner.values == nil || owner.checker == nil || owner.values.program == nil || owner.values.checker != owner.checker || operation == nil || candidate.origin == nil || candidate.runtimeUnknown || candidate.protocol || candidate.cut.operation == nil || candidate.cut.reading == nil {
		return plan, false
	}
	for _, node := range []*ast.Node{operation, candidate.origin, candidate.cut.operation, candidate.cut.use, candidate.cut.reading, candidate.cut.initializing, candidate.cut.invoking, candidate.cut.returning} {
		if node != nil {
			file := ast.GetSourceFileOfNode(node)
			if file == nil || owner.values.program.GetSourceFile(file.FileName()) != file {
				return plan, false
			}
		}
	}
	file := ast.GetSourceFileOfNode(operation)
	if file.IsDeclarationFile {
		return plan, false
	}
	index := owner.values.index(file)
	occurrence := index.normalOccurrences[operation]
	if index.incomplete || index.normalDynamicScope || occurrence == nil || occurrence.node != operation || occurrence.region != candidate.region {
		return plan, false
	}
	var target, key, value *ast.Node
	staticKey := false
	if candidate.reflective {
		if !ast.IsCallExpression(operation) {
			return plan, false
		}
		actuals := restrictedInvocationArguments(operation.AsCallExpression())
		if len(actuals) < 1 || len(actuals) > 3 {
			return plan, false
		}
		for _, actual := range actuals {
			if ast.IsSpreadElement(actual) {
				return plan, false
			}
		}
		target = actuals[0]
		if len(actuals) > 1 {
			key = actuals[1]
		}
		if len(actuals) > 2 {
			value = actuals[2]
		}
	} else {
		if !ast.IsBinaryExpression(operation) || operation.AsBinaryExpression().OperatorToken.Kind != ast.KindEqualsToken {
			return plan, false
		}
		assignment := operation.AsBinaryExpression()
		if !ast.IsPropertyAccessExpression(assignment.Left) && !ast.IsElementAccessExpression(assignment.Left) {
			return plan, false
		}
		target = assignment.Left.Expression()
		if ast.IsElementAccessExpression(assignment.Left) {
			key = assignment.Left.AsElementAccessExpression().ArgumentExpression
		} else {
			key = assignment.Left.Name()
			staticKey = true
		}
		value = assignment.Right
	}
	for index, expression := range []*ast.Node{target, key, value} {
		endpoint := []sourceRelativeEndpoint{candidate.target, candidate.key, candidate.value}[index]
		if expression == nil {
			if !sameOperationEndpoint(endpoint, sourceRelativeEndpoint{}) {
				return plan, false
			}
			continue
		}
		expected := sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: expression, producer: operation, cut: candidate.cut}
		if index == 2 && !candidate.reflective {
			expected.get = operation.AsBinaryExpression().Left
		}
		if !sameOperationEndpoint(endpoint, expected) {
			return plan, false
		}
	}
	query := newSourceDependencyQuery(operation, owner.checker, owner, occurrence.region)
	defer query.publishDependencyStatistics()
	plan = sourceStagedMemberSourceRoles{operation: operation, region: occurrence.region, target: memberEndpoint(query, target, occurrence.region), value: memberEndpoint(query, value, occurrence.region)}
	if staticKey {
		// A property-name identifier is source syntax, not a lexical binding Get.
		plan.key = memberEndpoint(query, nil, occurrence.region)
		plan.key.expression = key
	} else {
		plan.key = memberEndpoint(query, key, occurrence.region)
	}
	return plan, true
}
