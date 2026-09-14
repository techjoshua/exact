package exactcompiler

import "github.com/microsoft/TypeScript/tsc/internal/ast"

// planJSXAttributeSyntax relies on TypeScript's JSX parser and scanner to own tags,
// trivia, literals, templates, regular expressions, comments, and expression
// nesting. Parser recovery represents `{name}` in an attribute list as a JSX
// spread attribute with a missing `...`; the exact raw span distinguishes that
// recoverable shorthand from a valid spread or another malformed expression. Standard DOM
// casing shares this syntax pass so synchronized and individual sources bind identically.
func planJSXAttributeSyntax(fileName string, source string) []sourceEdit {
	sourceFile := parseNormalizationSource(fileName, source)
	edits := []sourceEdit{}
	native := !usesForeignJSXRuntime(sourceFile)
	walkNode(sourceFile.AsNode(), func(node *ast.Node) bool {
		if native {
			edits = append(edits, standardNativePropCasing(sourceFile, node)...)
		}
		if !ast.IsJsxSpreadAttribute(node) {
			return true
		}
		expression := node.AsJsxSpreadAttribute().Expression
		if expression == nil || !ast.IsIdentifier(expression) {
			return true
		}
		start := nodeTokenStart(sourceFile, node)
		expressionStart := nodeTokenStart(sourceFile, expression)
		expressionEnd := expression.End()
		if start < 0 || start >= len(source) || expressionStart != start+1 ||
			expressionEnd < expressionStart || expressionEnd >= len(source) ||
			expressionEnd+1 != node.End() || source[start] != '{' || source[expressionEnd] != '}' {
			return true
		}
		name := source[expressionStart:expressionEnd]
		edits = append(edits, sourceEdit{start: start, end: start, text: name + "="})
		return true
	})
	return edits
}
