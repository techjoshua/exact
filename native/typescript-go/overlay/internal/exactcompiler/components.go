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
	"hasContext": {},
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
	if usesForeignJSXRuntime(sourceFile) {
		return nil
	}
	var components []Component
	for _, candidate := range componentCandidates(sourceFile) {
		signals := componentSignals(candidate, sourceFile)
		if len(signals) == 0 {
			continue
		}
		surface := ComponentSurfacePlan{
			Logging:      componentUsesProtocolMember(candidate.node, "log"),
			Localization: componentUsesProtocolMember(candidate.node, "intl"),
			Refs:         componentUsesProtocolMember(candidate.node, "ref", "readRef", "refs"),
			Contexts: componentUsesProtocolMember(
				candidate.node,
				"hasContext", "getContext", "setContext",
			),
			Reactivity: componentUsesProtocolMember(candidate.node, "reactive"),
			ServerLifecycle: componentUsesProtocolMember(
				candidate.node,
				"onUnmount", "onRender", "own",
			),
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
			EnhancementContexts: EnhancementContextEffects{
				Provides:           []string{},
				Requires:           []string{},
				OptionallyConsumes: []string{},
			},
			SplitBoundaries: []string{},
			Diagnostics:     []string{},
			CompiledRender:  componentHasCompiledRender(candidate.node),
			Lifecycle: componentUsesProtocolMember(
				candidate.node,
				"onMount", "onActivate", "onDeactivate", "onUnmount", "onRender", "own",
			),
			Lists:   componentUsesProtocolMember(candidate.node, "map"),
			Surface: surface,
		})
	}
	sort.Slice(components, func(left int, right int) bool {
		return components[left].Start < components[right].Start
	})
	return components
}

func componentHasCompiledRender(node *ast.Node) bool {
	if ast.IsArrowFunction(node) && containsJSX(unwrapRenderExpression(node.Body())) {
		return true
	}
	for _, returned := range directCallableReturns(node) {
		callable := unwrapRenderExpression(returned)
		if ast.IsArrowFunction(callable) && containsJSX(callable) {
			return true
		}
	}
	return false
}

// componentReturnsRenderFunction recognizes the durable setup-plus-view shape even when the view
// forwards children or another already-authored value and therefore contains no JSX syntax itself.
func componentReturnsRenderFunction(node *ast.Node) bool {
	for _, returned := range directCallableReturns(node) {
		callable := unwrapRenderExpression(returned)
		if ast.IsArrowFunction(callable) || ast.IsFunctionExpression(callable) {
			return true
		}
	}
	return false
}

func componentUsesProtocolMember(node *ast.Node, names ...string) bool {
	accepted := make(map[string]struct{}, len(names))
	for _, name := range names {
		accepted[name] = struct{}{}
	}
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		name, componentMember, dynamic := componentProtocolMember(candidate)
		if !componentMember {
			return true
		}
		if _, exists := accepted[name]; exists || dynamic {
			found = true
			return false
		}
		return true
	})
	return found
}

// componentProtocolMember identifies direct and computed access to the authored component view.
// A dynamic computed key conservatively selects every queried capability family because the
// compiler cannot prove which operation the running program will choose.
func componentProtocolMember(node *ast.Node) (name string, componentMember bool, dynamic bool) {
	if ast.IsPropertyAccessExpression(node) {
		member := node.AsPropertyAccessExpression()
		if member.Expression.Kind == ast.KindThisKeyword && member.Name() != nil {
			return member.Name().Text(), true, false
		}
		return "", false, false
	}
	if !ast.IsElementAccessExpression(node) {
		return "", false, false
	}
	member := node.AsElementAccessExpression()
	if member.Expression.Kind != ast.KindThisKeyword || member.ArgumentExpression == nil {
		return "", false, false
	}
	if ast.IsStringLiteral(member.ArgumentExpression) {
		return member.ArgumentExpression.Text(), true, false
	}
	return "", true, true
}

// usesForeignJSXRuntime keeps React, Preact, and other explicitly authored JSX
// modules outside eXact component analysis even when they share an eXact
// package-level TypeScript project.
func usesForeignJSXRuntime(sourceFile *ast.SourceFile) bool {
	pragma := ast.GetPragmaFromSourceFile(sourceFile, "jsximportsource")
	if pragma == nil {
		return false
	}
	runtime := ast.GetPragmaArgument(pragma, "factory")
	return runtime != "" &&
		runtime != "@exactjs/jsx" &&
		!strings.HasPrefix(runtime, "@exactjs/")
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
	return durableComponentCandidates(sourceFile)
}

