package exactcompiler

import (
	"strings"
	"testing"
)

func TestSessionPlansWholeScalarTextRuns(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{
			ID: "scalar-run.tsx", Kind: "compile", Target: target,
			ComponentContractProjection: ComponentContractProjectionHydrate,
			Source: `export function Label(props: { owner: string; status: string }) {
				return () => <small>{props.owner ? 'Assigned' : 'Unassigned'} / {props.status}</small>;
			}`,
		})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if target == TargetClient {
			if !strings.Contains(response.Code, `[8, [0, " / ", 1]]`) ||
				!strings.Contains(response.Code, `[3, 0, 0, true]`) ||
				!strings.Contains(response.Code, `[3, 1, 1, true]`) {
				t.Fatalf("text run lost its separate scalar claims:\n%s", response.Code)
			}
		} else if markerlessSsrTextCallCount(response.Code) != 2 {
			t.Fatalf("text run retained scalar delimiters:\n%s", response.Code)
		}
	}
}

func TestSessionRetainsBoundariesForMixedScalarAndStructuralChildren(t *testing.T) {
	response := NewSession().Execute(Request{
		ID: "mixed-text-run.tsx", Kind: "compile", Target: TargetClient,
		Source: `export function Label(props: { left: string; right: string }) {
			return () => <small>{props.left}<b>middle</b>{props.right}</small>;
		}`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if strings.Contains(response.Code, `[8, [`) {
		t.Fatalf("mixed content was treated as one text run:\n%s", response.Code)
	}
}

// A scalar structural tail can share a browser Text with preceding literal prose.
// Keep a delimiter there, while tails after elements and empty trivia stay markerless.
func TestRenderProgramStructuralTailKeepsLiteralBoundary(t *testing.T) {
	for _, row := range []struct {
		name, prefix string
		marked       bool
	}{
		{"literal", "Prefix:", true},
		{"empty", "", false},
		{"element", "<b>Prefix</b>", false},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(row.name+"/"+string(target), func(t *testing.T) {
				source := `import type {Component,Child} from '@exactjs/core';export function Page(this:Component<{}>,props:{value:Child}){return()=> <output>` + row.prefix + `{props.value}</output>;}`
				response := NewSession().Execute(Request{Kind: "compile", ID: "structural-text-tail.tsx", Target: target, Source: source})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
				}
				if target == TargetServer {
					if strings.Contains(response.Code, "__exactSsr.keyedChild(") == row.marked {
						t.Fatalf("incorrect structural tail delimiter:\n%s", response.Code)
					}
				} else if strings.Contains(response.Code, "<!--x:") != row.marked {
					t.Fatalf("incorrect client template delimiter:\n%s", response.Code)
				}
			})
		}
	}
}
