package exactcompiler

import (
	"strings"
	"testing"
)

func TestSessionCoalescesLiteralDocumentScriptWithAdoptionIdentity(t *testing.T) {
	for _, source := range []string{
		`export function Document() { return () => <html><head><script type="module" src="/app.js" /></head><body><main>App</main></body></html>; }`,
		`export function Document() { return () => <html><head /><body><script src="https://example.test/app.js" /></body></html>; }`,
	} {
		response := NewSession().Execute(Request{ID: "document-script.tsx", Kind: "compile", Target: TargetServer, Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if strings.Contains(response.Code, `ssrHost: "script"`) || !strings.Contains(response.Code, `<script data-exact-id=\"`) {
			t.Fatalf("literal script did not coalesce with adoption identity: %s", response.Code)
		}
	}
}

func TestSessionPlansEmptyExternalServerScript(t *testing.T) {
	response := NewSession().Execute(Request{ID: "script.tsx", Kind: "compile", Target: TargetServer,
		Source: `export function Script(props: { src: string }) { return () => <script type="module" src={props.src} />; }`,
	})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	if !strings.Contains(response.Code, `ssrHost: "script"`) || !strings.Contains(response.Code, "data-exact-id") {
		t.Fatalf("script lost compiled output or adoption identity: %s", response.Code)
	}
}

func TestSessionRetainsSpecialScriptFallbacks(t *testing.T) {
	for _, source := range []string{
		`export function Script() { return () => <script>{"console.log(1)"}</script>; }`,
		`export function Script(props: object) { return () => <script {...props} src="/app.js" />; }`,
		`export function Script() { return () => <script src="/app.js">inline</script>; }`,
	} {
		response := NewSession().Execute(Request{ID: "script.tsx", Kind: "compile", Target: TargetServer, Source: source})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if strings.Contains(response.Code, `ssrHost: "script"`) {
			t.Fatalf("special script incorrectly planned: %s", response.Code)
		}
	}
}
