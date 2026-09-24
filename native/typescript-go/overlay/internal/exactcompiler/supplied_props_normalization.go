package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strconv"
	"strings"
)

// planSuppliedPropsNormalization exposes destructured component inputs before dependency analysis.
// Named derived locals then use the ordinary reactive compiler path instead of setup snapshots.
func planSuppliedPropsNormalization(fileName, source string) ([]sourceEdit, map[string]struct{}, error) {
	sourceFile := parseNormalizationSource(fileName, source)
	edits := []sourceEdit{}
	roots := make(map[string]struct{})
	for _, candidate := range componentCandidates(sourceFile) {
		component := candidate.node
		usesTarget := false
		walkNode(component, func(node *ast.Node) bool {
			if ast.IsJsxSelfClosingElement(node) && sourceText(sourceFile, openingTag(node)) == "_target" {
				usesTarget = true
			}
			return true
		})
		if !usesTarget && len(componentSignals(candidate, sourceFile)) == 0 {
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
			roots[input] = struct{}{}
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
				return nil, nil, fmt.Errorf("component %s props destructuring supports flat named fields, aliases, and defaults; nested, rest, and computed bindings require a named props parameter", candidate.name)
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
	return edits, roots, nil
}

// suppliedPropsBindingStatement recognizes only compiler-introduced props aliases in this pass.
func suppliedPropsBindingStatement(statement *ast.Node, roots map[string]struct{}) bool {
	if !ast.IsVariableStatement(statement) {
		return false
	}
	for root := range roots {
		if containsIdentifier(statement, root) {
			return true
		}
	}
	return false
}
