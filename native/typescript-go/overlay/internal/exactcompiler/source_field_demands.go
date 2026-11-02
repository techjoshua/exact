package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// sourceFieldDemand identifies a declaration-local field operation on one input
// slot. Identity associates admitted facts, never proves an activation or value.
type sourceFieldDemand struct {
	declaration, operation, slot *ast.Node
	key                          string
	use, consumer                *ast.Node
}

func (d sourceFieldDemand) identity() string {
	if d.declaration == nil || d.operation == nil || d.slot == nil {
		return ""
	}
	source := ast.GetSourceFileOfNode(d.declaration)
	return fmt.Sprintf("%s:%d:field:%d:slot:%d:%s", source.FileName(), d.declaration.Pos(), d.operation.Pos(), d.slot.Pos(), d.key) + fmt.Sprintf(":%p:%p", d.use, d.consumer)
}

type sourceFieldOutcome struct {
	demand    sourceFieldDemand
	fulfilled bool
}

// sourceFieldCall is a construction result, with no input frame or query retained.
// The invocation consumer sets coverage only after the complete selection closes.
type sourceFieldCall struct {
	// dependencies identifies effect coverage from per-use source substitution.
	// It supplies no normal output, descriptor or execution authority.
	dependencies         bool
	operation, target    *ast.Node
	calls                []sourceCallOutcome
	outcomes             []sourceFieldOutcome
	complete             bool
	descriptorOccurrence *sourceDescriptorEffectOccurrence
	descriptorEffects    []sourceDescriptorEffectOutcome
}

func (query *sourceValueQuery) fieldDemand(operation, receiver *ast.Node, key string) (sourceFieldDemand, *ast.Symbol) {
	if operation == nil || receiver == nil || key == "" {
		return sourceFieldDemand{}, nil
	}
	receiver = unwrapSourceCallableReference(receiver)
	root := receiver
	// Source obligations name the exact Get even when its receiver is a
	// projection of an input. Exact descriptor coverage keeps its direct-slot law.
	if query.dependenciesOnly {
		for ast.IsPropertyAccessExpression(root) || ast.IsElementAccessExpression(root) {
			root = unwrapSourceCallableReference(root.Expression())
		}
	}
	if !ast.IsIdentifier(root) {
		return sourceFieldDemand{}, nil
	}
	symbol := query.owner.checker.GetSymbolAtLocation(root)
	if symbol == nil || symbol.ValueDeclaration == nil {
		return sourceFieldDemand{}, nil
	}
	declaration := enclosingCallableNode(operation)
	slotOwner := enclosingCallableNode(symbol.ValueDeclaration)
	if declaration == nil || slotOwner == nil {
		return sourceFieldDemand{}, nil
	}
	if ast.IsParameterDeclaration(symbol.ValueDeclaration) {
		// Naming a bound lexical read is not an activation/descriptor proof.
		// Exact coverage remains the responsibility of its separate consumer.
		if !ast.IsIdentifier(symbol.ValueDeclaration.Name()) {
			return sourceFieldDemand{}, nil
		}

		var actual *ast.Node
		selected := ""
		if ast.IsPropertyAccessExpression(operation) || ast.IsElementAccessExpression(operation) {
			actual, selected = accessorReceiver(operation)
		}
		if query.dependenciesOnly && sourceLocalPatternGetReceiver(operation, key) == receiver {
			actual, selected = receiver, key
		}
		if actual != receiver || selected != key {
			return sourceFieldDemand{}, nil
		}
	} else {
		if !ast.IsVariableDeclaration(symbol.ValueDeclaration) && !ast.IsBindingElement(symbol.ValueDeclaration) {
			return sourceFieldDemand{}, nil
		}
		// Destructured formals and actual local pattern Gets are source-relative
		// input operations. Other same-owner locals and normal descriptor/output
		// admission retain their separate contracts.
		if declaration == slotOwner && !(query.dependenciesOnly && (sourcePatternParameter(root, query.owner.checker) || sourceLocalPatternGetReceiver(operation, key) == receiver)) {
			return sourceFieldDemand{}, nil
		}
	}
	return sourceFieldDemand{declaration: declaration, operation: operation, slot: symbol.ValueDeclaration, key: key, use: query.effectUse(), consumer: query.effectOwner}, symbol
}

