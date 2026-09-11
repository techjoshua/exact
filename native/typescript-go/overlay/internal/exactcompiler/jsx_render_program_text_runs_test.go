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
