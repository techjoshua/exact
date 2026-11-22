package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"path/filepath"
	"strings"
)

// Invoked callback edges carry local and imported environment effects through the same graph.
// Unresolved callable inputs remain conservative until project linking establishes their owner.
func appendInvokedCallbackEffects(fact *callableFacts, facts []callableFacts, call *ast.Node, argument *ast.Node, argumentIndex int, source *ast.SourceFile, typeChecker *checker.Checker, nodeTargets map[*ast.Node]int, symbolTargets map[ast.SymbolId]int, imports externalImportBindings) {
	appendInvokedCallbackReferences(fact, facts, call, eagerCallbackReferences(argument, typeChecker), argumentIndex, source, typeChecker, nodeTargets, symbolTargets, imports)
}

func appendInvokedCallbackReferences(fact *callableFacts, facts []callableFacts, call *ast.Node, references []*ast.Node, argumentIndex int, source *ast.SourceFile, typeChecker *checker.Checker, nodeTargets map[*ast.Node]int, symbolTargets map[ast.SymbolId]int, imports externalImportBindings) {
	for referenceIndex, reference := range references {
		edge := CallEdge{ID: fmt.Sprintf("%s:callback:%d:%d:%d", fact.summary.ID, call.Pos(), argumentIndex, referenceIndex), Name: strings.TrimSpace(sourceText(source, reference))}
		symbol := resolvedCallableSymbol(callTargetSymbol(reference, typeChecker), typeChecker)
		target, resolved := nodeTargets[reference]
		if symbol != nil {
			fact.callSymbols[edge.ID] = ast.GetSymbolId(symbol)
			if index, exists := symbolTargets[ast.GetSymbolId(symbol)]; exists {
				target, resolved = index, true
			}
		}
		if resolved {
			targetNode := facts[target].node
			retainMapInputRole(fact, call, targetNode, argumentIndex, edge.ID)
			edge.componentReactiveProducer = argumentIndex == 0 && fact.summary.Kind == "component" &&
				enclosingCallableNode(targetNode) == fact.node && componentReactiveMember(call.Expression(), typeChecker)
			edge.TargetID = facts[target].summary.ID
			edge.Resolved = true
			fact.targets = append(fact.targets, target)
		} else {
			if imported, exists := externalImportForExpression(reference, imports, typeChecker); exists {
				edge.ModuleSpecifier = imported.moduleSpecifier
				edge.ExportName = imported.exportName
			}
			if environment := unresolvedCallEnvironment(reference, source, typeChecker, nil); environment != "" {
				description := edge.Name
				if environment == "unknown" {
					description = "unresolved call " + edge.Name
				}
				effect := environmentSource(environment, description, fact.summary.Name)
				effect.Opaque = environment == "unknown" && opaqueCallExpression(reference, typeChecker)
				fact.summary.DirectEffectSources = append(fact.summary.DirectEffectSources, effect)
			}
		}
		fact.callExpressions[edge.ID] = reference
		fact.contextReferences[edge.ID] = stableSourceCallableReference(reference, typeChecker)
		fact.summary.Calls = append(fact.summary.Calls, edge)
	}
}

// Native higher-order operations own specific callback slots. A callable thisArg or reduction
// seed is ordinary data. Unproven authored operation contracts retain conservative traversal.
func invokedCallbackArgument(node *ast.Node, index int, typeChecker *checker.Checker) (result bool) {
	expression := node.AsCallExpression().Expression
	operation := componentProtocolCallMember(expression, typeChecker)
	if name, member, dynamic := checkedComponentProtocolMember(operation, typeChecker); member && !dynamic && name == "map" && componentProtocolReceiverOwned(expression, typeChecker) {
		return index == 1 || index == 2
	}
	if !eagerCallbackCall(expression, typeChecker) {
		return index == 0
	}
	result = true
	defer func() {
		if recover() != nil {
			result = true
		}
	}()
	receiver, name := restrictedInvocationMember(unwrapSourceCallableReference(expression), typeChecker)
	var symbol *ast.Symbol
	if receiver != nil && name != "" {
		symbol = typeChecker.GetPropertyOfType(typeChecker.GetTypeAtLocation(receiver), name)
	} else {
		symbol = typeChecker.GetSymbolAtLocation(expression)
	}
	if symbol == nil || len(symbol.Declarations) == 0 {
		return true
	}
	for _, declaration := range symbol.Declarations {
		source := ast.GetSourceFileOfNode(declaration)
		if !standardLibrarySource(source) || declaration.Parent == nil || !ast.IsInterfaceDeclaration(declaration.Parent) {
			return true
		}
		file := filepath.Base(source.FileName())
		if !(strings.HasPrefix(file, "lib.es") && strings.HasSuffix(file, ".d.ts")) && file != "lib.dom.d.ts" && file != "lib.webworker.d.ts" {
			return true
		}
	}
	if name == "from" && standardFactoryMapperSymbol(symbol) {
		return index == 1
	}
	if name == "then" {
		return index < 2
	}
	return index == 0
}

// standardFactoryMapperSymbol proves the array factory contract before choosing its mapper slot.
// Callable input data and thisArg values are not invoked by standard from factories.
func standardFactoryMapperSymbol(symbol *ast.Symbol) bool {
	if symbol == nil || len(symbol.Declarations) == 0 {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if !standardLibrarySource(ast.GetSourceFileOfNode(declaration)) || declaration.Parent == nil || !ast.IsInterfaceDeclaration(declaration.Parent) {
			return false
		}
		owner := declaration.Parent.Name()
		if owner == nil || !strings.HasSuffix(owner.Text(), "ArrayConstructor") || !portableNativeContainerName(strings.TrimSuffix(owner.Text(), "Constructor")) {
			return false
		}
	}
	return true
}
