package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

type moduleDefinitionSymbolVisit struct {
	id      ast.SymbolId
	execute bool
}
type moduleDefinitionNodeVisit struct {
	node    *ast.Node
	execute bool
}

// moduleDefinitionAnalysis separates making a value from executing a callable or constructor.
// Both modes retain captured module bindings. Shared dependency graphs and recursive calls are
// visited once per mode, so a deferred definition cannot mask a later eager invocation.
type moduleDefinitionAnalysis struct {
	placementOnly            bool
	descriptorModuleInput    func(sourceStagedModuleInput)
	initializerActiveSymbols map[moduleDefinitionSymbolVisit]bool
	initializerActiveNodes   map[moduleDefinitionNodeVisit]bool
	initializerMerged        map[string]bool
	initializerDepth         int
	initializerSeenRevision  uint64
	initializerTransient     uint64

	ownedComponentEvidence []*ownedGetContribution
	ownedGetEvidence       []*ownedGetPopulation

	checker         *checker.Checker
	owner           *executableBodyOwner
	flow            *sourceValueQuery
	opaque          bool
	reading         *ast.Node
	inputs          *sourceValueInputs
	symbols         map[moduleDefinitionSymbolVisit]bool
	nodes           map[moduleDefinitionNodeVisit]bool
	browser, server bool
}

func (analysis *moduleDefinitionAnalysis) symbol(symbol *ast.Symbol, execute bool) {
	analysis.beginInitializerPolicyPass()
	defer analysis.endInitializerPolicyPass()
	if symbol == nil {
		return
	}
	if analysis.owner != nil {
		selected, owned := analysis.owner.symbol(symbol, make(map[ast.SymbolId]bool))
		if owned {
			if selected == nil {
				analysis.opaque = true
				return
			}
			symbol = selected
		}
	}
	key := moduleDefinitionSymbolVisit{ast.GetSymbolId(symbol), execute}
	if analysis.symbols[key] {
		return
	}
	if analysis.initializerActiveSymbols[key] {
		return
	}
	analysis.initializerActiveSymbols[key] = true
	transient := analysis.initializerTransient
	defer func() {
		delete(analysis.initializerActiveSymbols, key)
		if analysis.initializerTransient == transient {
			analysis.symbols[key] = true
		}
	}()
	for _, declaration := range symbol.Declarations {
		for ast.IsBindingElement(declaration) || ast.IsObjectBindingPattern(declaration) || ast.IsArrayBindingPattern(declaration) {
			declaration = declaration.Parent
		}
		owner := ast.GetSourceFileOfNode(declaration)
		if owner == nil || owner.IsDeclarationFile {
			continue
		}
		if ast.IsVariableDeclaration(declaration) && enclosingCallableNode(declaration) != nil {
			continue
		}
		var work *ast.Node
		switch {
		case ast.IsVariableDeclaration(declaration):
			// The binding operation itself may read accessors through destructuring.
			work = declaration
		case ast.IsFunctionLike(declaration), ast.IsClassDeclaration(declaration), ast.IsClassExpression(declaration):
			work = declaration
		case ast.IsExportAssignment(declaration):
			work = declaration.AsExportAssignment().Expression
		}
		if analysis.interceptInitializer(declaration, false) {
			continue
		}
		if work == nil {
			continue
		}
		if !execute && ast.IsFunctionLike(work) && !looksLikeTaskPolicy(work, owner) && len(componentSignals(componentCandidate{name: ast.SymbolName(symbol), node: work}, owner)) != 0 {
			continue
		}
		analysis.expression(work, execute)
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		analysis.symbol(analysis.checker.GetImmediateAliasedSymbol(symbol), execute)
	}
}

