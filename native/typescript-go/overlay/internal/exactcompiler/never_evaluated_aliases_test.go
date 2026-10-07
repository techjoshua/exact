package exactcompiler

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Array elisions establish no alias, while subsequent and nested bindings retain their exact paths.
func TestNeverEvaluatedArrayAliasPaths(t *testing.T) {
	root, config := neverEvaluatedFixture(t)
	for _, c := range []struct{ name, binding, path string }{
		{"leading-hole", "[, selected]", "rows.1"},
		{"multiple-holes", "[,, selected]", "rows.2"},
		{"trailing-hole", "[selected,,]", "rows.0"},
		{"nested-hole", "[,[,selected]]", "rows.1.1"},
	} {
		t.Run(c.name, func(t *testing.T) {
			value := "{value:1}"
			if c.name == "nested-hole" {
				value = "[{value:1},{value:2}]"
			}
			source := `import type {Component} from '@exactjs/core';export function Page(this:Component<{rows:any[]}>){this.state.rows=[` + value + `,` + value + `,` + value + `];const ` + c.binding + `=this.state.rows;return()=> <button onClick={()=>selected.value++}>{selected.value}</button>}`
			entry := filepath.Join(root, "Entry.tsx")
			if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
			for _, target := range []Target{TargetClient, TargetServer} {
				taskSource := strings.Replace(source, "import type {Component}", "import {TaskContext,type Component}", 1)
				taskSource = strings.Replace(taskSource, "return()=>", fmt.Sprintf("function update(task:TaskContext=TaskContext.%s().blocking()){selected.value++;}%sreturn()=>", target, map[Target]string{TargetServer: "update();"}[target]), 1)
				if err := os.WriteFile(entry, []byte(taskSource), 0600); err != nil {
					t.Fatal(err)
				}
				taskResponse := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: target, Source: taskSource, ConfigFile: config, Diagnostics: "semantic"})
				if taskResponse.Error != "" || len(taskResponse.Diagnostics) != 0 {
					t.Fatalf("executor alias escaped setup: %s %#v", taskResponse.Error, taskResponse.Diagnostics)
				}
				response := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: target, Source: source, ConfigFile: config, Diagnostics: "semantic"})
				if response.Error != "" || len(response.Diagnostics) != 0 {
					t.Fatalf("source rejected: %s %#v", response.Error, response.Diagnostics)
				}
				found := false
				for _, alias := range response.Analysis.StateAliases {
					if alias.Name == "selected" && strings.Join(alias.Path, ".") == c.path {
						found = true
					}
				}
				if !found {
					t.Fatalf("selected receiver lost path %s: %#v", c.path, response.Analysis.StateAliases)
				}
			}
		})
	}
}
