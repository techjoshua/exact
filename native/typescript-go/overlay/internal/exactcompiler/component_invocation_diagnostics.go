package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/scanner"
)

// borrowedComponentDiagnostics guards the authored use of an artifact entry point
// against executing setup on another instance's state and lifecycle slots.
func borrowedComponentDiagnostics(project *projectState, source *ast.SourceFile, values *sourceValueOwner) []Diagnostic {
	var diagnostics []Diagnostic
	c := values.checker
	for _, node := range values.index(source).calls {
		call := node.AsCallExpression()
		if call.Arguments == nil || len(call.Arguments.Nodes) == 0 {
			continue
		}
		instance := unwrapSourceCallableReference(call.Arguments.Nodes[0])
		if instance == nil || instance.Kind != ast.KindThisKeyword {
			continue
		}
		receiver, method := restrictedInvocationMember(unwrapSourceCallableReference(call.Expression), c)
		if method != "call" && method != "apply" {
			continue
		}
		receiver = unwrapSourceCallableReference(receiver)
		if receiver == nil || !ast.IsIdentifier(receiver) {
			continue
		}
		reference := c.GetSymbolAtLocation(receiver)
		symbol := resolvedCallableSymbol(reference, c)
		if symbol == nil || symbol.ValueDeclaration == nil {
			continue
		}
		declaration := symbol.ValueDeclaration
		body := declaration
		if ast.IsVariableDeclaration(declaration) {
			if declaration.Parent == nil || declaration.Parent.Flags&ast.NodeFlagsConst == 0 {
				continue
			}
			body = declaration.AsVariableDeclaration().Initializer
		} else if !ast.IsFunctionDeclaration(declaration) {
			continue
		}
		origin := ast.GetSourceFileOfNode(declaration)
		if origin == nil || origin.IsDeclarationFile {
			continue
		}
		for _, candidate := range projectComponentCandidates(project, origin) {
			if candidate.node != body || !componentCandidateIsModuleLevel(candidate) || !componentCandidateAcceptsProps(body) {
				continue
			}
			if !nativeFunctionInvocation(receiver, method, c) || values.bindingWritten(reference) || reference != symbol && values.bindingWritten(symbol) {
				break
			}
			start := scanner.GetTokenPosOfNode(node, source, false)
			diagnostics = append(diagnostics, Diagnostic{
				Severity: "error",
				Code: "EXACT_BORROWED_COMPONENT",
				Message: "Cannot invoke component " + candidate.name + " with ." + method + " on the current receiver. Use JSX to mount it with its own state and lifecycle, or extract an ordinary setup helper to share the current instance.",
				Start: start,
				Length: node.End() - start,
			})
			break
		}
	}
	return diagnostics
}
