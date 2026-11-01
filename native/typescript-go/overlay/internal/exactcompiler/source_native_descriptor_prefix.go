package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceCompletedDataGet is the scalar effect component of one actual Get. Its
// source construction owns it, without retaining a frame, value or replay path.
type sourceCompletedDataGet struct {
	view              *sourceNormalViewIdentity
	entry             *sourceNormalOccurrence
	population        *sourceNormalPopulation
	root, effectOwner *ast.Node
	operation         *sourceWriteOperationIdentity
}

func (query *sourceValueQuery) retainCompletedDataGet(slot *sourceNormalOperation, node *ast.Node, result *accessorCandidates) {
	if slot == nil || slot.state != sourceOperationConsumed || slot.writeEffect != sourceWriteNoWrites || slot.entry == nil || slot.entry.region != nil || !slot.entry.once {
		return
	}
	view, source := slot.prefixView, slot.prefixSource
	if view == nil || source == nil || query.propertyView() != view || source.domains[slot.prefixRoot] != slot.population || slot.writeIdentity == nil {
		return
	}
	if !query.charge(result, node) {
		slot.writeEffect = sourceWriteTop
		view.incomplete = true
		return
	}
	source.dataGets = append(source.dataGets, sourceCompletedDataGet{view: view.normalIdentity, entry: slot.entry, population: slot.population, root: slot.prefixRoot, effectOwner: slot.entry.statement, operation: slot.writeIdentity})
}

func (query *sourceValueQuery) completedDataGet(source *sourceNormalSourceIdentity, entry *sourceNormalOccurrence, result *accessorCandidates) bool {
	view := query.propertyView()
	if view == nil || source == nil || entry == nil {
		return false
	}
	var operation *sourceWriteOperationIdentity
	for _, receipt := range source.dataGets {
		if !query.charge(result, entry.node) {
			return false
		}
		if receipt.entry != entry {
			continue
		}
		if receipt.view != view.normalIdentity || receipt.population == nil || source.domains[receipt.root] != receipt.population || receipt.population.entries[entry.node] != entry || receipt.effectOwner != entry.statement || receipt.operation == nil {
			return false
		}
		if operation != nil && operation != receipt.operation {
			return false
		}
		operation = receipt.operation
	}
	return operation != nil
}

// normalDescriptorPrefix consumes preconstructed events only. A statement view
// never executes predecessors to recover their footprints. Creation/local-read
// laws are distinct from initialized callee and full-call NoWrites producers.
func (query *sourceValueQuery) normalDescriptorPrefix(source *sourceNormalSourceIdentity, at *ast.Node, result *accessorCandidates) bool {
	if source == nil || source.population == nil || source.cyclic {
		return false
	}
	current := ast.GetSourceFileOfNode(at) == source.source
	var stop *sourceNormalOccurrence
	if current {
		stop = source.population.entries[at]
		if stop == nil || stop.node != at || stop.region != nil || !stop.once || ast.IsClassDeclaration(stop.statement) || ast.IsClassExpression(stop.statement) {
			return false
		}
	}
	for _, event := range source.plan.normal {
		if !query.charge(result, event.node) {
			return false
		}
		entry := source.population.entries[event.node]
		if entry == nil {
			return false
		}
		if current && entry == stop && event.fold != nil && event.fold.kind == sourceNormalEnter {
			return true
		}
		if entry.region != nil || event.fold == nil || event.fold.kind == sourceNormalEnter {
			continue
		}
		fold := event.fold
		if fold.kind == sourceNormalResidual {
			return false
		}
		if fold.kind == sourceNormalErased || fold.kind == sourceNormalCreation {
			continue
		}
		node := event.node
		switch {
		case ast.IsIdentifier(node) && !entry.structural:
			parent := entry.parent
			// This is one operand of the actual Get below. Its own data law must
			// supply the implicit entry-read component, never another global read.
			if parent != nil && (ast.IsPropertyAccessExpression(parent.node) || ast.IsElementAccessExpression(parent.node)) && parent.node.Expression() == node {
				continue
			}
			// Match consumeNormalFold's checker-owned undefined read law. This
			// grants no value or effect authority to a shadow or ambient lookalike.
			if !query.owner.checker.IsUndefinedSymbol(query.owner.checker.GetSymbolAtLocation(node)) && !query.localOperationReference(node, source.source, result) {
				return false
			}
		case ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node):
			read, _ := accessorEvaluationMode(node)
			if !read {
				if ast.IsElementAccessExpression(node) {
					key := node.AsElementAccessExpression().ArgumentExpression
					if key == nil || !ast.IsStringLiteral(key) && !ast.IsNumericLiteral(key) {
						return false
					}
				}
				continue
			}
			if !query.completedDataGet(source, entry, result) {
				return false
			}
		case ast.IsCallExpression(node):
			if !query.completedInvocationExcluded(node, result) {
				return false
			}
		case ast.IsAwaitExpression(node):
			return false
		}
	}
	return !current
}
