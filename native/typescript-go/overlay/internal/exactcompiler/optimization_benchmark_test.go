package exactcompiler

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// BenchmarkOptimizationWarm measures incremental compilation of twelve task-owning components.
// Each operation changes source text and includes native analysis, lowering and validation.
func BenchmarkOptimizationWarm(b *testing.B) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, validation := range []string{"", "semantic"} {
			b.Run(string(target)+"/"+validation, func(b *testing.B) {
				root, err := os.MkdirTemp(".", ".optimization-profile-")
				if err != nil {
					b.Fatal(err)
				}
				b.Cleanup(func() { os.RemoveAll(root) })
				root, err = filepath.Abs(root)
				if err != nil {
					b.Fatal(err)
				}
				config := filepath.Join(root, "tsconfig.json")
				if err := os.WriteFile(config, []byte(`{"compilerOptions":{"target":"ESNext","module":"ESNext","moduleResolution":"Bundler","jsx":"preserve","jsxImportSource":"@exactjs/jsx","skipLibCheck":true}}`), 0600); err != nil {
					b.Fatal(err)
				}
				var source strings.Builder
				source.WriteString(`import {TaskContext,type Component} from '@exactjs/core';`)
				for index := 0; index < 12; index++ {
					fmt.Fprintf(&source, `export function Page%d(this:Component<{rows:{value:number}[][]}>,props:{label:string}){this.state.rows=[[{value:0}],[{value:1},{value:2}]];const [,[,selected]]=this.state.rows;function mutate(){selected.value++;}function update(task:TaskContext=TaskContext.server().blocking()){mutate();}update();return()=> <main><output>{props.label}:{selected.value}</output><button onClick={()=>update()}>update</button></main>;}`, index)
				}
				request := Request{ID: filepath.Join(root, "Entry.tsx"), Root: root, ConfigFile: config, Kind: "compile", Target: target, Source: source.String(), Diagnostics: validation}
				session := NewSession()
				response := session.Execute(request)
				if response.Error != "" || len(response.Diagnostics) > 0 {
					b.Fatalf("warmup: %s %#v", response.Error, response.Diagnostics)
				}
				b.ReportAllocs()
				b.ResetTimer()
				for index := 0; index < b.N; index++ {
					request.Source = source.String() + fmt.Sprintf("\nexport const revision=%d;", index)
					response = session.Execute(request)
					if response.Error != "" || len(response.Diagnostics) > 0 {
						b.Fatalf("compile: %s %#v", response.Error, response.Diagnostics)
					}
				}
			})
		}
	}
}
