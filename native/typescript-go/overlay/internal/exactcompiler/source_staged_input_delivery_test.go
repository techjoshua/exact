package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The ordinary input consumer owns B once. Retaining that event must preserve
// its original creating Call, acquired source and separate relative recipe.
func TestStagedSourceInputConsumerRetainsOriginalBinder(t *testing.T) {
	const source = `const box={run:()=>{window.name;return 1}};function read(value:typeof box){return value.run()}export function invoke(){return read(box)}`
	session := NewSession()
	response := session.Execute(Request{Kind: "analyze", ID: "/virtual/input-delivery.ts", Source: source, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	found := false
	for _, fact := range stagedDeclarationFacts(session) {
		if fact.summary.Name != "invoke" {
			continue
		}
		for _, call := range fact.staged.calls {
			if call.invocation.declaration == nil || call.invocation.declaration.Name().Text() != "read" {
				continue
			}
			found = true
			edge := call.inputs
			if edge == nil || !edge.delivered || call.sourceInputs != nil || !sameSourceRelativeVector(call.invocation, edge.request) || !sameSourceRelativeInputEnvelope(edge.request, edge.bound) || !sameSourceRelativeInputEnvelope(edge.request, edge.relative) {
				t.Fatal("original input binder delivery lost or re-created")
			}
			if edge.request.operation != call.invocation.operation || edge.bound.cut.operation != call.invocation.operation || edge.bound.cut.reading != call.invocation.operation {
				t.Fatal("input packet retargeted to member read")
			}
			literal, recipe := false, false
			for _, binding := range edge.bound.bindings {
				if binding.target.kind == relativeRoleFormal && binding.target.slot == 0 {
					for _, endpoint := range binding.sources {
						literal = literal || ast.IsObjectLiteralExpression(endpoint.expression)
					}
				}
			}
			for _, binding := range edge.relative.bindings {
				if binding.target.kind == relativeRoleFormal && binding.target.slot == 0 {
					for _, endpoint := range binding.sources {
						recipe = recipe || ast.IsIdentifier(endpoint.expression) && endpoint.expression.Text() == "box"
					}
				}
			}
			if !literal || !recipe {
				t.Fatal("acquired input was conflated with its relative source recipe")
			}
			if !validStagedMemberActivationCall(call, call.invocation.declaration, call.invocation.operation) {
				t.Fatal("real original B was rejected solely because its input consumer retains legacy ownership")
			}
			var owner *sourceValueOwner
			for _, project := range session.projects {
				if project.callableCache != nil && project.callableCache.owner != nil {
					owner = project.callableCache.owner.values
				}
			}
			if owner == nil {
				t.Fatal("current original source owner missing")
			}
			for _, gap := range []sourceRelativeInputGap{relativeInputsUnsupportedActual, relativeInputsUnsupportedCapture, relativeInputsUnsupportedReceiver} {
				projected := cloneSourceRelativeBoundInputs(edge.bound)
				projected.unsupported = gap
				// Metadata variation protects demand-relative DATA projection,
				// not delivery authority. B above came from the original binder.
				plan, own := describeStagedStoredFormal(call.invocation.declaration.Parameters()[0].Name(), call.invocation.declaration, projected, owner)
				if !own || plan.unsupported != relativeInputsSupported || len(plan.bindings) != 1 {
					t.Fatal("another input role blocked this complete formal DATA binding")
				}
				for i := range projected.bindings {
					if projected.bindings[i].target.kind == relativeRoleFormal {
						projected.bindings[i].unknown = true
					}
				}
				plan, _ = describeStagedStoredFormal(call.invocation.declaration.Parameters()[0].Name(), call.invocation.declaration, projected, owner)
				if plan.unsupported == relativeInputsSupported || len(plan.bindings) != 1 || !plan.bindings[0].unknown {
					t.Fatal("the selected role's unknown source was cleared")
				}
			}

		}
	}
	if !found {
		t.Fatal("original source call association missing")
	}
}
