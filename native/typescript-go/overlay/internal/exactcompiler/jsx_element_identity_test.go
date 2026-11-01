package exactcompiler

import (
	"github.com/microsoft/TypeScript/tsc/internal/printer"
	"strings"
	"testing"
)

func TestReservedElementIdentitySourceDiagnostics(t *testing.T) {
	for _, props := range []string{`data-exact-id="label"`, `data-exact-id={read()}`, `data-exact-id`, `DATA-EXACT-ID="label"`, `{...{ "data-exact-id": "label" }}`, `{...({"DATA-EXACT-ID":"label"} as {"DATA-EXACT-ID"?:string})}`} {
		for _, kind := range []string{"analyze", "check", "compile"} {
			for _, target := range []Target{TargetClient, TargetServer} {
				requestTarget := target
				if kind == "check" {
					requestTarget = TargetDefault
				}
				result := NewSession().Execute(Request{ID: "identity.tsx", Kind: kind, Target: requestTarget, Source: `declare function read():string; export function View(){return()=> <button ` + props + `/>}`})
				found := false
				for _, d := range result.Diagnostics {
					if d.Code == "EXACT_NATIVE_PROP" && strings.Contains(d.Message, "compiler-owned") {
						found = true
						if d.Start < 0 || d.Length == 0 {
							t.Fatal(d)
						}
					}
				}
				if !found || result.Code != "" {
					t.Fatalf("%s/%s %s: %s %#v %s", kind, target, props, result.Error, result.Diagnostics, result.Code)
				}
			}
		}
	}
}
func TestReservedElementIdentityNamespaceAndOtherProps(t *testing.T) {
	for _, source := range []string{`export function View(){return()=> <button data-testid="label" data-exact-other="valid" data-exact-ie="valid"/>}`, `export function View(){return()=> <svg><g data-exact-other="distinct"/></svg>}`, `function Child(props:{"data-exact-id":string}){return()=> <span/>} export function View(){return()=> <Child data-exact-id="ordinary-input"/>}`} {
		result := NewSession().Execute(Request{ID: "identity-valid.tsx", Kind: "compile", Target: TargetClient, Source: source})
		if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) {
			t.Fatalf("%s %#v", result.Error, result.Diagnostics)
		}
	}
	result := NewSession().Execute(Request{ID: "identity-html.tsx", Kind: "compile", Target: TargetServer, Source: `export function View(){return()=> <svg><foreignObject><div DATA-EXACT-ID="invalid"/></foreignObject></svg>}`})
	if !hasErrorDiagnostic(result.Diagnostics) || result.Code != "" {
		t.Fatalf("HTML integration point emitted: %#v", result)
	}
}
func TestReservedElementIdentityHTMLForeignAliases(t *testing.T) {
	for _, host := range []string{`<svg><g DATA-EXACT-ID="invalid"/></svg>`, `<math><mi DaTa-ExAcT-Id="invalid"/></math>`} {
		result := NewSession().Execute(Request{ID: "identity-foreign.tsx", Kind: "compile", Target: TargetServer, Source: `export function View(){return()=> ` + host + `}`})
		if !hasErrorDiagnostic(result.Diagnostics) || result.Code != "" {
			t.Fatalf("foreign HTML alias emitted: %#v", result)
		}
	}
	for _, name := range []string{"data-exact-identity", "data-exact-İd", "data-exact-ıd"} {
		if reservedElementIdentityName(name) {
			t.Fatalf("non-ASCII/nonreserved key folded: %s", name)
		}
	}
}

func TestReservedElementIdentityOpaqueSpreadProjection(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		result := NewSession().Execute(Request{ID: "identity-opaque.tsx", Kind: "compile", Target: target, Source: `declare const bag:Record<string,unknown>; export function View(){return()=> <button {...bag} data-testid="action" onClick={()=>{}}/>}`})
		if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) {
			t.Fatalf("%s %#v", result.Error, result.Diagnostics)
		}
		if !strings.Contains(result.Code, "[__exactElementIdentity]") && !strings.Contains(result.Code, "data-exact-id=") {
			t.Fatalf("opaque bag not protected: %s", result.Code)
		}
	}
	result := NewSession().Execute(Request{ID: "identity-safe.tsx", Kind: "compile", Target: TargetClient, Source: `export function View(){return()=> <button {...{title:"safe"}} onClick={()=>{}}/>}`})
	if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) {
		t.Fatalf("safe bag rejected: %s %#v %s", result.Error, result.Diagnostics, result.Code)
	}
}

