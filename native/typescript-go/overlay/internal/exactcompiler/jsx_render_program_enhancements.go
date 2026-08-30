package exactcompiler

import "github.com/microsoft/typescript-go/internal/ast"

// Enhanced descendants retain an ordinary focused child range. The nested render program carries
// its own enhancement marker, so the surrounding finite intrinsic program neither interprets the
// enhancement nor needs to know what physical output crosses that range.
func (lowering *jsxLowering) renderProgramIntrinsicHasEnhancements(attributes *ast.Node) bool {
	if attributes == nil {
		return false
	}
	if len(lowering.enhancementImports.applications[attributes.Pos()].components) != 0 {
		return true
	}
	for _, property := range attributes.AsJsxAttributes().Properties.Nodes {
		if ast.IsJsxSpreadAttribute(property) {
			members := lowering.checker.GetTypeAtLocation(
				property.AsJsxSpreadAttribute().Expression,
			).Distributed()
			for _, member := range members {
				if lowering.checker.GetPropertyOfType(member, "__exactEnhancements") != nil {
					return true
				}
			}
			continue
		}
		if ast.IsJsxAttribute(property) &&
			jsxAttributeText(property.AsJsxAttribute().Name()) == "__exactEnhancements" {
			return true
		}
	}
	return false
}

// Materializes only the semantic intrinsic selected by enhancement planning. Its descendant values
// continue through their own compiler-selected programs and component targets; the surrounding
// range treats the complete enhanced value as opaque.
func (lowering *jsxLowering) lowerFocusedEnhancementBoundary(
	identityNode *ast.Node,
	opening *ast.Node,
	children *ast.NodeList,
) *ast.Node {
	previous := lowering.renderProgramFallback
	lowering.renderProgramFallback = true
	result := lowering.lowerOpeningLike(identityNode, opening, children)
	lowering.renderProgramFallback = previous
	return result
}
