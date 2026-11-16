package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourceStagedConstructedAssignmentResult relates one original Set argument's
// successful local assignment to its selected New source. It is conditional
// source DATA, not performed assignment, instance identity or native output.
// The existing result receipt owns it; construction and Call work stay required.
type sourceStagedConstructedAssignmentResult struct {
	writer       sourceStagedOperationRequest
	binding      *ast.Node
	construction sourceStandardConstructionContribution
	root         sourceStagedOperationRequest
}

func validConstructedAssignmentResult(relation sourceStagedConstructedAssignmentResult, writer *sourceStagedConstructedMember) bool {
	site := methodStorageAllocation(writer)
	if site == nil || site != relation.construction.site || !relation.construction.selectionComplete || relation.construction.owner != writer.request.consumer || relation.construction.constructor == nil || !standardLibrarySource(ast.GetSourceFileOfNode(relation.construction.constructor)) || !sameOperationRequest(relation.writer, writer.request) || !validStagedMemberParent(relation.root) || relation.root.use != site || relation.root.producer.operation != site || relation.root.producer.declaration != writer.request.consumer || relation.root.producer.selector != (sourceStagedOperationSelector{}) || relation.root.producer.kind != relativeDemandEffects || relation.root.consumer != writer.request.consumer || relation.root.inputs != nil || relation.root.reading != (sourceStagedOperationKey{}) || relation.root.cut != (sourceRelativeCut{operation: site, use: site, reading: site}) {
		return false
	}
	if args := site.AsNewExpression().Arguments; args != nil && len(args.Nodes) != 0 {
		return false
	}
	assignment := writer.actuals[1].endpoint.expression
	if assignment == nil || !ast.IsBinaryExpression(assignment) || !ast.IsIdentifier(assignment.AsBinaryExpression().Left) || relation.binding == nil || !ast.IsVariableDeclaration(relation.binding) || relation.binding.Name() == nil || !ast.IsIdentifier(relation.binding.Name()) || relation.binding.Parent == nil || !ast.IsVariableDeclarationList(relation.binding.Parent) || relation.binding.Parent.Flags&ast.NodeFlagsConst != 0 || enclosingCallableNode(relation.binding) != writer.request.consumer || ast.GetSourceFileOfNode(relation.binding) != ast.GetSourceFileOfNode(site) || relation.binding.Pos() >= assignment.Pos() {
		return false
	}
	return relation.binding.Name().Text() == assignment.AsBinaryExpression().Left.Text()
}

// describeConstructedAssignmentResult uses the original selected construction
// publication and checker-owned local binding. It may describe missing original
// phase factories, but never queries New, observes a Get or activates a Set.
func (work *callableEffectWork) describeConstructedAssignmentResult(facts []callableFacts, writer *sourceStagedConstructedMember, owner *executableBodyOwner) (sourceStagedConstructedAssignmentResult, bool) {
	site := methodStorageAllocation(writer)
	if site == nil || owner == nil || owner.checker == nil || owner.values == nil || owner.values.program == nil || owner.project == nil || work.operationGeneration == nil || owner.values.generation != work.operationGeneration || owner.project.activeGeneration != work.operationGeneration || !work.operationGeneration.active || owner.values.checker != owner.checker {
		return sourceStagedConstructedAssignmentResult{}, false
	}
	construction, selected := owner.standardConstructions[site]
	if !selected || !construction.selectionComplete || construction.site != site || construction.owner != writer.request.consumer || !work.constructedAssignmentProtocolCurrent(writer) {
		return sourceStagedConstructedAssignmentResult{}, false
	}
	caller, known := work.memberNodes[writer.request.consumer]
	publisher := owner.pendingMemberPublishers[writer.request.consumer]
	if !known || publisher == nil || !publisher.live || publisher.fact != &facts[caller] || facts[caller].normalInputs != nil || owner.values.program.GetSourceFile(facts[caller].sourceFile.FileName()) != facts[caller].sourceFile {
		return sourceStagedConstructedAssignmentResult{}, false
	}
	assignment := writer.actuals[1].endpoint.expression
	if assignment == nil || !ast.IsBinaryExpression(assignment) || !ast.IsIdentifier(assignment.AsBinaryExpression().Left) {
		return sourceStagedConstructedAssignmentResult{}, false
	}
	symbol := owner.checker.GetSymbolAtLocation(assignment.AsBinaryExpression().Left)
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || symbol.ValueDeclaration == nil {
		return sourceStagedConstructedAssignmentResult{}, false
	}
	root, registered := work.describeStagedConstructionEffects(facts, caller, site, owner)
	relation := sourceStagedConstructedAssignmentResult{writer: writer.request, binding: symbol.ValueDeclaration, construction: construction, root: root}
	if !registered || !validConstructedAssignmentResult(relation, writer) {
		return sourceStagedConstructedAssignmentResult{}, false
	}
	return relation, true
}

