package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// retainSelectedConstructionDependencies conserves selected source effects beside
// construction uncertainty. The source selector owns target identity. This walk
// grants no instance, installed receiver, normal output or completion receipt.
func (q *sourceValueQuery) retainSelectedConstructionDependencies(site *ast.Node, selected *sourcePreparedInvocation, result *accessorCandidates) {
	if selected == nil {
		return
	}
	if q.dependenciesOnly && ast.IsCallExpression(site) {
		// The implicit construction observes live captures at the native Call.
		// A previous source New of the same class owns a different read cut.
		previous := q.initializing
		q.initializing = site
		defer func() { q.initializing = previous }()
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
			q.retainConstructorInputDependencies(site, target, selected, selected.scope.bindings, result)
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
			scope := q.copyCallableScope(selected.scope, result)
			// A species-producing Call has no authored allocation expression or
			// source actuals for its implicit constructor.
			scope.bindings[0] = []sourceValue{{}}
			if ast.IsNewExpression(site) {
				scope.bindings[0][0].node = site
			}
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
			if constructor := ast.GetFirstConstructorWithBody(target); constructor != nil {
				q.retainConstructorInputDependencies(site, constructor, selected, selected.scope.bindings, result)
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

// retainConstructorInputDependencies instantiates the existing source demand
// plan with the original New's ordered actuals. It grants neither an instance
// nor normal completion/output, and does not activate merely stored callbacks.
func (q *sourceValueQuery) retainConstructorInputDependencies(site, constructor *ast.Node, selected *sourcePreparedInvocation, bindings sourceValueBindings, result *accessorCandidates) {
	if q.dependenciesOnly && site != nil && ast.IsCallExpression(site) {
		// Native construction supplies its own inputs. Keep only the lexical
		// capture. No source parameter or receiver came from the outer method call.
		scope := q.copyCallableScope(selected.scope, result)
		for _, parameter := range constructor.Parameters() {
			for _, name := range bindingIdentifiers(parameter.Name()) {
				if symbol := q.owner.checker.GetSymbolAtLocation(name); symbol != nil {
					delete(scope.bindings, ast.GetSymbolId(symbol))
				}
			}
		}
		delete(scope.creators, constructor)
		scope.bindings[0] = []sourceValue{{}}
		previous := q.creators
		q.creators = scope.creators
		defer func() { q.creators = previous }()
		q.executeInputs(constructor, scope.bindings, result, nil, &sourceValueInputs{declaration: constructor, bindings: scope.bindings})
		return
	}
	if !q.dependenciesOnly || site == nil || !ast.IsNewExpression(site) {
		return
	}
	owner := enclosingCallableNode(constructor)
	if owner != nil && owner != q.effectOwner && selected.scope.creators[owner].invocation == nil {
		result.opaque = true
		return
	}
	inputs := q.bindInvocationInputsAtScope(constructor, site, bindings, &selected.scope, result, false)
	inputs.bindings[0] = []sourceValue{{node: site}}
	q.executeInputs(constructor, inputs.bindings, result, nil, inputs)
}
