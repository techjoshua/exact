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
			result.retainCallableEffect(site, target)
			continue
		}
		if q.active[target] {
			result.opaque = true
			q.owner.widenings++
			continue
		}
		func() {
			q.active[target] = true
			defer delete(q.active, target)
			previousCreators := q.creators
			q.creators = selected.scope.creators
			defer func() { q.creators = previousCreators }()
			for _, member := range target.Members() {
				if !q.charge(result, member) {
					break
				}
				if !ast.IsPropertyDeclaration(member) || ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) || member.Initializer() == nil {
					continue
				}
				inputs := &sourceValueInputs{declaration: member, bindings: selected.scope.bindings}
				for _, node := range q.owner.summary(member).nodes {
					if !member.Initializer().Contains(node) {
						continue
					}
					q.executeDemand(node, member, inputs.bindings, result, nil, inputs)
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
					q.retainSelectedConstructionDependencies(site, next, result)
				}
			}
		}()
	}
}
