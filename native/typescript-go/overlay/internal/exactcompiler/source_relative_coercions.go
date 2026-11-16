package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceRelativeCoercion is an implicit operation on an original input role.
// It is deliberately separate from invoked-input demands. A primitive actual
// pays ToString effects without invoking a body. Object/unknown alternatives
// retain their original protocol owner until its Get/call contributions arrive.
type sourceRelativeCoercion struct {
	role                  sourceRelativeRole
	expression, operation *ast.Node
	cut                   sourceRelativeCut
}

func relativeCoercionEffect(demand sourceRelativeCoercion, owner string) EnvironmentEffectSource {
	effect := environmentSource("unknown", "input string coercion", owner)
	// The selected input owner has represented this original formal's ToString
	// operation. An arbitrary runtime actual can invoke hooks or throw; that MAY
	// effect is independent of unfinished compiler work. Actual-input transfer
	// still discharges primitives and retains unsupported projections separately.
	effect.Opaque = true
	effect.relativeCoercion = &demand
	return effect
}

func relativeCoercionIdentity(source EnvironmentEffectSource) string {
	if source.relativeCoercion == nil {
		return ""
	}
	d := source.relativeCoercion
	return fmt.Sprintf(":input-coercion:%p:%d:%p:%p:%p:%p", d.role.declaration, d.role.slot, d.expression, d.operation, d.cut.reading, d.cut.use)
}

func sameRelativeCoercion(a, b *sourceRelativeCoercion) bool {
	return a == b || a != nil && b != nil && *a == *b
}

// stagedStringInput separates template construction from each ToString demand.
// It accepts original immutable formal roles, not their TypeScript types. The
// eventual caller must supply each role's actual source contributions.
func stagedStringInput(expression *ast.Node, source *sourceStagedNativeGetSource, owner *executableBodyOwner) ([]sourceRelativeCoercion, bool) {
	if sourcePrimitiveValue(expression) {
		return nil, true
	}
	if expression == nil || !ast.IsTemplateExpression(expression) || owner == nil || owner.values == nil {
		return nil, false
	}
	var demands []sourceRelativeCoercion
	for _, span := range expression.AsTemplateExpression().TemplateSpans.Nodes {
		value := span.AsTemplateSpan().Expression
		if sourcePrimitiveValue(value) {
			continue
		}
		if !ast.IsIdentifier(value) {
			return nil, false
		}
		symbol := owner.checker.GetSymbolAtLocation(value)
		if symbol == nil || symbol.ValueDeclaration == nil || owner.values.bindingWritten(symbol) {
			return nil, false
		}
		declaration := source.request.producer.declaration
		if !ast.IsFunctionDeclaration(declaration) {
			return nil, false
		}
		slot := 0
		found := false
		for _, parameter := range declaration.Parameters() {
			if parameter.Name() != nil && ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
				continue
			}
			if parameter == symbol.ValueDeclaration && parameter.Initializer() == nil && parameter.AsParameterDeclaration().DotDotDotToken == nil {
				demands = append(demands, sourceRelativeCoercion{role: sourceRelativeRole{kind: relativeRoleFormal, declaration: declaration, slot: slot}, expression: value, operation: source.request.producer.operation, cut: source.request.cut})
				found = true
				break
			}
			slot++
		}
		if !found {
			return nil, false
		}
	}
	return demands, true
}

func validStagedCoercionEffect(recipe sourceStagedOperationRecipe, effect EnvironmentEffectSource) bool {
	source := recipe.nativeGet
	if source == nil || source.kind != sourceNativeSymbolFor || recipe.key != nativeRootDebtRequest(source, "eager-inputs").producer || effect.relativeCoercion == nil {
		return false
	}
	for _, demand := range source.coercions {
		if !validOperationRelativeRole(demand.role, source.request.producer.declaration) || demand.operation != source.request.producer.operation || demand.cut != source.request.cut || demand.expression == nil || source.input == nil || !nodeInside(demand.expression, source.input.input.expression) {
			continue
		}
		if demand == *effect.relativeCoercion {
			return true
		}
	}
	return false
}

// coercionBinding selects one stored input role without claiming invocation or
// installing an acquired scope. Pending and unknown remain distinct channels.
func coercionBinding(inputs sourceRelativeBoundInputs, role sourceRelativeRole) (sourceRelativeBinding, bool) {
	if inputs.declaration != role.declaration || inputs.unsupported != relativeInputsSupported {
		return sourceRelativeBinding{}, false
	}
	for _, binding := range inputs.bindings {
		if binding.target == role {
			return binding, true
		}
	}
	return sourceRelativeBinding{}, false
}

