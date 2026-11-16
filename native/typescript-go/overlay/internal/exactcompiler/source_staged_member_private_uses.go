package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// excludeStagedPrivateAllocationWriters consumes the original allocation's
// complete use relation at the live member finish. Candidate descriptions stay
// registered. Only unrelated writer Effects leave this source-set demand.
func (work *callableEffectWork) excludeStagedPrivateAllocationWriters(facts []callableFacts, q *sourceValueQuery) {
	excluded := work.stagedPrivateAllocationWriterExclusions(facts, q)
	if len(excluded) == 0 {
		return
	}
	c := q.stagedMember.coverage
	// An earlier source prefix may already require this candidate. Positive
	// relevance can avoid input recovery, but cannot retract a sealed edge.
	// Its original semantic Set producer still accounts for that requirement.
	sealed := make(map[sourceStagedOperationKey]bool)
	prior := work.operationRecipes[c.request.producer]
	if source := prior.memberSource; source != nil && source.coverage != nil && source.generation == c.generation && source.coverage.cut == c.cut && sameOperationRequest(source.parent, q.stagedMember.request) && validStagedMemberCoverageRecipe(prior) {
		for _, request := range prior.delta.required {
			sealed[request.producer] = true
		}
	}
	required := make([]sourceStagedOperationRequest, 0, len(c.required))
	for _, request := range c.required {
		if !excluded[request.producer] || sealed[request.producer] {
			required = append(required, request)
		}
	}
	c.required = required
}

// stagedPrivateAllocationWriterExclusions consumes the same original use proof
// before input recovery and at final source publication. The returned keys name
// only this live observation's positively excluded writers, never missing work.
func (work *callableEffectWork) stagedPrivateAllocationWriterExclusions(facts []callableFacts, q *sourceValueQuery) map[sourceStagedOperationKey]bool {
	if q == nil {
		return nil
	}
	b := q.stagedMember
	if b == nil || b.coverage == nil || !q.liveStagedMemberSource(b, b.get, b.read) || q.executable == nil || b.generation != work.operationGeneration {
		return nil
	}
	c := b.coverage
	if c.origin == nil || c.cut != q.relativeInputCut(b.get.operation) || c.generation != b.generation || !sameOperationRequest(c.request, stagedMemberCoverageRequest(b.request, c.origin, c.cut)) {
		return nil
	}
	construction, published := q.executable.standardConstructions[c.origin]
	if !published || !stagedPrivateAllocationBinding(construction, q.executable) {
		return nil
	}
	// Only current source children retained on this C can pay an alias use.
	// RHS readiness is independent, but its original observation must exist.
	writerParents := []sourceStagedOperationRequest{}
	for _, required := range c.required {
		source := work.operationRecipes[required.producer].memberSource
		if source == nil || !source.writeEffects || source.generation != b.generation || source.candidate.origin != c.origin || source.candidate.cut != c.cut {
			continue
		}
		raw := stagedMemberCandidateRequest(source.parent, source.candidate)
		for _, child := range work.operationRecipes[raw.producer].writerRequired {
			packet := work.writerSourceInputs[child.producer]
			if packet != nil && packet.generation == b.generation {
				writerParents = append(writerParents, raw)
				break
			}
		}
	}
	aliases, covered := stagedConstructionUseAliases(construction, q.executable, func(node *ast.Node) bool {
		if node.Parent == b.get.operation && (ast.IsPropertyAccessExpression(node.Parent) || ast.IsElementAccessExpression(node.Parent)) && node.Parent.Expression() == node && b.get.receiver.node == construction.site && q.stagedStandardAssignmentConstruction(construction.site) {
			return true
		}
		for _, parent := range writerParents {
			if work.stagedWriterUseCovered(parent, construction.site, node, q.executable, make(map[ast.SymbolId]bool)) {
				return true
			}
		}
		return false
	})
	if !covered {
		return nil
	}
	excluded := make(map[sourceStagedOperationKey]bool)
	for _, request := range c.required {
		source := work.operationRecipes[request.producer].memberSource
		if source == nil || !source.writeEffects || source.generation != b.generation || source.candidate.origin != c.origin || source.candidate.cut != c.cut || !sameOperationRequest(source.parent, b.request) || !sameOperationRequest(source.request, request) || !plainStagedAssignment(source.candidate.operation) {
			continue
		}
		left := source.candidate.operation.AsBinaryExpression().Left
		if !ast.IsPropertyAccessExpression(left) || !ast.IsIdentifier(left.Expression()) {
			continue
		}
		symbol := q.owner.checker.GetSymbolAtLocation(left.Expression())
		if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || aliases[ast.GetSymbolId(symbol)] || q.owner.bindingWritten(symbol) {
			continue
		}
		declaration := symbol.ValueDeclaration
		if declaration == nil || !ast.IsVariableDeclaration(declaration) {
			continue
		}
		site := declaration.Initializer()
		if _, published := q.executable.standardConstructions[site]; !published {
			work.prepareStagedConstructionSource(facts, site, q.executable)
		}
		other, found := q.executable.standardConstructions[site]
		if found && other.site != construction.site && stagedPrivateAllocationBinding(other, q.executable) && declaration == other.site.Parent {
			excluded[request.producer] = true
		}
	}
	return excluded
}

// consumeStagedPrivateWriterExclusion authenticates the exact immutable writer
// description before the original owner asks for its invocation inputs.
func (work *callableEffectWork) consumeStagedPrivateWriterExclusion(facts []callableFacts, q *sourceValueQuery, write, origin *ast.Node) bool {
	if q == nil || q.stagedMember == nil || q.stagedMember.coverage == nil || q.stagedMember.coverage.origin != origin {
		return false
	}
	excluded := work.stagedPrivateAllocationWriterExclusions(facts, q)
	for _, required := range q.stagedMember.required {
		source := work.operationRecipes[required.producer].memberSource
		if source != nil && source.writeEffects && source.candidate.operation == write && source.candidate.origin == origin && excluded[required.producer] {
			return true
		}
	}
	return false
}

// An independently published genuine standard New contributes fresh allocation
// semantics on success. This does not acquire a value or select a runtime alias.
func stagedPrivateAllocationBinding(source sourceStandardConstructionContribution, owner *executableBodyOwner) bool {
	site := source.site
	if owner == nil || owner.values == nil || site == nil || !ast.IsNewExpression(site) || !source.selectionComplete || source.constructor == nil || source.owner != enclosingCallableNode(site) || source.owner == nil || site.AsNewExpression().Arguments != nil && len(site.AsNewExpression().Arguments.Nodes) != 0 {
		return false
	}
	file := ast.GetSourceFileOfNode(site)
	if owner.values.program.GetSourceFile(file.FileName()) != file {
		return false
	}
	declaration := site.Parent
	if declaration == nil || !ast.IsVariableDeclaration(declaration) || declaration.Initializer() != site || declaration.Name() == nil || !ast.IsIdentifier(declaration.Name()) || declaration.Parent == nil || !ast.IsVariableDeclarationList(declaration.Parent) || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
		return false
	}
	symbol := owner.checker.GetSymbolAtLocation(declaration.Name())
	return symbol != nil && symbol.ValueDeclaration == declaration && !owner.values.bindingWritten(symbol)
}
