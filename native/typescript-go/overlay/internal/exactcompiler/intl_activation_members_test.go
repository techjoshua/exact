package exactcompiler

import (
	"path/filepath"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// Extraction must agree with native final property ownership, without evaluating
// dynamic keys or pretending an accessor is its returned value.
func TestIntlActivationMemberOwnership(t *testing.T) {
	for _, c := range []struct{ source, name, expected string }{
		{`{}`, "value", ""},
		{`{name:"count"}`, "value", ""},
		{`{value:count}`, "value", "count"},
		{`{['value']:count}`, "value", "count"},
		{"{[`value`]:count}", "value", "count"},
		{`{value}`, "value", "value"},
		{`{value:old,value:count}`, "value", "count"},
		{`{value:count,value:other}`, "value", "other"},
		{`{value:count,...options}`, "value", ""},
		{`{...options,value:count}`, "value", "count"},
		{`{value:count,[key]:other}`, "value", ""},
		{`{[key]:other,value:count}`, "value", "count"},
		{`{value:count,['unrelated']:other}`, "value", "count"},
		{`{value:count,2:other,[3]:other}`, "value", "count"},
		{`{value:count,get value(){return other}}`, "value", ""},
		{`{value:count,value(){return other}}`, "value", ""},
		{`{name:'old',name:'final'}`, "name", "'final'"},
		{`{name:'old',['name']:'final'}`, "name", "'final'"},
		{`{name:'old',...options}`, "name", ""},
		{`{...options,name:'final'}`, "name", "'final'"},
		{`{name:'old',[key]:'final'}`, "name", ""},
		{`{name:'old',name:dynamic}`, "name", "dynamic"},
	} {
		t.Run(c.source+c.name, func(t *testing.T) {
			source := parseNormalizationSource(filepath.Join(t.TempDir(), "activation.ts"), "const activation="+c.source+";")
			expression := source.Statements.Nodes[0].AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes[0].AsVariableDeclaration().Initializer
			result := intlActivationObjectMember(expression, c.name)
			actual := ""
			if result != nil {
				actual = source.Text()[result.Pos():result.End()]
			}
			if actual != c.expected {
				t.Fatalf("final member: %q, expected %q", actual, c.expected)
			}
			if result != nil && !ast.IsIdentifier(result) && !ast.IsStringLiteral(result) {
				t.Fatal("lost scalar member")
			}
		})
	}
}