// Structural contributions share the host reservation without inheriting intrinsic prop validation.
func TestReservedElementIdentityContributions(t *testing.T) {
	for _, tag := range []string{"_", "_target"} {
		for _, props := range []string{`DATA-EXACT-ID="forged"`, `{...{"data-exact-id":"forged"}}`} {
			for _, kind := range []string{"analyze", "check", "compile"} {
				for _, target := range []Target{TargetClient, TargetServer} {
					if kind == "check" {
						target = TargetDefault
					}
					result := NewSession().Execute(Request{ID: "contribution.tsx", Kind: kind, Target: target, Source: `export function View(){return()=> <` + tag + ` ` + props + `/>}`})
					found := false
					for _, d := range result.Diagnostics {
						if d.Code == "EXACT_NATIVE_PROP" && strings.Contains(d.Message, "compiler-owned") {
							found = true
						}
					}
					if !found || result.Code != "" {
						t.Fatalf("%s/%s/%s: %#v", tag, kind, target, result)
					}
				}
			}
		}
		for _, target := range []Target{TargetClient, TargetServer} {
			result := NewSession().Execute(Request{ID: "contribution-opaque.tsx", Kind: "compile", Target: target, Source: `declare const bag:Record<string,unknown>; export function View(){return()=> <` + tag + ` {...bag}/>} `})
			if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) || strings.Contains(result.Code, "[__exactElementIdentity]") {
				t.Fatalf("%s/%s: %#v", tag, target, result)
			}
		}
	}
}

// These symbol JSX forms exercise internal compiler lowering, not public typed authoring.
func TestReservedElementIdentityCoreAliases(t *testing.T) {
	for _, exported := range []string{"Fragment", "Target"} {
		for _, target := range []Target{TargetClient, TargetServer} {
			prefix := `import { ` + exported + ` as Boundary } from "@exactjs/core"; `
			bad := NewSession().Execute(Request{ID: "identity-alias.tsx", Kind: "compile", Target: target, Source: prefix + `export function View(){return()=> <Boundary {...{"DATA-EXACT-ID":"bad"}}/>}`})
			found := false
			for _, d := range bad.Diagnostics {
				if d.Code == "EXACT_NATIVE_PROP" {
					found = true
				}
			}
			if !found || bad.Code != "" {
				t.Fatalf("%s/%s: %#v", exported, target, bad)
			}
			good := NewSession().Execute(Request{ID: "identity-alias.tsx", Kind: "compile", Target: target, Source: prefix + `declare const bag:Record<string,unknown>; export function View(){return()=> <Boundary {...bag}/>} `})
			if good.Error != "" || hasErrorDiagnostic(good.Diagnostics) || strings.Contains(good.Code, "[__exactElementIdentity]") {
				t.Fatalf("%s/%s: %#v", exported, target, good)
			}
		}
	}
	for _, name := range []string{"Fragment", "Target"} {
		result := NewSession().Execute(Request{ID: "identity-user.tsx", Kind: "compile", Target: TargetClient, Source: `function ` + name + `(props:{"data-exact-id":string}){return()=> <span/>} export function View(){return()=> <` + name + ` data-exact-id="ordinary"/>}`})
		if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) {
			t.Fatalf("ordinary %s: %#v", name, result)
		}
	}
}

func TestReservedElementIdentityLexicalObject(t *testing.T) {
	for _, binding := range []string{`const Object={keys:0};`, `const Object={keys:()=>[]};`} {
		for _, body := range []string{`<button {...bag} onClick={()=>{}}/>`, `<_ {...bag}><button onClick={()=>{}}/></_>`, `<_target {...bag}/>`} {
			for _, target := range []Target{TargetClient, TargetServer} {
				result := NewSession().Execute(Request{ID: "identity-shadow.tsx", Kind: "compile", Target: target, Source: binding + `declare const bag:Record<string,unknown>; export function View(){return()=> ` + body + `}`})
				if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) {
					t.Fatalf("%s/%s: %#v", body, target, result)
				}
			}
		}
	}
}

