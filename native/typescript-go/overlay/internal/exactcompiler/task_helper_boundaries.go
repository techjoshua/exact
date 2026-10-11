package exactcompiler

import (
	"path/filepath"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/scanner"
)

// taskHelperBoundaryDiagnostics reports proven view incompatibility and limited, identifiable
// identity/lifetime uncertainty. It analyzes helpers without rewriting their implementations.
func taskHelperBoundaryDiagnostics(source *ast.SourceFile, typeChecker *checker.Checker, tasks []Task, target Target, facts *sourceAnalysisFacts) []Diagnostic {
	if target == TargetServer || typeChecker == nil {
		return nil
	}
	var diagnostics []Diagnostic
	for _, component := range componentCandidates(source) {
		aliases := sourceStateAliases(component, typeChecker, facts)
		walkNode(component.node, func(node *ast.Node) bool {
			inside := false
			for _, task := range tasks {
				inside = inside || task.Readiness == "blocking" && task.Placement != "server" && node.Pos() >= task.WorkStart && node.End() <= task.WorkStart+task.WorkLength
			}
			if !inside {
				return true
			}
			if receiver, name := restrictedInvocationMember(node, typeChecker); receiver != nil {
				if _, owned := statePath(receiver, aliases.bySymbol, typeChecker, true); owned {
					symbol := typeChecker.GetPropertyOfType(typeChecker.GetTypeAtLocation(receiver), name)
					if symbol != nil {
						for _, declaration := range symbol.Declarations {
							file := ast.GetSourceFileOfNode(declaration)
							callableField := ast.IsPropertyDeclaration(declaration) && len(typeChecker.GetSignaturesOfType(typeChecker.GetTypeAtLocation(node), checker.SignatureKindCall)) != 0
							if declaration.Parent != nil && ast.IsClassLike(declaration.Parent) && (ast.IsMethodDeclaration(declaration) || ast.IsGetAccessorDeclaration(declaration) || ast.IsSetAccessorDeclaration(declaration) || callableField) && (file == nil || !strings.HasPrefix(filepath.Base(file.FileName()), "lib.")) {
								diagnostics = append(diagnostics, Diagnostic{Severity: "error", Code: "EXACT2230", Start: node.Pos(), Length: node.End() - node.Pos(), Message: "pending component state cannot invoke a class member through a state view. Call an ordinary helper with supported fields or stateAccess(state) as an argument, keeping the class receiver outside the transaction"})
								break
							}
						}
					}
				}
			}
			if !ast.IsCallExpression(node) {
				return true
			}
			call := node.AsCallExpression()
			symbol := restrictedHelperSymbol(call.Expression, typeChecker)
			if symbol == nil {
				return true
			}
			for _, work := range symbol.Declarations {
				declaration := work
				if ast.IsVariableDeclaration(work) {
					work = work.AsVariableDeclaration().Initializer
				}
				if work == nil || !ast.IsFunctionLike(work) || work.Body() == nil {
					continue
				}
				owned := map[ast.SymbolId]bool{}
				arguments := callArguments(node)
				for index, parameter := range work.Parameters() {
					if index >= len(arguments) || !ast.IsIdentifier(parameter.Name()) {
						break
					}
					argument := arguments[index]
					if _, state := statePath(argument, aliases.bySymbol, typeChecker, true); state && typeChecker.GetTypeAtLocation(argument).Flags()&(checker.TypeFlagsObject|checker.TypeFlagsAny) != 0 {
						if binding := typeChecker.GetSymbolAtLocation(parameter.Name()); binding != nil {
							owned[ast.GetSymbolId(binding)] = true
						}
					}
				}
				if len(owned) == 0 || stateViewAcknowledged(node, source) || stateViewAcknowledged(declaration, ast.GetSourceFileOfNode(work)) {
					continue
				}
				uncertain := false
				walkNode(work.Body(), func(part *ast.Node) bool {
					if ast.IsBinaryExpression(part) {
						binary := part.AsBinaryExpression()
						switch binary.OperatorToken.Kind {
						case ast.KindEqualsEqualsToken, ast.KindEqualsEqualsEqualsToken, ast.KindExclamationEqualsToken, ast.KindExclamationEqualsEqualsToken:
							for _, operand := range []*ast.Node{binary.Left, binary.Right} {
								if ast.IsIdentifier(operand) {
									binding := typeChecker.GetSymbolAtLocation(operand)
									uncertain = uncertain || binding != nil && owned[ast.GetSymbolId(binding)]
								}
							}
						}
					}
					if ast.IsReturnStatement(part) {
						value := part.AsReturnStatement().Expression
						if value != nil && ast.IsFunctionLike(value) {
							walkNode(value, func(capture *ast.Node) bool {
								if ast.IsIdentifier(capture) {
									binding := typeChecker.GetSymbolAtLocation(capture)
									uncertain = uncertain || binding != nil && owned[ast.GetSymbolId(binding)]
								}
								return !uncertain
							})
						}
					}
					return !uncertain
				})
				if uncertain {
					diagnostics = append(diagnostics, Diagnostic{Severity: "warning", Code: "EXACT2231", Start: node.Pos(), Length: node.End() - node.Pos(), Message: "helper compares or captures a pending state input. Views differ from original object identity and belong to the creating task. Use sameStateTarget() for storage comparison and pass a fresh view to later callbacks, or acknowledge these limits with @exact state-view on this call or helper"})
				}
			}
			return true
		})
	}
	return diagnostics
}

// stateViewAcknowledged suppresses only view uncertainty, never incompatible operations or policy errors.
func stateViewAcknowledged(node *ast.Node, source *ast.SourceFile) bool {
	if source == nil {
		return false
	}
	for parent := node.Parent; parent != nil && !ast.IsBlock(parent) && !ast.IsSourceFile(parent); parent = parent.Parent {
		if ast.IsExpressionStatement(parent) || ast.IsVariableDeclaration(parent) {
			node = parent
			break
		}
	}
	for _, directive := range collectDirectives(source.Text()) {
		if directive.Name == "state-view" && directive.Namespace == "exact" && directive.Start+directive.Length <= scanner.GetTokenPosOfNode(node, source, false) && dynamicDirectiveAttachesTo(&directive, node, source) {
			return true
		}
	}
	return false
}
