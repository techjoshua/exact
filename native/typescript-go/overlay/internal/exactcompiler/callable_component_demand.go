package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// componentCallableDemand selects public analysis work, not runtime execution.
// Canonical inventories remain available to every source. Only a component,
// framework task/policy boundary in the requested source, or its transitive
// references demand bodies. Program roots retain type context, not body demand.
// Omitted scope preserves full-registry inspection for existing private harnesses.
// The private replacement harness deliberately retains its all-facts experiment.
func componentCallableDemand(collection *projectCallableCollection, requested ...*ast.SourceFile) []bool {
	facts, owner := collection.facts, collection.owner
	nodes, symbols := collection.nodes, collection.symbols
	if owner == nil || owner.project == nil || owner.project.stagedReplacement {
		return nil
	}
	demand := make([]bool, len(facts))
	modules := make(map[*ast.SourceFile][]int)
	for i, f := range facts {
		modules[f.sourceFile] = append(modules[f.sourceFile], i)
	}
	var pending []int
	add := func(i int) {
		if !demand[i] {
			demand[i] = true
			pending = append(pending, i)
		}
	}
	needed := make(map[*ast.SourceFile]bool)
	var sources []*ast.SourceFile
	needSource := func(s *ast.SourceFile) {
		if s != nil && !s.IsDeclarationFile && len(modules[s]) != 0 && !needed[s] {
			needed[s] = true
			sources = append(sources, s)
		}
	}
	if len(requested) != 0 {
		needSource(requested[0])
	}
	for i, f := range facts {
		if len(requested) != 0 && f.sourceFile != requested[0] {
			continue
		}
		_, component := owner.values.components[f.node]
		annotations := callableNodeAnnotations(f.node, f.sourceFile)
		task := owner.values.erasedTaskPolicyParameter(f.node) != nil
		if component || task || annotations.client || annotations.server || annotations.policy != nil {
			add(i)
			needSource(f.sourceFile)
		}
	}
	if len(requested) != 0 {
		helperPublicationDemand(collection, requested[0], func(i int) { add(i); needSource(facts[i].sourceFile) })
	}
	// Reuse resolved declaration identity. A reference may name an imported
	// helper or a callable stored in a property; spelling supplies no edge.
	demandReference := func(node *ast.Node, mode accessorTraversal) {
		consider := func(i int) {
			n := facts[i].node
			if ast.IsGetAccessorDeclaration(n) {
				if mode&accessorNoGet == 0 {
					add(i)
				}
				return
			}
			if ast.IsSetAccessorDeclaration(n) {
				if mode&accessorSet != 0 {
					add(i)
				}
				return
			}
			if mode&accessorInvoke != 0 {
				add(i)
			}
		}
		if node == nil {
			return
		}
		if i, found := nodes[node]; found {
			consider(i)
			return
		}
		symbol := resolvedCallableSymbol(owner.checker.GetSymbolAtLocation(node), owner.checker)
		if symbol == nil {
			return
		}
		if i, found := symbols[ast.GetSymbolId(symbol)]; found {
			consider(i)
		}
		for _, declaration := range symbol.Declarations {
			if i, found := nodes[declaration]; found {
				consider(i)
				continue
			}
			if ast.IsVariableDeclaration(declaration) || ast.IsPropertyAssignment(declaration) {
				if i, found := nodes[unwrapSourceCallableReference(declaration.Initializer())]; found {
					consider(i)
				}
			}
		}
	}
	for head, sourceHead := 0, 0; head < len(pending) || sourceHead < len(sources); {
		for sourceHead < len(sources) {
			source := sources[sourceHead]
			sourceHead++
			for _, i := range modules[source] {
				if runtimeModuleEvaluation(facts[i].node) {
					add(i)
				}
			}
			index := owner.values.index(source)
			for _, slot := range index.runtimeImports {
				if index.erasedImports[slot] {
					continue
				}
				reference, _ := executableDeclarationReference(slot)
				if reference != nil {
					if symbol := owner.checker.GetSymbolAtLocation(reference); symbol != nil {
						needSource(moduleSourceFile(symbol))
					}
				}
			}
		}
		if head == len(pending) {
			continue
		}
		i := pending[head]
		head++
		f := &facts[i]
		needSource(f.sourceFile)
		if !isCallableNode(f.node) && !runtimeModuleEvaluation(f.node) {
			continue
		}
		_, componentReturn := owner.values.components[f.node]
		summary := owner.values.summary(f.node)
		for _, node := range summary.nodes {
			if ast.IsJsxOpeningElement(node) {
				demandReference(node.AsJsxOpeningElement().TagName, accessorInvoke)
			}
			if ast.IsJsxSelfClosingElement(node) {
				demandReference(node.AsJsxSelfClosingElement().TagName, accessorInvoke)
			}
			if ast.IsCallExpression(node) || ast.IsNewExpression(node) {
				demandReference(unwrapSourceCallableReference(node.Expression()), accessorInvoke)
			}
			if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
				mode := accessorRead
				mutation := planMutationOperation(node.Parent)
				if mutation.target == node && mutation.kind == mutationDelete {
					continue
				}
				if mutation.target == node {
					mode = accessorSet
					if mutation.kind == mutationAssign {
						mode |= accessorNoGet
					}
				}
				demandReference(node, mode)
			}
			if ast.IsIdentifier(node) && !ast.IsDeclarationName(node) && !isStaticPropertyName(node) && callableDemandBoundary(node, f.node, componentReturn) {
				demandReference(node, accessorInvoke)
			}
		}
		if componentReturn {
			// Render functions are indexed deferred regions, not ordinary helper
			// Calls. Their JSX tags require the child's own component summary for
			// cross-file planning; no invocation/input edge is created here.
			index := owner.values.index(f.sourceFile)
			for _, returned := range summary.returns {
				render := unwrapRenderExpression(returned)
				region := index.operationRegions[render]
				if region == nil {
					continue
				}
				for _, references := range [][]*ast.Node{region.references, region.members} {
					for _, reference := range references {
						parent := reference.Parent
						if parent != nil && (ast.IsJsxOpeningElement(parent) && parent.AsJsxOpeningElement().TagName == reference || ast.IsJsxSelfClosingElement(parent) && parent.AsJsxSelfClosingElement().TagName == reference) {
							demandReference(reference, accessorInvoke)
						}
					}
				}
			}
			for _, site := range summary.returnSites {
				if ast.IsReturnStatement(site) {
					site = site.Expression()
				}
				demandReference(unwrapSourceCallableReference(site), accessorInvoke)
			}
		}
		// JSX handlers are real component boundary consumers, even when the
		// callback is a literal rather than a symbol reference in a Call.
		region := owner.values.index(f.sourceFile).operationRegions[f.node]
		if region != nil {
			for _, child := range region.lexicalChildren {
				if callableIsInteractiveHandler(child) || callableDemandBoundary(child, f.node, componentReturn) {
					demandReference(child, accessorInvoke)
				}
			}
		}
	}
	return demand
}

func callableSourceDemanded(facts []callableFacts, work *callableEffectWork, source *ast.SourceFile) bool {
	for i := range facts {
		if facts[i].sourceFile == source && work.extractionPhases[i] != callableExtractionRegistered {
			return true
		}
	}
	return false
}

// A created callback crossing a real call/render/return boundary can supply
// component work. An unread local function declaration/initializer does not.
func callableDemandBoundary(node, owner *ast.Node, componentReturn bool) bool {
	for at := node; at != nil && at.Parent != nil && at.Parent != owner; at = at.Parent {
		p := at.Parent
		if ast.IsVariableDeclaration(p) || isCallableNode(p) {
			return false
		}
		if componentReturn && ast.IsReturnStatement(p) || ast.IsJsxExpression(p) || ast.IsCallExpression(p) && p.Expression() != at {
			return true
		}
	}
	return false
}