func coercionActualsCovered(binding sourceRelativeBinding) bool {
	if binding.unknown || len(binding.pending) != 0 || len(binding.sources) == 0 {
		return false
	}
	for _, endpoint := range binding.sources {
		if len(endpoint.projection) != 0 || endpoint.creation != nil || endpoint.returning != nil {
			return false
		}
		if endpoint.kind == relativeEndpointUndefined || endpoint.kind == relativeEndpointRole && endpoint.role.kind == relativeRoleFormal {
			continue
		}
		if endpoint.kind != relativeEndpointExpression || !sourcePrimitiveValue(endpoint.expression) {
			return false
		}
	}
	return true
}

func stagedRelativeCoercionTransfer(fact *callableFacts, edge CallEdge, source EnvironmentEffectSource) ([]EnvironmentEffectSource, bool) {
	if source.relativeCoercion == nil {
		return nil, false
	}
	transfer, found := fact.staged.coercionTransfers[edge.ID][*source.relativeCoercion]
	return transfer, found
}

// prepareRelativeCoercions reuses the existing declaration edges and detached
// binder/source associations. It performs no input acquisition or initializer
// replay. Forwarded formal atoms form a finite declaration/role/source domain.
func (work *callableEffectWork) prepareRelativeCoercions(facts []callableFacts) {
	nodes := work.memberNodes
	type subscriber struct {
		caller int
		call   sourceStagedDeclarationCall
		edge   string
	}
	subscribers := make([][]subscriber, len(facts))
	demands := make([][]sourceRelativeCoercion, len(facts))
	seen := make([]map[sourceRelativeCoercion]bool, len(facts))
	for i := range facts {
		seen[i] = make(map[sourceRelativeCoercion]bool)
		facts[i].staged.coercionTransfers = nil
		for _, source := range facts[i].summary.DirectEffectSources {
			if source.relativeCoercion != nil {
				d := *source.relativeCoercion
				if !seen[i][d] {
					seen[i][d] = true
					demands[i] = append(demands[i], d)
				}
			}
		}
		for _, call := range facts[i].staged.calls {
			if producer, known := nodes[call.invocation.declaration]; known && !call.legacyInputs && call.inputConsumerWait == nil {
				subscribers[producer] = append(subscribers[producer], subscriber{i, call, stagedDeclarationCallEdge(facts[i].summary.ID, call.invocation)})
			}
		}
	}
	for changed := true; changed; {
		changed = false
		for producer, rows := range demands {
			for _, demand := range rows {
				for _, sub := range subscribers[producer] {
					inputs := sourceRelativeBoundInputs{}
					if sub.call.sourceInputs != nil {
						inputs = sub.call.sourceInputs.bindings
					} else if sub.call.inputs != nil && sub.call.inputs.delivered {
						inputs = sub.call.inputs.relative
					} else {
						continue
					}
					binding, found := coercionBinding(inputs, demand.role)
					if !found || !coercionActualsCovered(binding) {
						continue
					}
					var transferred []EnvironmentEffectSource
					for _, endpoint := range binding.sources {
						if endpoint.kind == relativeEndpointRole {
							mapped := demand
							mapped.role = endpoint.role
							if mapped.role.declaration != facts[sub.caller].node {
								continue
							}
							if !seen[sub.caller][mapped] {
								seen[sub.caller][mapped] = true
								demands[sub.caller] = append(demands[sub.caller], mapped)
								changed = true
							}
							transferred = append(transferred, relativeCoercionEffect(mapped, facts[sub.caller].summary.Name))
						}
					}
					caller := &facts[sub.caller]
					if caller.staged.coercionTransfers == nil {
						caller.staged.coercionTransfers = make(map[string]map[sourceRelativeCoercion][]EnvironmentEffectSource)
					}
					if caller.staged.coercionTransfers[sub.edge] == nil {
						caller.staged.coercionTransfers[sub.edge] = make(map[sourceRelativeCoercion][]EnvironmentEffectSource)
					}
					caller.staged.coercionTransfers[sub.edge][demand] = transferred
				}
			}
		}
	}
}

func (work *callableEffectWork) stagedCoercionConsumerAt(fact *callableFacts, expression *ast.Node) bool {
	for _, use := range fact.staged.operationUses {
		root := work.operationRecipes[use.request.producer].nativeGet
		if root == nil || root.kind != sourceNativeSymbolFor {
			continue
		}
		source := work.operationRecipes[nativeRootDebtRequest(root, "algorithm").producer].nativeGet
		if source == nil {
			continue
		}
		for _, demand := range source.coercions {
			if demand.expression == expression {
				return true
			}
		}
	}
	return false
}
