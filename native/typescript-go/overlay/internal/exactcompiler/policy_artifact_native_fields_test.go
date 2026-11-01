package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/checker"
)

// Native payload contracts and application-added stored fields are independent.
// Looking through a native container must not drop its authored augmentation.
func TestPolicyArtifactNativeStoredFields(t *testing.T) {
	for _, test := range []struct {
		name, declarations, valueType string
		secret                        bool
	}{
		{"array augmentation", `declare global{interface Array<T>{extra:Tagged}}`, "Array<string>", true},
		{"map augmentation", `declare global{interface Map<K,V>{extra:Tagged}}`, "Map<string,string>", true},
		{"readonly augmentation", `declare global{interface ReadonlyArray<T>{extra:Tagged}}`, "ReadonlyArray<string>", true},
		{"native payload", "", "Array<Tagged>", true},
		{"array public", "", "Array<string>", false},
		{"map public", "", "Map<string,string>", false},
		{"public augmentation", `declare global{interface Array<T>{extra:string}}`, "Array<string>", false},
		{"deferred augmentation", `declare global{interface Array<T>{extra:()=>Tagged}}`, "Array<string>", false},
		{"phantom public", `interface Phantom<T>{label:string}`, "Array<Phantom<Tagged>>", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `export {};interface Tagged{
/** @exact keep=secret */ value:string}
` + test.declarations + `;declare const candidate:` + test.valueType + `;`
			filename, err := normalizeFileName("native-stored-fields.ts", "")
			if err != nil {
				t.Fatal(err)
			}
			request := Request{Kind: "analyze", ID: filename, Source: source}
			project, diagnostics, err := newProjectState(request, filename)
			if err != nil || len(diagnostics) != 0 {
				t.Fatal(err, diagnostics)
			}
			generation, err := project.advance(context.Background(), filename, source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			if diagnostics := generation.checker.GetDiagnostics(context.Background(), generation.sourceFile); len(diagnostics) != 0 {
				t.Fatal(diagnostics)
			}
			var value *checker.Type
			walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
				if ast.IsVariableDeclaration(node) && ast.IsIdentifier(node.Name()) && node.Name().Text() == "candidate" {
					value = generation.checker.GetTypeAtLocation(node.Name())
				}
				return true
			})
			if value == nil {
				t.Fatal("selected candidate type missing")
			}
			if secret := secretArtifactOwnDataQualified(value, generation.checker, make(map[checker.TypeId]bool)); secret != test.secret {
				t.Fatalf("stored secret=%v want=%v", secret, test.secret)
			}
		})
	}
}
