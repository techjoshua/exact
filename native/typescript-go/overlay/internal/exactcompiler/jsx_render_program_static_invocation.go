package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// staticServerInvocationSlots keeps shared literals inside HTML serialization. Component and
// structural child slots may expose object identity to authored code and remain request-local.
func staticServerInvocationSlots(build *renderProgramBuild) bool {
	for _, slot := range build.slots {
		if slot.kind == "component" || slot.kind == "child" {
			return false
		}
	}
	return true
}

// literalServerInvocationValue admits only compiler-owned trees with no authored references,
// evaluation effects, custom prototypes, or deferred work. They remain private to generated code.
func literalServerInvocationValue(value *ast.Node) bool {
	if value == nil {
		return false
	}
	switch value.Kind {
	case ast.KindStringLiteral, ast.KindNumericLiteral, ast.KindTrueKeyword, ast.KindFalseKeyword, ast.KindNullKeyword:
		return true
	case ast.KindArrayLiteralExpression:
		for _, item := range value.AsArrayLiteralExpression().Elements.Nodes {
			if !literalServerInvocationValue(item) {
				return false
			}
		}
		return true
	case ast.KindObjectLiteralExpression:
		for _, property := range value.AsObjectLiteralExpression().Properties.Nodes {
			if !ast.IsPropertyAssignment(property) ||
				(!ast.IsIdentifier(property.Name()) && !ast.IsStringLiteral(property.Name())) ||
				property.Name().Text() == "__proto__" ||
				!literalServerInvocationValue(property.AsPropertyAssignment().Initializer) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

// hoistStaticServerInvocation reuses value-only server input, never request output or ownership.
// The dependency keeps its compiled program reachable only while the invocation is retained.
func (lowering *jsxLowering) hoistStaticServerInvocation(position int, programName string, invocation *ast.Node) *ast.Node {
	f := lowering.factory
	if lowering.staticServerInvocations == nil {
		lowering.staticServerInvocations = make(map[int]string)
	}
	if name, exists := lowering.staticServerInvocations[position]; exists {
		return f.NewIdentifier(name)
	}
	if lowering.staticServerInvocationNames == nil {
		lowering.staticServerInvocationNames = sourceIdentifiers(lowering.sourceFile)
	}
	used := lowering.staticServerInvocationNames
	for _, name := range lowering.materializedNames {
		used[name] = struct{}{}
	}
	name := allocateGeneratedName(used, "__exact_server_invocation")
	lowering.staticServerInvocations[position] = name
	invocation = lowering.emitContext.AddSyntheticLeadingComment(invocation, ast.KindMultiLineCommentTrivia, " @__PURE__ ", false)
	lowering.renderProgramDefinitionNodes = append(lowering.renderProgramDefinitionNodes, namedRenderProgramDefinition{
		name: name, dependencies: []string{programName},
		node: f.NewVariableStatement(nil, f.NewVariableDeclarationList(f.NewNodeList([]*ast.Node{
			f.NewVariableDeclaration(f.NewIdentifier(name), nil, nil, invocation),
		}), ast.NodeFlagsConst)),
	})
	return f.NewIdentifier(name)
}
