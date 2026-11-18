package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// definePropertiesCallEffects retains ToPropertyDescriptor getter dependencies
// for an already acquired standard Call alternative. It publishes no installed
// field, returned value, completion, callee coverage or descriptor conversion.
// The original invocation retains all of its uncertainty and authored siblings.
func (query *sourceValueQuery) definePropertiesCallEffects(node *ast.Node, prepared sourcePreparedInvocation, bindings sourceValueBindings, result *accessorCandidates) {
	// This is the top-level original dependency Call only. Nested writer
	// probes and normal/result acquisition retain their existing paths.
	if !query.dependenciesOnly || query.operation != nil || query.sourceEffects.issuer != query || query.dependencyUse != node || query.reading != node || query.effectOwner != enclosingCallableNode(node) {
		return
	}
	selected := false
	for _, value := range prepared.acquired.values {
		selected = selected || value.native != nil && value.native.kind == sourceNativeObjectDefineProperties
	}
	if !selected || !ast.IsCallExpression(node) {
		return
	}
	call := node.AsCallExpression()
	actuals := restrictedInvocationArguments(call)
	// Adapted and spread vectors retain their existing owner. This finite
	// direct-Call contribution must not reinterpret an adapter's raw arguments.
	if call.QuestionDotToken != nil || len(actuals) != 2 || ast.IsSpreadElement(actuals[0]) || ast.IsSpreadElement(actuals[1]) {
		return
	}
	callee := unwrapSourceCallableReference(call.Expression)
	if !ast.IsPropertyAccessExpression(callee) && !ast.IsElementAccessExpression(callee) {
		return
	}
	_, method := accessorReceiver(callee)
	if method != "defineProperties" {
		return // call/apply adapters must use their own supplied-vector owner.
	}
	argument := unwrapSourceCallableReference(actuals[1])
	if !ast.IsObjectLiteralExpression(argument) {
		return // Other input producers retain their existing protocol owner.
	}
	maps, admitted := query.actualArgumentValues(node, argument, result)
	if !admitted {
		maps = query.originsAt(argument, query.boundInputAcquisition(argument, node), bindings, result)
	}
	for _, value := range maps {
		// Only the finite original map supplies field names. Actual reads below
		// still use its acquired receiver and the existing writer/Get owners.
		if value.node == nil || len(value.path) != 0 || !ast.IsObjectLiteralExpression(value.node) {
			continue
		}
		for _, member := range value.node.AsObjectLiteralExpression().Properties.Nodes {
			if !query.charge(result, member) {
				return
			}
			if !ast.IsPropertyAssignment(member) || member.Name() == nil || !ast.IsObjectLiteralExpression(unwrapSourceCallableReference(member.AsPropertyAssignment().Initializer)) {
				continue
			}
			if ast.IsComputedPropertyName(member.Name()) {
				if len(value.node.AsObjectLiteralExpression().Properties.Nodes) != 1 {
					continue // Multiple-entry identity/collisions retain the old path.
				}
				key := member.Name().AsComputedPropertyName().Expression
				checked := query.owner.checker.GetTypeAtLocation(key)
				primitive := checked != nil
				if primitive {
					for _, part := range checked.Distributed() {
						primitive = primitive && part.Flags()&(checker.TypeFlagsStringLike|checker.TypeFlagsNumberLike|checker.TypeFlagsESSymbolLike) != 0
					}
				}
				if primitive {
					// The sole own entry cannot be overwritten by another key.
					// Preserve its actual creating scope; the eager owner alone
					// evaluates the key and any coercion/Throw. No key is acquired.
					query.withProxySourceScope(value, bindings, func(scope sourceValueBindings) {
						descriptor := sourceValue{node: unwrapSourceCallableReference(member.Initializer())}
						query.normalizeDescriptorSourceFields(node, descriptor, scope, result)
					})
				}
				continue
			}
			name := callableNameText(member.Name())
			if name == "__proto__" && ast.IsPropertyAssignment(member) {
				continue // A prototype initializer is not an enumerable own entry.
			}
			descriptors := query.bindingPropertyOperation([]sourceValue{value}, name, bindings, result, accessorAcquire, node)
			for _, descriptor := range descriptors {
				// Reuse ordered source Has/Get MAY. Without an installed issuer
				// it retains known donors and opaque phases, never a successful Get.
				if descriptor.node != nil && len(descriptor.path) == 0 && ast.IsObjectLiteralExpression(descriptor.node) {
					query.normalizeDescriptorSourceFields(node, descriptor, bindings, result)
				}
			}
		}
	}
}
