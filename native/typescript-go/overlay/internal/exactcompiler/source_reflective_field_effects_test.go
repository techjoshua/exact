package exactcompiler

import (
	"context"
	"os"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// The existing original normal driver creates the operation and receiver scope.
// No field value, presence, getter frame or accounting result is assembled here.
// This qualifies producer accounting only, not staged field-debt admission.
func TestReflectiveFieldEffectsOriginalSourceOwner(t *testing.T) {
	for _, row := range []struct {
		name, descriptor     string
		getter, missingValue bool
	}{
		{"stored callback", `{value:()=>document.title}`, false, false},
		{"stored method", `{value(){document.title;return "stored"}}`, false, false},
		{"throwing getter", `{get value():never{window.name;throw 1}}`, true, true},
	} {
		t.Run(row.name, func(t *testing.T) {
			request := Request{Kind: "analyze", ID: "/virtual/reflective-field-effects.ts", Source: `export function read(){return Object.defineProperty({},'run',` + row.descriptor + `)}`}
			project, diagnostics, err := newProjectState(request, request.ID)
			if err != nil || len(diagnostics) != 0 {
				t.Fatal(err, diagnostics)
			}
			generation, err := project.advance(context.Background(), request.ID, request.Source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			analysis := collectProjectCallableEffects(project, generation.sourceFile, generation.checker, nil, nil, nil, nil, analyzeAssets(generation.sourceFile, generation.checker, request), nil)
			owner := project.callableCache.owner
			var body, call *ast.Node
			walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
				if ast.IsFunctionDeclaration(node) && node.Name() != nil && node.Name().Text() == "read" {
					body = node
				}
				if ast.IsCallExpression(node) && enclosingCallableNode(node) == body {
					call = node
				}
				return true
			})
			if body == nil || call == nil {
				t.Fatal("missing original source owner")
			}
			inputs := &sourceValueInputs{declaration: body, bindings: make(sourceValueBindings), returnedGets: make([]sourceGetReturn, 0)}
			query := &sourceValueQuery{owner: owner.values, executable: owner, effectOwner: body, inputs: inputs, active: make(map[*ast.Node]bool), remaining: 4096, operation: &sourceOperationContext{owner: body, inputs: inputs}}
			defer releaseNormalOperations(inputs)
			result := accessorCandidates{}
			query.executeInputs(body, inputs.bindings, &result, nil, inputs)
			var operation *sourceReflectiveOperation
			for _, candidate := range result.reflective {
				if candidate.operation == call {
					operation = candidate
				}
			}
			if operation == nil {
				t.Fatalf("original native owner missing, reflective=%d", len(result.reflective))
			}
			field, found := operation.fields["value"]
			if !found {
				t.Fatalf("original Has/Get producer unavailable: conversionIncomplete=%t frame=%t", operation.conversionIncomplete, operation.frame != nil)
			}
			if field.effects.has != sourceEffectsAccounted || field.effects.get != sourceEffectsAccounted || field.effects.getter != row.getter {
				t.Fatalf("execution accounting did not follow original Has/Get owner: %#v fieldIncomplete=%t values=%d", field.effects, field.incomplete, len(field.values))
			}
			if row.getter {
				if len(field.effects.invoked) != 1 || field.effects.invoked[0].operation != call || field.effects.invoked[0].alternative.endpoint.expression != restrictedInvocationArguments(call.AsCallExpression())[2] || field.effects.invoked[0].alternative.endpoint.cut.operation != call || field.effects.invoked[0].alternative.endpoint.cut.reading != call {
					t.Fatal("known original getter/receiver relationship lost")
				}
				known := false
				for _, fact := range analysis.facts {
					if fact.node != field.effects.invoked[0].declaration {
						continue
					}
					for _, effect := range fact.summary.EffectSources {
						known = known || effect.Environment == "browser" && effect.Description == "window"
					}
				}
				if !known {
					t.Fatal("published getter relationship did not select known window donor")
				}
			} else if len(field.effects.invoked) != 0 {
				t.Fatal("stored callback or method was activated")
			}
			if row.missingValue && (!field.incomplete || len(field.values) != 0 || operation.normal) {
				t.Fatal("accounted throwing getter manufactured a field value or normal completion")
			}
		})
	}
}

// This public consumer target remains RED on exact e80. Producer accounting
// alone cannot transport the required getter/receiver edge into its parent.
func TestReflectiveFieldEffectsPublicDonorAcceptance(t *testing.T) {
	if os.Getenv("EXACT_STAGED_NATIVE_FIELD_ACCEPTANCE") != "1" {
		t.Skip("unmigrated native field consumer target, known window donor required: set EXACT_STAGED_NATIVE_FIELD_ACCEPTANCE=1")
	}
	response := NewSession().Execute(Request{Kind: "analyze", ID: "/virtual/reflective-field-effects.ts", Source: `export function read(){return Object.defineProperty({},'run',{get value():never{window.name;throw 1}})}`, Diagnostics: "semantic"})
	if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
		t.Fatal(response.Error, response.Diagnostics)
	}
	summary := executableSummary(t, response, "read")
	window, document := false, false
	for _, effect := range summary.EffectSources {
		window = window || effect.Environment == "browser" && effect.Description == "window"
		document = document || effect.Environment == "browser" && effect.Description == "document"
	}
	if !window || document {
		t.Fatalf("known getter donor/dormant stored callback changed: window=%t document=%t sources=%#v", window, document, summary.EffectSources)
	}
}
