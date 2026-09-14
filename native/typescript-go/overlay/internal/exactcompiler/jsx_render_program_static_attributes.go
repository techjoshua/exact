package exactcompiler

import (
	"html"
	"strings"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// plannedStaticRenderProgramAttribute separates server serialization proofs from client property work.
// A literal URL with an unambiguous safe prefix cannot match the runtime javascript: policy.
// Other protocols, expressions, custom elements, and client artifacts retain the existing operations.
func (lowering *jsxLowering) plannedStaticRenderProgramAttribute(tag string, name string, initializer *ast.Node) (string, string, bool) {
	if attribute, serialized, static := staticRenderProgramAttribute(tag, name, initializer); static {
		return attribute, serialized, true
	}
	if lowering.target != TargetServer || strings.Contains(tag, "-") || initializer == nil || !ast.IsStringLiteral(initializer) {
		return "", "", false
	}
	switch name {
	case "href", "src", "action", "formAction", "formaction":
	default:
		return "", "", false
	}
	value := initializer.AsStringLiteral().Text
	if !strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "./") && !strings.HasPrefix(value, "../") && !strings.HasPrefix(value, "#") &&
		!strings.HasPrefix(value, "https://") && !strings.HasPrefix(value, "http://") {
		return "", "", false
	}
	attribute := compiledSsrAttribute(tag, name).attribute
	return attribute, ` ` + attribute + `="` + html.EscapeString(value) + `"`, true
}
