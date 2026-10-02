package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
	"github.com/microsoft/TypeScript/tsc/internal/nodebuilder"
)

// taskDependencyType preserves source checking and portable executable context.
func (lowering *jsxLowering) taskDependencyType(location *ast.Node) *ast.Node {
	if location == nil || lowering.checker == nil || ast.NodeIsSynthesized(location) || location.Parent == nil {
		return lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword)
	}
	value := lowering.checker.GetTypeAtLocation(location)
	if value == nil {
		return lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword)
	}
	if typeNode := lowering.checker.TypeToTypeNode(value, location,
		nodebuilder.FlagsNoTruncation|nodebuilder.FlagsInTypeAlias, nil); typeNode != nil {
		// Source-owned checking retains every authored obligation. Self-contained
		// executable annotations preserve callback context without relocation hazards.
		if lowering.checking || portableTaskCaptureType(typeNode) {
			return typeNode
		}
	}
	// Generated artifacts can live in a different directory than their authored
	// source. Avoid emitting source-relative import() types in executable captures.
	// The checking projection above owns the corresponding authored constraints.
	return lowering.factory.NewKeywordTypeNode(ast.KindAnyKeyword)
}

// taskCallbackParameterType materializes authored callback inference before
// capture erasure can remove it. Recursive contexts need not expand indefinitely.
// The checking projection keeps implicit parameters and rejects missing context.
func (lowering *jsxLowering) taskCallbackParameterType(node *ast.Node, visitor *ast.NodeVisitor) *ast.Node {
	if lowering.checking || lowering.checker == nil || !ast.IsParameterDeclaration(node) ||
		node.Type() != nil || node.Parent == nil ||
		(!ast.IsArrowFunction(node.Parent) && !ast.IsFunctionExpression(node.Parent)) ||
		lowering.checker.GetContextualType(node.Parent, checker.ContextFlagsNone) == nil {
		return nil
	}
	typeNode := lowering.taskDependencyType(node)
	parameter := visitor.VisitEachChild(node).AsParameterDeclaration()
	return lowering.factory.UpdateParameterDeclaration(parameter, parameter.Modifiers(),
		parameter.DotDotDotToken, parameter.Name(), parameter.QuestionToken, typeNode, parameter.Initializer)
}

// taskCaptureTypeScope owns only parameters declared inside this annotation.
func taskCaptureTypeScope(node *ast.Node, bound map[string]bool) map[string]bool {
	callable := node.FunctionLikeData()
	if callable == nil || callable.TypeParameters == nil {
		return bound
	}
	parameters := callable.TypeParameters.Nodes
	scope := make(map[string]bool, len(bound)+len(parameters))
	for name := range bound {
		scope[name] = true
	}
	for _, parameter := range parameters {
		scope[parameter.Name().Text()] = true
	}
	return scope
}

// portableTaskCaptureType rejects references owned by the authored module or
// enclosing component. Parameters declared inside the annotation retain their
// lexical scope, so generic callbacks remain contextual without free type names.
func portableTaskCaptureType(typeNode *ast.Node) bool {
	var visit func(*ast.Node, map[string]bool) bool
	visit = func(node *ast.Node, bound map[string]bool) bool {
		if ast.IsTypeReferenceNode(node) {
			name := node.AsTypeReferenceNode().TypeName
			if !ast.IsIdentifier(name) || !bound[name.Text()] {
				return false
			}
		}
		if ast.IsTypeQueryNode(node) || ast.IsImportTypeNode(node) || node.Kind == ast.KindThisType {
			return false
		}
		bound = taskCaptureTypeScope(node, bound)
		return !node.ForEachChild(func(child *ast.Node) bool { return !visit(child, bound) })
	}
	return visit(typeNode, nil)
}
