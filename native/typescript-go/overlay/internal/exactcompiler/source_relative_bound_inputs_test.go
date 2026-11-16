package exactcompiler

import (
	"context"
	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"testing"
)

// These checked source witnesses run the real binder and inspect its publication
// before the input frame can be released. No synthetic default decision is used.
func TestRelativeBoundInputSourceProducer(t *testing.T) {
	for _, row := range []struct {
		name, call string
		selection  sourceRelativeDefaultSelection
		tail       bool
		slots      int
	}{
		{"missing", `invoke()`, relativeDefaultRequired, false, 0},
		{"undefined", `invoke(undefined)`, relativeDefaultRequired, false, 0},
		{"supplied", `invoke(safe,browser,safe)`, relativeDefaultBypassed, false, 2},
		{"unknown", `invoke(foreign)`, relativeDefaultConditional, false, 0},
		{"unknown-apply", `invoke.apply(undefined,foreignVector)`, relativeDefaultConditional, true, 1},
		{"spread", `invoke(safe,...foreignVector,browser)`, relativeDefaultBypassed, true, 2},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `function browser(){return document.title}function safe(){return 'safe'}declare const foreign:()=>string;declare const foreignVector:(()=>string)[];function invoke(first=browser,...rest:(()=>string)[]){return first()}export const value=` + row.call + `;`
			request := Request{Kind: "analyze", ID: "/virtual/relative-bound-" + row.name + ".ts", Source: source}
			project, diagnostics, err := newProjectState(request, request.ID)
			if err != nil || len(diagnostics) != 0 {
				t.Fatal(err, diagnostics)
			}
			generation, err := project.advance(context.Background(), request.ID, source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			var declaration, call *ast.Node
			walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
				if ast.IsFunctionDeclaration(node) && node.Name().Text() == "invoke" {
					declaration = node
				}
				if ast.IsCallExpression(node) && enclosingCallableNode(node) == nil {
					call = node
				}
				return true
			})
			if declaration == nil || call == nil {
				t.Fatal("missing source binder witness")
			}
			owner := newExecutableBodyOwner(project, generation.checker)
			query := newSourceDependencyQuery(call, generation.checker, owner, declaration)
			relative := sourceRelativeInvocation{declaration: declaration, operation: call, use: call, actualsKnown: row.name != "unknown-apply", cut: sourceRelativeCut{operation: call, use: call}}
			for index, actual := range restrictedInvocationArguments(call.AsCallExpression()) {
				relative.actuals = append(relative.actuals, sourceRelativeActual{expression: actual, ordinal: index, spread: ast.IsSpreadElement(actual)})
			}
			query.relativeInputRequest = &relative
			query.relativeInputIssuer = query
			publications := 0
			var published sourceRelativeBoundInputs
			query.relativeInputConsumer = func(value sourceRelativeBoundInputs) { publications++; published = value }
			if row.name == "missing" {
				// Matching source identities and a copied callback do not transfer
				// the original query's live synchronous issuer borrow.
				copied := *query
				copied.bindInputs(declaration, call, nil, &accessorCandidates{})
				if publications != 0 {
					t.Fatal("copied query inherited binder publication rights")
				}
				query.relativeInputIssuer = nil
				query.bindInputs(declaration, call, nil, &accessorCandidates{})
				if publications != 0 {
					t.Fatal("query without issuer published binder inputs")
				}
				query.relativeInputIssuer = query
			}
			inputs := query.bindInputs(declaration, call, nil, &accessorCandidates{})
			if published.unsupported != relativeInputsSupported {
				t.Fatalf("source binder description unmigrated: %v", published.unsupported)
			}
			if publications != 1 || len(published.defaults) != 1 || published.defaults[0].selection != row.selection {
				t.Fatalf("publication count %d defaults %+v", publications, published.defaults)
			}
			if len(published.rest) != 1 || published.rest[0].unknownTail != row.tail || len(published.rest[0].slots) != row.slots {
				t.Fatalf("rest %+v", published.rest)
			}
			if row.tail {
				for _, slot := range published.rest[0].slots {
					if !slot.unknownPosition {
						t.Fatal("unknown vector/spread fabricated exact rest index")
					}
				}
			}
			if row.name == "supplied" {
				role := published.rest[0].formal
				plan := substituteSourceRelativeInvokedInput(published, role, []string{"1"})
				if plan.unsupported != relativeInputsSupported || len(plan.bindings) != 1 || len(plan.bindings[0].sources) != 1 || plan.bindings[0].unknown {
					t.Fatal("source rest projection lost selected callback", plan)
				}
				node := plan.bindings[0].sources[0].expression
				if node == nil || !(ast.IsIdentifier(node) && node.Text() == "safe" || node.Name() != nil && callableNameText(node.Name()) == "safe") {
					t.Fatal("source rest projection selected dormant browser sibling")
				}
			}
			if len(published.bindings) < 2 || len(published.bindings[1].pending) != 0 {
				t.Fatal("missing formal or fabricated pending producer")
			}
			// Mutating the original source plan cannot change detached projections.
			symbol := generation.checker.GetSymbolAtLocation(declaration.Parameters()[0].Name())
			inputs.bindings[ast.GetSymbolId(symbol)] = nil
			inputs.defaults = nil
			if published.defaults[0].selection != row.selection {
				t.Fatal("publication retained default map")
			}
		})
	}
}

