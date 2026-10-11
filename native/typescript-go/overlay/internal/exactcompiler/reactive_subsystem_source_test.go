package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Supported source variations retain state ownership, eager value selection and
// shared derived identity independently of wrappers or generated-name collisions.
func TestReactiveSourceOwnershipVariations(t *testing.T) {
	for _, body := range []string{
		`this.state.n=((0));return()=> <button onClick={()=>{const owner=this;owner.state.n++;}}>{this.state.n}</button>;`,
		`this.state.n=0;return()=> <button onClick={()=>{((this.state.n))++;}}>{this.state.n}</button>;`,
		`this.state.n=0;const owner=((this.state));return()=> <button onClick={()=>owner.n++}>{this.state.n}</button>;`,
		`this.state.n=0;const owner=this.state satisfies {n:number};return()=> <button onClick={()=>owner.n++}>{this.state.n}</button>;`,
		`this.state.n=0;return()=> <p>{this.state["n"]}</p>;`,
		`const label=props.value.trim(), fixed=1;return()=> <p>{label+fixed}</p>;`,
		`const label=props.value.trim();const value=label.toUpperCase();return()=> <p>{value+value}</p>;`,
		`const label=props.optional?.trim();return()=> <p title={label}>{label ? label.toUpperCase() : "empty"}</p>;`,
		`const __exact_label_1="fixed";const label=props.value.trim();return()=> <p>{label+__exact_label_1}</p>;`,
		`const __exact_cached_label_1="fixed";const label=props.value.trim();return()=> <p title={label}>{label+label+__exact_cached_label_1}</p>;`,
		`const {value:label="fallback"}=props, fixed=1;return()=> <p>{label+fixed}</p>;`,
		`const {value:label="fallback",rows}=props;return()=> <p title={label}>{label+rows.join(",")}</p>;`,
		`const [first,,third]=props.rows;return()=> <p>{first+third}</p>;`,
		`const {0:first,1:second}=props.rows;return()=> <p>{first+second}</p>;`,
		`this.reactive(props.value);return()=> <p>{props.value}</p>;`,
		"this.reactive`label ${props.value}`;return()=> <p>{props.value}</p>;",
		`const shared=Symbol("shared");this.state.symbol=shared;return()=> <button onClick={()=>this.state.symbol=shared}>Go</button>;`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			response := NewSession().Execute(Request{Kind: "compile", ID: "source-ownership.tsx", Target: target, Source: `export function Page(this:{state:{n:number;symbol:symbol};reactive(value:unknown):unknown},props:{value:string;optional?:string;rows:string[]}){` + body + `}`})
			assertReactiveCompilation(t, response, body)
		}
	}
}

// The project's callable graph must preserve portable helper ownership across
// supported module extensions and cache rebuilds, including ordinary JavaScript.
func TestReactiveCallableModuleSources(t *testing.T) {
	for _, extension := range []string{"ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"} {
		root := t.TempDir()
		config := filepath.Join(root, "tsconfig.json")
		helper := filepath.Join(root, "helper."+extension)
		page := filepath.Join(root, "page.tsx")
		pageSource := `import {label} from './helper.` + extension + `';export function Page(){return()=> <p>{label()}</p>;}`
		for file, source := range map[string]string{
			config: `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","allowJs":true,"jsx":"preserve"}}`,
			helper: `export function label(){return "portable";}`,
			page:   pageSource,
		} {
			if err := os.WriteFile(file, []byte(source), 0600); err != nil {
				t.Fatal(err)
			}
		}
		session := NewSession()
		for _, target := range []Target{TargetClient, TargetServer} {
			for iteration := 0; iteration < 2; iteration++ {
				response := session.Execute(Request{Kind: "compile", ID: page, Root: root, ConfigFile: config, Target: target, Source: pageSource})
				assertReactiveCompilation(t, response, extension)
				for _, component := range response.Analysis.Components {
					if component.Placement != "isomorphic" {
						t.Fatalf("%s helper lost portable placement: %#v", extension, component)
					}
				}
				if !strings.Contains(response.Code, "label") {
					t.Fatalf("%s helper omitted from %s", extension, target)
				}
			}
		}
	}
}

// Invalid loop targets still expose their state-write restriction, while loops
// writing ordinary locals retain the same JavaScript assignment syntax.
func TestReactiveLoopTargetOwnership(t *testing.T) {
	for _, work := range []string{`for(this.state.text in {a:1}){}`, `for(this.state.n of [1,2]){}`, `let text="";for(text in {a:1}){}`, `let n=0;for(n of [1,2]){}`} {
		response := NewSession().Execute(Request{Kind: "compile", ID: "loop-ownership.tsx", Target: TargetClient, Source: `export function Page(this:{state:{n:number;text:string}}){this.state.n=0;this.state.text="";return()=> <button onClick={()=>{` + work + `}}>Go</button>;}`})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		rejected := false
		for _, diagnostic := range response.Diagnostics {
			rejected = rejected || diagnostic.Code == "EXACT_STATE_WRITE"
		}
		if rejected != strings.Contains(work, "this.state") {
			t.Fatalf("loop ownership %s: %#v", work, response.Diagnostics)
		}
	}
}
