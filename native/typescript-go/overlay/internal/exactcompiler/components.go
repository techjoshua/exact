package exactcompiler

import (
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

var componentProtocolCalls = map[string]struct{}{
	"getContext": {},
	"map":        {},
	"onMount":    {},
	"onRender":   {},
	"onUnmount":  {},
	"reactive":   {},
	"setContext": {},
	"task":       {},
}

type componentCandidate struct {
	name     string
	node     *ast.Node
	exported bool
}

// collectComponents discovers the declarations which own eXact component
// lifecycle and state. Signals are retained so differential tests can protect
// each supported declaration form independently of TypeScript node identity.
func collectComponents(sourceFile *ast.SourceFile) []Component {
	var components []Component
	for _, candidate := range componentCandidates(sourceFile) {
		signals := componentSignals(candidate, sourceFile)
		if len(signals) == 0 {
			continue
		}
		components = append(components, Component{
			ID:                nativeComponentIDForNode(sourceFile, candidate.node),
			Name:              candidate.name,
			Start:             candidate.node.Pos(),
			Length:            candidate.node.End() - candidate.node.Pos(),
			Exported:          candidate.exported,
			Signals:           signals,
			Placement:         "isomorphic",
			SubgraphPlacement: "isomorphic",
			EnvironmentEffect: "neutral",
			ArtifactTargets:   []string{"client", "server"},
			RenderEdges:       []RenderEdge{},
			Contexts:          []ContextEffect{},
			SplitBoundaries:   []string{},
			Diagnostics:       []string{},
		})
	}
	sort.Slice(components, func(left int, right int) bool {
		return components[left].Start < components[right].Start
	})
	return components
}

func assignComponentIDs(
	sourceFile *ast.SourceFile,
	components []Component,
	identityFilename string,
) {
	identityFilename = normalizedIdentityFilename(identityFilename)
	ids := expressionNodeIDs(sourceFile)
	candidates := activeComponentCandidates(sourceFile)
	for index := range components {
		if index >= len(candidates) {
			return
		}
		components[index].ID = exactStableID(
			identityFilename,
			ids[candidates[index].node],
		)
	}
}

func normalizedIdentityFilename(filename string) string {
	filename = strings.ReplaceAll(filename, `\`, "/")
	if len(filename) >= 3 &&
		((filename[1] == ':' && filename[2] == '/') ||
			strings.HasPrefix(filename, "//")) {
		return strings.ToLower(filename)
	}
	return filename
}

// markExportedComponents uses checker export identity so aliased exports such
// as `export { ProjectPage as Page }` retain component ownership metadata.
func markExportedComponents(
	sourceFile *ast.SourceFile,
	components []Component,
	typeChecker *checker.Checker,
) {
	if sourceFile.Symbol == nil || typeChecker == nil {
		return
	}
	exportedStarts := make(map[int]struct{})
	for _, exported := range typeChecker.GetExportsOfModule(sourceFile.Symbol) {
		resolved := typeChecker.SkipAlias(exported)
		if resolved == nil || resolved.Flags&ast.SymbolFlagsValue == 0 {
			continue
		}
		for _, declaration := range resolved.Declarations {
			switch {
			case ast.IsFunctionDeclaration(declaration):
				exportedStarts[declaration.Pos()] = struct{}{}
			case ast.IsVariableDeclaration(declaration):
				initializer := declaration.AsVariableDeclaration().Initializer
				if initializer != nil {
					exportedStarts[initializer.Pos()] = struct{}{}
				}
			}
		}
	}
	for index := range components {
		if _, exported := exportedStarts[components[index].Start]; exported {
			components[index].Exported = true
		}
	}
}

func componentCandidates(sourceFile *ast.SourceFile) []componentCandidate {
	candidates := rawComponentCandidates(sourceFile)
	renderTargets := returnedLocalRenderTargets(candidates, sourceFile)
	filtered := make([]componentCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		if _, isRender := renderTargets[candidate.node]; !isRender {
			filtered = append(filtered, candidate)
		}
	}
	return filtered
}

func rawComponentCandidates(sourceFile *ast.SourceFile) []componentCandidate {
	var candidates []componentCandidate
	walkNode(sourceFile.AsNode(), func(statement *ast.Node) bool {
		switch {
		case ast.IsFunctionDeclaration(statement):
			name := statement.Name()
			if name != nil {
				candidates = append(candidates, componentCandidate{
					name:     name.Text(),
					node:     statement,
					exported: ast.HasSyntacticModifier(statement, ast.ModifierFlagsExport),
				})
			}
		case ast.IsVariableDeclaration(statement):
			declaration := statement.AsVariableDeclaration()
			if declaration.Name() != nil && ast.IsIdentifier(declaration.Name()) &&
				declaration.Initializer != nil &&
				(ast.IsArrowFunction(declaration.Initializer) ||
					ast.IsFunctionExpression(declaration.Initializer)) {
				variableStatement := enclosingVariableStatement(statement)
				candidates = append(candidates, componentCandidate{
					name: declaration.Name().Text(),
					node: declaration.Initializer,
					exported: variableStatement != nil &&
						ast.HasSyntacticModifier(variableStatement, ast.ModifierFlagsExport),
				})
			}
		}
		return true
	})
	return candidates
}

// returnedLocalRenderTargets keeps same-module shared render declarations out
// of component ownership. A render function describes one component's current
// tree; it does not establish a second durable component instance.
func returnedLocalRenderTargets(
	candidates []componentCandidate,
	sourceFile *ast.SourceFile,
) map[*ast.Node]struct{} {
	declarations := make(map[string]*ast.Node)
	for _, candidate := range candidates {
		declarations[candidate.name] = candidate.node
	}
	result := make(map[*ast.Node]struct{})
	for _, candidate := range candidates {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		for _, expression := range directCallableReturns(candidate.node) {
			expression = unwrapRenderExpression(expression)
			if !ast.IsIdentifier(expression) {
				continue
			}
			if target := declarations[expression.Text()]; target != nil &&
				target != candidate.node && directlyReturnsRenderedValue(target) {
				result[target] = struct{}{}
			}
		}
	}
	return result
}

func directlyReturnsRenderedValue(callable *ast.Node) bool {
	if ast.IsArrowFunction(callable) {
		body := callable.Body()
		if body != nil && !ast.IsBlock(body) && containsJSX(body) {
			return true
		}
	}
	for _, expression := range directCallableReturns(callable) {
		expression = unwrapRenderExpression(expression)
		if ast.IsArrowFunction(expression) || ast.IsFunctionExpression(expression) {
			continue
		}
		if containsJSX(expression) {
			return true
		}
	}
	return false
}

func directCallableReturns(callable *ast.Node) []*ast.Node {
	var result []*ast.Node
	walkNode(callable, func(node *ast.Node) bool {
		if node != callable && ast.IsFunctionLike(node) {
			return false
		}
		if ast.IsReturnStatement(node) {
			if expression := node.AsReturnStatement().Expression; expression != nil {
				result = append(result, expression)
			}
		}
		return true
	})
	return result
}

func unwrapRenderExpression(node *ast.Node) *ast.Node {
	for node != nil && ast.IsParenthesizedExpression(node) {
		node = node.AsParenthesizedExpression().Expression
	}
	return node
}

func enclosingVariableStatement(node *ast.Node) *ast.Node {
	for current := node.Parent; current != nil; current = current.Parent {
		if ast.IsVariableStatement(current) {
			return current
		}
		if ast.IsStatement(current) {
			return nil
		}
	}
	return nil
}

func componentSignals(candidate componentCandidate, sourceFile *ast.SourceFile) []string {
	signals := make(map[string]struct{}, 3)
	if componentName(candidate.name) && containsJSX(candidate.node) {
		signals["named-jsx"] = struct{}{}
	}
	if hasComponentReceiver(candidate.node, sourceFile) {
		signals["typed-receiver"] = struct{}{}
	}
	if containsComponentProtocolCall(candidate.node) {
		signals["component-protocol"] = struct{}{}
	}
	result := make([]string, 0, len(signals))
	for signal := range signals {
		result = append(result, signal)
	}
	sort.Strings(result)
	return result
}

func componentName(name string) bool {
	first, _ := utf8.DecodeRuneInString(name)
	return first != utf8.RuneError && unicode.IsUpper(first)
}

func containsJSX(node *ast.Node) bool {
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if ast.IsJsxElement(candidate) || ast.IsJsxSelfClosingElement(candidate) ||
			ast.IsJsxFragment(candidate) {
			found = true
			return false
		}
		return true
	})
	return found
}

func hasComponentReceiver(node *ast.Node, sourceFile *ast.SourceFile) bool {
	for _, parameter := range node.Parameters() {
		name := parameter.Name()
		typeNode := parameter.Type()
		if name == nil || !ast.IsIdentifier(name) || name.Text() != "this" || typeNode == nil {
			continue
		}
		if strings.Contains(sourceText(sourceFile, typeNode), "Component") {
			return true
		}
	}
	return false
}

func containsComponentProtocolCall(node *ast.Node) bool {
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if !ast.IsPropertyAccessExpression(candidate) {
			return true
		}
		member := candidate.AsPropertyAccessExpression()
		if member.Expression == nil || member.Expression.Kind != ast.KindThisKeyword ||
			member.Name() == nil {
			return true
		}
		if _, supported := componentProtocolCalls[member.Name().Text()]; supported {
			found = true
			return false
		}
		return true
	})
	return found
}

func walkNode(node *ast.Node, visit func(*ast.Node) bool) {
	if node == nil || !visit(node) {
		return
	}
	node.ForEachChild(func(child *ast.Node) bool {
		walkNode(child, visit)
		return false
	})
}

func sourceText(sourceFile *ast.SourceFile, node *ast.Node) string {
	start := node.Pos()
	end := node.End()
	if start < 0 || end < start || end > len(sourceFile.Text()) {
		return ""
	}
	return sourceFile.Text()[start:end]
}