// Saved callables publish capture donors from their selected completed creation,
// even after another value replaces the original member at the current cut.
// Completed writes remain relative obligations for the live-read owner, rather
// than being misreported as settled initial capture values.
func TestRelativeBoundCaptureSourceProducer(t *testing.T) {
	for _, row := range []struct{ name, initial, completion, want string }{
		{"saved-browser", "browser", "", "browser"},
		{"saved-safe", "safe", "", "safe"},
		{"completed-finally", "browser", "finally{read=safe}", "safe"},
		{"completed-before-return", "browser", "before", "safe"},
	} {
		t.Run(row.name, func(t *testing.T) {
			factory := `return function invoke(){return read()}`
			if row.completion == "before" {
				factory = `read=safe;` + factory
			} else if row.completion != "" {
				factory = `try{` + factory + `}` + row.completion
			}
			source := `function browser(){return document.title}function safe(){return 'safe'}function make(read:()=>string){` + factory + `}const box={read:make(` + row.initial + `)};const saved=box.read;box.read=make(safe);export const value=saved();`
			request := Request{Kind: "analyze", ID: "/virtual/relative-capture-" + row.name + ".ts", Source: source}
			project, diagnostics, err := newProjectState(request, request.ID)
			if err != nil || len(diagnostics) != 0 {
				t.Fatal(err, diagnostics)
			}
			generation, err := project.advance(context.Background(), request.ID, source)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			var declaration, call, capture *ast.Node
			walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
				if ast.IsFunctionExpression(node) && node.Name() != nil && node.Name().Text() == "invoke" {
					declaration = node
				}
				if ast.IsFunctionDeclaration(node) && node.Name().Text() == "make" {
					capture = node.Parameters()[0]
				}
				if ast.IsCallExpression(node) && ast.IsIdentifier(node.AsCallExpression().Expression) && node.AsCallExpression().Expression.Text() == "saved" {
					call = node
				}
				return true
			})
			if declaration == nil || call == nil || capture == nil {
				t.Fatal("missing capture witness")
			}
			owner := newExecutableBodyOwner(project, generation.checker)
			query := newSourceDependencyQuery(call, generation.checker, owner, declaration)
			relative := sourceRelativeInvocation{declaration: declaration, operation: call, use: call, actualsKnown: true, captures: []sourceRelativeBinding{{target: sourceRelativeRole{kind: relativeRoleCapture, declaration: declaration, binding: capture}}}}
			query.relativeInputRequest = &relative
			query.relativeInputIssuer = query
			var published []sourceRelativeBoundInputs
			query.relativeInputConsumer = func(value sourceRelativeBoundInputs) { published = append(published, value) }
			query.consumeInvocation(call, nil, sourceInvocationConsumer{body: func(*ast.Node, sourceValueBindings, *sourceValueInputs, *ast.Node, *accessorCandidates) {}})
			if row.completion != "" {
				if len(published) == 0 {
					t.Fatal("missing completed capture publication")
				}
				for _, value := range published {
					if value.unsupported != relativeInputsUnsupportedCapture {
						t.Fatal("written capture reported settled", value.unsupported)
					}
					for _, binding := range value.bindings {
						if binding.target.kind == relativeRoleCapture && (len(binding.sources) != 1 || binding.sources[0].kind != relativeEndpointRole || binding.sources[0].creation == nil || len(binding.pending) != 0) {
							t.Fatal("written capture lost relative obligation or fabricated pending")
						}
					}
				}
				return
			}
			found := false
			for _, value := range published {
				for _, binding := range value.bindings {
					if binding.target.kind != relativeRoleCapture {
						continue
					}
					for _, endpoint := range binding.sources {
						node := endpoint.expression
						if node != nil && ((ast.IsIdentifier(node) && node.Text() == row.want) || (node.Name() != nil && callableNameText(node.Name()) == row.want)) {
							found = true
						}
					}
				}
			}
			if !found {
				t.Fatalf("lost selected %s capture: %+v", row.want, published)
			}
		})
	}
}
