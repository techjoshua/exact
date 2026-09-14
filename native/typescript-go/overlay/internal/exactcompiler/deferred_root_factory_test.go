package exactcompiler

import (
	"strings"
	"testing"
)

// Deferred preparation must retain the narrow component entry without invoking the factory early.
func TestDeferredRootFactoryRetainsCompiledHydrationEntry(t *testing.T) {
	for _, factory := range []string{"() => <App />", "() => { const props = {}; return <App {...props} />; }"} {
		response := NewSession().Execute(Request{ID: "deferred-root.tsx", Kind: "compile", Target: TargetClient,
			ComponentContractProjection: ComponentContractProjectionHydrate,
			Source: `import { hydrateAfterNavigation } from "@exactjs/hydrate/root";
   declare class Component<State> { state: State }
   export function App(this: Component<{}>) { return () => <p>Ready</p>; }
   hydrateAfterNavigation(` + factory + `, document.body);`,
		})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("compile failed: %s %#v", response.Error, response.Diagnostics)
		}
		if !strings.Contains(response.Code, "hydrateCompiledComponentRootAfterNavigation as") {
			t.Fatalf("factory lost narrow entry: %s", response.Code)
		}
	}
}
