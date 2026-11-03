package exactcompiler

import "testing"

// Ordered JSX input contributions replace only the selected property. Unknown
// later spreads retain known MAY donors, and dormant inputs never activate bodies.
func TestComponentCallableInputOverrides(t *testing.T) {
	for _, row := range []struct {
		name, tag, attributes, placement string
		browser, server                  bool
	}{
		{"spread-before", "Child", `{...extra} read={browserRead}`, "client", true, false},
		{"spread-after", "Child", `read={browserRead} {...extra}`, "unknown", true, false},
		{"final-explicit", "Child", `{...{read:browserRead}} {...extra} read={safeRead}`, "isomorphic", false, false},
		{"finite-disjoint", "Child", `read={browserRead} {...{title:'ignored'}}`, "client", true, false},
		{"finite-override", "Child", `{...{read:browserRead}} {...{read:serverRead}}`, "server", false, true},
		{"unknown-key", "Child", `read={browserRead} {...{[key]:safeRead}}`, "unknown", true, false},
		{"unknown-key-browser-donor", "Child", `read={safeRead} {...{[key]:browserRead}}`, "unknown", true, false},
		{"unknown-key-server-donor", "Child", `read={safeRead} {...{[key]:serverRead}}`, "unknown", false, true},
		{"unknown-key-final-write", "Child", `{...{[key]:browserRead}} read={safeRead}`, "isomorphic", false, false},
		{"nested-unknown", "Child", `read={browserRead} {...{...extra}}`, "unknown", true, false},
		{"getter-override", "Child", `{...{read:browserRead}} {...{get read(){return safeRead}}}`, "unknown", false, false},
		{"server-before", "Child", `{...extra} read={serverRead}`, "server", false, true},
		{"server-after", "Child", `read={serverRead} {...extra}`, "unknown", false, true},
		{"literal-method", "Child", `{...{read(){return document.title}}}`, "client", true, false},
		{"unknown-key-method", "Child", `read={safeRead} {...{[key](){return document.title}}}`, "unknown", true, false},
		{"dormant-method", "Dormant", `{...{read(){return document.title}}}`, "isomorphic", false, false},
		{"dormant", "Dormant", `read={browserRead} {...extra}`, "isomorphic", false, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `const extra={title:'extra'};declare const key:string;function browserRead(){return document.title}function safeRead(){return 'safe'}function serverRead(){return __dirname}function Child(props:{read():string}){return()=> <output>{props.read()}</output>}function Dormant(props:{read():string}){return()=> <output>ready</output>}export function Parent(){return()=> <` + row.tag + ` ` + row.attributes + `/>}`
			for _, kind := range []string{"analyze", "compile"} {
				for _, target := range []Target{TargetClient, TargetServer} {
					r := NewSession().Execute(Request{Kind: kind, Target: target, ID: "callable-overrides.tsx", Source: source})
					if r.Error != "" {
						t.Fatal(r.Error)
					}
					p := findComponent(t, r.Analysis.Components, "Parent")
					if len(p.RenderEdges) != 1 || p.RenderEdges[0].Placement != row.placement {
						t.Fatalf("%s/%s lost ordered selection: %#v", kind, target, p)
					}
					if (p.RenderCapability.Server == "unsupported") != row.browser || (p.RenderCapability.Client == "unsupported") != row.server {
						t.Fatalf("%s/%s lost donor or activated dormant body: %#v", kind, target, p.RenderCapability)
					}
				}
			}
		})
	}
}
