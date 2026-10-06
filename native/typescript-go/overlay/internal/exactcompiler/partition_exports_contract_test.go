package exactcompiler

import (
	"strings"
	"testing"
)

func TestPartitionExportsRetainOnlyTheirRuntime(t *testing.T) {
	for _, c := range []struct {
		name, source string
		owner        Target
	}{
		{"direct", `export const browser=window.innerWidth,stable=1;`, TargetClient},
		{"alias", `const browser=window.innerWidth;export {browser as width};export const stable=1;`, TargetClient},
		{"alias siblings", `const browser=window.innerWidth;const stable=1;export {browser as width,stable};`, TargetClient},
		{"default alias", `const browser=window.innerWidth;export default browser;export const stable=1;`, TargetClient},
		{"object pattern", `export const {innerWidth:width}=window;export const stable=1;`, TargetClient},
		{"nested pattern", `export const {navigator:{language}}=window;export const stable=1;`, TargetClient},
		{"array pattern", `export const [width]=[window.innerWidth];export const stable=1;`, TargetClient},
		{"default expression", `export default window.innerWidth;export const stable=1;`, TargetClient},
		{"transitive alias", `const browser=window.innerWidth;const alias=browser;export {alias as width};export const stable=1;`, TargetClient},
		{"closure input", `const browser=window.innerWidth;export const width=()=>browser;export const stable=1;`, TargetClient},

		{"server alias", `const server=process.version;export {server as version};export const stable=1;`, TargetServer},
		{"server pattern", `export const {version}=process;export const stable=1;`, TargetServer},
	} {
		t.Run(c.name, func(t *testing.T) {
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/exports.ts", Target: target, Source: c.source})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("export source rejected: %s %#v", response.Error, response.Diagnostics)
				}
				marker := "window"
				if c.owner == TargetServer {
					marker = "process"
				}
				if strings.Contains(response.Code, marker) != (target == c.owner) {
					t.Fatalf("%s leaked/removed opposite-runtime initialization:\n%s", target, response.Code)
				}
				if !strings.Contains(response.Code, "stable") {
					t.Fatalf("%s removed the target-neutral sibling:\n%s", target, response.Code)
				}
			}
		})
	}
}
