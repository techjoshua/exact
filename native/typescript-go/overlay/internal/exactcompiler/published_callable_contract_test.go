package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Published helper bodies may be unavailable. Declaration contracts must inform component
// placement without allowing purity to erase a concrete client/server restriction.
func TestPublishedCallableDeclarationContracts(t *testing.T) {
	root := t.TempDir()
	pkg := filepath.Join(root, "node_modules", "published-clock")
	if err := os.MkdirAll(pkg, 0700); err != nil {
		t.Fatal(err)
	}
	for file, source := range map[string]string{
		"package.json": `{"name":"published-clock","type":"module","exports":{"types":"./index.d.ts","default":"./index.js"}}`,
		"index.d.ts": `/** @exact pure */ export declare function makeClock():number;
/** @exact pure @exact server */ export declare function serverClock():number;
/** @exact pure @exact client */ export declare function clientClock():number;
export declare function opaqueClock():number;`,
		"index.js": `export function makeClock(){return 42} export function serverClock(){return 42} export function clientClock(){return 42} export function opaqueClock(){return 42}`,
	} {
		if err := os.WriteFile(filepath.Join(pkg, file), []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	config := filepath.Join(root, "tsconfig.json")
	if err := os.WriteFile(config, []byte(`{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct{ name, placement string }{{"makeClock", "isomorphic"}, {"serverClock", "server"}, {"clientClock", "client"}, {"opaqueClock", "unknown"}} {
		for _, form := range []struct{ name, source string }{
			{"named", `import {` + c.name + ` as read} from 'published-clock';const value=read();`},
			{"namespace", `import * as helpers from 'published-clock';const value=helpers.` + c.name + `();`},
			{"literal-member", `import * as helpers from 'published-clock';const value=helpers["` + c.name + `"]();`},
		} {
			for _, target := range []Target{TargetClient, TargetServer} {
				t.Run(c.name+"/"+form.name+"/"+string(target), func(t *testing.T) {
					parts := strings.SplitN(form.source, "const value=", 2)
					response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: target, Source: parts[0] + `export function Page(){const value=` + parts[1] + `return()=> <span>{value}</span>;}`})
					if response.Error != "" {
						t.Fatal(response.Error)
					}
					if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != c.placement {
						t.Fatalf("%#v", response.Analysis.Components)
					}
				})
			}
		}
	}
	for _, source := range []string{
		`import * as helpers from 'published-clock';function Page(props:{key:string}){const value=helpers[props.key]();return()=> <span>{value}</span>;}`,
		`import * as helpers from 'published-clock';function Page(props:{helpers:{makeClock():number}}){const helpers=props.helpers;const value=helpers.makeClock();return()=> <span>{value}</span>;}`,
		`import * as helpers from 'published-clock';function Page(props:{helpers:{makeClock():number}}){const helpers=props.helpers;const value=helpers["makeClock"]();return()=> <span>{value}</span>;}`,
	} {
		response := NewSession().Execute(Request{Kind: "compile", ID: filepath.Join(root, "page.tsx"), Root: root, ConfigFile: config, Target: TargetClient, Source: source})
		if response.Error != "" || len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "unknown" {
			t.Fatalf("opaque receiver acquired a namespace contract: %s %#v", response.Error, response.Analysis.Components)
		}
	}

}
