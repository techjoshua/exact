package exactcompiler

import "testing"

// Repeated syntax in one body needs one logical dependency on its actual Get
// owner. The body summary retains invocation effects, not another source walk.
func TestStagedFieldBodySourceExactRequiredOwner(t *testing.T) {
	const source = `declare function foreign():void;export function invoke(){return Object.defineProperty({},'run',{get value(){window;foreign();foreign();return 1}})}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/conditional-field-source.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatalf("source: %s %#v", response.Error, response.Diagnostics)
	}
	prefixes := 0
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name != "invoke" {
			continue
		}
		if !fact.staged.settled || fact.staged.operationsPending {
			t.Fatal("conditional body work did not settle")
		}
		for _, recipe := range fact.staged.operationRecipes {
			native := recipe.nativeGet
			if native == nil {
				continue
			}
			request := native.request
			request.producer = recipe.key
			parent, valid := fieldSourceParent(request)
			if !valid || recipe.key.kind != relativeDemandEffects {
				continue
			}
			roles, _ := fieldSourceRequests(parent)
			if !sameOperationRequest(request, roles.prototype) {
				continue
			}
			expected := native.request
			expected.producer.selector = sourceStagedOperationSelector{occurrence: native.descriptorGet, field: "value"}
			matches := 0
			for _, required := range recipe.delta.required {
				if required.producer.selector.occurrence == native.descriptorGet && required.producer.selector.field == "value" {
					if !sameOperationRequest(required, expected) {
						t.Fatal("body dependency lost original Get/Call/consumer/cut association")
					}
					matches++
				}
			}
			if !recipe.delta.extracted || matches != 1 {
				t.Fatal("body syntax expanded logical dependencies or became an empty prefix")
			}
			prefixes++
		}
	}
	if prefixes != len(reflectiveDescriptorKeys) {
		t.Fatalf("source role coverage=%d", prefixes)
	}
}
