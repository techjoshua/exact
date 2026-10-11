package exactcompiler

import (
	"context"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
	"github.com/microsoft/TypeScript/tsc/internal/core"
	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

// Cache only scope-independent primitives. Compare every captured type with construction
// in an empty cache, including named, composite, generic and unique-symbol controls.
func TestMutationIntrinsicReusePreservesAuthoredTypes(t *testing.T) {
	request := Request{ID: "/virtual/intrinsics.ts", Source: `let first:number=1; let second:number=2; let text:string='x'; type Box={value:number}; let box:Box; let union:string|number; const unique=Symbol(); function generic<T>(input:T){return input;}`}
	project, diagnostics, err := newProjectState(request, request.ID)
	if err != nil || len(diagnostics) != 0 {
		t.Fatalf("project: %v %#v", err, diagnostics)
	}
	generation, err := project.advance(context.Background(), request.ID, request.Source)
	if err != nil {
		t.Fatal(err)
	}
	defer generation.release()
	emit := printer.NewEmitContext()
	lowering := &jsxLowering{checker: generation.checker, factory: emit.Factory}
	lowering.mutationFacts.initialize()
	printType := func(node *ast.Node) string {
		emitter := printer.NewPrinter(printer.PrinterOptions{NewLine: core.NewLineKindLF}, printer.PrintHandlers{}, emit)
		writer := printer.NewTextWriter("\n", 0)
		emitter.Write(node, nil, writer, nil)
		return writer.String()
	}
	expectedReusable := map[string]bool{"first": true, "second": true, "text": true, "box": false, "union": false, "unique": false, "input": false}
	seen := make(map[string]*ast.Node)
	walkNode(generation.sourceFile.AsNode(), func(node *ast.Node) bool {
		if !ast.IsVariableDeclaration(node) && !ast.IsParameterDeclaration(node) || !ast.IsIdentifier(node.Name()) {
			return true
		}
		name := node.Name().Text()
		expected, relevant := expectedReusable[name]
		if !relevant {
			return true
		}
		value := generation.checker.GetTypeAtLocation(node.Name())
		if reusableMutationIntrinsic(value) != expected {
			t.Fatalf("unexpected intrinsic eligibility for %s", name)
		}
		fresh := &jsxLowering{checker: generation.checker, factory: emit.Factory}
		fresh.mutationFacts.initialize()
		actual := lowering.authoredMutationType(node.Name())
		if printType(actual) != printType(fresh.authoredMutationType(node.Name())) {
			t.Fatalf("captured type changed for %s", name)
		}
		seen[name] = actual
		return true
	})
	if len(seen) != len(expectedReusable) || seen["first"] != seen["second"] {
		t.Fatal("fixture did not exercise primitive reuse and all scope-sensitive controls")
	}
	lowering.mutationFacts.seal()
	if lowering.mutationFacts.intrinsicTypes != nil {
		t.Fatal("checker type cache survived analysis sealing")
	}
}
