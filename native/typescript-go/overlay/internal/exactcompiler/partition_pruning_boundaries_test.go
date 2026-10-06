package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPartitionStaticCommonJSLoaderUsesModulePlacement(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, module := range []string{"portable-package", "node:fs"} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/loader.ts", Target: target, Source: `const direct=require("` + module + `").value;const {value:renamed}=require("` + module + `");console.log(direct,renamed);`})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			retained := module != "node:fs" || target == TargetServer
			if strings.Contains(response.Code, "const direct") != retained || strings.Contains(response.Code, "renamed } =") != retained || strings.Contains(response.Code, "console.log") != retained {
				t.Fatalf("%s/%s lost loader ownership:\n%s", module, target, response.Code)
			}
		}
	}
}

func TestPartitionNativeComponentReexportsKeepServerImplementation(t *testing.T) {
	root := t.TempDir()
	entry := filepath.Join(root, "index.ts")
	child := filepath.Join(root, "child.tsx")
	config := filepath.Join(root, "tsconfig.json")
	for file, source := range map[string]string{
		config: `{"compilerOptions":{"target":"esnext","module":"esnext","moduleResolution":"bundler"},"include":["*.ts","*.tsx"]}`,
		entry:  `export {Panel} from './child.js';`,
		child:  `export function Panel(){return()=> <button onClick={()=>console.log(window.innerWidth)}>Panel</button>;}export const width=window.innerWidth;`,
	} {
		if err := os.WriteFile(file, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Target: target, ServerComponents: true, Source: `export {Panel,width} from './child.js';`})
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("valid component barrel rejected: %s %#v", response.Error, response.Diagnostics)
		}
		if !strings.Contains(response.Code, "Panel") || strings.Contains(response.Code, "width") != (target == TargetClient) {
			t.Fatalf("%s conflated component projection with ordinary values:\n%s", target, response.Code)
		}
	}
}

func TestPartitionForeignExportsDoNotBorrowLocalComponentIdentity(t *testing.T) {
	root := t.TempDir()
	entry := filepath.Join(root, "index.tsx")
	foreign := filepath.Join(root, "value.ts")
	config := filepath.Join(root, "tsconfig.json")
	for file, source := range map[string]string{config: `{"compilerOptions":{"target":"esnext","module":"esnext","moduleResolution":"bundler"},"include":["*.ts","*.tsx"]}`, foreign: `export function Same(){return window.innerWidth;}`} {
		if err := os.WriteFile(file, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, local := range []string{`function Same(){return()=> <p/>}`, `function Different(){return()=> <p/>}`, `function Same(){return process.env.VALUE}`, `function Same(){return window.innerWidth}`} {
		source := local + `;export{Same as width} from './value.js';`
		if err := os.WriteFile(entry, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: entry, Root: root, ConfigFile: config, Target: target, Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("valid collision control rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if strings.Contains(response.Code, "width") != (target == TargetClient) {
				t.Fatalf("%s/%s borrowed local component ownership:\n%s", local, target, response.Code)
			}
		}
	}
}

func TestPartitionModuleConsumersFollowPrunedInputs(t *testing.T) {
	for _, source := range []string{
		`const browser=window.innerWidth;console.log(browser);export const stable=1;`,
		`const browser=window.innerWidth;if(browser){console.log(browser);}export const stable=1;`,
		`const browser=window.innerWidth;for(let i=0;i<browser;i++){console.log(browser);}export const stable=1;`,
		`const browser=window.innerWidth;try{console.log(browser);}catch{}export const stable=1;`,
		`const browser=window.innerWidth;{const alias=browser;console.log(browser);}export const stable=1;`,
		`const browser=window;const alias=browser;alias.alert('owned');export const stable=1;`,
		`const browser=window.innerWidth;function report(){console.log(browser);}report();export const stable=1;`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/consumers.ts", Target: target, Source: source})
			if response.Error != "" {
				t.Fatal(response.Error)
			}
			if !strings.Contains(response.Code, "stable") {
				t.Fatal("lost neutral sibling")
			}
			for _, consumer := range []string{"console.log(browser);", "alias.alert", "report();"} {
				if strings.Contains(source, consumer) && strings.Contains(response.Code, consumer) != (target == TargetClient) {
					t.Fatalf("%s orphaned module consumer:\n%s", target, response.Code)
				}
			}
		}
	}
}

func TestPartitionModuleGuardsPreservePortableFallbacks(t *testing.T) {
	source := `let stable=0;if(typeof window!=='undefined'){const browser=window.innerWidth;stable=browser;}else{stable=1;}export{stable};`
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "/virtual/guarded.ts", Target: target, Source: source})
		if response.Error != "" || !strings.Contains(response.Code, "typeof window") || !strings.Contains(response.Code, "stable = 1") {
			t.Fatalf("%s lost guarded fallback:\n%s", target, response.Code)
		}
	}
}
