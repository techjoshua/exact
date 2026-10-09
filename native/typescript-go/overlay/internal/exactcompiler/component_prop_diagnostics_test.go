package exactcompiler

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestComponentPropConstraintsSurviveReceiptLowering(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, fixture := range []struct{ name, expression, code string }{
		{"valid", `<Card value={1}/>`, ""},
		{"optional", `<Card value={1} label="ok"/>`, ""},
		{"key", `<Card key="identity" value={1}/>`, ""},
		{"comment-child", `<Card value={1}>{/* no child */}</Card>`, ""},
		{"element-child", `<Card value={1}><strong>Nested</strong></Card>`, "TS2322"},
		{"wrong-type", `<Card value="invalid"/>`, "TS2322"},
		{"missing", `<Card/>`, "TS2345"},
		{"excess", `<Card value={1} unknown="invalid"/>`, "TS2353"},
		{"spread", `<Card {...{value:"invalid"}}/>`, "TS2345"},
		{"child", `<Card value={1}>Text</Card>`, ""},
		{"invalid-child", `<Card value={1}>{42}</Card>`, "TS2322"},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			source := `function Card(props:{value:number;label?:string;children?:string}){return()=> <p>{props.value}</p>;}export function Probe(){return()=> ` + fixture.expression + `;}`
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				kind := "compile"
				if target == TargetDefault {
					kind = "check"
				}
				response := NewSession().Execute(Request{Kind: kind, ID: filepath.Join(root, "Probe.tsx"), Root: root, ConfigFile: config, Source: source, Target: target, Diagnostics: "semantic"})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				found := false
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Code == fixture.code {
						found = true
					}
				}
				if fixture.code != "" && !found {
					t.Fatalf("%s lost %s: %#v", target, fixture.code, response.Diagnostics)
				}
				if fixture.code == "" && len(response.Diagnostics) != 0 {
					t.Fatalf("%s rejected valid props: %#v", target, response.Diagnostics)
				}
			}
		})
	}
}

func TestComponentWithoutPropsRetainsItsJsxConstraint(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, attribute := range []string{"", ` unknown="invalid"`} {
		source := `function Empty(){return()=> <p/>;}export function Probe(){return()=> <Empty` + attribute + `/>;}`
		response := NewSession().Execute(Request{Kind: "check", ID: filepath.Join(root, "Probe.tsx"), Root: root, ConfigFile: config, Source: source, Diagnostics: "semantic"})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		if (len(response.Diagnostics) != 0) != (attribute != "") {
			t.Fatalf("zero-argument component props: %v", formsDiagnosticDetails(response.Diagnostics))
		}
	}
}

func TestComponentPropConstraintNeighbors(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, fixture := range []struct{ name, source, invalid, replacement string }{
		{"generic", `function Card<T extends string>(props:{value:T;changed:(value:T)=>void}){return()=> <p>{props.value}</p>;}export function Probe(){return()=> <Card value="valid" changed={value=>value.toUpperCase()}/>;}`, "toUpperCase()", "toFixed()"},
		{"union", `function Card(props:{kind:"number";value:number}|{kind:"text";value:string}){return()=> <p>{props.value}</p>;}export function Probe(){return()=> <Card kind="number" value={1}/>;}`, "value={1}", `value={"invalid"}`},
		{"children", `function Card(props:{children:string[]}){return()=> <p>{props.children}</p>;}export function Probe(){return()=> <Card>{"first"}{"second"}</Card>;}`, `{"second"}`, "{42}"},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			for _, valid := range []bool{true, false} {
				source := fixture.source
				if !valid {
					source = strings.Replace(source, fixture.invalid, fixture.replacement, 1)
				}
				response := NewSession().Execute(Request{Kind: "check", ID: filepath.Join(root, "Probe.tsx"), Root: root, ConfigFile: config, Source: source, Diagnostics: "semantic"})
				if response.Error != "" || (len(response.Diagnostics) == 0) != valid {
					t.Fatalf("valid=%v: %s %v", valid, response.Error, formsDiagnosticDetails(response.Diagnostics))
				}
			}
		})
	}
}

// Checking must retain a local consumed by JSX props even when client lowering
// can move its sole initializer into the consumer's reactive reader.
func TestComponentPropCapturedLocalsRetainCheckingScope(t *testing.T) {
	root, config := formsSourceFixture(t)
	for _, fixture := range []struct{ name, setup, props, required string }{
		{"object", `const seed={value:props.count};`, `seed={seed}`, `seed:{value:number}`},
		{"array", `const badges=[props.count];`, `badges={badges}`, `badges:number[]`},
		{"destructured", `const {seed}={seed:{value:props.count}};`, `seed={seed}`, `seed:{value:number}`},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			for _, valid := range []bool{true, false} {
				setup := fixture.setup
				if !valid {
					setup = strings.ReplaceAll(setup, "props.count", `"invalid"`)
				}
				source := `function Card(props:{` + fixture.required + `}){return()=> <p/>;}export function Probe(props:{count:number}){` + setup + `return()=> <Card ` + fixture.props + `/>;}`
				for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
					kind := "compile"
					if target == TargetDefault {
						kind = "check"
					}
					response := NewSession().Execute(Request{Kind: kind, ID: filepath.Join(root, "Scope.tsx"), Root: root, ConfigFile: config, Source: source, Target: target, Diagnostics: "semantic"})
					if response.Error != "" || (len(response.Diagnostics) == 0) != valid {
						t.Fatalf("valid=%v target=%s: %s %v", valid, target, response.Error, formsDiagnosticDetails(response.Diagnostics))
					}
					for _, diagnostic := range response.Diagnostics {
						if diagnostic.Code == "TS2304" {
							t.Fatalf("declared prop local lost its scope: %v", formsDiagnosticDetails(response.Diagnostics))
						}
					}
				}
			}
		})
	}
}
