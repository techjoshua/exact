package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// constructedWriterUseCovered extends the complete private-reference owner
// with relationships delivered by the original writer/input owner. Index
// membership alone never covers an argument escape or a property mutation.
// Every use of the corresponding formal must itself be covered, including
// nested source writer Calls. The finite declaration-slot set breaks backedges.
func (work *callableEffectWork) constructedWriterUseCovered(source *sourceStagedConstructedMember, node *ast.Node, owner *executableBodyOwner, seen map[ast.SymbolId]bool) bool {
	return work.stagedWriterUseCovered(constructedMemberRequest(source, "own-writers"), source.construction.site, node, owner, seen)
}

// stagedWriterUseCovered follows only delivered original writer/input source
// relationships. Source-use closure remains distinct from required RHS closure.
// The caller supplies its independently authenticated receiver/protocol parent.
func (work *callableEffectWork) stagedWriterUseCovered(writerRequest sourceStagedOperationRequest, origin, node *ast.Node, owner *executableBodyOwner, seen map[ast.SymbolId]bool) bool {
	if node == nil || owner == nil || owner.values == nil {
		return false
	}
	parent := node.Parent
	if parent == nil {
		return false
	}
	recipe := work.operationRecipes[writerRequest.producer]
	for _, required := range recipe.writerRequired {
		child := work.operationRecipes[required.producer].writer
		if child == nil || child.callable || child.generation != owner.values.generation || !sameOperationRequest(child.parent, writerRequest) {
			continue
		}
		for _, read := range child.reads {
			if read.origin != origin || read.incomplete {
				continue
			}
			left := read.write.AsBinaryExpression().Left
			if (ast.IsPropertyAccessExpression(parent) || ast.IsElementAccessExpression(parent)) && parent.Expression() == node && parent == left {
				return true
			}
			if !ast.IsCallExpression(parent) || read.call != parent {
				continue
			}
			for _, actual := range read.invocation.actuals {
				if actual.expression != node || actual.spread {
					continue
				}
				position := 0
				for _, parameter := range read.region.Parameters() {
					if ast.IsIdentifier(parameter.Name()) && parameter.Name().Text() == "this" {
						continue
					}
					if position == actual.ordinal && ast.IsIdentifier(parameter.Name()) {
						symbol := owner.checker.GetSymbolAtLocation(parameter.Name())
						if symbol == nil {
							return false
						}
						id := ast.GetSymbolId(symbol)
						if seen[id] {
							return true
						}
						seen[id] = true
						index := owner.values.index(ast.GetSourceFileOfNode(parameter))
						if index.incomplete || index.normalDynamicScope || index.privateUses == nil || !index.privateUses.complete {
							return false
						}
						for _, use := range index.privateUses.uses[id] {
							if !work.stagedWriterUseCovered(writerRequest, origin, use.node, owner, seen) {
								return false
							}
						}
						return true
					}
					position++
				}
			}
		}
	}
	return false
}