func (analysis *moduleDefinitionAnalysis) expression(work *ast.Node, execute bool) {
	analysis.beginInitializerPolicyPass()
	defer analysis.endInitializerPolicyPass()
	if work == nil {
		return
	}
	previousReading := analysis.reading
	if analysis.reading == nil || ast.IsVariableDeclaration(work) && enclosingCallableNode(work) == nil {
		analysis.reading = work
	}
	defer func() { analysis.reading = previousReading }()
	owner := ast.GetSourceFileOfNode(work)
	if owner == nil || owner.IsDeclarationFile {
		return
	}
	if analysis.interceptInitializer(work, false) {
		return
	}
	key := moduleDefinitionNodeVisit{work, execute}
	if analysis.nodes[key] {
		return
	}
	if analysis.initializerActiveNodes[key] {
		return
	}
	analysis.initializerActiveNodes[key] = true
	transient := analysis.initializerTransient
	defer func() {
		delete(analysis.initializerActiveNodes, key)
		if analysis.initializerTransient == transient {
			analysis.nodes[key] = true
		}
	}()
	if execute && ast.IsFunctionLike(work) {
		for _, parameter := range work.Parameters() {
			analysis.expression(parameter.AsParameterDeclaration().Initializer, false)
		}
		analysis.expression(work.Body(), false)
		return
	}
	if execute && (ast.IsClassDeclaration(work) || ast.IsClassExpression(work)) {
		var class *ast.ClassLikeBase
		if ast.IsClassDeclaration(work) {
			class = &work.AsClassDeclaration().ClassLikeBase
		} else {
			class = &work.AsClassExpression().ClassLikeBase
		}
		if class.HeritageClauses != nil {
			for _, clause := range class.HeritageClauses.Nodes {
				if clause.AsHeritageClause().Token != ast.KindExtendsKeyword {
					continue
				}
				for _, base := range clause.AsHeritageClause().Types.Nodes {
					expression := base.AsExpressionWithTypeArguments().Expression
					analysis.symbol(analysis.checker.GetSymbolAtLocation(expression), true)
					analysis.symbol(analysis.checker.GetTypeAtLocation(expression).Symbol(), true)
				}
			}
		}
		for _, member := range class.Members.Nodes {
			if ast.IsConstructorDeclaration(member) {
				analysis.expression(member, true)
			}
			if ast.IsPropertyDeclaration(member) && !ast.HasSyntacticModifier(member, ast.ModifierFlagsStatic) {
				analysis.expression(member.AsPropertyDeclaration().Initializer, false)
			}
		}
		return
	}
	// Initializers inherit guards from their enclosing execution scope. Stopping at the
	// initializer itself would hide a preceding terminal guard from definition effects.
	guardBoundary := enclosingCallableNode(work)
	if guardBoundary == nil {
		guardBoundary = owner.AsNode()
	}
	walkNode(work, func(node *ast.Node) bool {
		// Further effects cannot refine an already unknown placement. Other consumers need the full walk.
		if analysis.placementOnly && (analysis.opaque || analysis.browser && analysis.server) {
			return false
		}
		if analysis.interceptInitializer(node, true) {
			return false
		}
		if node.Parent != nil && ast.IsPartOfTypeNode(node) {
			return false
		}
		// The input owner already selected and evaluated defaults for this invocation.
		// Skip their syntax here, including nested binding defaults that were bypassed.
		if analysis.inputs != nil && node != work {
			if _, planned := analysis.inputs.defaults[node]; planned {
				return false
			}
		}
		deferred := moduleDefinitionNodeIsDeferred(node, work)
		if !deferred && analysis.flow != nil {
			// Optional continuations evaluate their receiver but skip keys and arguments
			// when its acquired source value is nullish. Use the shared occurrence proof.
			if node.Parent != nil && ast.IsOptionalChain(node.Parent) {
				if possible, _ := analysis.flow.expressionBranch(node, node.Parent, nil); !possible {
					return false
				}
			}
			if ast.IsStatement(node) {
				possible, _ := analysis.flow.reachable(node, nil)
				if !possible {
					return false
				}
			}
			if ast.IsBinaryExpression(node) {
				binary := node.AsBinaryExpression()
				op := binary.OperatorToken.Kind
				if op == ast.KindBarBarToken || op == ast.KindAmpersandAmpersandToken || op == ast.KindQuestionQuestionToken {
					known, truthy, nullish := analysis.flow.literalDecision(binary.Left, nil)
					if known {
						analysis.expression(binary.Left, false)
						if sourceLogicalTakesRight(op, truthy, nullish) {
							analysis.expression(binary.Right, false)
						}
						return false
					}
				}
			}
			if ast.IsConditionalExpression(node) {
				branch := node.AsConditionalExpression()
				known, truthy, _ := analysis.flow.literalDecision(branch.Condition, nil)
				if known {
					analysis.expression(branch.Condition, false)
					if truthy {
						analysis.expression(branch.WhenTrue, false)
					} else {
						analysis.expression(branch.WhenFalse, false)
					}
					return false
				}
			}
		}
		boundInvocation := false
		if !deferred {
			analysis.evaluatedAccessors(node)
			if ast.IsCallExpression(node) {
				candidates := sourceInvocationDependenciesObserved(node, analysis.reading, analysis.checker, analysis.owner, nil, analysis.inputs, sourceEffectsObserver{moduleInput: analysis.descriptorModuleInput})
				boundInvocation = candidates.invocationOwned
				for _, inputs := range candidates.inputs {
					boundInvocation = boundInvocation || inputs.invocation == node
				}
				analysis.accessors(candidates)
			}
		}
		if !deferred && !boundInvocation && (ast.IsCallExpression(node) || ast.IsNewExpression(node)) {
			if target, owned := analysis.owner.definition(policyInvocationTarget(node)); owned {
				if target == nil {
					analysis.opaque = true
				} else {
					analysis.expression(target, true)
				}
				// Arguments still execute. The authored signature cannot supply a second body.
			} else {
				if ast.IsNewExpression(node) {
					callee := node.AsNewExpression().Expression
					analysis.symbol(analysis.checker.GetSymbolAtLocation(callee), true)
					analysis.symbol(analysis.checker.GetTypeAtLocation(callee).Symbol(), true)
					if ast.IsClassExpression(callee) {
						analysis.expression(callee, true)
					}
				}
				if ast.IsCallExpression(node) {
					analysis.symbol(callTargetSymbol(node.AsCallExpression().Expression, analysis.checker), true)
				}
				if signature := analysis.checker.GetResolvedSignature(node); signature != nil {
					target := signature.Declaration()
					if target != nil && ast.IsConstructorDeclaration(target) {
						target = target.Parent
					}
					if target != nil && (ast.IsFunctionLike(target) || ast.IsClassDeclaration(target) || ast.IsClassExpression(target)) {
						analysis.expression(target, true)
					}
				}
			}
		}
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return true
		}
		reference := analysis.checker.GetSymbolAtLocation(node)
		if serverOnlyImportSymbol(reference) {
			analysis.server = true
		}
		if !deferred {
			if _, global := browserGlobals[node.Text()]; global && symbolIsOutsideSource(reference, owner) && !browserGlobalReferenceIsGuarded(node, node.Text(), guardBoundary) {
				analysis.browser = true
			}
			if _, global := serverGlobals[node.Text()]; global && symbolIsOutsideSource(reference, owner) {
				module, loader := requireModule(node.Parent, func(value *ast.Node) bool { return nativeModuleLoaderExpression(value, analysis.checker) })
				analysis.server = analysis.server || node.Text() != "require" || !loader || serverOnlyModule(module)
			}
		}
		analysis.symbol(reference, false)
		return true
	})
}

