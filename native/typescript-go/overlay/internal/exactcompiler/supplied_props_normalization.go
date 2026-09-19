package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strconv"
	"strings"
)

// planSuppliedPropsNormalization exposes destructured supplied inputs before dependency analysis.
// Named derived locals then use the ordinary reactive compiler path instead of setup snapshots.
func planSuppliedPropsNormalization(fileName, source string) []sourceEdit {
	sourceFile := parseNormalizationSource(fileName, source)
	edits := []sourceEdit{}
	for _, candidate := range componentCandidates(sourceFile) {
		component := candidate.node
		usesTarget := false
		walkNode(component, func(node *ast.Node) bool {
			if ast.IsJsxSelfClosingElement(node) && sourceText(sourceFile, openingTag(node)) == "_target" {
				usesTarget = true
			}
			return true
		})
		if !usesTarget {
			continue
		}
		for _, parameter := range component.Parameters() {
			name := parameter.Name()
			if name == nil || !ast.IsObjectBindingPattern(name) {
				continue
			}
			input := "__exactSuppliedProps"
			for index := 1; strings.Contains(source, input); index++ {
				input = "__exactSuppliedProps" + strconv.Itoa(index)
			}
			declarations := []string{}
			supported := true
			for _, node := range name.AsBindingPattern().Elements.Nodes {
				binding := node.AsBindingElement()
				if binding.DotDotDotToken != nil || !ast.IsIdentifier(binding.Name()) {
					supported = false
					break
				}
				key := binding.PropertyName
				if key == nil {
					key = binding.Name()
				}
				if !ast.IsIdentifier(key) && !ast.IsStringLiteral(key) {
					supported = false
					break
				}
				value := input + "[" + strconv.Quote(key.Text()) + "]"
				if binding.Initializer != nil {
					value = "(" + value + " === undefined ? (" + normalizationNodeText(sourceFile, binding.Initializer) + ") : " + value + ")"
				}
				declarations = append(declarations, "const "+binding.Name().Text()+" = "+value+";")
			}
			if !supported {
				continue
			}
			edits = append(edits, sourceEdit{start: nodeTokenStart(sourceFile, name), end: name.End(), text: input})
			body := component.Body()
			setup := strings.Join(declarations, " ")
			if ast.IsBlock(body) {
				position := nodeTokenStart(sourceFile, body) + 1
				edits = append(edits, sourceEdit{start: position, end: position, text: setup})
			} else {
				edits = append(edits, sourceEdit{start: nodeTokenStart(sourceFile, body), end: body.End(), text: "{ " + setup + " return " + normalizationNodeText(sourceFile, body) + "; }"})
			}
		}
	}
	return edits
}
