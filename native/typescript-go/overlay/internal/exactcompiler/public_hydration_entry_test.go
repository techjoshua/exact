package exactcompiler

import (
	"strings"
	"testing"
)

func TestPublicHydrationRetainsRequestRuntime(t *testing.T) {
	for _, module := range []string{"@exactjs/hydrate", "@exactjs/hydrate/root"} {
		response := NewSession().Execute(Request{
			Kind: "compile", ID: "bootstrap.tsx", Target: TargetClient,
			Source: `import {hydrate} from "` + module + `"; import {App} from "./App.exact.client.js"; hydrate(<App/>, document.getElementById('app')!, registration);`,
		})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		physical := strings.Contains(response.Code, "hydrateCompiledComponentRoot as")
		if physical != (module == "@exactjs/hydrate/root") {
			t.Fatalf("hydration changed the selected runtime surface for %s: %s", module, response.Code)
		}
	}
}