// durableComponentCandidates retains nested durable definitions long enough for diagnostics to
// reject them. Only module-level definitions can receive stable, target-local artifact contracts;
// setup-local PascalCase view arrows are handled separately as lexical micro-components.
func durableComponentCandidates(sourceFile *ast.SourceFile) []componentCandidate {
	candidates := rawComponentCandidates(sourceFile)
	microTargets := lexicalMicroComponentTargets(candidates, sourceFile)
	filtered := make([]componentCandidate, 0, len(candidates))
	for _, candidate := range candidates {
		_, isMicro := microTargets[candidate.node]
		isTask := looksLikeTaskPolicy(candidate.node, sourceFile) ||
			strings.HasPrefix(candidate.name, "__exactComponentComputation_") ||
			strings.HasPrefix(candidate.name, "__exactComponentSetupTask_")
		if !isMicro && !isTask {
			filtered = append(filtered, candidate)
		}
	}
	return filtered
}

func componentCandidateIsModuleLevel(candidate componentCandidate) bool {
	if ast.IsFunctionDeclaration(candidate.node) {
		return candidate.node.Parent != nil && ast.IsSourceFile(candidate.node.Parent)
	}
	if candidate.node.Parent == nil || !ast.IsVariableDeclaration(candidate.node.Parent) {
		return false
	}
	return componentVariableIsModuleLevel(candidate.node.Parent)
}

// nestedComponentDiagnostics prevents analysis from promising an artifact that module emission
// cannot attach. Durable component definitions have module identity; narrower setup-local view
// helpers must use the compiler-owned lexical micro-component form instead.
func nestedComponentDiagnostics(sourceFile *ast.SourceFile) []Diagnostic {
	diagnostics := []Diagnostic{}
	for _, candidate := range durableComponentCandidates(sourceFile) {
		if componentCandidateIsModuleLevel(candidate) {
			continue
		}
		if !componentName(candidate.name) || !componentHasCompiledRender(candidate.node) {
			continue
		}
		diagnostics = append(diagnostics, Diagnostic{
			Severity: "error",
			Code:     "EXACT2216",
			Message: "Native eXact component " + candidate.name +
				" must be defined at module scope so every target can receive one stable compiled artifact",
			Start:  candidate.node.Pos(),
			Length: candidate.node.End() - candidate.node.Pos(),
		})
	}
	return diagnostics
}

// lexicalMicroComponentTargets identifies PascalCase, synchronous view arrows
// declared inside a durable component. They are compiler-owned view helpers:
// their lexical receiver and reactive work belong to the enclosing component,
// and they never establish a second component instance or stable identity.
func lexicalMicroComponentTargets(
	candidates []componentCandidate,
	sourceFile *ast.SourceFile,
) map[*ast.Node]componentCandidate {
	result := make(map[*ast.Node]componentCandidate)
	for _, candidate := range candidates {
		if !microComponentShape(candidate) ||
			looksLikeTaskPolicy(candidate.node, sourceFile) {
			continue
		}
		var owner *componentCandidate
		for index := range candidates {
			possible := &candidates[index]
			if possible.node == candidate.node ||
				candidate.node.Pos() < possible.node.Pos() ||
				candidate.node.End() > possible.node.End() ||
				microComponentShape(*possible) {
				continue
			}
			if len(componentSignals(*possible, sourceFile)) == 0 {
				continue
			}
			if owner == nil ||
				possible.node.End()-possible.node.Pos() < owner.node.End()-owner.node.Pos() {
				owner = possible
			}
		}
		if owner != nil && directlyDeclaredInSetup(candidate.node, owner.node) {
			result[candidate.node] = *owner
		}
	}
	return result
}

func microComponentShape(candidate componentCandidate) bool {
	return ast.IsArrowFunction(candidate.node) &&
		componentName(candidate.name) &&
		directlyReturnsRenderedValue(candidate.node)
}

func directlyDeclaredInSetup(node *ast.Node, owner *ast.Node) bool {
	for current := node.Parent; current != nil && current != owner; current = current.Parent {
		if ast.IsFunctionLike(current) {
			return false
		}
	}
	return owner != nil && node.Pos() >= owner.Pos() && node.End() <= owner.End()
}

func immutableMicroComponent(node *ast.Node) bool {
	return node != nil && node.Parent != nil &&
		ast.IsVariableDeclaration(node.Parent) &&
		node.Parent.Parent != nil &&
		node.Parent.Parent.Flags&ast.NodeFlagsConst != 0
}

func lexicalMicroComponentSymbols(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) map[ast.SymbolId]struct{} {
	result := make(map[ast.SymbolId]struct{})
	if typeChecker == nil {
		return result
	}
	for node := range lexicalMicroComponentTargets(rawComponentCandidates(sourceFile), sourceFile) {
		parent := node.Parent
		if parent == nil || !ast.IsVariableDeclaration(parent) {
			continue
		}
		name := parent.AsVariableDeclaration().Name()
		if name == nil || !ast.IsIdentifier(name) {
			continue
		}
		if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
			result[ast.GetSymbolId(symbol)] = struct{}{}
		}
	}
	return result
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
	if componentName(candidate.name) && componentReturnsRenderFunction(candidate.node) &&
		!looksLikeTaskPolicy(candidate.node, sourceFile) {
		signals["named-render"] = struct{}{}
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
