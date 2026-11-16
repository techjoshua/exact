package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// stagedNativeSequence bounds one straight-line installation followed by its
// original descriptor Get. Syntax is eligibility only. Each Call still requires
// live standard selection, ordered eager work and independent source closure.
// No branch, passive unrelated body, external input or exact output is elided.
func stagedNativeSequence(fact *callableFacts, owner *executableBodyOwner) ([]*ast.Node, bool) {
	if fact.normalInputs != nil || owner == nil || owner.values == nil || !ast.IsFunctionDeclaration(fact.node) || fact.node.Parent == nil || !ast.IsSourceFile(fact.node.Parent) || !ast.IsExternalModule(fact.sourceFile) || !envelopeSynchronousFunction(fact.node) || enclosingCallableNode(fact.node) != nil || len(fact.node.Parameters()) != 0 || fact.node.Body() == nil || !ast.IsBlock(fact.node.Body()) {
		return nil, false
	}
	if _, component := owner.values.components[fact.node]; component {
		return nil, false
	}
	statements := fact.node.Body().AsBlock().Statements.Nodes
	if len(statements) != 2 || !ast.IsExpressionStatement(statements[0]) || !ast.IsReturnStatement(statements[1]) {
		return nil, false
	}
	calls := []*ast.Node{statements[0].Expression(), statements[1].Expression()}
	var eager []sourceStagedNativeEagerCall
	for i, call := range calls {
		if call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || !ast.IsPropertyAccessExpression(call.Expression()) || ast.IsOptionalChain(call.Expression()) {
			return nil, false
		}
		callee := call.Expression()
		root := callee.Expression()
		if !ast.IsIdentifier(root) || callableNameText(callee.Name()) != "defineProperty" {
			return nil, false
		}
		symbol := owner.checker.GetSymbolAtLocation(root)
		if symbol == nil || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
			return nil, false
		}
		args := restrictedInvocationArguments(call.AsCallExpression())
		if len(args) != 3 || !ast.IsStringLiteralLike(args[1]) || !sourceInertValueCreation(args[1]) || !ast.IsObjectLiteralExpression(args[2]) {
			return nil, false
		}
		if i == 1 {
			if !ast.IsObjectLiteralExpression(args[0]) || !sourceInertValueCreation(args[0]) || len(args[2].AsObjectLiteralExpression().Properties.Nodes) != 0 {
				return nil, false
			}
			continue
		}
		if !ast.IsPropertyAccessExpression(args[0]) || ast.IsOptionalChain(args[0]) || !ast.IsIdentifier(args[0].Expression()) || callableNameText(args[0].Name()) != "prototype" || stagedDescriptorFieldIndex(args[1].Text()) < 0 {
			return nil, false
		}
		targetRoot := owner.checker.GetSymbolAtLocation(args[0].Expression())
		standardRoot := owner.checker.GetGlobalSymbol("Object", ast.SymbolFlagsValue, nil)
		if targetRoot == nil || standardRoot == nil || targetRoot.ValueDeclaration != standardRoot.ValueDeclaration {
			return nil, false
		}
		endpoints := make([]sourceRelativeEndpoint, 3)
		for n, arg := range args {
			endpoints[n] = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: arg, producer: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
		}
		var valid bool
		eager, valid = describeStagedEagerDescriptorCalls(endpoints, fact, owner)
		if !valid {
			return nil, false
		}
		accessorInput := false
		for _, property := range args[2].AsObjectLiteralExpression().Properties.Nodes {
			name := callableNameText(property.Name())
			if name == "value" || name == "writable" {
				return nil, false
			}
			if name == "get" && ast.IsPropertyAssignment(property) && ast.IsCallExpression(property.AsPropertyAssignment().Initializer) {
				accessorInput = true
			}
		}
		if !accessorInput {
			return nil, false
		}
		for _, dependency := range eager {
			templates := describeStagedReturnTemplates(dependency.invocation.declaration, owner.values)
			if len(templates) == 0 {
				return nil, false
			}
			for _, template := range templates {
				values, supported := stagedMemberSourceValues(template.callable, nil, owner)
				if template.unknown || len(template.captures) != 0 || !supported || len(values) != 1 || !stagedSequenceCallableSources(template.callable, owner) {
					return nil, false
				}
			}
		}
	}
	index := owner.values.index(fact.sourceFile)
	if index.incomplete || index.normalDynamicScope || index.normalOccurrences == nil || index.memberOrigins == nil || len(index.runtimeImports) != 0 {
		return nil, false
	}
	operations, ready := stagedFieldPrototypeDiscovery(index)
	if !ready {
		return nil, false
	}
	for _, candidate := range operations {
		represented := false
		for _, call := range calls {
			args := restrictedInvocationArguments(call.AsCallExpression())
			represented = represented || candidate.region == fact.node && (candidate.operation == call || candidate.operation == call.Expression() || candidate.operation == args[0])
		}
		if !represented && !stagedEagerSourceOperation(eager, candidate.operation, candidate.region, owner) {
			return nil, false
		}
	}
	return calls, true
}

