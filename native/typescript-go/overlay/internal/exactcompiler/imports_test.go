package exactcompiler

import (
	"testing"
)

func TestLiteralDynamicImportsRemainDeferredDependencyEdges(t *testing.T) {
	response := NewSession().Execute(Request{ID: "dynamic-imports.ts", Kind: "analyze", Source: "import type { Model } from './model.js';\n" +
		"export const load = () => import('./view.js');\n" +
		"export const template = () => import(`./template.js`);\n" +
		"export const opaque = (name: string) => import(name);\n" +
		"type DeferredType = typeof import('./types.js');",
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	imports := response.Analysis.Imports
	if len(imports) != 3 || imports[0].ModuleSpecifier != "./model.js" || !imports[0].TypeOnly || imports[0].Dynamic {
		t.Fatalf("unexpected static/deferred dependencies: %#v", imports)
	}
	for index, specifier := range []string{"./view.js", "./template.js"} {
		edge := imports[index+1]
		if edge.ModuleSpecifier != specifier || !edge.Dynamic || !edge.RuntimeBinding || edge.SideEffectOnly || edge.TypeOnly {
			t.Fatalf("deferred edge lost its semantics: %#v", edge)
		}
	}
}
