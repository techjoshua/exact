package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// componentSpreadReceipt republishes the ordinary object copy made by JSX spreads inside an
// owned reactive range, including beneath cached keyed items. Copy evaluation and prop precedence
// remain ordinary JavaScript; the range retains the child instance and observes source reads.
// Both normal SSR and island fallbacks retain the same range for matching hydration.
func (lowering *jsxLowering) componentSpreadReceipt(identityNode, attributes, element *ast.Node) *ast.Node {
	if _, owned := lowering.componentContaining(identityNode); !owned || attributes == nil {
		return element
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			return lowering.call(lowering.names.dynamic, []*ast.Node{
				lowering.arrow(element),
				lowering.factory.NewStringLiteral(lowering.dynamicID(identityNode), ast.TokenFlagsNone),
			})
		}
	}
	return element
}
