package exactcompiler

import (
	"slices"
	"testing"
)

func TestLiteralDynamicImportsRemainDeferredDependencyEdges(t *testing.T) {
	request := Request{ID: "dynamic-imports.ts", Kind: "analyze", Source: "import type { Model } from './model.js';\n" +
		"export const load = () => import('./view.js');\n" +
		"export const template = () => import(`./template.js`);\n" +
		"export const opaque = (name: string) => import(name);\n" +
		"type DeferredType = typeof import('./types.js');",
	}
	response := NewSession().Execute(request)
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	imports := response.Analysis.Imports
	request.Kind = "module-imports"
	session := NewSession()
	if narrow := session.Execute(request); narrow.Error != "" || !slices.Equal(imports, narrow.Analysis.Imports) {
		t.Fatalf("discovery import mismatch: %s %#v", narrow.Error, narrow.Analysis.Imports)
	}
	request.Source = "export const load = () => import('./replacement.js');"
	if changed := session.Execute(request); len(changed.Analysis.Imports) != 1 || changed.Analysis.Imports[0].ModuleSpecifier != "./replacement.js" {
		t.Fatalf("discovery retained obsolete dependencies: %#v", changed.Analysis.Imports)
	}
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