// evaluatedAccessors uses the same explicit and implicit read contracts as callable effects.
func (analysis *moduleDefinitionAnalysis) evaluatedAccessors(node *ast.Node) {
	analysis.beginInitializerPolicyPass()
	defer analysis.endInitializerPolicyPass()
	if analysis.interceptInitializer(node, true) {
		return
	}
	if ast.IsAccessExpression(node) {
		query := newSourceDependencyQuery(analysis.reading, analysis.checker, analysis.owner, nil)
		defer query.publishDependencyStatistics()
		var bound sourceValueBindings
		if analysis.inputs != nil {
			bound = analysis.inputs.bindings
			query.creators = analysis.inputs.dependencyScope.creators
			query.invoking = analysis.inputs.invocation
			query.dependencyUse = analysis.inputs.dependencyUse
		} else {
			bound = make(sourceValueBindings)
		}
		analysis.accessors(query.evaluatedSourceAccessors(node, bound))
	}
	analysis.accessors(moduleBindingProducers(node, analysis.reading, analysis.checker, analysis.owner))
	visitImplicitAccessors(node, analysis.checker, nil, analysis.owner, nil, nil, analysis.accessors)
}

// accessors executes only the declarations selected by the existing evaluation/provenance owner.
func (analysis *moduleDefinitionAnalysis) accessors(candidates accessorCandidates) {
	mergeOwnedGets(&analysis.ownedGetEvidence, candidates.ownedGets)
	appendContributionRefs(&analysis.ownedComponentEvidence, candidateContributionReferences(candidates))
	analysis.opaque = analysis.opaque || ownedCurrentScalarUncertain(candidates.ownedGets)
	analysis.opaque = analysis.opaque || sourceResidualOpaque(candidates)
	for _, effect := range candidates.environmentEffects {
		analysis.browser = analysis.browser || effect.Environment == "browser"
		analysis.server = analysis.server || effect.Environment == "server"
		analysis.opaque = analysis.opaque || effect.Environment == "unknown" || effect.Opaque
	}
	for _, producer := range candidates.producers {
		analysis.expression(producer, false)
	}
	for _, inputs := range candidates.inputs {
		if inputs.dependencyScope.bindings != nil {
			continue
		}
		previous := analysis.inputs
		analysis.inputs = inputs
		// Each candidate contributes its activated defaults even if its body was already
		// visited. A safe first invocation must not hide a later default execution.
		// Preserve binding order rather than allowing map iteration to choose which
		// conditional environment demand reaches the existing walker first.
		for _, initializer := range inputs.order {
			defaults := inputs.defaults[initializer]
			if defaults.bindings != nil {
				browser, server := analysis.browser, analysis.server
				defaultInputs := *inputs
				defaultInputs.bindings = defaults.bindings
				analysis.inputs = &defaultInputs
				analysis.expression(initializer, false)
				analysis.inputs = inputs
				analysis.opaque = analysis.opaque || defaults.conditional && (analysis.browser != browser || analysis.server != server)
			}
		}
		if !inputs.deferredBody {
			analysis.expression(inputs.declaration.Body(), false)
		}
		analysis.inputs = previous
	}
	for _, contribution := range candidates.effects {
		declaration := contribution.declaration
		planned := false
		for _, inputs := range candidates.inputs {
			planned = planned || inputs.declaration == declaration
		}
		if !planned {
			analysis.expression(declaration, true)
		}
	}
}

