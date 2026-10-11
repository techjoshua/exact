package exactcompiler

import (
	"fmt"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"reflect"
	"strings"
	"testing"
)

// Identity strings are a paired-artifact contract, including normalized Windows paths and
// component-local traversal roots. Compare every node against the original formatter.
func TestNodeIdentityIndexPreservesArtifactIdentity(t *testing.T) {
	for _, filename := range []string{"/virtual/components.tsx", "C:/App/Components.tsx", "//Server/Share/Components.tsx"} {
		source := parseNormalizationSource(filename, `export function First(){return()=> <><p>first</p><Second/></>}function Second(){return()=> <div/>}const Helper=(value:string)=><span>{value}</span>;`)
		expected := legacyNodeIdentityIndex(source)
		if actual := expressionNodeIDs(source); !reflect.DeepEqual(actual, expected) {
			t.Fatalf("identity changed for %s", filename)
		}
		for _, component := range collectComponentsWithIDs(source, expected) {
			node := nodeAtSpan(source.AsNode(), component.Start, component.Length)
			if component.ID != exactStableID(source.FileName(), expected[node]) {
				t.Fatal("component identity changed")
			}
		}
	}
}

func legacyNodeIdentityIndex(source *ast.SourceFile) map[*ast.Node]string {
	result := make(map[*ast.Node]string)
	names := make(map[*ast.Node]string)
	for _, candidate := range activeComponentCandidates(source) {
		names[candidate.node] = candidate.name
	}
	var visit func(*ast.Node, string, bool)
	visit = func(node *ast.Node, path string, inside bool) {
		if name, exists := names[node]; exists && !inside {
			path = "component:" + name
			inside = true
		}
		index := 0
		node.ForEachChild(func(child *ast.Node) bool {
			childPath := fmt.Sprintf("%s/%s:%d", path, strings.TrimPrefix(child.Kind.String(), "Kind"), index)
			index++
			visit(child, childPath, inside)
			return false
		})
		kind := strings.TrimPrefix(node.Kind.String(), "Kind")
		if node.Kind == ast.KindEndOfFile {
			kind = "EndOfFileToken"
		}
		result[node] = fmt.Sprintf("%s:node:%s:%s", normalizedIdentityFilename(source.FileName()), path, kind)
	}
	visit(source.AsNode(), "module", false)
	return result
}
