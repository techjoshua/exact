package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// retainSelectedConstructionDependencies conserves selected source effects beside
// construction uncertainty. The source selector owns target identity. This walk
// grants no instance, installed receiver, normal output or completion receipt.
func (q *sourceValueQuery) retainSelectedConstructionDependencies(site *ast.Node, selected *sourcePreparedInvocation, result *accessorCandidates) {
	if selected == nil {
		return
	}
	q.retainSourceConstructorEffects(site, selected, result)
	for _, target := range selected.declarations {
		if !q.charge(result, site) || !sourceConstructorDefinition(target) {
			continue
		}
		if ast.IsFunctionLike(target) {
			if !sourceFunctionConstructible(target) {
				continue
			}
			result.retainCallableEffect(site, target)
			continue
		}
		if q.active[target] {
			result.opaque = true
			q.owner.widenings++
			continue
		}
		if ast.HasDecorators(target) {
			result.opaque = true
		}
		func() {
			q.active[target] = true
			defer delete(q.active, target)
			previousCreators := q.creators
			scope := q.acquireCallableScope(selected.scope.bindings, result)
			scope.bindings[0] = []sourceValue{{node: site}}
			q.creators = scope.creators
			defer func() { q.creators = previousCreators }()
			for _, member := range target.Members() {
				if !q.charge(result, member) {
					break
				}
				// Instance decorators can replace field initialization or register
				// construction callbacks independently of the authored initializer.
				if !ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) && ast.HasDecorators(member) {
					result.opaque = true
				}
				if !ast.IsPropertyDeclaration(member) || ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) || member.Initializer() == nil {
					continue
				}
				inputs := &sourceValueInputs{declaration: member, bindings: scope.bindings}
				q.withConstructionFieldRead(site, target, inputs, func() {
					for _, node := range q.owner.summary(member).nodes {
						if !member.Initializer().Contains(node) {
							continue
						}
						q.executeDemand(node, member, inputs.bindings, result, nil, inputs)
					}
				})
				if !q.sourceInitializerMayComplete(member.Initializer(), scope.bindings) {
					result.valueIncomplete = true
					break
				}
			}
			// The default derived constructor forwards construction to its base.
			// Explicit constructors retain their own body graph, including super calls.
			if ast.GetFirstConstructorWithBody(target) != nil {
				return
			}
			var class *ast.ClassLikeBase
			if ast.IsClassDeclaration(target) {
				class = &target.AsClassDeclaration().ClassLikeBase
			} else {
				class = &target.AsClassExpression().ClassLikeBase
			}
			if class.HeritageClauses == nil {
				return
			}
			for _, clause := range class.HeritageClauses.Nodes {
				if clause.AsHeritageClause().Token != ast.KindExtendsKeyword {
					continue
				}
				for _, base := range clause.AsHeritageClause().Types.Nodes {
					if !q.charge(result, base) {
						return
					}
					next := q.selectSourceConstructionReference(base.Expression(), site, selected.scope.bindings, result)
					result.opaque = result.opaque || len(next.declarations) == 0 || next.base.valueIncomplete
					q.retainSelectedConstructionDependencies(site, next, result)
				}
			}
		}()
	}
}