func (work *callableEffectWork) stageNativeSequenceCall(facts []callableFacts, consumer int, call *ast.Node, owner *executableBodyOwner) bool {
	calls, eligible := stagedNativeSequence(&facts[consumer], owner)
	if !eligible || call != calls[0] && call != calls[1] {
		return false
	}
	args := restrictedInvocationArguments(call.AsCallExpression())
	request := sourceStagedNativeRequest{call: call, get: call.Expression(), descriptorGet: args[2], request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: facts[consumer].node, operation: call, kind: relativeDemandEffects}, consumer: facts[consumer].node, edge: fmt.Sprintf("%s:native-effects:%d", facts[consumer].summary.ID, call.Pos()), use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
	query := newSourceDependencyQuery(call, owner.checker, owner, facts[consumer].node)
	defer query.publishDependencyStatistics()
	revoke, installed := beginStagedNativeDescriptorSource(query, work, facts, request)
	if !installed {
		return false
	}
	defer revoke()
	query.receiverCandidates(call, nil)
	if _, registered := work.operationRecipes[request.request.producer]; !registered {
		return false
	}
	facts[consumer].staged.operationSkipped = append(facts[consumer].staged.operationSkipped, call)
	return true
}

// The initial sequence domain transports only independent external reads in an
// invoked callback. Returned calls, construction, mutations and further value
// families require their original owners instead of an empty Value baseline.
func stagedSequenceCallableSources(body *ast.Node, owner *executableBodyOwner) bool {
	for _, site := range owner.values.summary(body).returnSites {
		expression := site
		if ast.IsReturnStatement(site) {
			expression = site.Expression()
		}
		if expression == nil {
			continue
		}
		if sourcePrimitiveValue(expression) && sourceInertValueCreation(expression) {
			continue
		}
		if !stagedSequenceExternalRead(expression, owner) {
			return false
		}
	}
	supported := true
	walkNode(body.Body(), func(node *ast.Node) bool {
		if node != body.Body() && ast.IsFunctionLike(node) {
			supported = false
			return false
		}
		if ast.IsCallExpression(node) || ast.IsNewExpression(node) || ast.IsDeleteExpression(node) || ast.IsPrefixUnaryExpression(node) || ast.IsPostfixUnaryExpression(node) || ast.IsBinaryExpression(node) && ast.IsAssignmentOperator(node.AsBinaryExpression().OperatorToken.Kind) {
			supported = false
			return false
		}
		if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
			supported = stagedSequenceExternalRead(node, owner)
		}
		return supported
	})
	return supported
}

// This is a runtime input leaf identified by its original global source owner,
// not by the type or possible value of the read. No normal result follows.
func stagedSequenceExternalRead(expression *ast.Node, owner *executableBodyOwner) bool {
	if expression == nil || !ast.IsPropertyAccessExpression(expression) {
		return false
	}
	root, _ := accessorReceiver(expression)
	if !ast.IsIdentifier(root) {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(root)
	global := owner.checker.GetGlobalSymbol(root.Text(), ast.SymbolFlagsValue, nil)
	return symbol != nil && symbol == global && symbol.ValueDeclaration != nil && standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration))
}
