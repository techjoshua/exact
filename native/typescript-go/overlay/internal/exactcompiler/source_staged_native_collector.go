package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// stageNativeDescriptorCall enrolls the first complete ordinary collector domain.
// The source index bounds eligibility, not semantic coverage. Only the actual
// selected Get owner can publish the native relationship and independent debts.
// Other source regions and input domains keep their existing collector.
func (work *callableEffectWork) stageNativeDescriptorCall(facts []callableFacts, consumer int, call *ast.Node, owner *executableBodyOwner) bool {
	fact := &facts[consumer]
	if fact.normalInputs != nil || !envelopeSynchronousFunction(fact.node) || enclosingCallableNode(fact.node) != nil || len(fact.node.Parameters()) != 0 || !ast.IsCallExpression(call) || !ast.IsBlock(fact.node.Body()) {
		return false
	}
	statements := fact.node.Body().AsBlock().Statements.Nodes
	if len(statements) != 1 || !ast.IsReturnStatement(statements[0]) || statements[0].AsReturnStatement().Expression != call {
		return work.stageNativeSequenceCall(facts, consumer, call, owner)
	}
	callee := call.Expression()
	if !ast.IsPropertyAccessExpression(callee) && !ast.IsElementAccessExpression(callee) {
		return false
	}
	receiver, _ := accessorReceiver(callee)
	if !ast.IsIdentifier(receiver) {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(receiver)
	if symbol == nil || symbol.ValueDeclaration == nil || !standardLibrarySource(ast.GetSourceFileOfNode(symbol.ValueDeclaration)) {
		return false
	}
	actuals := restrictedInvocationArguments(call.AsCallExpression())
	if len(actuals) != 3 || !ast.IsObjectLiteralExpression(actuals[0]) || !ast.IsObjectLiteralExpression(actuals[2]) || !sourcePrimitiveValue(actuals[1]) {
		return false
	}
	var eagerCalls []sourceStagedNativeEagerCall
	inert := true
	endpoints := make([]sourceRelativeEndpoint, len(actuals))
	for index, actual := range actuals {
		inert = inert && sourceInertValueCreation(actual)
		endpoints[index] = sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actual, producer: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}
	}
	if !inert {
		var supported bool
		eagerCalls, supported = describeStagedEagerCallConstruction(endpoints, fact, owner)
		if !supported {
			return false
		}
	}
	for _, member := range actuals[2].AsObjectLiteralExpression().Properties.Nodes {
		if ast.IsPropertyAssignment(member) && callableNameText(member.Name()) == "__proto__" {
			return false
		}
		if ast.IsGetAccessorDeclaration(member) && !stagedFieldGetterInputsMapped(member, nil, owner) {
			return false
		}
	}
	index := owner.values.index(fact.sourceFile)
	if index.incomplete || index.normalOccurrences == nil || index.memberOrigins == nil || len(index.runtimeImports) != 0 {
		return false
	}
	operations, populated := stagedFieldPrototypeDiscovery(index)
	if !populated {
		return false
	}
	for _, operation := range operations {
		if operation.region != fact.node || operation.operation != call && operation.operation != callee {
			if _, represented := stagedInvokedDescriptorBodySource(actuals[2], operation.operation, operation.region, owner); !represented && !stagedEagerSourceOperation(eagerCalls, operation.operation, operation.region, owner) {
				return false
			}
		}
	}
	writers, populated := stagedFieldWriterDiscovery(index, actuals[2])
	if !populated || len(writers) != 0 {
		return false
	}
	request := sourceStagedNativeRequest{call: call, get: callee, descriptorGet: actuals[2], request: sourceStagedOperationRequest{producer: sourceStagedOperationKey{declaration: fact.node, operation: call, kind: relativeDemandEffects}, consumer: fact.node, edge: fmt.Sprintf("%s:native-effects:%d", fact.summary.ID, call.Pos()), use: call, cut: sourceRelativeCut{operation: call, use: call, reading: call}}}
	query := newSourceDependencyQuery(call, owner.checker, owner, fact.node)
	defer query.publishDependencyStatistics()
	revoke, installed := beginStagedNativeDescriptorSource(query, work, facts, request)
	if !installed {
		return false
	}
	defer revoke()
	query.receiverCandidates(call, nil)
	_, registered := work.operationRecipes[request.request.producer]
	if !registered {
		return false
	} // No selected standard alternative. Legacy owns it.
	// Once authenticated membership exists, the queue owns settlement. A missing
	// contribution is a pending producer, never permission to publish an empty set.
	fact.staged.operationSkipped = append(fact.staged.operationSkipped, call)
	return true
}
