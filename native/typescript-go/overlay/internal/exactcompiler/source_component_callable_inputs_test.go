package exactcompiler

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// A callable is a render requirement only where the receiving definition calls
// it. Delivery changes the parent edge, never the shared target definition.
func TestComponentNamedCallableInputTransfer(t *testing.T) {
	const childSource = `declare function foreign():string;export function Child(props:{label:string;read(this:{label:string},suffix:string):string}){return()=> <output>{props.read(props.label)}</output>;} export function ChildUnknown(props:{label:string;read(this:{label:string},suffix:string):string}){return()=> <output>{props.read(props.label)+foreign()}</output>;} export function Dormant(props:{label:string;read(this:{label:string},suffix:string):string}){return()=> <output>{props.label}</output>;}`
	for _, kind := range []string{"analyze", "compile"} {
		for _, target := range []Target{TargetServer, TargetClient} {
			t.Run(kind+"/"+string(target), func(t *testing.T) {
				root := t.TempDir()
				child := filepath.Join(root, "child.tsx")
				parent := filepath.Join(root, "parent.tsx")
				if err := os.WriteFile(child, []byte(childSource), 0600); err != nil {
					t.Fatal(err)
				}
				var baseline []Component
				var code string
				for _, row := range []struct{ name, body, selected, want string }{
					{"safe", `return this.label+suffix+captured;`, "Child", "isomorphic"},
					{"browser", `return this.label+suffix+captured+document.title;`, "Child", "client"},
					{"dormant", `return this.label+suffix+document.title;`, "Dormant", "isomorphic"},
					{"unknown", `return this.label+suffix+foreign();`, "Child", "unknown"},
					{"unknown-target", `return this.label+suffix+document.title;`, "ChildUnknown", "unknown"},
					{"known-unknown", `return this.label+suffix+document.title+foreign();`, "Child", "unknown"},
				} {
					t.Run(row.name, func(t *testing.T) {
						source := `import {Child,ChildUnknown,Dormant} from './child.js';declare function foreign():string;const captured='capture';function read(this:{label:string},suffix:string){` + row.body + `}export function Parent(){return()=> <` + row.selected + ` label="label" read={read}/>;}`
						if err := os.WriteFile(parent, []byte(source), 0600); err != nil {
							t.Fatal(err)
						}
						s := NewSession()
						result := s.Execute(Request{Kind: kind, Target: target, ID: parent, Root: root, Source: source})
						if result.Error != "" {
							t.Fatal(result.Error)
						}
						p := findComponent(t, result.Analysis.Components, "Parent")
						if len(p.RenderEdges) != 1 || p.RenderEdges[0].Placement != row.want || p.SubgraphPlacement != row.want {
							t.Fatalf("missing relative %s requirement: %#v", row.name, p)
						}
						if strings.Contains(row.body, "document.title") && row.selected != "Dormant" && p.RenderCapability.Server != "unsupported" {
							t.Fatal("known browser requirement was erased", p.RenderCapability)
						}
						if row.want == "unknown" && row.selected == "Child" && !strings.Contains(strings.Join(p.Diagnostics, " "), "unresolved environment") {
							t.Fatal("missing unresolved-input warning", p.Diagnostics)
						}
						if kind == "compile" && row.want == "unknown" {
							found := false
							for _, diagnostic := range result.Diagnostics {
								if diagnostic.Code == "EXACT2212" {
									found = true
									if strings.Contains(diagnostic.Message, "compatibility adapter") || !strings.Contains(diagnostic.Message, "Ordinary JavaScript is preserved") {
										t.Fatal("native input received foreign-component guidance", diagnostic)
									}
								}
							}
							if !found {
								t.Fatal("missing native unresolved warning")
							}
						}
						definition := s.Execute(Request{Kind: kind, Target: target, ID: child, Root: root, Source: childSource})
						if definition.Error != "" {
							t.Fatal(definition.Error)
						}
						if baseline == nil {
							baseline = definition.Analysis.Components
							code = definition.Code
						} else if !reflect.DeepEqual(baseline, definition.Analysis.Components) || code != definition.Code {
							t.Fatal("consumer specialized target definition")
						}
					})
				}
			})
		}
	}
}
