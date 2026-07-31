package exactcompiler

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/scanner"
)

var safeDerivedCollectionMethods = map[string]struct{}{
	"at": {}, "concat": {}, "every": {}, "filter": {}, "find": {},
	"findIndex": {}, "findLast": {}, "findLastIndex": {}, "flatMap": {},
	"includes": {}, "indexOf": {}, "join": {}, "lastIndexOf": {},
	"map": {}, "reduce": {}, "reduceRight": {}, "slice": {}, "some": {},
	"toReversed": {}, "toSorted": {}, "toSpliced": {}, "with": {},
}

var safeDerivedStringMethods = map[string]struct{}{
	"endsWith": {}, "includes": {}, "localeCompare": {}, "slice": {},
	"startsWith": {}, "substr": {}, "substring": {}, "toLowerCase": {},
	"toUpperCase": {}, "trim": {}, "trimEnd": {}, "trimStart": {},
}

var safeDerivedScalarFunctions = map[string]struct{}{
	"BigInt": {}, "Boolean": {}, "Number": {}, "String": {},
	"isFinite": {}, "isNaN": {}, "parseFloat": {}, "parseInt": {},
}

type reactiveBindingState struct {
	component    string
	name         string
	node         *ast.Node
	initializer  *ast.Node
	hint         string
	dependencies []ast.SymbolId
	safe         bool
	stateAlias   bool
}

// collectReactiveBindings builds the lexical provenance graph used by native
// JSX cells and task dependency planning.
func collectReactiveBindings(
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	stateAliases []StateAlias,
	stateReads []StateRead,
) []ReactiveBinding {
	var output []ReactiveBinding
	for _, candidate := range componentCandidates(sourceFile) {
		if len(componentSignals(candidate, sourceFile)) == 0 {
			continue
		}
		states := collectComponentReactiveStates(
			candidate,
			sourceFile,
			typeChecker,
			stateAliases,
			stateReads,
		)
		bySymbol := make(map[ast.SymbolId]*reactiveBindingState, len(states))
		for _, state := range states {
			symbol := typeChecker.GetSymbolAtLocation(state.node)
			if symbol != nil {
				bySymbol[ast.GetSymbolId(symbol)] = state
			}
		}
		for _, state := range states {
			if state.initializer == nil || ast.IsArrowFunction(state.initializer) ||
				ast.IsFunctionExpression(state.initializer) {
				continue
			}
			seen := make(map[ast.SymbolId]struct{})
			visitedHelpers := make(map[ast.SymbolId]struct{})
			var collectDependencies func(*ast.Node)
			collectDependencies = func(root *ast.Node) {
				walkNode(root, func(node *ast.Node) bool {
					if root == state.initializer &&
						ast.IsObjectLiteralExpression(root) &&
						(isCallableNode(node) ||
							ast.IsMethodDeclaration(node) ||
							ast.IsGetAccessorDeclaration(node) ||
							ast.IsSetAccessorDeclaration(node)) {
						return false
					}
					if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
						isStaticPropertyName(node) {
						if ast.IsCallExpression(node) {
							call := node.AsCallExpression()
							if ast.IsIdentifier(call.Expression) {
								symbol := typeChecker.GetSymbolAtLocation(call.Expression)
								if symbol != nil {
									id := ast.GetSymbolId(symbol)
									if _, visited := visitedHelpers[id]; !visited {
										visitedHelpers[id] = struct{}{}
										if body := localCallableBody(symbol); body != nil {
											collectDependencies(body)
										}
									}
								}
							}
						}
						return true
					}
					symbol := typeChecker.GetSymbolAtLocation(node)
					if symbol == nil {
						return true
					}
					id := ast.GetSymbolId(symbol)
					if _, local := bySymbol[id]; local {
						if _, exists := seen[id]; !exists {
							state.dependencies = append(state.dependencies, id)
							seen[id] = struct{}{}
						}
					}
					return true
				})
			}
			collectDependencies(state.initializer)
		}
		markWrittenReactiveBindingsUnsafe(candidate.node, states, typeChecker)
		references := reactiveBindingReferences(candidate.node, states, sourceFile, typeChecker)
		resolved := make(map[*reactiveBindingState]string, len(states))
		resolving := make(map[*reactiveBindingState]bool, len(states))
		var classify func(*reactiveBindingState) string
		classify = func(state *reactiveBindingState) string {
			if value := resolved[state]; value != "" {
				return value
			}
			if state.hint != "" {
				resolved[state] = state.hint
				return state.hint
			}
			if resolving[state] {
				return "unknown"
			}
			resolving[state] = true
			value := "unknown"
			for _, dependency := range state.dependencies {
				source := bySymbol[dependency]
				if source != nil && reactiveProvenance(classify(source)) {
					value = "derived"
					break
				}
			}
			delete(resolving, state)
			resolved[state] = value
			return value
		}
		for _, state := range states {
			dependencies := make([]string, 0, len(state.dependencies))
			for _, dependency := range state.dependencies {
				if source := bySymbol[dependency]; source != nil {
					dependencies = append(dependencies, source.name)
				}
			}
			output = append(output, ReactiveBinding{
				Component:        candidate.name,
				Name:             state.name,
				Provenance:       classify(state),
				ContextToken:     reactiveContextToken(state.initializer),
				Dependencies:     dependencies,
				Definition:       reactiveBindingDefinition(state),
				References:       references[state],
				SafeToReevaluate: state.safe,
				Start:            state.node.Pos(),
				Length:           state.node.End() - state.node.Pos(),
			})
		}
	}
	sort.Slice(output, func(left int, right int) bool {
		return output[left].Start < output[right].Start
	})
	return output
}

