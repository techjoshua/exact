package exactcompiler

import (
	"strings"
	"testing"
)

func TestIndependentDocumentSiblingsShareBoundaryOwnershipAcrossTargets(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			response := NewSession().Execute(Request{
				ID: "C:/tmp/sibling-document.tsx", Kind: "compile", Target: target,
				Source: `function Child(props: { index: number }) { return () => <strong>{props.index}</strong>; }
export function Page() { return () => <html><head/><body><Child index={1}/><Child index={2}/></body></html>; }`,
			})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			// A client-only dynamic range would require markers absent from the server document.
			if strings.Contains(response.Code, "__exactDynamic(() => __exactComponentReceipt(Child") {
				t.Fatal("independent component siblings retained an extra child-range owner")
			}
		})
	}
}
