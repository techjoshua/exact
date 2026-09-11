package exactcompiler

import (
	"strings"
	"testing"
)

func TestSessionPlansDocumentHostsAndStaticHeadContent(t *testing.T) {
	response := NewSession().Execute(Request{ID: "document.tsx", Kind: "compile", Target: TargetServer,
		Source: `export function Document() { return () => <html lang="en"><head><meta charSet="UTF-8"/><title>Ready</title></head><body><main>Content</main></body></html>; }`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	for _, host := range []string{"html", "head", "body"} {
		if !strings.Contains(response.Code, `ssrHost: "`+host+`"`) {
			t.Fatalf("document host lost its program ownership: %s", response.Code)
		}
	}
	if strings.Count(response.Code, "ssrHost:") != 3 || strings.Contains(response.Code, `__exactIntrinsicReceipt("html"`) {
		t.Fatalf("canonical document lost compilation: %s", response.Code)
	}
	if !strings.Contains(response.Code, "data-exact-id") {
		t.Fatalf("document adoption identity was lost: %s", response.Code)
	}
}

func TestSessionRetainsNormalizationForIncompleteDocument(t *testing.T) {
	response := NewSession().Execute(Request{ID: "incomplete.tsx", Kind: "compile", Target: TargetServer,
		Source: `export function Document() { return () => <html><body><main>Content</main></body></html>; }`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if strings.Contains(response.Code, `ssrHost: "html"`) || !strings.Contains(response.Code, `ssrHost: "body"`) {
		t.Fatalf("incomplete document bypassed normalization or lost body compilation: %s", response.Code)
	}
}

func TestSessionMarksDynamicDocumentBodyClosingBoundary(t *testing.T) {
	response := NewSession().Execute(Request{ID: "body-boundary.tsx", Kind: "compile", Target: TargetServer,
		Source: `export function Document(props: { content: unknown }) { return () => <html><head><title>Ready</title></head><body>{props.content}</body></html>; }`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `__exactSsr.static(__exactOutput, "</body>", 0)`) {
		t.Fatalf("compiler lost the document hydration insertion boundary: %s", response.Code)
	}
}