// reactiveBindingDefinition returns the initializer span, falling back to the binding itself for
// reactive inputs such as parameters that do not have an authored initializer.
func reactiveBindingDefinition(state *reactiveBindingState) SourceSpan {
	node := state.initializer
	if node == nil {
		node = state.node
	}
	return SourceSpan{
		Start:  node.Pos(),
		Length: node.End() - node.Pos(),
	}
}

// reactiveBindingReferences retains symbol-resolved reads so editor presentation can distinguish
// a derived declaration from each consumer without reconstructing TypeScript binding in the LSP.
func reactiveBindingReferences(
	component *ast.Node,
	states []*reactiveBindingState,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) map[*reactiveBindingState][]SourceSpan {
	bySymbol := make(map[ast.SymbolId]*reactiveBindingState, len(states))
	for _, state := range states {
		if symbol := typeChecker.GetSymbolAtLocation(state.node); symbol != nil {
			bySymbol[ast.GetSymbolId(symbol)] = state
		}
	}
	references := make(map[*reactiveBindingState][]SourceSpan, len(states))
	walkNode(component, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		state := bySymbol[ast.GetSymbolId(symbol)]
		if state != nil {
			start := scanner.SkipTrivia(sourceFile.Text(), node.Pos())
			references[state] = append(references[state], SourceSpan{
				Start:  start,
				Length: node.End() - start,
			})
		}
		return true
	})
	return references
}

func localCallableBody(symbol *ast.Symbol) *ast.Node {
	for _, declaration := range symbol.Declarations {
		switch {
		case ast.IsFunctionDeclaration(declaration):
			return declaration.Body()
		case ast.IsVariableDeclaration(declaration):
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer != nil &&
				(ast.IsArrowFunction(initializer) ||
					ast.IsFunctionExpression(initializer)) {
				return initializer.Body()
			}
		}
	}
	return nil
}

func markWrittenReactiveBindingsUnsafe(
	component *ast.Node,
	states []*reactiveBindingState,
	typeChecker *checker.Checker,
) {
	bySymbol := make(map[ast.SymbolId]*reactiveBindingState)
	for _, state := range states {
		if state.initializer == nil {
			continue
		}
		symbol := typeChecker.GetSymbolAtLocation(state.node)
		if symbol != nil {
			bySymbol[ast.GetSymbolId(symbol)] = state
		}
	}
	walkNode(component, func(node *ast.Node) bool {
		if !ast.IsIdentifier(node) || ast.IsDeclarationName(node) ||
			!identifierIsWriteTarget(node) {
			return true
		}
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return true
		}
		state := bySymbol[ast.GetSymbolId(symbol)]
		if state == nil || node.Pos() <= state.node.End() {
			return true
		}
		// A state alias is a compiler-owned reactive view. Assignments through
		// its properties mutate the underlying state, while assigning the alias
		// identifier itself invalidates the setup binding.
		if state.stateAlias && !identifierIsDirectWriteTarget(node) {
			return true
		}
		state.safe = false
		return true
	})
}

