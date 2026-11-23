package exactcompiler

import (
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/parser"
)

func TestSourceIndexErasureDescent(t *testing.T) {
	for _, row := range []struct {
		name, source string
		recovered    bool
	}{
		{"component", `import type { Hidden } from "./types";
import { type Component, run } from "./core";
export type { Hidden as Public };
export { type Component, run };
export type * from "./types";
type Callback<T> = (value:T) => void;
interface Options<T> { run: Callback<T> }
export function Page(this:Component, options: Options<number>) {
	return () => <button onClick={() => { const v = run(); options.run(v as number) }}>Run</button>;
}`, false},
		{"recovered", `import {type Item as , value} from "./a";
export type {Item as };
function Page(){ return () => <span>{value(, )}</span> }`, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			file := parser.ParseSourceFile(ast.SourceFileParseOptions{FileName: "/page.tsx", Path: "/page.tsx"}, row.source, core.ScriptKindTSX)
			if (len(file.Diagnostics()) != 0) != row.recovered {
				t.Fatalf("unexpected parser diagnostics %v", file.Diagnostics())
			}
			var expected []*ast.Node
			walkNode(file.AsNode(), func(node *ast.Node) bool {
				expected = append(expected, node)
				return !ast.IsPartOfTypeNode(node)
			})
			visited := 0
			walkSourceIndex(file.AsNode(), nil, false, func(node, _ *ast.Node, erased, partOfType bool) {
				if visited >= len(expected) || node != expected[visited] || erased != semanticTypeOnly(node) || partOfType != ast.IsPartOfTypeNode(node) {
					t.Fatalf("index diverged at visit %d, %v at %d", visited, node.Kind, node.Pos())
				}
				visited++
			})
			if visited != len(expected) {
				t.Fatalf("visited %d of %d nodes", visited, len(expected))
			}
		})
	}
}