// moduleDefinitionNodeIsDeferred distinguishes bodies and instance fields from computed names and decorators
// and static initialization. The selected work root may itself be an executing body or field.
func moduleDefinitionNodeIsDeferred(node, work *ast.Node) bool {
	if node == work {
		return false
	}
	for current := node.Parent; current != nil; current = current.Parent {
		if current == work {
			return ast.IsFunctionLike(current)
		}
		if ast.IsPropertyDeclaration(current) && !ast.HasSyntacticModifier(current, ast.ModifierFlagsStatic) {
			initializer := current.AsPropertyDeclaration().Initializer
			if initializer != nil && node.Pos() >= initializer.Pos() && node.End() <= initializer.End() {
				return true
			}
		}
		if ast.IsFunctionLike(current) {
			if sourceDefinitionExpressionContains(current, node) {
				continue
			}
			return true
		}
	}
	return false
}

// moduleValueAvailability belongs to one request and one executable selection.
// Export reporting and pruning can ask for the same checker's symbol before lowering.
type moduleValueAvailability struct {
	checker    *checker.Checker
	owner      *executableBodyOwner
	callables  map[*ast.Node]CallableSummary
	revision   uint64
	placements map[*ast.Symbol]string
}

func (availability *moduleValueAvailability) placement(symbol *ast.Symbol) string {
	revision := uint64(0)
	if availability.owner != nil && availability.owner.values != nil {
		revision = availability.owner.values.initializerRevision
	}
	if availability.revision != revision {
		clear(availability.placements)
		availability.revision = revision
	}
	if prior, ok := availability.placements[symbol]; ok {
		return prior
	}
	analysis := newModuleDefinitionAnalysis(availability.checker, availability.owner)
	analysis.placementOnly = true
	analysis.symbol(symbol, false)
	placement := "isomorphic"
	switch {
	case analysis.opaque || (analysis.browser && analysis.server):
		placement = "unknown"
	case analysis.browser:
		placement = "client"
	case analysis.server:
		placement = "server"
	}
	if availability.placements != nil && analysis.initializerTransient == 0 {
		availability.placements[symbol] = placement
	}
	return placement
}

// newModuleDefinitionAnalysis shares execution and capture traversal for export availability
// and module pruning. The mode-keyed visits preserve eager calls and deferred definitions.
func newModuleDefinitionAnalysis(c *checker.Checker, owner *executableBodyOwner) moduleDefinitionAnalysis {
	var flow *sourceValueQuery
	if owner != nil && owner.values != nil {
		flow = &sourceValueQuery{owner: owner.values, executable: owner, remaining: 4096, active: make(map[*ast.Node]bool)}
	}
	return moduleDefinitionAnalysis{checker: c, owner: owner, flow: flow}
}