func identifierIsDirectWriteTarget(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return false
	}
	if ast.IsAssignmentExpression(parent, false) &&
		parent.AsBinaryExpression().Left == node {
		return true
	}
	if ast.IsPrefixUnaryExpression(parent) {
		operator := parent.AsPrefixUnaryExpression().Operator
		return operator == ast.KindPlusPlusToken ||
			operator == ast.KindMinusMinusToken
	}
	return ast.IsPostfixUnaryExpression(parent)
}

func identifierIsWriteTarget(node *ast.Node) bool {
	current := node
	for current.Parent != nil &&
		(ast.IsPropertyAccessExpression(current.Parent) ||
			ast.IsElementAccessExpression(current.Parent)) {
		parent := current.Parent
		if ast.IsPropertyAccessExpression(parent) &&
			parent.AsPropertyAccessExpression().Expression != current {
			break
		}
		if ast.IsElementAccessExpression(parent) &&
			parent.AsElementAccessExpression().Expression != current {
			break
		}
		current = parent
	}
	parent := current.Parent
	if parent == nil {
		return false
	}
	if ast.IsAssignmentExpression(parent, false) &&
		parent.AsBinaryExpression().Left == current {
		return true
	}
	if ast.IsPrefixUnaryExpression(parent) {
		operator := parent.AsPrefixUnaryExpression().Operator
		return operator == ast.KindPlusPlusToken ||
			operator == ast.KindMinusMinusToken
	}
	return ast.IsPostfixUnaryExpression(parent)
}

func reactiveContextToken(initializer *ast.Node) string {
	return stableContextToken(continuationContextLookup(initializer))
}

func collectComponentReactiveStates(
	candidate componentCandidate,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	stateAliases []StateAlias,
	stateReads []StateRead,
) []*reactiveBindingState {
	var states []*reactiveBindingState
	for _, parameter := range candidate.node.Parameters() {
		for _, name := range bindingIdentifiers(parameter.Name()) {
			hint := "props"
			if name.Text() == "this" {
				hint = "state"
			}
			states = append(states, &reactiveBindingState{
				component: candidate.name,
				name:      name.Text(),
				node:      name,
				hint:      hint,
				safe:      true,
			})
		}
	}
	walkNode(candidate.node, func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) ||
			!setupOwnedNode(node, candidate.node) {
			return true
		}
		declaration := node.AsVariableDeclaration()
		for _, name := range bindingIdentifiers(declaration.Name()) {
			hint := ""
			stateAlias := aliasAt(stateAliases, candidate.name, name.Pos())
			functionInitializer := declaration.Initializer != nil &&
				(ast.IsArrowFunction(declaration.Initializer) ||
					ast.IsFunctionExpression(declaration.Initializer))
			if !functionInitializer {
				if containsNamedCall(declaration.Initializer, "peek") {
					hint = "snapshot"
				} else if stateAlias ||
					reactiveReadWithinInitializer(
						stateReads,
						candidate.name,
						declaration.Initializer,
					) {
					hint = "derived"
				} else if containsThisMember(declaration.Initializer, "props") {
					hint = "derived"
				} else if containsThisMember(declaration.Initializer, "getContext") ||
					containsThisMember(declaration.Initializer, "context") {
					hint = "context"
				}
			}
			states = append(states, &reactiveBindingState{
				component:   candidate.name,
				name:        name.Text(),
				node:        name,
				initializer: declaration.Initializer,
				hint:        hint,
				stateAlias:  stateAlias,
				safe: safeReactiveInitializer(
					declaration.Initializer,
					sourceFile,
					typeChecker,
				),
			})
		}
		return true
	})
	return states
}

