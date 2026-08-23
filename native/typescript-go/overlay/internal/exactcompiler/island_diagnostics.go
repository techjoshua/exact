package exactcompiler

import (
	"fmt"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

// islandPlacementDiagnostics protects the server artifact boundary before
// lowering removes the authored JSX sites. Client islands may not close over
// server imports, and the remaining server-rendered tree may not read browser
// globals.
func islandPlacementDiagnostics(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	callables callableAnalysis,
	components []Component,
	tasks []Task,
	stateAliases []StateAlias,
	stateReads []StateRead,
	stateWrites []StateWrite,
	reactiveBindings []ReactiveBinding,
	target Target,
) []Diagnostic {
	if target != TargetServer {
		return nil
	}
	islands := indexClientElementIslands(
		sourceFile,
		components,
		stateAliases,
		stateReads,
		stateWrites,
		reactiveBindings,
		typeChecker,
	)
	islandNodes := make([]*ast.Node, 0, len(islands))
	diagnostics := []Diagnostic{}
	seen := make(map[string]struct{})
	add := func(code string, message string, node *ast.Node) {
		key := code + ":" + message
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		diagnostics = append(diagnostics, Diagnostic{
			Severity: "error",
			Code:     code,
			Message:  message,
			Start:    node.Pos(),
			Length:   node.End() - node.Pos(),
		})
	}
	for node := range islands {
		islandNodes = append(islandNodes, node)
		walkNode(node, func(current *ast.Node) bool {
			if !ast.IsIdentifier(current) ||
				ast.IsDeclarationName(current) ||
				isStaticPropertyName(current) {
				return true
			}
			symbol := typeChecker.GetSymbolAtLocation(current)
			if serverOnlyImportSymbol(symbol) {
				add(
					"EXACT2210",
					"error: client island cannot reference server-only imports ("+
						current.Text()+")",
					current,
				)
			}
			return true
		})
	}
	candidates := activeComponentCandidates(sourceFile)
	for index, component := range components {
		if index >= len(candidates) || component.Placement == "client" {
			continue
		}
		candidate := candidates[index]
		clientLifecycleSpans := componentClientLifecycleCallbackSpans(candidate.node)
		dormantCallableSpans := componentDormantCallableSpans(candidate.node, callables, typeChecker)
		walkNode(candidate.node, func(node *ast.Node) bool {
			if insideTaskSpan(node.Pos(), tasks, component.Name) ||
				nodeInsideAnyIsland(node, islandNodes) ||
				insideSourceSpans(node.Pos(), clientLifecycleSpans) ||
				insideSourceSpans(node.Pos(), dormantCallableSpans) {
				return false
			}
			if !ast.IsIdentifier(node) ||
				ast.IsDeclarationName(node) ||
				isStaticPropertyName(node) {
				return true
			}
			if _, browser := browserGlobals[node.Text()]; !browser {
				return true
			}
			symbol := typeChecker.GetSymbolAtLocation(node)
			if symbolIsOutsideSource(symbol, sourceFile) {
				add(
					"EXACT2211",
					"error: browser-only global "+node.Text()+
						" cannot be used in server-rendered component code",
					node,
				)
			}
			return true
		})
	}
	return diagnostics
}

// componentDormantCallableSpans identifies local callback bodies that server setup and render
// cannot execute. Merely creating or forwarding a browser callback is target-neutral; only a
// server-reachable invocation may make its browser globals a server placement error.
func componentDormantCallableSpans(
	component *ast.Node,
	callables callableAnalysis,
	typeChecker *checker.Checker,
) []SourceSpan {
	indexesByNode := make(map[*ast.Node]int, len(callables.facts))
	indexesBySpan := make(map[string]int, len(callables.facts))
	indexesByID := make(map[string]int, len(callables.facts))
	indexesBySymbol := make(map[ast.SymbolId]int, len(callables.facts))
	for index := range callables.facts {
		fact := &callables.facts[index]
		indexesByNode[fact.node] = index
		indexesBySpan[fmt.Sprintf("%d:%d", fact.node.Pos(), fact.node.End())] = index
		indexesByID[fact.summary.ID] = index
		if symbol := callableDeclarationSymbol(fact.node, typeChecker); symbol != nil {
			indexesBySymbol[ast.GetSymbolId(symbol)] = index
		}
	}
	reachable := make(map[int]struct{})
	queue := []int{}
	add := func(index int) {
		if _, exists := reachable[index]; exists {
			return
		}
		reachable[index] = struct{}{}
		queue = append(queue, index)
	}
	if index, exists := indexesByNode[component]; exists {
		add(index)
	}
	if ast.IsVariableDeclaration(component) {
		initializer := component.AsVariableDeclaration().Initializer
		if initializer != nil {
			if index, exists := indexesByNode[initializer]; exists {
				add(index)
			}
		}
	}
	outerIndex, outerWidth := -1, -1
	for index := range callables.facts {
		callable := callables.facts[index].node
		if !ast.IsFunctionLike(callable) || callable.Pos() < component.Pos() ||
			callable.End() > component.End() {
			continue
		}
		if width := callable.End() - callable.Pos(); width > outerWidth {
			outerIndex, outerWidth = index, width
		}
	}
	if outerIndex >= 0 {
		add(outerIndex)
	}
	if ast.IsArrowFunction(component) && component.Body() != nil &&
		!ast.IsBlock(component.Body()) {
		renderIndex, renderWidth := -1, -1
		for index := range callables.facts {
			callable := callables.facts[index].node
			if callable == component || callable.Pos() < component.Body().Pos() ||
				callable.End() > component.Body().End() {
				continue
			}
			if width := callable.End() - callable.Pos(); width > renderWidth {
				renderIndex, renderWidth = index, width
			}
		}
		if renderIndex >= 0 {
			add(renderIndex)
		}
	}
	walkCallable(component, func(node *ast.Node) bool {
		if !ast.IsReturnStatement(node) {
			return true
		}
		expression := unwrapRenderExpression(node.AsReturnStatement().Expression)
		if expression == nil {
			return true
		}
		index, exists := indexesByNode[expression]
		if !exists {
			index, exists = indexesBySpan[fmt.Sprintf("%d:%d", expression.Pos(), expression.End())]
		}
		if !exists {
			width := int(^uint(0) >> 1)
			for candidate := range callables.facts {
				fact := callables.facts[candidate].node
				if fact.Pos() <= expression.Pos() && fact.End() >= expression.End() &&
					fact.End()-fact.Pos() < width {
					index, exists, width = candidate, true, fact.End()-fact.Pos()
				}
			}
		}
		if exists {
			add(index)
		}
		walkCallable(expression, func(renderNode *ast.Node) bool {
			if !ast.IsCallExpression(renderNode) {
				return true
			}
			symbol := resolvedCallableSymbol(
				callTargetSymbol(renderNode.AsCallExpression().Expression, typeChecker),
				typeChecker,
			)
			if symbol == nil {
				return true
			}
			if called, found := indexesBySymbol[ast.GetSymbolId(symbol)]; found {
				add(called)
				return true
			}
			if summary, found := callables.bySymbol[ast.GetSymbolId(symbol)]; found {
				if called, indexed := indexesByID[summary.ID]; indexed {
					add(called)
				}
			}
			return true
		})
		if exists {
			return true
		}
		if ast.IsIdentifier(expression) {
			symbol := resolvedCallableSymbol(typeChecker.GetSymbolAtLocation(expression), typeChecker)
			if symbol == nil {
				return true
			}
			if summary, exists := callables.bySymbol[ast.GetSymbolId(symbol)]; exists {
				if index, found := indexesByID[summary.ID]; found {
					add(index)
				}
			}
		}
		return true
	})
	for len(queue) != 0 {
		index := queue[0]
		queue = queue[1:]
		for _, target := range callables.facts[index].targets {
			add(target)
		}
	}
	spans := []SourceSpan{}
	for index := range callables.facts {
		fact := &callables.facts[index]
		if fact.node == component || fact.node.Pos() < component.Pos() || fact.node.End() > component.End() {
			continue
		}
		if _, executes := reachable[index]; executes {
			continue
		}
		spans = append(spans, SourceSpan{Start: fact.node.Pos(), Length: fact.node.End() - fact.node.Pos()})
	}
	return spans
}

func nodeInsideAnyIsland(node *ast.Node, islands []*ast.Node) bool {
	for _, island := range islands {
		if node.Pos() >= island.Pos() && node.End() <= island.End() {
			return true
		}
	}
	return false
}
