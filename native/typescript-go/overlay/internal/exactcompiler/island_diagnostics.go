package exactcompiler

import (
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
		walkNode(candidate.node, func(node *ast.Node) bool {
			if insideTaskSpan(node.Pos(), tasks, component.Name) ||
				nodeInsideAnyIsland(node, islandNodes) {
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

func nodeInsideAnyIsland(node *ast.Node, islands []*ast.Node) bool {
	for _, island := range islands {
		if node.Pos() >= island.Pos() && node.End() <= island.End() {
			return true
		}
	}
	return false
}
