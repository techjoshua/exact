package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// sourcePrivateUse preserves the existing index region, not an actual entry.
type sourcePrivateUse struct{ node, region *ast.Node }

// sourcePrivateUses is generation-owned syntax/checker coverage, not activation.
// One index traversal fills it. A proof never contains a live query/view/frame.
type sourcePrivateUses struct {
	complete, refused bool
	// work counts this producer's AST/metadata steps. Checker calls are opaque
	// units recorded separately. Existing indexWork owns both generation costs.
	work, checkerLookups int
	uses                 map[ast.SymbolId][]sourcePrivateUse
	unresolved           map[string][]*ast.Node
	proofs               map[*ast.Node]bool
}

func (owner *sourceValueOwner) privateUseIndexStep(pop *sourcePrivateUses) {
	pop.work++
	owner.indexWork++
}

// privateRuntimeReference filters syntax before missing-symbol handling.
// Names never supply positive identity. Type erasure comes from the index pass.
func privateRuntimeReference(node *ast.Node, erased bool) bool {
	return !erased && ast.IsIdentifier(node) && (node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) || !ast.IsDeclarationName(node) && !isStaticPropertyName(node))
}

// indexPrivateUse records coverage in the existing source pass, before its
// filters. It returns erasure for the callback's later runtime-reference step.
func (owner *sourceValueOwner) indexPrivateUse(pop *sourcePrivateUses, node *ast.Node) bool {
	owner.privateUseIndexStep(pop)
	if semanticTypeOnlyWithSteps(node, func(*ast.Node) { owner.privateUseIndexStep(pop) }) {
		return true
	}
	if ast.IsExportAssignment(node) {
		pop.refused = true
	}
	if ast.IsExportDeclaration(node) && !node.AsExportDeclaration().IsTypeOnly {
		clause := node.AsExportDeclaration().ExportClause
		if clause == nil || !ast.IsNamedExports(clause.AsNode()) {
			pop.refused = true
		} else {
			for _, element := range clause.AsNamedExports().Elements.Nodes {
				owner.privateUseIndexStep(pop)
				if !element.AsExportSpecifier().IsTypeOnly {
					pop.refused = true
				}
			}
		}
	}
	if !privateUseCovered(node) {
		pop.refused = true
	}
	if ast.IsCallExpression(node) {
		callee := unwrapSourceCallableReferenceWithBudget(node.Expression(), func(*ast.Node) bool { owner.privateUseIndexStep(pop); return true })
		// Conservative lexical hazard rejection supplies no native identity.
		if callee == nil || callee.Kind == ast.KindImportKeyword || ast.IsIdentifier(callee) && (callee.Text() == "eval" || callee.Text() == "Function") {
			pop.refused = true
		}
	}
	return false
}

// indexPrivateReference reuses the region already assigned by the index. It
// never searches ancestors again to rediscover captures during each proof.
func (owner *sourceValueOwner) indexPrivateReference(pop *sourcePrivateUses, node *ast.Node, region *sourceMemberOperationRegion) {
	if !privateRuntimeReference(node, false) {
		return
	}
	owner.privateUseIndexStep(pop)
	pop.checkerLookups++
	owner.indexWork++ // one opaque checker-call unit, not its internal time
	var symbol *ast.Symbol
	if node.Parent != nil && ast.IsShorthandPropertyAssignment(node.Parent) {
		symbol = owner.checker.GetShorthandAssignmentValueSymbol(node.Parent)
	} else {
		symbol = owner.checker.GetSymbolAtLocation(node)
	}
	if symbol == nil {
		// A potentially matching unresolved name can deny proof, never mint it.
		// Unrelated ambient names do not erase a checker's positive local identity.
		pop.unresolved[node.Text()] = append(pop.unresolved[node.Text()], node)
		return
	}
	id := ast.GetSymbolId(symbol)
	pop.uses[id] = append(pop.uses[id], sourcePrivateUse{node: node, region: region.declaration})
}

