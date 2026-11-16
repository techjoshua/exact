package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Population comes from the real canonical visitor. These operations must not
// disappear merely because no mutation-output provider has described them yet.
func TestOriginalGetterMutationPopulationRetainsImplicitWork(t *testing.T) {
	for _, row := range []struct {
		name, body string
		kind       sourceOriginalMutationBodyOperationKind
	}{
		{"comparison-left-get", "document.title === ''; return 1", originalMutationBodyGet},
		{"using-disposal", "using resource = { [Symbol.dispose]() { document.title } }; return 1", originalMutationBodyUnsupported},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := "/// <reference lib=\"esnext\" />\n/// <reference lib=\"dom\" />\nexport{};export function probe(value:object){Object.defineProperty(Object.prototype,'value',{configurable:true,get:function(){" + row.body + "}});return Object.getOwnPropertyDescriptor(value,'code')?.value===true}"
			withReflectiveRelevanceSource(t, source, func(initial *executableBodyOwner, file *ast.SourceFile) {
				cache, _ := prepareProjectCallableContexts(initial.project, file, initial.checker, nil, nil, nil, nil, assetAnalysis{}, nil)
				collection := beginProjectCallableCollection(cache, cache.owner)
				defer collection.close()
				collection.collect()
				collection.resolve(file)
				reached := false
				for _, fact := range collection.facts {
					if !ast.IsFunctionExpression(fact.node) {
						continue
					}
					for _, operation := range fact.staged.mutationBody.operations {
						if operation.kind != row.kind {
							continue
						}
						if row.name == "comparison-left-get" {
							reached = reached || sourceText(file, operation.node) == "document.title"
						} else {
							reached = reached || ast.IsVariableDeclarationList(operation.node) && operation.node.Flags&ast.NodeFlagsUsing != 0
						}
					}
				}
				if !reached {
					t.Fatal("original getter operation population omitted required work")
				}
			})
		})
	}
}
