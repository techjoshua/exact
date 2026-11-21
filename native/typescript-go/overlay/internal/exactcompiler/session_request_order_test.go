package exactcompiler

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Checker reuse must preserve generic instantiations and source ownership across request order.
func TestSessionCrossModuleRequestOrder(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	sources := map[string]string{
		"helper.ts":  `export type Box<T>={value:T};export function identity<T>(value:T):T{return value;}`,
		"First.tsx":  `import {identity,type Box} from './helper.js';export function First(props:{box:Readonly<Box<string>>}){return()=> <p>{identity(props.box).value.toUpperCase()}</p>;}`,
		"Second.tsx": `import {identity,type Box} from './helper.js';export function Second(props:{box:Box<number>}){return()=> <p>{identity(props.box).value.toFixed(2)}</p>;}`,
		"Page.tsx":   `import {First} from './First.js';import {Second} from './Second.js';export function Page(){return()=> <main><First box={{value:'label'}}/><Second box={{value:2}}/></main>;}`,
	}
	for name, source := range sources {
		if err := os.WriteFile(filepath.Join(root, name), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","jsx":"preserve"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	for _, order := range [][]string{{"First.tsx", "Second.tsx", "Page.tsx", "First.tsx"}, {"Page.tsx", "Second.tsx", "First.tsx", "Page.tsx"}} {
		session := NewSession()
		for _, name := range order {
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				request := Request{Kind: "compile", ID: filepath.Join(root, name), Root: root, ConfigFile: config, Source: sources[name], Target: target, SourceMap: true}
				retained, fresh := session.Execute(request), NewSession().Execute(request)
				if retained.Error != "" || fresh.Error != "" {
					t.Fatalf("retained %s, fresh %s", retained.Error, fresh.Error)
				}
				// Generation-local AST and checker identities are private. Compare
				// the analysis contract delivered by the session protocol.
				retainedAnalysis, err := json.Marshal(retained.Analysis)
				if err != nil {
					t.Fatal(err)
				}
				freshAnalysis, err := json.Marshal(fresh.Analysis)
				if err != nil {
					t.Fatal(err)
				}
				if retained.Code != fresh.Code || !reflect.DeepEqual(retained.SourceMap, fresh.SourceMap) || !bytes.Equal(retainedAnalysis, freshAnalysis) || !reflect.DeepEqual(retained.Diagnostics, fresh.Diagnostics) {
					t.Fatalf("request order changed %s %s", name, target)
				}
			}
		}
	}
}