// Coverage understands only this finite syntax core. It does not discharge any
// ordinary effects. Decorator/heritage/with/dynamic-code and unknown forms refuse.
func privateUseCovered(node *ast.Node) bool {
	if node.Kind <= ast.KindLastToken {
		return node.Kind != ast.KindUnknown && node.Kind != ast.KindWithKeyword
	}
	switch node.Kind {
	case ast.KindSourceFile, ast.KindBlock, ast.KindEmptyStatement, ast.KindExpressionStatement,
		ast.KindClassDeclaration, ast.KindClassExpression, ast.KindConstructor, ast.KindPropertyDeclaration, ast.KindNewExpression,
		ast.KindVariableStatement, ast.KindVariableDeclarationList, ast.KindVariableDeclaration,
		ast.KindFunctionDeclaration, ast.KindFunctionExpression, ast.KindArrowFunction,
		ast.KindParameter, ast.KindReturnStatement, ast.KindThrowStatement, ast.KindIfStatement,
		ast.KindObjectLiteralExpression, ast.KindArrayLiteralExpression, ast.KindPropertyAssignment,
		ast.KindShorthandPropertyAssignment, ast.KindGetAccessor, ast.KindSetAccessor, ast.KindMethodDeclaration,
		ast.KindPropertyAccessExpression, ast.KindElementAccessExpression, ast.KindCallExpression,
		ast.KindParenthesizedExpression, ast.KindAsExpression, ast.KindSatisfiesExpression, ast.KindNonNullExpression,
		ast.KindTypeOfExpression, ast.KindVoidExpression, ast.KindPrefixUnaryExpression, ast.KindPostfixUnaryExpression,
		ast.KindBinaryExpression, ast.KindConditionalExpression, ast.KindAwaitExpression,
		ast.KindExportDeclaration, ast.KindNamedExports, ast.KindExportSpecifier, ast.KindExportAssignment:
		return true
	}
	return false
}

// privateCallableObserved proves only the private declaration's complete
// observation-only use population. All aliases and cross-callable uses refuse.
func (query *sourceValueQuery) privateCallableObserved(body *ast.Node, result *accessorCandidates) bool {
	return body != nil && ast.IsFunctionDeclaration(body) && query.privateDefinitionObserved(body, result)
}

// privateDefinitionObserved shares complete source-use coverage between ordinary
// functions and classes. Observing a definition cannot call or construct it.
// Aliases, exports, captures, heritage and unknown syntax withhold this proof.
func (query *sourceValueQuery) privateDefinitionObserved(body *ast.Node, result *accessorCandidates) bool {
	if !query.charge(result, body) || body == nil || body.Name() == nil || !ast.IsClassDeclaration(body) && (!ast.IsFunctionDeclaration(body) || body.Body() == nil) {
		return false
	}
	source := ast.GetSourceFileOfNode(body)
	if source == nil || source.IsDeclarationFile || body.Parent != source.AsNode() || !ast.IsExternalModule(source) || ast.GetCombinedModifierFlags(body)&(ast.ModifierFlagsAmbient|ast.ModifierFlagsExport|ast.ModifierFlagsDefault) != 0 {
		return false
	}
	index := query.owner.index(source)
	pop := index.privateUses
	if index.incomplete || pop == nil || !pop.complete || pop.refused {
		return false
	}
	if len(pop.unresolved[""]) != 0 || len(pop.unresolved[body.Name().Text()]) != 0 {
		return false
	}
	if proof, ok := pop.proofs[body]; ok {
		return proof
	}
	// Query-local proof lookup is charged separately from generation indexing.
	if !query.charge(result, body.Name()) {
		return false
	}
	symbol := query.owner.checker.GetSymbolAtLocation(body.Name())
	if symbol == nil || symbol.Flags&ast.SymbolFlagsAlias != 0 || len(symbol.Declarations) != 1 || symbol.Declarations[0] != body || symbol.ValueDeclaration != body || len(index.bindings[ast.GetSymbolId(symbol)]) != 0 {
		return false
	}
	if ast.IsClassDeclaration(body) && !query.privateClassReceiverUnexposed(body, result) {
		pop.proofs[body] = false
		return false
	}
	// Coverage work was recorded once by its generation index owner. Query
	// fuel owns only this candidate's proof and later demand-local scans.
	for _, use := range pop.uses[ast.GetSymbolId(symbol)] {
		if !query.charge(result, use.node) || !query.privateObservationUse(use, source, result) {
			{
				pop.proofs[body] = false
			}
			return false
		}
	}
	pop.proofs[body] = true
	return true
}

