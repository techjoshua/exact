package exactcompiler

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

func (lowering *jsxLowering) elementID(node *ast.Node) string {
	return exactStableID(
		lowering.sourceFile.FileName(),
		"element",
		lowering.nodeIDs[node],
	)
}

func (lowering *jsxLowering) dynamicID(node *ast.Node) string {
	return exactStableID(
		lowering.sourceFile.FileName(),
		"dynamic",
		lowering.nodeIDs[node],
	)
}

func expressionNodeIDs(sourceFile *ast.SourceFile) map[*ast.Node]string {
	result := make(map[*ast.Node]string)
	componentNames := make(map[*ast.Node]string)
	for _, candidate := range activeComponentCandidates(sourceFile) {
		componentNames[candidate.node] = candidate.name
	}
	var visit func(*ast.Node, string, bool)
	visit = func(node *ast.Node, path string, insideComponent bool) {
		if name, component := componentNames[node]; component &&
			!insideComponent {
			path = "component:" + name
			insideComponent = true
		}
		childIndex := 0
		node.ForEachChild(func(child *ast.Node) bool {
			childPath := fmt.Sprintf(
				"%s/%s:%d",
				path,
				strings.TrimPrefix(child.Kind.String(), "Kind"),
				childIndex,
			)
			childIndex++
			visit(child, childPath, insideComponent)
			return false
		})
		kind := strings.TrimPrefix(node.Kind.String(), "Kind")
		if node.Kind == ast.KindEndOfFile {
			kind = "EndOfFileToken"
		}
		result[node] = fmt.Sprintf(
			"%s:node:%s:%s",
			normalizedIdentityFilename(sourceFile.FileName()),
			path,
			kind,
		)
	}
	visit(sourceFile.AsNode(), "module", false)
	return result
}

func exactStableID(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, ":")))
	return "x" + base64.RawURLEncoding.EncodeToString(sum[:])[:22]
}
