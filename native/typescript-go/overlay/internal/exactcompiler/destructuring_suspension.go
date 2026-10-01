package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"strings"
)

// destructuringSuspension keeps an awaited RHS in its original callable. Its type-only reader
// is never invoked, so source checking retains destination obligations without evaluating twice.
type destructuringSuspension map[*ast.Node][]string

func (scopes destructuringSuspension) capture(source *ast.SourceFile, node *ast.Node, prefix string) string {
	var scope *ast.Node
	for parent := node.Parent; parent != nil; parent = parent.Parent {
		if ast.IsBlock(parent) {
			scope = parent
			break
		}
		if isCallableNode(parent) {
			scope = parent.Body()
			break
		}
	}
	if scope == nil {
		return ""
	}
	name := prefix + "_rhs"
	for containsIdentifier(scope, name) || containsIdentifier(scope, name+"_type") {
		name += "_"
	}
	text := normalizationNodeText(source, node.AsBinaryExpression().Right)
	scopes[scope] = append(scopes[scope], fmt.Sprintf("const %s_type = async () => (%s); let %s: Awaited<ReturnType<typeof %s_type>>;", name, text, name, name))
	return name
}

func (scopes destructuringSuspension) edits(source *ast.SourceFile, edits []sourceEdit) []sourceEdit {
	for scope, declarations := range scopes {
		prefix := strings.Join(declarations, " ") + " "
		if ast.IsBlock(scope) {
			position := nodeTokenStart(source, scope) + 1
			edits = append(edits, sourceEdit{start: position, end: position, text: prefix})
			continue
		}
		start := nodeTokenStart(source, scope)
		local := []sourceEdit{}
		retained := []sourceEdit{}
		for _, edit := range edits {
			if edit.start >= start && edit.end <= scope.End() {
				local = append(local, sourceEdit{start: edit.start - start, end: edit.end - start, text: edit.text})
			} else {
				retained = append(retained, edit)
			}
		}
		body := applySourceEdits(normalizationNodeText(source, scope), local)
		edits = append(retained, sourceEdit{start: start, end: scope.End(), text: "{ " + prefix + "return " + body + "; }"})
	}
	return edits
}
