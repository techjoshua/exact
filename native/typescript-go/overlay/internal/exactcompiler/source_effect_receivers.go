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