func reactiveReadWithinInitializer(
	reads []StateRead,
	component string,
	initializer *ast.Node,
) bool {
	if initializer == nil {
		return false
	}
	if !ast.IsObjectLiteralExpression(initializer) {
		return readWithin(reads, component, initializer)
	}
	for _, read := range reads {
		if read.Component != component ||
			read.Start < initializer.Pos() ||
			read.Start+read.Length > initializer.End() {
			continue
		}
		deferred := false
		walkNode(initializer, func(node *ast.Node) bool {
			if (!isCallableNode(node) &&
				!ast.IsMethodDeclaration(node) &&
				!ast.IsGetAccessorDeclaration(node) &&
				!ast.IsSetAccessorDeclaration(node)) ||
				node == initializer {
				return true
			}
			if read.Start >= node.Pos() &&
				read.Start+read.Length <= node.End() {
				deferred = true
				return false
			}
			return true
		})
		if !deferred {
			return true
		}
	}
	return false
}

func bindingIdentifiers(name *ast.Node) []*ast.Node {
	if name == nil {
		return nil
	}
	if ast.IsIdentifier(name) {
		return []*ast.Node{name}
	}
	if !ast.IsObjectBindingPattern(name) && !ast.IsArrayBindingPattern(name) {
		return nil
	}
	var identifiers []*ast.Node
	for _, elementNode := range name.AsBindingPattern().Elements.Nodes {
		if ast.IsBindingElement(elementNode) {
			identifiers = append(
				identifiers,
				bindingIdentifiers(elementNode.AsBindingElement().Name())...,
			)
		}
	}
	return identifiers
}

func aliasAt(aliases []StateAlias, component string, start int) bool {
	for _, alias := range aliases {
		if alias.Component == component && alias.Start == start {
			return true
		}
	}
	return false
}

func readWithin(reads []StateRead, component string, node *ast.Node) bool {
	if node == nil {
		return false
	}
	for _, read := range reads {
		if read.Component == component && read.Start >= node.Pos() &&
			read.Start+read.Length <= node.End() {
			return true
		}
	}
	return false
}

func containsThisMember(node *ast.Node, name string) bool {
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if !ast.IsPropertyAccessExpression(candidate) {
			return true
		}
		member := candidate.AsPropertyAccessExpression()
		if member.Expression.Kind == ast.KindThisKeyword &&
			member.Name() != nil && member.Name().Text() == name {
			found = true
			return false
		}
		return true
	})
	return found
}

// containsNamedCall recognizes the explicit eXact setup-snapshot boundary.
//
// Snapshot provenance deliberately wins over dependencies inside the callback:
// peek() asks the compiler to retain the setup value instead of subscribing to
// the reactive reads used to calculate it.
func containsNamedCall(node *ast.Node, name string) bool {
	found := false
	walkNode(node, func(candidate *ast.Node) bool {
		if !ast.IsCallExpression(candidate) {
			return true
		}
		expression := candidate.AsCallExpression().Expression
		if ast.IsIdentifier(expression) && expression.Text() == name {
			found = true
			return false
		}
		return true
	})
	return found
}

func safeReactiveInitializer(
	node *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	return safeReactiveInitializerWithHelpers(
		node,
		sourceFile,
		typeChecker,
		make(map[ast.SymbolId]struct{}),
	)
}

