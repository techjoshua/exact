package exactcompiler

import (
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
	"github.com/microsoft/typescript-go/internal/checker"
)

// analyzeIslandSubtreeActivation localizes approved intrinsic targets while
// broadening an unsplittable generated island for nested eager browser work.
func analyzeIslandSubtreeActivation(
	sourceFile *ast.SourceFile,
	root *ast.Node,
	typeChecker *checker.Checker,
	nodeIDs map[*ast.Node]string,
) ActivationDecision {
	opening := root
	if ast.IsJsxElement(root) {
		opening = root.AsJsxElement().OpeningElement
	}
	decision := ActivationDecision{Mode: "eager", Reasons: []ActivationReason{}, Targets: []ActivationTarget{}}
	if !ast.IsJsxFragment(root) {
		decision = analyzeIslandActivation(
			sourceFile,
			opening,
			typeChecker,
			islandActivationTargetID(sourceFile, root, nodeIDs),
		)
	}
	walkNode(root, func(candidate *ast.Node) bool {
		if candidate == opening ||
			(!ast.IsJsxOpeningElement(candidate) && !ast.IsJsxSelfClosingElement(candidate)) {
			return true
		}
		identity := fullJSXElementNode(candidate)
		child := analyzeIslandActivation(
			sourceFile,
			candidate,
			typeChecker,
			islandActivationTargetID(sourceFile, identity, nodeIDs),
		)
		if len(child.Reasons) != 0 {
			decision.Mode = "eager"
			decision.Reasons = append(decision.Reasons, child.Reasons...)
			decision.Reasons = append(
				decision.Reasons,
				activationReason("unsplittable-owner", candidate, strings.TrimSpace(
					sourceText(sourceFile, openingTag(candidate)),
				)),
			)
			decision.Targets = []ActivationTarget{}
			return true
		}
		if child.Mode == "interaction" && len(decision.Reasons) == 0 {
			decision.Targets = append(decision.Targets, child.Targets...)
		}
		return true
	})
	if len(decision.Reasons) != 0 || len(decision.Targets) == 0 {
		decision.Mode = "eager"
		decision.Targets = []ActivationTarget{}
	}
	return decision
}

func islandActivationTargetID(
	sourceFile *ast.SourceFile,
	node *ast.Node,
	nodeIDs map[*ast.Node]string,
) string {
	identity := nodeIDs[node]
	if identity == "" {
		identity = strconv.Itoa(node.Pos())
	}
	return exactStableID(sourceFile.FileName(), "element", identity)
}