// beginInitializerPolicyPass invalidates reusable visits when the detached graph
// installation changes. Building uncertainty never becomes a completed memo.
func (a *moduleDefinitionAnalysis) beginInitializerPolicyPass() {
	revision := uint64(0)
	if a.owner != nil && a.owner.values != nil {
		revision = a.owner.values.initializerRevision
	}
	if a.initializerDepth == 0 && (a.initializerActiveNodes == nil || revision != a.initializerSeenRevision) {
		a.symbols = map[moduleDefinitionSymbolVisit]bool{}
		a.nodes = map[moduleDefinitionNodeVisit]bool{}
		a.initializerActiveSymbols = map[moduleDefinitionSymbolVisit]bool{}
		a.initializerActiveNodes = map[moduleDefinitionNodeVisit]bool{}
		a.initializerMerged = map[string]bool{}
		a.browser = false
		a.server = false
		a.opaque = false
		a.reading = nil
		a.initializerTransient = 0
		a.initializerSeenRevision = revision
	}
	a.initializerDepth++
}
func (a *moduleDefinitionAnalysis) endInitializerPolicyPass() { a.initializerDepth-- }

// interceptInitializer is read-only. It suppresses only exact paid operations or
// the fully covered singleton RHS, while explicitly visiting holder definitions.
// It has no preparation, slot creation, getter or publication path.
func (a *moduleDefinitionAnalysis) interceptInitializer(node *ast.Node, occurrence bool) bool {
	if node == nil || a.owner == nil || a.owner.values == nil {
		return false
	}
	v := a.owner.values
	var p *moduleInitializerProjection
	if occurrence {
		p = v.initializerOccurrences[node]
	} else {
		p = v.initializerDeclarations[node]
		if p == nil && node.Parent != nil && ast.IsVariableDeclaration(node.Parent) && node.Parent.Initializer() == node {
			p = v.initializerDeclarations[node.Parent]
		}
	}
	if p == nil {
		return false
	}
	d := p.Draft
	if d.Program != nil && d.Program != v.program || d.Checker != nil && d.Checker != a.checker || d.Source != ast.GetSourceFileOfNode(node) || d.Stamp != initializerSourceStamp(d.Source) {
		return false
	}
	// Only this consumer's exact refinement may intercept ordinary analysis.
	// A pending Call/result plan is not an opaque source dependency.
	if d.Mode != "AtomicStaticGetChain" {
		return false
	}
	if !p.Sealed {
		a.opaque = true
		a.initializerTransient++
		return true
	}
	if occurrence {
		paid, prefixPaid := false, false
		for _, c := range d.Coverage {
			if c.Disposition == "Accounted" {
				prefixPaid = true
			}
			if c.Node == node && c.Disposition == "Accounted" {
				paid = true
			}
		}
		if !paid && !prefixPaid {
			return false
		}
	}
	if a.initializerMerged == nil {
		a.initializerMerged = map[string]bool{}
	}
	key := p.Signature
	if occurrence {
		key += fmt.Sprintf(":%d", node.Pos())
	}
	if a.initializerMerged[key] {
		return occurrence || d.Status != "Unrepresented"
	}
	a.initializerMerged[key] = true
	a.opaque = a.opaque || d.Status == "Unrepresented" || len(d.Rows) == 0
	for _, r := range d.Rows {
		if r.Completion != fmt.Sprint(languageNormal) || r.Domain != "Primitive" && r.Domain != "Undefined" || r.Remaining != "" {
			a.opaque = true
		}
	}
	for _, c := range d.Coverage {
		if (c.Role == "I" || c.Role == "O") && c.Disposition != "Accounted" {
			a.opaque = true
		}
	}
	for _, e := range p.Donors {
		a.browser = a.browser || e.Environment == "browser"
		a.server = a.server || e.Environment == "server"
		a.opaque = a.opaque || e.Opaque || e.Incomplete || e.Environment == "unknown"
	}
	for _, dep := range d.Dependencies {
		if dep.Declaration != nil {
			a.symbol(a.checker.GetSymbolAtLocation(dep.Declaration.Name()), false)
		}
	}
	return occurrence || d.Status != "Unrepresented"
}