// operationFieldDemand names the authored receiver before alias projection.
// A traversal through an alias initializer must not change the obligation's slot.
func (query *sourceValueQuery) operationFieldDemand(operation *ast.Node, key string) sourceFieldDemand {
	if query.dependenciesOnly {
		if receiver := sourceLocalPatternGetReceiver(operation, key); receiver != nil {
			demand, _ := query.fieldDemand(operation, receiver, key)
			return demand
		}
	}
	if operation == nil || (!ast.IsPropertyAccessExpression(operation) && !ast.IsElementAccessExpression(operation)) {
		return sourceFieldDemand{}
	}
	receiver, selected := accessorReceiver(operation)
	if selected != key {
		return sourceFieldDemand{}
	}
	demand, _ := query.fieldDemand(operation, receiver, key)
	return demand
}

// missingNormalInput identifies an uninstalled normal-operand slot from the
// existing declaration summary. It does not infer a value from its initializer.
func (query *sourceValueQuery) missingNormalInput(symbol *ast.Symbol, read *ast.Node, bindings sourceValueBindings, result *accessorCandidates) bool {
	if symbol == nil || symbol.ValueDeclaration == nil || !ast.IsVariableDeclaration(symbol.ValueDeclaration) {
		return false
	}
	owner := enclosingCallableNode(symbol.ValueDeclaration)
	consumer := enclosingCallableNode(read)
	// Local writer resolution can reach an initializer in its lexical owner.
	// The unavailable input belongs to the original member demand, not that
	// intermediate source occurrence. This classifies absence, never activation.
	if query.protectedMember != nil {
		consumer = enclosingCallableNode(query.protectedMember)
	}
	if owner == nil || consumer == nil || owner == consumer {
		return false
	}
	if _, installed := bindings[ast.GetSymbolId(symbol)]; installed {
		return false
	}
	if query.creators[owner].invocation != nil {
		return false
	}
	if !query.charge(result, read) {
		return false
	}
	_, described := query.owner.summary(owner).normalSlots[symbol.ValueDeclaration]
	return described
}

// missingFieldGet is shared by explicit member and pattern value consumers.
// The term is unknown, with an exact unavailable input cause. Residual unknown
// from any other alternative remains independent and is never relabeled.
func (query *sourceValueQuery) missingFieldGet(value sourceValue, key string, operation *ast.Node, result *accessorCandidates) bool {
	if value.entrySlot == nil {
		return false
	}
	// An intermediate acquisition may have no actual member operation. It
	// cannot publish a field demand and must retain ordinary uncertainty.
	if operation == nil {
		result.opaque = true
		result.valueIncomplete = true
		return true
	}
	declaration := enclosingCallableNode(operation)
	if query.dependenciesOnly {
		if demand := query.operationFieldDemand(operation, key); demand.declaration != nil {
			result.fieldFallbacks = append(result.fieldFallbacks, demand)
			result.valueIncomplete = true
			return true
		}
	}
	if declaration == nil || key == "" || len(value.path) != 0 || declaration == enclosingCallableNode(value.entrySlot) {
		result.opaque = true
	} else {
		demand := sourceFieldDemand{declaration: declaration, operation: operation, slot: value.entrySlot, key: key, use: query.effectUse(), consumer: query.effectOwner}
		if ast.IsPropertyAccessExpression(operation) || ast.IsElementAccessExpression(operation) {
			receiver, selectedKey := accessorReceiver(operation)
			if selectedKey == key {
				if requested, _ := query.fieldDemand(operation, receiver, key); requested.declaration != nil {
					// Preserve the actual demanded input slot across local writer
					// resolution. entrySlot remains the separate unavailable value
					// origin. Only this exact Get's complete actual outcome can match.
					demand = requested
				}
			}
		}
		result.fieldFallbacks = append(result.fieldFallbacks, demand)
	}
	result.valueIncomplete = true
	return true
}

// sourceLocalPatternGetReceiver names a direct Get in a local object pattern.
// It supplies only source effect substitution, never a normal descriptor proof.
func sourceLocalPatternGetReceiver(operation *ast.Node, key string) *ast.Node {
	if operation == nil || !ast.IsBindingElement(operation) || key == "" {
		return nil
	}
	pattern := operation.Parent
	if pattern == nil || !ast.IsObjectBindingPattern(pattern) {
		return nil
	}
	declaration := pattern.Parent
	if declaration == nil || !ast.IsVariableDeclaration(declaration) || declaration.Name() != pattern || declaration.Initializer() == nil {
		return nil
	}
	for index, binding := range pattern.AsBindingPattern().Elements.Nodes {
		if binding == operation {
			selected, finite := bindingSegment(pattern, binding, index)
			if finite && selected == key && binding.AsBindingElement().DotDotDotToken == nil {
				return unwrapSourceCallableReference(declaration.Initializer())
			}
			return nil
		}
	}
	return nil
}