// constructedAssignmentProtocolCurrent consumes the original conditional Get
// source-set observation. It validates the full existing C factory and physical
// parent/cut, without borrowing the optional no-input-invocation method law.
// APPLIED delivery and complete required membership remain graph obligations.
func (work *callableEffectWork) constructedAssignmentProtocolCurrent(source *sourceStagedConstructedMember) bool {
	if !validConstructedMemberSource(source) || !work.freshConstructedProtocolMember(*source) {
		return false
	}
	request := stagedMemberCoverageRequest(source.request, source.construction.site, source.cut)
	recipe := work.operationRecipes[request.producer]
	if !validStagedMemberCoverageRecipe(recipe) {
		return false
	}
	c := recipe.memberSource
	return sameOperationRequest(c.request, request) && sameOperationRequest(c.parent, source.request) && c.generation == work.operationGeneration && c.coverage.origin == source.construction.site && c.coverage.cut == source.cut
}

// Currentness requires original reader/writer Get source observations and the
// existing constructor observation, separately from local result membership.
// Their exact C/phase/Call APPLIED closure stays on the operation graph; no
// optional no-input-invocation law or whole closure seeds this source relation.
func (work *callableEffectWork) constructedAssignmentResultsCurrent(recipe sourceStagedOperationRecipe) bool {
	proof := recipe.constructedDisposition
	if proof == nil || len(proof.resultAssignments) == 0 {
		return true
	}
	registered, exists := work.operationRecipes[recipe.key]
	if !exists || registered.constructedDisposition != proof || !sameConstructedMemberSource(registered.constructed, recipe.constructed) || !operationDeltaPrefix(registered.delta, recipe.delta) || !operationDeltaPrefix(recipe.delta, registered.delta) {
		return false
	}
	if proof.generation != work.operationGeneration || work.operationGeneration == nil || !work.operationGeneration.active {
		return false
	}
	if recipe.constructed == nil || !work.constructedAssignmentProtocolCurrent(recipe.constructed) {
		return false
	}
	for _, relation := range proof.resultAssignments {
		bindingMatched := false
		for _, writer := range proof.resultSources {
			if !validConstructedAssignmentResult(relation, &writer) || !work.constructedAssignmentProtocolCurrent(&writer) {
				continue
			}
			assignment := writer.actuals[1].endpoint.expression
			symbol := work.operationGeneration.checker.GetSymbolAtLocation(assignment.AsBinaryExpression().Left)
			bindingMatched = symbol != nil && symbol.ValueDeclaration == relation.binding
		}
		if !bindingMatched {
			return false
		}
		construction := work.operationRecipes[relation.root.producer]
		if !validStagedConstructionEffectsRecipe(construction) || !sameOperationRequest(construction.constructionEffects.root, relation.root) || !work.passiveConstructionEffectsReady(construction) {
			return false
		}
		observed := work.constructionEffectsObserved[relation.root.producer]
		if observed == nil || observed.constructor != relation.construction.constructor {
			return false
		}
	}
	return true
}