// privateClassReceiverUnexposed accounts for the class's lexical receiver in
// static initialization, including captured arrows. Such code can construct or
// expose the class without a reference to its binding. Reuse indexed receivers
// and the shared receiver-scope rule, without entering any initializer/body.
func (query *sourceValueQuery) privateClassReceiverUnexposed(definition *ast.Node, result *accessorCandidates) bool {
	index := query.owner.index(ast.GetSourceFileOfNode(definition))
	for _, member := range definition.AsClassDeclaration().Members.Nodes {
		if !query.charge(result, member) {
			return false
		}
		if !ast.IsPropertyDeclaration(member) || !ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) || member.Initializer() == nil {
			continue
		}
		for _, region := range index.operationRegions {
			for _, receiver := range region.receivers {
				if !query.charge(result, receiver) || helperOwnsReceiver(receiver, member) {
					return false
				}
			}
		}
	}
	return true
}

func (query *sourceValueQuery) privateObservationUse(use sourcePrivateUse, source *ast.SourceFile, result *accessorCandidates) bool {
	if use.region != nil {
		return false
	}
	current := use.node
	for current.Parent != nil {
		if !query.charge(result, current) {
			return false
		}
		parent := current.Parent
		switch {
		case ast.IsParenthesizedExpression(parent) || ast.IsAsExpression(parent) || ast.IsSatisfiesExpression(parent) || ast.IsNonNullExpression(parent):
			if parent.Expression() != current {
				return false
			}
		case ast.IsTypeOfExpression(parent) || ast.IsVoidExpression(parent):
			if parent.Expression() != current {
				return false
			}
		case ast.IsPrefixUnaryExpression(parent):
			if parent.AsPrefixUnaryExpression().Operator != ast.KindExclamationToken || parent.AsPrefixUnaryExpression().Operand != current {
				return false
			}
		case ast.IsBinaryExpression(parent):
			binary := parent.AsBinaryExpression()
			if binary.OperatorToken.Kind != ast.KindEqualsEqualsEqualsToken && binary.OperatorToken.Kind != ast.KindExclamationEqualsEqualsToken {
				return false
			}
			other := binary.Left
			if other == current {
				other = binary.Right
			}
			other = unwrapSourceCallableReferenceWithBudget(other, func(n *ast.Node) bool { return query.charge(result, n) })
			if other == nil || !(ast.IsIdentifier(other) || ast.IsStringLiteral(other) || ast.IsNumericLiteral(other) || other.Kind == ast.KindNullKeyword || other.Kind == ast.KindTrueKeyword || other.Kind == ast.KindFalseKeyword) {
				return false
			}
		case ast.IsExpressionStatement(parent):
			return parent.Parent == source.AsNode() && parent.Expression() == current
		default:
			return false
		}
		current = parent
	}
	return false
}

// sourceDeferredRead is synchronous demand qualification. It is never stored in
// the source classification or an output/capture/cache. Projection may replace
// value inputs, while the admitted operation relation remains independent.
type sourceDeferredRead struct {
	view      *sourcePropertyReferenceView
	operation sourceOperationContext
	frame     *sourceValueInputs
	get       *sourceGetInputs
}

