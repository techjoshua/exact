package exactcompiler

import (
	"strings"
	"testing"
)

func TestComposableIntrinsicProgramsRequireFixedDeclarations(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, test := range []struct {
			name, child string
			optimized   bool
		}{
			{"literal", `<span title="fixed"><Counter /></span>`, true},
			{"dynamic", `<span title={props.label}><Counter /></span>`, false},
			{"call", `<span title={readTitle()} />`, false},
			{"spread", `<span {...{ title: props.label }} />`, false},
			{"key", `<span key="identity" />`, false},
			{"text-host", `<textarea>text</textarea>`, false},
			{"document", `<body>text</body>`, false},
		} {
			t.Run(string(target)+"/"+test.name, func(t *testing.T) {
				response := NewSession().Execute(Request{ID: "composable.tsx", Kind: "compile", Target: target,
					Source: `function readTitle() { return "read"; }
					function Counter() { return () => <b>child</b>; }
					function Wrapper(props: { children?: unknown }) { return () => props.children; }
					export function Root(props: { label: string }) { return () => <Wrapper>` + test.child + `</Wrapper>; }`,
				})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
				}
				if strings.Contains(response.Code, "withIntrinsicComposition") != test.optimized {
					t.Fatalf("unexpected composition optimization: %s", response.Code)
				}
			})
		}
	}
}
