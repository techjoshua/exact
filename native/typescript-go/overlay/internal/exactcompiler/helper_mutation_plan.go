package exactcompiler

import (
	"crypto/sha256"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// helperMutationPlan retains source identities only for this exact-paired compilation.
// Entries share their ordinary callable's module. No library or runtime registry is published.
type helperMutationPlan struct {
	entries         map[string]helperMutationEntry
	calls           map[string]string
	sources         []HelperSource
	selectedSources bool
}

type helperMutationEntry struct {
	node          *ast.Node
	source        *ast.SourceFile
	name          string
	writes        []StateWrite
	nativeTargets map[SourceSpan]*ast.Node
}

// HelperSource is an ephemeral resolved executable edge, not package helper metadata.
type HelperSource struct {
	ModuleSpecifier string `json:"moduleSpecifier"`
	SourceFile      string `json:"sourceFile"`
}

// directScalarHelper accepts module-owned immutable bodies whose parameter writes can
// use the shared selected-reference planner. Nested execution owners remain separate.
func directScalarHelper(fact *callableFacts, c *checker.Checker) bool {
	node := fact.node
	if fact.summary.Kind != "function" || node.Body() == nil || fact.sourceFile.IsDeclarationFile || !ast.IsExternalModule(fact.sourceFile) {
		return false
	}
	if ast.IsFunctionDeclaration(node) {
		if node.Parent != fact.sourceFile.AsNode() || node.Name() == nil || node.AsFunctionDeclaration().AsteriskToken != nil {
			return false
		}
	} else if ast.IsArrowFunction(node) || ast.IsFunctionExpression(node) {
		binding := sourceCallableBinding(node)
		if binding == nil || binding.Parent == nil || binding.Parent.Flags&ast.NodeFlagsConst == 0 || binding.Parent.Parent == nil || binding.Parent.Parent.Parent != fact.sourceFile.AsNode() {
			return false
		}
		// Named expressions own a self binding distinct from the ordinary module value.
		if ast.IsFunctionExpression(node) && (node.Name() != nil || node.AsFunctionExpression().AsteriskToken != nil) {
			return false
		}
	} else {
		return false
	}
	if helperReflectRoot(fact.sourceFile) == "" {
		return false
	}
	symbol := callableDeclarationSymbol(node, c)
	if symbol == nil || componentValueSymbolIsWrittenAfter(symbol, 0, fact.sourceFile, c) {
		return false
	}
	valid := true
	walkNode(node, func(current *ast.Node) bool {
		if ast.IsPartOfTypeNode(current) {
			return false
		}
		if current != node && (isCallableNode(current) || ast.IsClassDeclaration(current) || ast.IsClassExpression(current)) {
			valid = false
			return false
		}
		if ast.IsArrowFunction(node) {
			propertyName := current.Parent != nil && ast.IsPropertyAssignment(current.Parent) && current.Parent.Name() == current
			argumentsReference := ast.IsIdentifier(current) && current.Text() == "arguments" && !isStaticPropertyName(current) && !propertyName
			newTarget := current.Kind == ast.KindMetaProperty && current.AsMetaProperty().KeywordToken == ast.KindNewKeyword
			if current.Kind == ast.KindThisKeyword || newTarget || argumentsReference {
				valid = false
			}
		}
		if _, operation := stateWriteTarget(current, c); operation != "" && operation != "assignment" && operation != "update" && operation != "delete" && !selectedNativeArrayPush(current, c) {
			valid = false
		}
		return valid
	})
	return valid
}

// selectedHelperSymbol deliberately does not unwrap call/apply or arbitrary members.
// Effect resolution can describe those calls without proving the selected function.
func selectedHelperSymbol(expression *ast.Node, c *checker.Checker) *ast.Symbol {
	expression = unwrapSourceCallableReference(expression)
	if expression == nil || !ast.IsIdentifier(expression) {
		return nil
	}
	return sourceCallableSymbol(c.GetSymbolAtLocation(expression), c)
}

// helperMutationCallCandidate is the necessary syntactic form shared by discovery
// and the final planner. It grants no immutable binding or callable authority.
// Optional calls remain candidates here, while the existing planner refuses them.
func helperMutationCallCandidate(node *ast.Node) *ast.Node {
	if !ast.IsCallExpression(node) {
		return nil
	}
	if node.AsCallExpression().QuestionDotToken != nil {
		return node.AsCallExpression().Expression
	}
	expression := unwrapSourceCallableReference(node.AsCallExpression().Expression)
	if expression == nil || !ast.IsIdentifier(expression) {
		return nil
	}
	return expression
}

func planHelperMutations(source *ast.SourceFile, analysis callableAnalysis, c *checker.Checker) helperMutationPlan {
	plan := helperMutationPlan{entries: map[string]helperMutationEntry{}, calls: map[string]string{}, sources: []HelperSource{}}
	plan.selectedSources = analysis.owner != nil && analysis.owner.selection != nil
	for _, fact := range analysis.facts {
		if fact.summary.ownedScalarBlocked || len(fact.summary.StateWrites) == 0 {
			continue
		}
		finite := true
		for _, effect := range fact.summary.StateWrites {
			if effect.Receiver == nil || effect.Receiver.Kind != "parameter" || effect.Confidence != "exact" || effect.Operation != "" {
				finite = false
			}
		}
		if !finite {
			continue
		}
		digest := sha256.Sum256([]byte(fact.summary.ID))
		name := fmt.Sprintf("__exact_owned_%x", digest[:8])
		// Reserve against authored names rather than assuming the private prefix is unavailable.
		for strings.Contains(fact.sourceFile.Text(), name) {
			name += "_"
		}
		writes := []StateWrite{}
		nativeTargets := map[SourceSpan]*ast.Node{}
		parameters := parameterStateSymbols(fact.node, c)
		walkCallable(fact.node, func(node *ast.Node) bool {
			if nativeAssignmentTargetRole(node) == nativeAssignmentPattern {
				if ast.IsPropertyAccessExpression(node) || ast.IsElementAccessExpression(node) {
					if _, owned := parameterStateEffect(node, "write", parameters, c); owned {
						nativeTargets[nodeSourceSpan(node)] = node
					}
				}
				return true
			}
			if target, operation := stateWriteTarget(node, c); operation == "assignment" || operation == "update" || operation == "delete" || selectedNativeArrayPush(node, c) {
				// Assignment to a parameter binding stays local. Calls such as array push
				// still mutate the selected parameter value and retain their existing plan.
				if (operation == "assignment" || operation == "update") && ast.IsIdentifier(unwrapSourceCallableReference(target)) {
					return true
				}
				if _, owned := parameterStateEffect(target, "write", parameters, c); owned {
					writes = append(writes, StateWrite{Operation: operation, Start: node.Pos(), Length: node.End() - node.Pos()})
				}
			}
			return true
		})
		plan.entries[fact.summary.ID] = helperMutationEntry{node: fact.node, source: fact.sourceFile, name: name, writes: writes, nativeTargets: nativeTargets}
	}
	seen := map[string]bool{}
	walkNode(source.AsNode(), func(node *ast.Node) bool {
		expression := helperMutationCallCandidate(node)
		if expression == nil || node.AsCallExpression().QuestionDotToken != nil {
			return true
		}
		// Execution ownership and the existing immutable-binding proof still
		// choose the body. A syntax candidate alone supplies neither.
		var summary CallableSummary
		var ok bool
		if body, owned := analysis.owner.body(expression); owned {
			summary, ok = analysis.byNode[body]
		} else {
			// Unselected SDK compilations retain their existing immutable-alias proof.
			symbol := selectedHelperSymbol(expression, c)
			if symbol == nil {
				return true
			}
			summary, ok = analysis.bySymbol[ast.GetSymbolId(symbol)]
		}
		entry, eligible := plan.entries[summary.ID]
		if !ok || !eligible {
			return true
		}
		plan.calls[nodeSpanKey(node)] = summary.ID
		if entry.source != source && !seen[entry.source.FileName()] {
			seen[entry.source.FileName()] = true
			specifier := helperSourceSpecifier(source, entry.source, plan.selectedSources)
			plan.sources = append(plan.sources, HelperSource{ModuleSpecifier: specifier, SourceFile: entry.source.FileName()})
		}
		return true
	})
	return plan
}

func helperSourceSpecifier(from, to *ast.SourceFile, selected bool) string {
	relative, _ := filepath.Rel(filepath.Dir(from.FileName()), to.FileName())
	relative = filepath.ToSlash(relative)
	if !strings.HasPrefix(relative, ".") {
		relative = "./" + relative
	}
	// Host-selected imports must name the exact acquired executable source. The
	// unselected portable SDK path retains its existing emitted JS suffix contract.
	if selected {
		return relative
	}
	// The resolved source remains authoritative even when the emitted specifier uses JS.
	extension := filepath.Ext(relative)
	runtimeExtension := ".js"
	switch strings.ToLower(extension) {
	case ".mts", ".mjs":
		runtimeExtension = ".mjs"
	case ".cts", ".cjs":
		runtimeExtension = ".cjs"
	}
	return strings.TrimSuffix(relative, extension) + runtimeExtension
}

// helperReflectRoot selects an unshadowed intrinsic reference for the private wrapper.
// Authored references inside the cloned body retain their own module bindings.
func helperReflectRoot(source *ast.SourceFile) string {
	shadowed := func(name string) bool {
		symbol := source.AsNode().Locals()[name]
		return symbol != nil && symbol.Flags&(ast.SymbolFlagsValue|ast.SymbolFlagsAlias) != 0
	}
	if !shadowed("Reflect") {
		return "Reflect"
	}
	if !shadowed("globalThis") {
		return "globalThis"
	}
	return ""
}

// selectedNativeArrayPush admits only the existing typed push operation, never an immutable callee assumption.
func selectedNativeArrayPush(node *ast.Node, c *checker.Checker) bool {
	if !ast.IsCallExpression(node) || node.Flags&ast.NodeFlagsOptionalChain != 0 {
		return false
	}
	_, method := restrictedInvocationMember(unwrapSourceCallableReference(node.AsCallExpression().Expression), c)
	if method != "push" {
		return false
	}
	_, operation := stateWriteTarget(node, c)
	return operation == "array-mutation"
}