func safeReactiveInitializerWithHelpers(
	node *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	resolving map[ast.SymbolId]struct{},
) bool {
	if node == nil {
		return false
	}
	safe := true
	walkNode(node, func(candidate *ast.Node) bool {
		switch {
		case ast.IsCallExpression(candidate):
			if trackedCallbackCall(candidate, sourceFile, typeChecker) ||
				safeDerivedCall(
					candidate,
					sourceFile,
					typeChecker,
					resolving,
				) {
				return true
			}
			safe = false
			return false
		case ast.IsNewExpression(candidate):
			expression := candidate.AsNewExpression().Expression
			if ast.IsIdentifier(expression) &&
				(expression.Text() == "Set" || expression.Text() == "Map") &&
				symbolIsOutsideSource(
					typeChecker.GetSymbolAtLocation(expression),
					sourceFile,
				) {
				return true
			}
			safe = false
			return false
		case
			ast.IsAwaitExpression(candidate),
			ast.IsYieldExpression(candidate),
			ast.IsDeleteExpression(candidate):
			safe = false
			return false
		case ast.IsAssignmentExpression(candidate, false):
			if mutationLocalToNestedCallback(candidate, node, typeChecker) {
				return true
			}
			safe = false
			return false
		case ast.IsPrefixUnaryExpression(candidate):
			operator := candidate.AsPrefixUnaryExpression().Operator
			if operator == ast.KindPlusPlusToken || operator == ast.KindMinusMinusToken {
				if mutationLocalToNestedCallback(candidate, node, typeChecker) {
					return true
				}
				safe = false
				return false
			}
		case ast.IsPostfixUnaryExpression(candidate):
			if mutationLocalToNestedCallback(candidate, node, typeChecker) {
				return true
			}
			safe = false
			return false
		}
		return true
	})
	return safe
}

func safeDerivedCall(
	node *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	resolving map[ast.SymbolId]struct{},
) bool {
	call := node.AsCallExpression()
	if ast.IsIdentifier(call.Expression) {
		name := call.Expression.Text()
		if _, safe := safeDerivedScalarFunctions[name]; safe &&
			symbolIsOutsideSource(
				typeChecker.GetSymbolAtLocation(call.Expression),
				sourceFile,
			) {
			return true
		}
		if safeDerivedSignature(call, sourceFile, typeChecker) {
			return true
		}
		return safeLocalDerivedHelper(
			call.Expression,
			sourceFile,
			typeChecker,
			resolving,
		)
	}
	if !ast.IsPropertyAccessExpression(call.Expression) {
		return false
	}
	member := call.Expression.AsPropertyAccessExpression()
	name := member.Name().Text()
	receiverText := strings.TrimSpace(sourceText(sourceFile, member.Expression))
	if (receiverText == "Array" && name == "isArray") ||
		(receiverText == "JSON" && (name == "parse" || name == "stringify")) ||
		(receiverText == "Math" && safeMathMethod(name)) {
		return symbolIsOutsideSource(
			typeChecker.GetSymbolAtLocation(member.Expression),
			sourceFile,
		)
	}
	receiverType := typeChecker.GetTypeAtLocation(member.Expression)
	display := ""
	if receiverType != nil {
		display = typeChecker.TypeToString(receiverType)
	}
	if _, safe := safeDerivedStringMethods[name]; safe &&
		(display == "string" || strings.Contains(display, "String")) {
		return true
	}
	if _, safe := safeDerivedCollectionMethods[name]; safe &&
		(strings.HasSuffix(display, "[]") ||
			strings.Contains(display, "Array<") ||
			strings.Contains(display, "ReadonlyArray<") ||
			strings.HasPrefix(receiverText, "this.state.") ||
			strings.HasPrefix(receiverText, "this.props.")) {
		return true
	}
	return safeDerivedSignature(call, sourceFile, typeChecker)
}

func safeDerivedSignature(
	call *ast.CallExpression,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	signature := typeChecker.GetResolvedSignature(call.AsNode())
	if signature == nil || signature.Declaration() == nil {
		return false
	}
	declarationSource := ast.GetSourceFileOfNode(signature.Declaration())
	return declarationSource != nil &&
		strings.Contains(
			sourceText(declarationSource, signature.Declaration()),
			"@exact pure",
		)
}

