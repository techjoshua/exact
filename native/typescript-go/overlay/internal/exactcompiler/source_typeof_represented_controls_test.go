package exactcompiler

import (
	"encoding/json"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"reflect"
	"testing"
)

// A canonical actual Get failure is used as the predecessor. This is a kernel
// completion-transport control, not a source outer-Call Throw producer claim.
func TestTypeofActualGetThrowKernel(t *testing.T) {
	o := newLanguageOwner()
	b := o.root()
	f := ast.NewNodeFactory(ast.NodeFactoryHooks{})
	ref := o.member(b, languageValue{node: f.NewToken(ast.KindNullKeyword)}, languageStringKey("value"))
	child := o.getReference(b, ref)
	if child.completion != languageThrow || child.value.text != "TypeError" {
		t.Fatal("canonical actual null Get did not throw")
	}
	ids := o.next
	work := languageCopyWork{}
	d := expressionSelectionOrdinary
	out := typeofSuccessor(child, child.value, nil, &work, &d)
	if !reflect.DeepEqual(out, child) || o.next != ids || work.used != 0 {
		t.Fatal("typeof evaluated/normalized actual abrupt child")
	}
}

func TestTypeofExistingArrayValueKernel(t *testing.T) {
	o := newLanguageOwner()
	b := o.root()
	work := languageCopyWork{}
	actual := o.allocateArray(b, nil, &work)
	if actual.completion != languageNormal || actual.value.object == nil || !actual.value.object.array {
		t.Fatal("existing actual array allocation")
	}
	ids := o.next
	answer, ok := acquiredTypeof(actual.branch, actual.value, &work)
	if !ok || answer != "object" || o.next != ids {
		t.Fatal("actual represented array classification")
	}
}

// typeofNestedSource keeps an actual same-shaped conditional sibling before
// the nested operand. Neither source identity nor the final output is replaced
// in the copied population challenges below.
func typeofNestedSource(take string) string {
	return `export {};const read=(take:boolean,v:number)=>((v=take?v:0),typeof(take?v:0));read(` + take + `,3);`
}

func typeofFollowupResponse(t *testing.T, response Response) {
	t.Helper()
	data, err := json.Marshal(response)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err = json.Unmarshal(data, &fields); err != nil {
		t.Fatal(err)
	}
	delete(fields, "timings")
	data, err = json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	t.Log("TYPEOFFOLLOWUPRESPONSE", string(data))
}
