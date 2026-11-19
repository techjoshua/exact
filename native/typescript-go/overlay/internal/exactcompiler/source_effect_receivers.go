package exactcompiler

import (
	"slices"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceEffectReceivers is a detached parameter relation for one effect use.
// It contains no normal input, storage, or runtime publication authority.
type sourceEffectReceivers struct {
	owner    *ast.Node
	bindings []ReceiverBinding
}

func (query *sourceValueQuery) sourceEffectReceiverBindings(effect sourceCallableEffect, inputs *sourceValueInputs, result *accessorCandidates) *sourceEffectReceivers {
	if query.effectOwner == nil || inputs == nil || inputs.declaration != effect.declaration {
		return nil
	}
	parameters := make(map[ast.SymbolId]int)
	if isCallableNode(query.effectOwner) {
		for index, parameter := range query.effectOwner.Parameters() {
			if !query.charge(result, parameter) {
				return nil
			}
			if parameter.Name() != nil && ast.IsIdentifier(parameter.Name()) {
				if symbol := query.owner.checker.GetSymbolAtLocation(parameter.Name()); symbol != nil {
					parameters[ast.GetSymbolId(symbol)] = index
				}
			}
		}
	}
	relation := &sourceEffectReceivers{owner: query.effectOwner}
	for index, parameter := range effect.declaration.Parameters() {
		if !query.charge(result, parameter) {
			return nil
		}
		var values []sourceValue
		if parameter.Name() != nil && ast.IsIdentifier(parameter.Name()) {
			if symbol := query.owner.checker.GetSymbolAtLocation(parameter.Name()); symbol != nil {
				values = inputs.bindings[ast.GetSymbolId(symbol)]
			}
		}
		if len(values) == 0 {
			values = []sourceValue{{}}
		}
		expanded := make(map[*ast.Node]bool)
		values = append([]sourceValue(nil), values...)
		for at := 0; at < len(values); at++ {
			value := values[at]
			if !query.charge(result, value.node) {
				return nil
			}
			// Source bindings can retain a lazy expression plan. Ask the existing
			// source-origin consumer for its alternatives at the original use.
			if value.node != nil && ast.IsConditionalExpression(unwrapSourceCallableReference(value.node)) && value.acquired == nil && value.normal == nil && !expanded[value.node] {
				expanded[value.node] = true
				part := query.accessors(value.node, value.path, "", accessorAcquire, inputs.bindings, nil)
				mergeAccessorCandidates(result, candidatePublisherPayload(part))
				if part.valueIncomplete || part.receiverIncomplete {
					values = append(values, sourceValue{})
				}
				if len(part.values) != 0 {
					values = append(values, part.values...)
					continue
				}
			}
			if !query.charge(result, value.node) {
				return nil
			}
			binding := ReceiverBinding{ParameterIndex: index, Source: "unknown"}
			if value.node != nil && value.acquired == nil && value.normal == nil && value.native == nil && value.bound == nil && value.rest == nil && value.copied == nil && stateArgumentMayOwnMutations(query.owner.checker.GetTypeAtLocation(value.node)) {
				if value.node.Kind == ast.KindThisKeyword {
					binding.Source = "component"
				} else if ast.IsIdentifier(value.node) {
					if symbol := query.owner.checker.GetSymbolAtLocation(value.node); symbol != nil {
						if source, exists := parameters[ast.GetSymbolId(symbol)]; exists {
							binding.Source, binding.SourceParameterIndex = "parameter", source
						}
					}
				}
				binding.Path = append([]string(nil), value.path...)
			}
			relation.bindings = append(relation.bindings, binding)
		}
	}
	return relation
}

func (effect sourceCallableEffect) receiverBindings(owner *ast.Node) []ReceiverBinding {
	if effect.receivers != nil && effect.receivers.owner == owner {
		return effect.receivers.bindings
	}
	return nil
}

// Alternative source contexts join receiver relations before call-graph mapping.
// An unknown alternative remains independent of every known parameter path.
func joinSourceReceiverBindings(target, source []ReceiverBinding) []ReceiverBinding {
	for _, next := range source {
		seen := false
		for _, prior := range target {
			if prior.ParameterIndex == next.ParameterIndex && prior.Source == next.Source && prior.SourceParameterIndex == next.SourceParameterIndex && slices.Equal(prior.Path, next.Path) {
				seen = true
				break
			}
		}
		if !seen {
			next.Path = append([]string(nil), next.Path...)
			target = append(target, next)
		}
	}
	return target
}

// detached retains only the source occurrence, finite path and its caller.
// A property write carries no acquired value or live execution context.
func (write sourceValueWrite) detached() sourceValueWrite {
	write.value = sourceValue{node: write.value.node, path: slices.Clone(write.value.path)}
	return write
}

// observeSetterStateReceiver maps the selected data property in this.field.leaf = rhs
// back to component state supplied by the caller. The pending journal determines
// whether this possible write actually happened in the current generation.
func (q *sourceValueQuery) observeSetterStateReceiver(literal, member *ast.Node, key string, result *accessorCandidates) {
	inputs, read := q.inputs, q.protectedMember
	if inputs == nil || !ast.IsSetAccessorDeclaration(inputs.declaration) || !q.sourceReceiverInputsLive(inputs, inputs.declaration) ||
		read == nil || !ast.IsPropertyAccessExpression(read) || read.Expression().Kind != ast.KindThisKeyword || read.Name().Text() != key ||
		inputs.declaration.Parent != literal || !ast.IsObjectLiteralExpression(literal) || !ast.IsPropertyAssignment(member) ||
		result.opaque || result.receiverIncomplete || result.valueIncomplete {
		return
	}
	target := read.Parent
	if target == nil || !ast.IsPropertyAccessExpression(target) || target.Expression() != read || !plainStagedAssignment(target.Parent) ||
		target.Parent.AsBinaryExpression().Left != target || !ast.IsIdentifier(target.Name()) {
		return
	}
	terms := inputs.bindings[0]
	if len(terms) != 1 || terms[0].node != literal || len(terms[0].path) != 0 || literal.Parent == nil ||
		!ast.IsCallExpression(literal.Parent) || !slices.Contains(callArguments(literal.Parent), literal) || enclosingCallableNode(literal) != q.effectOwner {
		return
	}
	init := unwrapRenderExpression(member.Initializer())
	if !ast.IsPropertyAccessExpression(init) || init.Name().Text() != "state" || init.Expression().Kind != ast.KindThisKeyword ||
		stateArgumentMayOwnMutations(q.owner.checker.GetTypeAtLocation(target)) {
		return
	}
	// A later spread or computed definition can replace the initializer before
	// the literal even reaches the helper. Only the last known definition counts.
	for _, later := range slices.Backward(literal.AsObjectLiteralExpression().Properties.Nodes) {
		if later == member {
			break
		}
		if later.Name() == nil || ast.IsComputedPropertyName(later.Name()) || callableNameText(later.Name()) == key {
			return
		}
	}
	for owner := q.effectOwner; owner != nil; owner = owner.Parent {
		if _, component := q.owner.components[owner]; component {
			if helperOwnsReceiver(init.Expression(), owner) {
				result.writes = append(result.writes, sourceValueWrite{componentOwner: q.effectOwner, value: sourceValue{node: init, path: []string{target.Name().Text()}}})
			}
			return
		}
	}
}
