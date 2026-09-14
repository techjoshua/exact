package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// captureScalarRootAttributes removes a closed root's property object when exactly one property
// is dynamic and all others are literal strings. The dynamic expression stays in its eager slot;
// a shared factory reconstructs authored properties only for semantic-target composition. Retain
// the original slot reader for writer preparation and class proofs. Reject duplicate or special
// property names so moving static literals never changes object construction semantics.
func (lowering *jsxLowering) captureScalarRootAttributes(build *renderProgramBuild) {
	if !build.rootSsrClosed || len(build.rootSsrPlan) != 1 {
		return
	}
	var bag *ast.Node
	for _, slot := range build.slots {
		if slot.kind == "root-attributes" {
			bag = slot.reader
			break
		}
	}
	if bag == nil || !ast.IsObjectLiteralExpression(bag) {
		return
	}
	name := build.rootSsrPlan[0].property
	parameter := lowering.factory.NewIdentifier("__exactRootValue")
	properties := []*ast.Node{}
	seen := map[string]bool{}
	var dynamic *ast.Node
	for _, property := range bag.AsObjectLiteralExpression().Properties.Nodes {
		if !ast.IsPropertyAssignment(property) ||
			(!ast.IsIdentifier(property.Name()) && !ast.IsStringLiteral(property.Name())) {
			return
		}
		key := property.Name().Text()
		if seen[key] || key == "__proto__" {
			return
		}
		seen[key] = true
		value := property.AsPropertyAssignment().Initializer
		if key == name {
			dynamic = value
			properties = append(properties, lowering.factory.NewPropertyAssignment(nil, property.Name(), nil, nil, parameter))
		} else {
			if !ast.IsStringLiteral(value) {
				return
			}
			properties = append(properties, property)
		}
	}
	if dynamic == nil {
		return
	}
	build.rootScalarValue = dynamic
	build.rootScalarFactory = lowering.factory.NewArrowFunction(
		nil, nil,
		lowering.factory.NewNodeList([]*ast.Node{lowering.factory.NewParameterDeclaration(nil, nil, parameter, nil, nil, nil)}),
		nil, nil, lowering.factory.NewToken(ast.KindEqualsGreaterThanToken),
		lowering.factory.NewParenthesizedExpression(lowering.factory.NewObjectLiteralExpression(lowering.factory.NewNodeList(properties), false)),
	)
}
