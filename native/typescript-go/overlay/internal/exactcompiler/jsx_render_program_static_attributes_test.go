package exactcompiler

import (
	"strings"
	"testing"
)

func TestServerLiteralURLsDoNotRetainClientAttributeOperations(t *testing.T) {
	source := `export function Links(props: { href: string }) {
		return () => <html><head><title>Links</title><link rel="stylesheet" href="/app.css" /></head>
		<body><main><a href="/guide">Guide</a><img src="https://example.test/icon.svg" />
		<a href={props.href}>Dynamic</a><a href="javascript:alert(1)">Blocked</a>
		<x-link href="/custom" /></main></body></html>;
	}`
	server := NewSession().Execute(Request{ID: "literal-url-server.tsx", Kind: "compile", Target: TargetServer, Source: source})
	if server.Error != "" {
		t.Fatal(server.Error)
	}
	for _, expected := range []string{`href=\"/guide\"`, `href=\"/app.css\"`, `src=\"https://example.test/icon.svg\"`} {
		if !strings.Contains(server.Code, expected) {
			t.Fatalf("safe literal URL did not enter static server markup (%s):\n%s", expected, server.Code)
		}
	}
	for _, forbidden := range []string{`href=\"javascript:`, `href=\"/custom\"`, `ssrHost: "link"`} {
		if strings.Contains(server.Code, forbidden) {
			t.Fatalf("server URL boundary retained or bypassed the wrong work (%s):\n%s", forbidden, server.Code)
		}
	}
	client := NewSession().Execute(Request{ID: "literal-url-client.tsx", Kind: "compile", Target: TargetClient, Source: source})
	if client.Error != "" {
		t.Fatal(client.Error)
	}
	if strings.Contains(client.Code, `href=\"/guide\"`) {
		t.Fatalf("server-only URL folding changed the client property path:\n%s", client.Code)
	}
}
