package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// The producer must preserve distinct creating edges without entering either
// closure. A mutable finally capture stays a demand for completed writes.
func TestStagedReturnTemplateSourceProducer(t *testing.T) {
	source := `function factory(callback:()=>string){return ()=>callback()}
 function finalFactory(){let callback=()=> 'quiet';try{return ()=>callback()}finally{callback=()=>document.title}}
 function defaultFactory(callback:()=>string){return (value=callback())=>value}
 function lexicalDefault(this:{title:string}){return (value=this.title)=>value}
 function ordinary(){return function(this:{title:string}){return this.title}}
 function lexical(this:{title:string}){return ()=>this.title}
 const saved=factory(()=>document.title);const fresh=factory(()=> 'quiet');
 const holder={run:saved};holder.run=fresh;export const dormant=holder;
 const finalSaved=finalFactory();
 export function unknownFactory(flag:boolean,foreign:()=>string){if(flag)return ()=>foreign();return foreign}
 export function actualCall(){return saved()}`
	request := Request{Kind: "analyze", ID: "/virtual/staged-return-template.ts", Source: source}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatal(err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	owner := newExecutableBodyOwner(project, generation.checker)
	declarations := map[string]*ast.Node{}
	var calls []*ast.Node
	var use, finalCall *ast.Node
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if ast.IsFunctionDeclaration(node) {
			declarations[node.Name().Text()] = node
		}
		if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) {
			if node.Expression().Text() == "factory" {
				calls = append(calls, node)
			}
			if node.Expression().Text() == "saved" {
				use = node
			}
			if node.Expression().Text() == "finalFactory" {
				finalCall = node
			}
		}
		return true
	})
	templates := describeStagedReturnTemplates(declarations["factory"], owner.values)
	if len(templates) != 1 || templates[0].unknown || len(templates[0].captures) != 1 || len(calls) != 2 || use == nil {
		t.Fatal("lost source templates/captures/calls", templates)
	}
	var values []sourceStagedReturnedCallable
	for _, call := range calls {
		bound := describeStagedCreatingInputs(sourceRelativeInvocation{declaration: declarations["factory"], operation: call, cut: sourceRelativeCut{operation: call, reading: call}}, owner)
		if bound.unsupported != relativeInputsSupported {
			t.Fatal("C0 recipe gap", bound.unsupported)
		}
		value, ok := instantiateStagedReturnTemplate(templates[0], bound)
		if !ok {
			t.Fatal("missing original return association")
		}
		values = append(values, value)
	}
	for index, value := range values {
		plan := stagedReturnedCaptureInput(value, templates[0].captures[0], use, nil)
		if plan.unsupported != relativeInputsSupported || len(plan.bindings) != 1 || len(plan.bindings[0].sources) != 1 || plan.bindings[0].sources[0].expression != calls[index].AsCallExpression().Arguments.Nodes[0] {
			t.Fatal("capture rebound to another factory", plan)
		}
	}
	badCut := describeStagedCreatingInputs(sourceRelativeInvocation{declaration: declarations["factory"], operation: calls[0]}, owner)
	if badCut.unsupported != relativeInputsInvalidOwner {
		t.Fatal("C0 accepted absent original cut")
	}
	edge := &sourceRelativeInputEdge{request: sourceRelativeInvocation{declaration: values[0].creating.declaration, operation: values[0].creating.operation, use: values[0].creating.use, cut: values[0].creating.cut}}
	alternative, ok := stagedReturnedOperationAlternative(values[0], edge)
	if !ok || alternative.creating != edge || alternative.endpoint.returning != templates[0].returning || edge.delivered {
		t.Fatal("conversion manufactured binder delivery")
	}
	if _, ok := stagedReturnedOperationAlternative(values[1], edge); ok {
		t.Fatal("conversion accepted another factory edge")
	}
	if values[0].endpoint.creation == values[1].endpoint.creation {
		t.Fatal("distinct C0 edges collapsed")
	}
	if plan := stagedReturnedCaptureInput(values[0], templates[0].captures[0], nil, nil); plan.unsupported == relativeInputsSupported {
		t.Fatal("dormant capture activated")
	}
	final := describeStagedReturnTemplates(declarations["finalFactory"], owner.values)
	if len(final) != 1 || len(final[0].captures) != 1 {
		t.Fatal("missing finally capture", final)
	}
	// Only association is needed to test the explicit writer gap. This is not a
	// completed factory or binder response and supplies no write qualification.
	value, ok := instantiateStagedReturnTemplate(final[0], describeStagedCreatingInputs(sourceRelativeInvocation{declaration: declarations["finalFactory"], operation: finalCall, cut: sourceRelativeCut{operation: finalCall}}, owner))
	if !ok {
		t.Fatal("missing local capture association")
	}
	plan := stagedReturnedCaptureInput(value, final[0].captures[0], use, nil)
	if plan.unsupported != relativeInputsUnsupportedCapture || !plan.bindings[0].unknown || len(plan.bindings[0].sources) != 1 || plan.bindings[0].sources[0].returning != final[0].returning {
		t.Fatal("finally write gap falsely closed", plan)
	}
	unknown := describeStagedReturnTemplates(declarations["unknownFactory"], owner.values)
	if len(unknown) != 2 || unknown[0].callable == nil || !unknown[1].unknown {
		t.Fatal("known template lost beside unknown return", unknown)
	}
	observed := sourceObservedValue{value: sourceValue{node: templates[0].callable}, returned: templates[0].returning, scope: acquiredCallableScope{creators: map[*ast.Node]sourceValueCreation{declarations["factory"]: {invocation: calls[0], returning: templates[0].returning}}}}
	if _, ok := describeObservedStagedReturn(observed, templates[0], values[0].creating); !ok {
		t.Fatal("lost original observation handoff")
	}
	if _, ok := describeObservedStagedReturn(observed, templates[0], values[1].creating); ok {
		t.Fatal("observation borrowed another creating edge")
	}
	for _, name := range []string{"defaultFactory", "lexicalDefault"} {
		defaults := describeStagedReturnTemplates(declarations[name], owner.values)
		if len(defaults) != 1 || defaults[0].unknown || len(defaults[0].captures) != 1 {
			t.Fatal("parameter initializer lost creating capture", name, defaults)
		}
		role := defaults[0].captures[0]
		if name == "defaultFactory" && (role.kind != relativeRoleCapture || role.binding != declarations[name].Parameters()[0]) {
			t.Fatal("default callback lost factory formal", role)
		}
		if name == "lexicalDefault" && (role.kind != relativeRoleReceiver || role.declaration != declarations[name] || !role.lexical) {
			t.Fatal("default arrow lost lexical receiver", role)
		}
	}
	ordinary := describeStagedReturnTemplates(declarations["ordinary"], owner.values)
	lexical := describeStagedReturnTemplates(declarations["lexical"], owner.values)
	if len(ordinary) != 1 || len(ordinary[0].captures) != 0 || len(lexical) != 1 || len(lexical[0].captures) != 1 || lexical[0].captures[0].kind != relativeRoleReceiver {
		t.Fatal("ordinary and lexical receivers confused", ordinary, lexical)
	}
}

