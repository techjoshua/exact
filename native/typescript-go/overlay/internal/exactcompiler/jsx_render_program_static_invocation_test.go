package exactcompiler

import (
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/printer"
)

func TestSessionHoistsOnlyLiteralServerInvocations(t *testing.T) {
	for _, test := range []struct {
		name, attributes string
		target           Target
		hoisted          bool
	}{
		{"static", `title="fixed"`, TargetServer, true},
		{"dynamic", `title={props.title}`, TargetServer, false},
		{"effect", `title={readTitle()}`, TargetServer, false},
		{"spread", `{...props}`, TargetServer, false},
		{"client", `title="fixed"`, TargetClient, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := NewSession().Execute(Request{ID: "static-invocation.tsx", Kind: "compile", Target: test.target,
				Source: `function readTitle() { return "read"; }
				export function Panel(props: {title: string}) { return () => <section ` + test.attributes + `>Content</section>; }`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, "const __exact_server_invocation_") != test.hoisted {
				t.Fatalf("unexpected static invocation selection: %s", response.Code)
			}
			if test.hoisted && !strings.Contains(response.Code, "const __exact_render_program_") {
				t.Fatal("hoist lost its compiled-program dependency")
			}
		})
	}
}

func TestRenderDefinitionDependenciesExcludeUnreachableRoots(t *testing.T) {
	f := printer.NewEmitContext().Factory
	program, invocation, unused := f.NewIdentifier("program-body"), f.NewIdentifier("invocation-body"), f.NewIdentifier("unused-body")
	definitions := []namedRenderProgramDefinition{
		{name: "program", node: program},
		{name: "invocation", node: invocation, dependencies: []string{"program"}},
		{name: "unused", node: unused},
	}
	selected := reachableRenderProgramDefinitions(f.NewIdentifier("invocation"), definitions)
	if len(selected) != 2 || selected[0] != program || selected[1] != invocation {
		t.Fatal("definition reachability lost dependency order or retained an unused root")
	}
	generated := reachableRenderProgramDefinitions(f.NewIdentifier("unrelated"), definitions, f.NewIdentifier("invocation"))
	if len(generated) != 2 || generated[0] != program || generated[1] != invocation {
		t.Fatal("generated island lost its transitive program definitions")
	}
	if len(reachableRenderProgramDefinitions(f.NewIdentifier("unrelated"), definitions)) != 0 {
		t.Fatal("unreachable definitions remained")
	}
}

func TestStaticServerInvocationKeepsAuthoredChildInputsLocal(t *testing.T) {
	for _, kind := range []string{"component", "child"} {
		if staticServerInvocationSlots(&renderProgramBuild{slots: []renderProgramSlot{{kind: kind}}}) {
			t.Fatalf("%s inputs could escape shared serialization storage", kind)
		}
	}
}
