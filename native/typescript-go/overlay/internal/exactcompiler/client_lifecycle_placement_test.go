package exactcompiler

import "testing"

func TestOpaqueClientLifecycleKeepsServerRenderPlacement(t *testing.T) {
	response := NewSession().Execute(Request{Kind: "analyze", ID: "opaque-lifecycle.tsx", Source: `
		declare function observe(): void;
		function mount() { observe(); }
		export function View(this: Component<{}>) {
			// Lifecycle registration may follow an explanatory comment.
			this.onMount(() => mount());
			return () => <p>Visible before activation</p>;
		}`})
	if response.Error != "" {
		t.Fatal(response.Error)
	}
	component := findComponent(t, response.Analysis.Components, "View")
	if component.Placement != "isomorphic" || len(component.ArtifactTargets) != 2 {
		t.Fatalf("client lifecycle poisoned the render placement: %#v", component)
	}
}