// Real binder publications authenticate the creating association. The consumer
// chooses the original callback donor, and refuses written formals and locals
// until the completed-activation writer owner delivers their contributions.
func TestStagedReturnedCaptureInvocationSource(t *testing.T) {
	for _, row := range []struct {
		name, body string
		supported  bool
	}{
		{"formal", `return ()=>callback()`, true},
		{"written-formal", `try{return ()=>callback()}finally{callback=()=>document.title}`, false},
		{"written-local", `let local=callback;try{return ()=>local()}finally{local=()=>document.title}`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function factory(callback:()=>string){` + row.body + `}const saved=factory(()=> 'quiet');const fresh=factory(()=>document.title);export const result=saved();`
			request := Request{Kind: "analyze", ID: "/virtual/staged-capture-use-" + row.name + ".ts", Source: source}
			project, diagnostics, err := newProjectState(request, request.ID)
			if err != nil || len(diagnostics) != 0 {
				t.Fatal(err, diagnostics)
			}
			generation, err := project.advance(context.Background(), request.ID, source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			owner := newExecutableBodyOwner(project, generation.checker)
			var factory, savedCall, freshCall, laterCall *ast.Node
			walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
				if ast.IsFunctionDeclaration(node) {
					factory = node
				}
				if ast.IsCallExpression(node) && ast.IsIdentifier(node.Expression()) {
					switch node.Expression().Text() {
					case "factory":
						if savedCall == nil {
							savedCall = node
						} else {
							freshCall = node
						}
					case "saved":
						laterCall = node
					}
				}
				return true
			})
			templates := describeStagedReturnTemplates(factory, owner.values)
			if len(templates) != 1 || len(templates[0].captures) != 1 || savedCall == nil || freshCall == nil || laterCall == nil {
				t.Fatal("missing source witness")
			}
			template := templates[0]
			var origin *ast.Node
			walkNode(template.callable, func(node *ast.Node) bool {
				if ast.IsCallExpression(node) {
					origin = node
				}
				return true
			})
			query := newSourceDependencyQuery(savedCall, generation.checker, owner, factory)
			creating := sourceRelativeInvocation{declaration: factory, operation: savedCall, use: query.effectUse(), cut: query.relativeInputCut(savedCall), actualsKnown: true}
			edge := &sourceRelativeInputEdge{}
			release, ok := query.beginSourceRelativeInputRequest(creating, edge)
			if !ok {
				t.Fatal("original binder request refused")
			}
			query.bindInputs(factory, savedCall, nil, &accessorCandidates{})
			release()
			if !edge.delivered {
				t.Fatal("missing original binder publication")
			}
			edge.relative = describeStagedCreatingInputs(creating, owner)
			value, ok := instantiateStagedReturnTemplate(template, edge.relative)
			if !ok {
				t.Fatal("missing return association")
			}
			alternative, ok := stagedReturnedOperationAlternative(value, edge)
			if !ok {
				t.Fatal("missing operation alternative")
			}
			demand, issued := describeStagedReturnedCaptureDemand(template, origin, owner.values)
			if !issued {
				t.Fatal("original capture demand not issued")
			}
			later := sourceRelativeInvocation{declaration: template.callable, operation: laterCall, cut: sourceRelativeCut{operation: laterCall, reading: laterCall}}
			plan := planStagedReturnedCaptureInvocation(alternative, demand, later, owner.values)
			if row.supported {
				if plan.unsupported != relativeInputsSupported || len(plan.bindings) != 1 || len(plan.bindings[0].sources) != 1 || plan.bindings[0].sources[0].expression != savedCall.AsCallExpression().Arguments.Nodes[0] {
					t.Fatal("lost or rebound original callback", plan)
				}
			} else if plan.unsupported != relativeInputsUnsupportedCapture || len(plan.bindings[0].sources) != 1 || plan.bindings[0].sources[0].creation != savedCall || plan.bindings[0].sources[0].returning != template.returning {
				t.Fatal("completed write requirement disappeared", plan)
			}
			bad := alternative
			bad.endpoint.creation = freshCall
			if planStagedReturnedCaptureInvocation(bad, demand, later, owner.values).unsupported == relativeInputsSupported {
				t.Fatal("accepted another creating call")
			}
			if planStagedReturnedCaptureInvocation(alternative, demand, sourceRelativeInvocation{}, owner.values).unsupported == relativeInputsSupported {
				t.Fatal("dormant exposure invoked capture")
			}
		})
	}
}

// describeStagedCreatingInputs is C0, a source recipe for an already selected
// ordinary direct Call. It never runs the binder or acquires an argument. Rich
// adapters must instead provide their original synchronous B/C response.
func describeStagedCreatingInputs(request sourceRelativeInvocation, bodyOwner *executableBodyOwner) sourceRelativeBoundInputs {
	bound := sourceRelativeBoundInputs{declaration: request.declaration, operation: request.operation, use: request.use, cut: request.cut}
	if bodyOwner == nil {
		bound.unsupported = relativeInputsInvalidOwner
		return bound
	}
	owner := bodyOwner.values
	call := request.operation
	if owner == nil || owner.checker == nil || call == nil || !ast.IsCallExpression(call) || call.AsCallExpression().QuestionDotToken != nil || !ast.IsIdentifier(call.Expression()) || request.cut.operation != call || request.cut.use != request.use {
		bound.unsupported = relativeInputsInvalidOwner
		return bound
	}
	symbol, implementation := stagedLexicalFunctionImplementation(call.Expression(), bodyOwner)
	if symbol == nil || implementation != request.declaration || owner.bindingWritten(symbol) {
		bound.unsupported = relativeInputsInvalidOwner
		return bound
	}
	request.actualsKnown, request.actuals = true, nil
	for index, actual := range restrictedInvocationArguments(call.AsCallExpression()) {
		request.actuals = append(request.actuals, sourceRelativeActual{expression: actual, ordinal: index, spread: ast.IsSpreadElement(actual), endpoint: sourceRelativeEndpoint{kind: relativeEndpointExpression, expression: actual, cut: request.cut}})
	}
	plan := planSourceRelativeInputs(request, owner)
	bound.bindings, bound.unsupported = plan.bindings, plan.unsupported
	// C0 supplies source endpoints, not a binder-observed missing-value or
	// default decision. Omitted inputs need their original binder handoff.
	for index := range bound.bindings {
		binding := &bound.bindings[index]
		if binding.target.kind == relativeRoleFormal && binding.target.slot >= len(request.actuals) {
			binding.sources, binding.unknown = nil, true
			if bound.unsupported == relativeInputsSupported {
				bound.unsupported = relativeInputsUnsupportedActual
			}
		}
	}
	return bound
}

// describeObservedStagedReturn detaches only a matching original observation.
// The borrowed inputs and capture maps are checked synchronously and never kept.
func describeObservedStagedReturn(observed sourceObservedValue, template sourceStagedReturnTemplate, creating sourceRelativeBoundInputs) (sourceStagedReturnedCallable, bool) {
	if observed.returned != template.returning || observed.value.node != template.callable {
		return sourceStagedReturnedCallable{}, false
	}
	creation := observed.scope.creators[template.declaration]
	if observed.value.capture != nil {
		creation = observed.value.capture.creators[template.declaration]
	}
	if creation.invocation != creating.operation {
		return sourceStagedReturnedCallable{}, false
	}
	return instantiateStagedReturnTemplate(template, creating)
}