func (query *sourceValueQuery) beginDeferredRead(get *sourceGetInputs) func() {
	prior := query.deferredRead
	query.deferredRead = nil
	if get != nil && get.operation != nil {
		if prior != nil && prior.get == get {
			query.deferredRead = prior
		} else if op := query.operation; op != nil && op.inputs != nil && query.inputs == op.inputs && op.node == get.operation && op.owner == op.inputs.declaration {
			if view := query.propertyView(); view != nil && view.frame == op.inputs && view.root == op.owner {
				query.deferredRead = &sourceDeferredRead{view: view, operation: *op, frame: op.inputs, get: get}
			}
		}
	}
	return func() { query.deferredRead = prior }
}

// deferredCandidateExcluded removes one deferred obligation, not contributions,
// previous opacity, value uncertainty, prototype state or runtime completion.
func (query *sourceValueQuery) deferredCandidateExcluded(node *ast.Node, result *accessorCandidates) (excluded bool) {
	if query.privateConstructionCandidateExcluded(node, result) {
		return true
	}
	d := query.deferredRead
	if d == nil || node == nil || !query.charge(result, node) {
		return false
	}
	v := d.view
	if v == nil || v.state != sourcePropertyComplete || v.incomplete || v.frame != d.frame || v.root != d.operation.owner || v.frame == nil || v.frame.properties != v || v.frame.declaration != v.root || d.operation.inputs != d.frame || d.operation.node != d.get.operation || query.effectOwner != v.root || v.owner != query.owner || v.program != query.owner.program || v.checker != query.owner.checker || v.generation != query.owner.generation || v.executable != query.executable {
		return false
	}
	source := ast.GetSourceFileOfNode(node)
	selected := false
	for _, s := range v.sources {
		if !query.charge(result, node) {
			return false
		}
		selected = selected || s == source
	}
	if !selected {
		return false
	}
	// Only a region directly owned by the private top-level declaration is in the
	// first core. Defaults/class/nested creation regions retain their MAY routes.
	var region *ast.Node
	for child, parent := node, node.Parent; parent != nil; child, parent = parent, parent.Parent {
		if !query.charge(result, parent) {
			return false
		}
		if sourceMemberOperationOwnsChild(parent, child) {
			region = parent
			break
		}
	}
	if region == nil || region == v.root || query.creators[region].invocation != nil || query.inputs != nil && query.inputs.declaration == region || !query.privateCallableObserved(region, result) {
		return false
	}
	for _, op := range v.operations {
		if !query.charge(result, node) {
			return false
		}
		if op.operation == node {
			return false
		}
	}
	for _, entry := range v.entries {
		if !query.charge(result, node) {
			return false
		}
		if entry.operation == node && (entry.normalOnly || entry.resolved) {
			return false
		}
	}
	return true
}

// privateConstructionCandidateExcluded removes an indexed constructor/field MAY
// obligation only when the existing checker-bound source-use population proves
// its class cannot be entered or exposed. This is source phase eligibility, not
// an absent normal frame, a property absence proof or an executed operation.
// The shared deferred-candidate consumer also applies it to descriptor inventory.
// It grants no Normal/NoWrites authority and clears no independent uncertainty.
func (query *sourceValueQuery) privateConstructionCandidateExcluded(node *ast.Node, result *accessorCandidates) bool {
	if node == nil || !query.charge(result, node) {
		return false
	}
	source := ast.GetSourceFileOfNode(node)
	if source == nil || query.owner.program.GetSourceFile(source.FileName()) != source {
		return false
	}
	index := query.owner.index(source)
	entry := index.normalOccurrences[node]
	if index.incomplete || entry == nil || entry.node != node || entry.region == nil {
		return false
	}
	region := entry.region
	if !ast.IsConstructorDeclaration(region) && (!ast.IsPropertyDeclaration(region) || ast.HasSyntacticModifier(region, ast.ModifierFlagsStatic)) {
		return false
	}
	definition := region.Parent
	if definition == nil || !ast.IsClassDeclaration(definition) || query.creators[region].invocation != nil || query.inputs != nil && query.inputs.declaration == region {
		return false
	}
	return query.privateDefinitionObserved(definition, result)
}