func TestReservedElementIdentityErasedFiniteMembers(t *testing.T) {
	cases := []struct{ prefix, spread string }{
		{"", `({"data-exact-id":"forged"} as {})`},
		{`declare function read():string;`, `{"data-exact-id":read()}`},
		{`const attrs=({"DATA-EXACT-ID":"forged"} as {});`, "attrs"},
		{`const leaf={"DATA-EXACT-ID":"forged"}; const attrs=({...leaf} as {});`, "attrs"},
		{"", `{"data-exact-id":"first","DATA-EXACT-ID":"second"}`},
	}
	for _, c := range cases {
		for _, tag := range []string{"select", "_target"} {
			source := c.prefix + `export function View(){return()=> <` + tag + ` {...` + c.spread + `}/>}`
			for _, kind := range []string{"analyze", "check", "compile"} {
				for _, target := range []Target{TargetClient, TargetServer} {
					if kind == "check" {
						target = TargetDefault
					}
					result := NewSession().Execute(Request{ID: "identity-erased.tsx", Kind: kind, Target: target, Source: source})
					count := 0
					for _, d := range result.Diagnostics {
						if d.Code == "EXACT_NATIVE_PROP" && strings.Contains(d.Message, "compiler-owned") {
							count++
							span := strings.TrimSpace(source[d.Start : d.Start+d.Length])
							if span != "{..."+c.spread+"}" {
								t.Fatalf("inaccurate spread span %q", span)
							}
						}
					}
					if count != 1 || result.Code != "" {
						t.Fatalf("%s/%s/%s %s: %#v", tag, kind, target, c.spread, result)
					}
				}
			}
		}
	}
}
func TestReservedElementIdentityErasedSpreadControls(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		for _, tag := range []string{"select", "_target"} {
			safe := NewSession().Execute(Request{ID: "identity-erased-safe.tsx", Kind: "compile", Target: target, Source: `const attrs={title:"kept","data-testid":"label"} as {}; export function View(){return()=> <` + tag + ` {...attrs}/>} `})
			if safe.Error != "" || hasErrorDiagnostic(safe.Diagnostics) {
				t.Fatalf("safe finite %s/%s: %#v", tag, target, safe)
			}
			opaque := NewSession().Execute(Request{ID: "identity-erased-opaque.tsx", Kind: "compile", Target: target, Source: `declare const bag:Record<string,unknown>; export function View(){return()=> <` + tag + ` {...(bag as {})}/>} `})
			if opaque.Error != "" || hasErrorDiagnostic(opaque.Diagnostics) || (tag == "select" && !strings.Contains(opaque.Code, "[__exactElementIdentity]")) {
				t.Fatalf("opaque assertion %s/%s: %#v", tag, target, opaque)
			}
		}
	}
	ordinary := NewSession().Execute(Request{ID: "identity-erased-component.tsx", Kind: "compile", Target: TargetClient, Source: `function Child(props:{}){return()=> <span/>} export function View(){return()=> <Child {...({"data-exact-id":"ordinary"} as {})}/>} `})
	if ordinary.Error != "" || hasErrorDiagnostic(ordinary.Diagnostics) {
		t.Fatalf("ordinary component: %#v", ordinary)
	}
}

// Only compiler-created physical metadata can participate in closed literal proofs.
func TestCompilerIdentityPropertiesKeepProofsNarrow(t *testing.T) {
	lowering := &jsxLowering{names: jsxRuntimeNames{elementIdentity: "__physical"}, factory: printer.NewEmitContext().Factory}
	for _, test := range []struct {
		member    string
		generated bool
	}{
		{`[__physical]: "planned"`, true},
		{`[__physical]: void 0`, true},
		{`[authored]: "planned"`, false},
		{`[read()]: "planned"`, false},
		{`["__physical"]: "planned"`, false},
		{`[__physical]: void effect()`, false},
		{`[__physical]: void 1`, false},
		{`[__physical]: 0`, false},
		{`[__physical]: void 0n`, false},
		{`...bag`, false},
		{`get [__physical]() {return "planned"}`, false},
	} {
		t.Run(test.member, func(t *testing.T) {
			source := parseNormalizationSource("/virtual/generated.ts", "const bag={"+test.member+"};")
			bag := source.Statements.Nodes[0].AsVariableStatement().DeclarationList.AsVariableDeclarationList().Declarations.Nodes[0].AsVariableDeclaration().Initializer
			property := bag.AsObjectLiteralExpression().Properties.Nodes[0]
			if lowering.isElementIdentityProperty(property) != test.generated {
				t.Fatal("identity property proof did not preserve compiler ownership")
			}
			if lowering.literalServerInvocationValue(bag) != test.generated {
				t.Fatal("literal proof admitted authored computed work or lost generated metadata")
			}
		})
	}
}