func safeLocalDerivedHelper(
	expression *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
	resolving map[ast.SymbolId]struct{},
) bool {
	symbol := typeChecker.GetSymbolAtLocation(expression)
	if symbol == nil {
		return false
	}
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = typeChecker.GetAliasedSymbol(symbol)
	}
	if symbol == nil {
		return false
	}
	id := ast.GetSymbolId(symbol)
	if _, recursive := resolving[id]; recursive {
		return true
	}
	next := make(map[ast.SymbolId]struct{}, len(resolving)+1)
	for key := range resolving {
		next[key] = struct{}{}
	}
	next[id] = struct{}{}
	for _, declaration := range symbol.Declarations {
		var work *ast.Node
		switch {
		case ast.IsFunctionDeclaration(declaration):
			work = declaration.Body()
		case ast.IsVariableDeclaration(declaration):
			initializer := declaration.AsVariableDeclaration().Initializer
			if initializer != nil &&
				(ast.IsArrowFunction(initializer) ||
					ast.IsFunctionExpression(initializer)) {
				work = initializer.Body()
			}
		}
		if work != nil {
			declarationSource := ast.GetSourceFileOfNode(declaration)
			if declarationSource == nil {
				continue
			}
			return safeReactiveInitializerWithHelpers(
				work,
				declarationSource,
				typeChecker,
				next,
			)
		}
	}
	return false
}

func mutationLocalToNestedCallback(
	mutation *ast.Node,
	root *ast.Node,
	typeChecker *checker.Checker,
) bool {
	var target *ast.Node
	switch {
	case ast.IsBinaryExpression(mutation):
		target = mutation.AsBinaryExpression().Left
	case ast.IsPrefixUnaryExpression(mutation):
		target = mutation.AsPrefixUnaryExpression().Operand
	case ast.IsPostfixUnaryExpression(mutation):
		target = mutation.AsPostfixUnaryExpression().Operand
	}
	for target != nil && (ast.IsPropertyAccessExpression(target) ||
		ast.IsElementAccessExpression(target)) {
		if ast.IsPropertyAccessExpression(target) {
			target = target.AsPropertyAccessExpression().Expression
		} else {
			target = target.AsElementAccessExpression().Expression
		}
	}
	if target == nil || !ast.IsIdentifier(target) {
		return false
	}
	symbol := typeChecker.GetSymbolAtLocation(target)
	if symbol == nil {
		return false
	}
	for callback := mutation.Parent; callback != nil && callback != root; callback = callback.Parent {
		if !ast.IsArrowFunction(callback) && !ast.IsFunctionExpression(callback) {
			continue
		}
		for _, declaration := range symbol.Declarations {
			if declaration.Pos() >= callback.Pos() &&
				declaration.End() <= callback.End() {
				return true
			}
		}
		return false
	}
	return false
}

func safeMathMethod(name string) bool {
	switch name {
	case "abs", "acos", "acosh", "asin", "asinh", "atan", "atan2",
		"atanh", "cbrt", "ceil", "clz32", "cos", "cosh", "exp",
		"expm1", "floor", "fround", "hypot", "imul", "log", "log10",
		"log1p", "log2", "max", "min", "pow", "round", "sign", "sin",
		"sinh", "sqrt", "tan", "tanh", "trunc":
		return true
	default:
		return false
	}
}

// trackedCallbackCall recognizes a call whose selected signature explicitly
// permits the compiler to observe and reevaluate a callback. The annotation is
// read from the resolved parameter declaration so aliases and overload
// selection retain TypeScript's own call resolution semantics.
func trackedCallbackCall(
	node *ast.Node,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) bool {
	if sourceFile == nil || typeChecker == nil || !ast.IsCallExpression(node) {
		return false
	}
	call := node.AsCallExpression()
	if call.Arguments == nil {
		return false
	}
	signature := typeChecker.GetResolvedSignature(node)
	if signature == nil || signature.Declaration() == nil {
		return false
	}
	parameters := signature.Declaration().Parameters()
	for index, argument := range call.Arguments.Nodes {
		if index >= len(parameters) ||
			(!ast.IsArrowFunction(argument) && !ast.IsFunctionExpression(argument)) {
			continue
		}
		parameterText := sourceText(sourceFile, parameters[index])
		if strings.Contains(parameterText, "@exact track") {
			return true
		}
	}
	return false
}

func reactiveProvenance(value string) bool {
	return value == "state" || value == "props" || value == "context" ||
		value == "derived" || value == "cell"
}
