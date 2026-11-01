package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// Invalid cyclic aliases cannot manufacture prototype purity. A cyclic branch
// also cannot hide a separate, source-visible prototype input.
func TestExplicitPrototypeAliasCycles(t *testing.T) {
	for _, test := range []struct {
		name, body            string
		prototype, incomplete bool
	}{
		{"cycle", `const a:unknown=b;const b:unknown=a;const probe=a;`, false, true},
		{"cycle-with-prototype", `const a:unknown=b;const b:unknown=a;const probe={cycle:a,prototype:Object.prototype};`, true, true},
		{"shared-plain", `const a={value:1};const probe={left:a,right:a};`, false, false},
		{"shared-prototype", `const a=Object.prototype;const probe={left:a,right:a};`, true, false},
		{"shadowed", `const Object={prototype:{value:1}};const probe=Object.prototype;`, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			session := NewSession()
			id := "/virtual/prototype-alias-" + test.name + ".ts"
			response := session.Execute(Request{Kind: "analyze", ID: id, Source: `export {};function fixture(){` + test.body + `}`, Diagnostics: "semantic"})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			for _, diagnostic := range response.Diagnostics {
				if diagnostic.Severity == "error" && diagnostic.Code != "TS2448" {
					t.Fatalf("unexpected source diagnostic: %#v", response.Diagnostics)
				}
			}
			found := false
			for _, project := range session.projects {
				walkNode(project.program.GetSourceFile(id).AsNode(), func(node *ast.Node) bool {
					if ast.IsVariableDeclaration(node) && node.Name() != nil && node.Name().Text() == "probe" {
						found = true
						query := sourceValueQuery{owner: project.callableCache.owner.values, remaining: 4096}
						result := accessorCandidates{}
						prototype := query.explicitObjectPrototype(node.Initializer(), nil, &result)
						if prototype != test.prototype || result.thenIncomplete != test.incomplete {
							t.Fatalf("prototype=%t incomplete=%t", prototype, result.thenIncomplete)
						}
					}
					return true
				})
			}
			if !found {
				t.Fatal("missing source probe")
			}
		})
	}
}
