package exactcompiler

import (
	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
	"github.com/microsoft/typescript-go/internal/scanner"
)

type derivedElisionCandidate struct {
	binding        ReactiveBinding
	declaration    *ast.Node
	reference      *ast.Node
	component      *ast.Node
	consumerSymbol ast.SymbolId
	renderConsumer bool
}

// planDerivedBindings separates durable shared cells from safe calculations
// that can live in their sole reactive view consumer without creating a new
// identity. The source declaration remains the semantic definition and
// inspection range; elision is only an emitted-runtime optimization.
func planDerivedBindings(
	sourceFile *ast.SourceFile,
	bindings []ReactiveBinding,
	typeChecker *checker.Checker,
) (map[int]ReactiveBinding, map[int]ReactiveBinding) {
	declarations := make(map[int]*ast.Node)
	declarationSymbols := make(map[int]ast.SymbolId)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) {
			return true
		}
		name := node.AsVariableDeclaration().Name()
		if name != nil && ast.IsIdentifier(name) {
			declarations[name.Pos()] = node
			if typeChecker != nil {
				if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
					declarationSymbols[name.Pos()] = ast.GetSymbolId(symbol)
				}
			}
		}
		return true
	})
	retained := make(map[int]ReactiveBinding)
	if typeChecker == nil {
		for _, binding := range bindings {
			if binding.Provenance == "derived" && binding.SafeToReevaluate {
				if _, declared := declarations[binding.Start]; declared {
					retained[binding.Start] = binding
				}
			}
		}
		return retained, map[int]ReactiveBinding{}
	}
	components := make(map[string]*ast.Node)
	for _, component := range componentCandidates(sourceFile) {
		components[component.name] = component.node
	}
	candidates := make(map[ast.SymbolId]*derivedElisionCandidate)
	for _, binding := range bindings {
		if binding.Provenance != "derived" || !binding.SafeToReevaluate {
			continue
		}
		declaration := declarations[binding.Start]
		if declaration == nil {
			continue
		}
		retained[binding.Start] = binding
		if len(binding.References) != 1 ||
			!elidableDerivedValue(
				declaration.AsVariableDeclaration().Initializer,
				typeChecker,
			) {
			continue
		}
		symbol := declarationSymbols[binding.Start]
		component := components[binding.Component]
		if symbol == 0 || component == nil {
			continue
		}
		reference := derivedReferenceNode(
			component,
			symbol,
			binding.References[0],
			sourceFile,
			typeChecker,
		)
		if reference == nil {
			continue
		}
		if jsxTagNameReference(reference) {
			continue
		}
		candidates[symbol] = &derivedElisionCandidate{
			binding:     binding,
			declaration: declaration,
			reference:   reference,
			component:   component,
			renderConsumer: eagerRenderReference(
				reference,
				component,
				sourceFile,
				typeChecker,
			),
		}
	}
	for _, candidate := range candidates {
		if candidate.renderConsumer {
			continue
		}
		for current := candidate.reference.Parent; current != nil &&
			current != candidate.component; current = current.Parent {
			if !ast.IsVariableDeclaration(current) {
				continue
			}
			name := current.AsVariableDeclaration().Name()
			if name != nil && ast.IsIdentifier(name) {
				if symbol := typeChecker.GetSymbolAtLocation(name); symbol != nil {
					candidate.consumerSymbol = ast.GetSymbolId(symbol)
				}
			}
			break
		}
	}
	elidedSymbols := make(map[ast.SymbolId]struct{})
	changed := true
	for changed {
		changed = false
		for symbol, candidate := range candidates {
			if _, elided := elidedSymbols[symbol]; elided {
				continue
			}
			_, consumerElided := elidedSymbols[candidate.consumerSymbol]
			if !candidate.renderConsumer && !consumerElided {
				continue
			}
			elidedSymbols[symbol] = struct{}{}
			changed = true
		}
	}
	elided := make(map[int]ReactiveBinding, len(elidedSymbols))
	for symbol := range elidedSymbols {
		candidate := candidates[symbol]
		delete(retained, candidate.binding.Start)
		elided[candidate.binding.Start] = candidate.binding
	}
	return retained, elided
}

func jsxTagNameReference(node *ast.Node) bool {
	parent := node.Parent
	if parent == nil {
		return false
	}
	if ast.IsJsxOpeningElement(parent) {
		return parent.AsJsxOpeningElement().TagName == node
	}
	if ast.IsJsxSelfClosingElement(parent) {
		return parent.AsJsxSelfClosingElement().TagName == node
	}
	return false
}

func derivedReferenceNode(
	component *ast.Node,
	symbol ast.SymbolId,
	span SourceSpan,
	sourceFile *ast.SourceFile,
	typeChecker *checker.Checker,
) *ast.Node {
	var result *ast.Node
	walkNode(component, func(node *ast.Node) bool {
		if result != nil || !ast.IsIdentifier(node) ||
			ast.IsDeclarationName(node) || isStaticPropertyName(node) {
			return result == nil
		}
		current := typeChecker.GetSymbolAtLocation(node)
		if current == nil || ast.GetSymbolId(current) != symbol {
			return true
		}
		start := scanner.SkipTrivia(sourceFile.Text(), node.Pos())
		if start == span.Start && node.End()-start == span.Length {
			result = node
			return false
		}
		return true
	})
	return result
}

func scalarDerivedType(value *checker.Type) bool {
	if value == nil {
		return false
	}
	if value.Flags()&checker.TypeFlagsUnion != 0 {
		members := value.Types()
		if len(members) == 0 {
			return false
		}
		for _, member := range members {
			if !scalarDerivedType(member) {
				return false
			}
		}
		return true
	}
	scalars := checker.TypeFlagsStringLike |
		checker.TypeFlagsNumberLike |
		checker.TypeFlagsBooleanLike |
		checker.TypeFlagsBigIntLike |
		checker.TypeFlagsNull |
		checker.TypeFlagsUndefined
	return value.Flags()&scalars != 0
}

// elidableDerivedValue admits values whose identity does not depend on a fresh
// setup allocation. Type information is preferred, but isolated transforms do
// not necessarily load the Component declaration, so direct state/property
// reads and known scalar intrinsics also need a syntax-level proof.
func elidableDerivedValue(value *ast.Node, typeChecker *checker.Checker) bool {
	if value == nil {
		return false
	}
	if scalarDerivedType(typeChecker.GetTypeAtLocation(value)) {
		return true
	}
	switch {
	case ast.IsIdentifier(value),
		ast.IsPropertyAccessExpression(value),
		ast.IsElementAccessExpression(value):
		return true
	case ast.IsCallExpression(value):
		call := value.AsCallExpression()
		if ast.IsIdentifier(call.Expression) {
			_, scalar := safeDerivedScalarFunctions[call.Expression.Text()]
			return scalar
		}
		if !ast.IsPropertyAccessExpression(call.Expression) {
			return false
		}
		method := call.Expression.AsPropertyAccessExpression().Name().Text()
		switch method {
		case
			"every", "findIndex", "findLastIndex", "includes", "indexOf",
			"join", "lastIndexOf", "localeCompare", "reduce", "reduceRight",
			"some", "startsWith", "endsWith":
			return true
		}
	}
	return false
}
