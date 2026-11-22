package exactcompiler

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/tspath"
)

func TestNormalizeAuthoredSourceRewritesPropPunning(t *testing.T) {
	source := `
		const text = "<Card {ignored} />";
		const template = ` + "`<Card {alsoIgnored} />`" + `;
		// <Card {commented} />
		export function View() {
			return () => (
				<Card {value} {count} expression={{ pattern: /}/, template: ` + "`value=${{ nested: true }.nested}`" + ` }} {...shared}>
					{value}
					<Nested {subtitle} />
				</Card>
			);
		}
	`
	normalized, err := normalizeAuthoredSource(normalizationTestFile(t, "view.tsx"), source)
	if err != nil {
		t.Fatal(err)
	}
	for _, rewritten := range []string{
		"<Card value={value} count={count}",
		"<Nested subtitle={subtitle}",
	} {
		if !strings.Contains(normalized.text, rewritten) {
			t.Fatalf("punned prop was not normalized to %q:\n%s", rewritten, normalized.text)
		}
	}
	for _, retained := range []string{
		`"<Card {ignored} />"`,
		"`<Card {alsoIgnored} />`",
		`// <Card {commented} />`,
		"expression={{ pattern: /}/, template: `value=${{ nested: true }.nested}` }}",
		`{...shared}`,
		"\n\t\t\t\t\t{value}\n",
	} {
		if !strings.Contains(normalized.text, retained) {
			t.Fatalf("normalization changed %q:\n%s", retained, normalized.text)
		}
	}
}

func TestPlanPropPunningRejectsNonShorthandBraceForms(t *testing.T) {
	for _, source := range []string{
		`const view = <Card value={value} />;`,
		`const view = <Card {...shared} />;`,
		`const view = <Card {value + other} />;`,
		`const view = <Card { value } />;`,
		`const view = <Card>{value}</Card>;`,
		`const text = "<Card {value} />";`,
		"const text = `<Card {value} />`;",
		`// <Card {value} />`,
	} {
		edits := planJSXAttributeSyntax(parseNormalizationSource(normalizationTestFile(t, "unchanged.tsx"), source))
		if len(edits) != 0 {
			t.Fatalf("non-shorthand source produced edits %#v:\n%s", edits, source)
		}
	}
}

func TestNormalizeAuthoredSourceOwnsDerivedComponentWork(t *testing.T) {
	normalized, err := normalizeAuthoredSource(
		normalizationTestFile(t, "summary.tsx"),
		`
			export function Summary(
				this: Component<{ quantity: number; price: number; subtotal: number }>
			) {
				this.state.subtotal = this.state.quantity * this.state.price;
				return () => <output>{this.state.subtotal}</output>;
			}
		`,
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		`const __exactComponentComputation_`,
		`this.state.subtotal = this.state.quantity * this.state.price; }; __exactComponentComputation_`,
	} {
		if !strings.Contains(normalized.text, expected) {
			t.Fatalf("derived setup work is missing %q:\n%s", expected, normalized.text)
		}
	}
}

func TestNormalizeAuthoredSourceCanonicalizesDirectComponentsButNotMicroComponents(t *testing.T) {
	normalized, err := normalizeAuthoredSource(
		normalizationTestFile(t, "direct-components.tsx"),
		`
			export function Rule() {
				return <hr />;
			}
			export const Badge = (props: { label: string }) => <strong>{props.label}</strong>;
			export function Article(this: Component<{ text: string }>) {
				const Footer = () => <footer>{this.state.text}</footer>;
				return () => <main><Footer /></main>;
			}
		`,
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		`return () => (<hr />);`,
		`const Badge = (props: { label: string }) => () => (<strong>{props.label}</strong>);`,
		`const Footer = () => <footer>{this.state.text}</footer>;`,
	} {
		if !strings.Contains(normalized.text, expected) {
			t.Fatalf("canonical component normalization is missing %q:\n%s", expected, normalized.text)
		}
	}
}

func TestNormalizeAuthoredSourcePreservesBoundSetupHelperRenderReturn(t *testing.T) {
	normalized, err := normalizeAuthoredSource(
		normalizationTestFile(t, "input.tsx"),
		`
			interface Component {}
			function control(this: Component, type: string) {
				return () => <input type={type} />;
			}
			export function Input(this: Component) {
				return control.call(this, "text");
			}
		`,
	)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(normalized.text, `return control.call(this, "text");`) ||
		strings.Contains(normalized.text, `return () => (control.call(this, "text"));`) {
		t.Fatalf("setup helper render return gained an extra callable layer:\n%s", normalized.text)
	}
}

func TestNormalizeAuthoredSourceOwnsAsyncComponentContinuation(t *testing.T) {
	normalized, err := normalizeAuthoredSource(
		normalizationTestFile(t, "customer.tsx"),
		`
			declare function load(id: string): Promise<string>;
			export async function Customer(
				this: Component<{ id: string; value?: string; error?: string }>
			) {
				try {
					this.state.value = await load(this.state.id);
				} catch (error) {
					this.state.error = String(error);
				}
				return () => <output>{this.state.value}</output>;
			}
		`,
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"export  function Customer",
		"import { TaskContext as __exactTaskContext } from \"@exactjs/core\";",
		"async function __exactComponentSetupTask_",
		"__exactComponentTaskContext: __exactTaskContext = __exactTaskContext.server().blocking()",
		"if (__exactComponentTaskContext.signal.aborted) throw __exactComponentTaskContext.signal.reason;",
	} {
		if !strings.Contains(normalized.text, expected) {
			t.Fatalf("async normalization is missing %q:\n%s", expected, normalized.text)
		}
	}
}

func TestNormalizeAuthoredSourcePublishesDestructuredState(t *testing.T) {
	normalized, err := normalizeAuthoredSource(
		normalizationTestFile(t, "selection.tsx"),
		`
			export function Selection(
				this: Component<{ values: number[]; selected: number; remaining: number[] }>
			) {
				[this.state.selected = 10, ...this.state.remaining] = this.state.values;
				return () => <output>{this.state.selected}</output>;
			}
		`,
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"const [__exactDestructured_",
		"this.state.selected = __exactDestructured_",
		"this.state.remaining = __exactDestructured_",
	} {
		if !strings.Contains(normalized.text, expected) {
			t.Fatalf("destructuring normalization is missing %q:\n%s", expected, normalized.text)
		}
	}
}

func TestNormalizeAuthoredSourcePreservesNestedDestructuringSemantics(t *testing.T) {
	normalized, err := normalizeAuthoredSource(
		normalizationTestFile(t, "callback-selection.tsx"),
		`
			export function Selection(
				this: Component<{ values: number[]; selected: number; remaining: number[] }>
			) {
				return () => <button onClick={() => consume(
					([this.state.selected = fallback(), ...this.state.remaining] = load())
				)} />;
			}
		`,
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"const __exactDestructured_",
		"set value_0(",
		"this.state.selected = __exactDestructured_",
		"set value_1(",
		"...__exactDestructured_",
		"return ([__exactDestructured_",
		"= fallback()",
		"] = load());",
	} {
		if !strings.Contains(normalized.text, expected) {
			t.Fatalf("nested destructuring normalization is missing %q:\n%s", expected, normalized.text)
		}
	}
}

func TestNormalizeAuthoredSourceRejectsDestructuringWritesInRender(t *testing.T) {
	for name, source := range map[string]string{
		"literal": `
			function Selection(this: Component<{ selected: number }>) {
				return () => {
					[this.state.selected] = load();
					return <output />;
				};
			}
		`,
		"micro-component": `
			function Selection(this: Component<{ selected: number }>) {
				const Output = () => {
					[this.state.selected] = load();
					return <output />;
				};
				return () => <Output />;
			}
		`,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeAuthoredSource(
				normalizationTestFile(t, name+".tsx"),
				source,
			)
			if err == nil ||
				!strings.Contains(
					err.Error(),
					"render functions may not write component state",
				) {
				t.Fatalf("missing render-write error: %v", err)
			}
		})
	}
}

func TestNormalizeAuthoredSourcePreservesMixedObjectDestructuring(t *testing.T) {
	normalized, err := normalizeAuthoredSource(
		normalizationTestFile(t, "object-selection.tsx"),
		`
			function Selection(this: Component<{ selected: number }>) {
				const state = this.state;
				let local = 0;
				let remaining = {};
				return () => <button onClick={() => consume(
					({ primary: state.selected = fallback(), secondary: local, ...remaining } = load())
				)} />;
			}
		`,
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"primary: __exactDestructured_",
		"= fallback()",
		"secondary: __exactDestructured_",
		"...__exactDestructured_",
		"state.selected = __exactDestructured_",
		"local = __exactDestructured_",
		"remaining = __exactDestructured_",
	} {
		if !strings.Contains(normalized.text, expected) {
			t.Fatalf("mixed object destructuring is missing %q:\n%s", expected, normalized.text)
		}
	}
}

func TestNormalizeAuthoredSourceLowersNestedDestructuringAssignments(t *testing.T) {
	normalized, err := normalizeAuthoredSource(
		normalizationTestFile(t, "nested-assignment.tsx"),
		`
			function Selection(
				this: Component<{ selected: number; mirrored: number }>
			) {
				return () => <button onClick={() => consume(
					([this.state.selected] = [this.state.mirrored] = load())
				)} />;
			}
		`,
	)
	if err != nil {
		t.Fatal(err)
	}
	if count := strings.Count(normalized.text, "set value_0("); count != 2 {
		t.Fatalf(
			"expected both destructuring assignments to be lowered, received %d:\n%s",
			count,
			normalized.text,
		)
	}
	for _, target := range []string{"this.state.selected =", "this.state.mirrored ="} {
		if !strings.Contains(normalized.text, target) {
			t.Fatalf("nested assignment is missing %q:\n%s", target, normalized.text)
		}
	}
}

func TestNormalizedSourceRemapsSourceMapColumns(t *testing.T) {
	authored := `const view = <Card {value} />;`
	normalized, err := normalizeAuthoredSource(
		normalizationTestFile(t, "view.tsx"),
		authored,
	)
	if err != nil {
		t.Fatal(err)
	}
	normalizedColumn := strings.Index(normalized.text, "/>")
	authoredColumn := strings.Index(authored, "/>")
	mapping := encodeSourceMapSegment([]int{0, 0, 0, normalizedColumn})
	remapped := remapSourceMapMappings(mapping, normalized)
	values, valid := decodeSourceMapSegment(remapped)
	if !valid || len(values) != 4 || values[3] != authoredColumn {
		t.Fatalf(
			"source map column was not remapped: got %q (%#v), expected %d",
			remapped,
			values,
			authoredColumn,
		)
	}
}

func normalizationTestFile(t *testing.T, name string) string {
	t.Helper()
	return tspath.NormalizePath(filepath.ToSlash(filepath.Join(t.TempDir(), name)))
}

func TestDestructuredComponentPropsRejectUnsupportedBindings(t *testing.T) {
	for _, binding := range []string{"{ value: { nested } }", "{ value, ...rest }", "{ [key]: value }"} {
		_, err := normalizeAuthoredSource(normalizationTestFile(t, "props.tsx"),
			"export function View("+binding+": any) { return () => <p/>; }")
		if err == nil || !strings.Contains(err.Error(), "props destructuring supports flat named fields") {
			t.Fatalf("expected authored diagnostic for %s, received %v", binding, err)
		}
	}
}

func TestNormalizeCoreReceiverReturns(t *testing.T) {
	source := `
		import { type Component as CoreComponent } from '@exactjs/core';
		type Owner = CoreComponent<{ count: number }>;
		function publish(this: Owner, next: number) {
			this.setContext(Token, next);
			return this.state.count + next;
		}
		function forward(this: Owner, next: number) {
			return publish.call(this, next);
		}
		function renderDirect(this: Owner) { return <output>{this.state.count}</output>; }
		function prepare(this: Owner) { return () => <output>{this.state.count}</output>; }
		export function Panel(this: Owner) { return prepare.call(this); }
		export function Scalar(this: Owner) { return 1; }
	`
	normalized, err := normalizeAuthoredSource(normalizationTestFile(t, "receiver-returns.tsx"), source)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"return this.state.count + next;",
		"return publish.call(this, next);",
		"return () => (<output>{this.state.count}</output>);",
		"return () => <output>{this.state.count}</output>;",
		"return prepare.call(this);",
		"return () => (1);",
	} {
		if !strings.Contains(normalized.text, expected) {
			t.Fatalf("canonical receiver returns lost %q:\n%s", expected, normalized.text)
		}
	}
}

func TestNormalizationPreservesRecoveredJSXShorthandDiagnostic(t *testing.T) {
	for _, source := range []string{
		`type F = (x = <Card {value} />) => void;`,
		`type F = (x = <Card {value} />) => void; const view = <Card {value} />;`,
	} {
		fileName := normalizationTestFile(t, "recovered.tsx")
		normalized, err := normalizeAuthoredSource(fileName, source)
		if err != nil {
			t.Fatal(err)
		}
		if want := strings.ReplaceAll(source, "{value}", "value={value}"); normalized.text != want {
			t.Fatalf("recovered shorthand normalization = %q, want %q", normalized.text, want)
		}
		result := NewSession().Execute(Request{
			ID: fileName, Kind: "diagnose", Source: source, Diagnostics: "semantic",
		})
		if result.Error != "" {
			t.Fatal(result.Error)
		}
		found := false
		for _, diagnostic := range result.Diagnostics {
			switch diagnostic.Code {
			case "TS1005":
				t.Fatalf("shorthand surfaced a parser diagnostic: %#v", diagnostic)
			case "TS2371":
				if diagnostic.Start != strings.Index(source, "x =") ||
					diagnostic.Length != len("x = <Card {value} />") {
					t.Fatalf("recovered initializer diagnostic lost its authored span: %#v", diagnostic)
				}
				found = true
			}
		}
		if !found {
			t.Fatalf("expected the type-signature initializer diagnostic: %#v", result.Diagnostics)
		}
	}
}

func TestNormalizationComposesEditsAcrossSessionGenerations(t *testing.T) {
	const source = `import type { Component } from "@exactjs/core";
		function Card(props: { value: number }) { return () => <span>{props.value}</span>; }
		export function View(this: Component<{ count: number }>, { step }: { step: number }) {
			[this.state.count] = [1];
			const value = this.state.count + step;
			return <section CLASSNAME="first"><Card {value} /></section>;
		}`
	for _, target := range []Target{TargetClient, TargetServer} {
		t.Run(string(target), func(t *testing.T) {
			session := NewSession()
			fileName := normalizationTestFile(t, "composed.tsx")
			edited := strings.NewReplacer(
				"[1]", "[123]",
				"count + step", "count * step",
				`CLASSNAME="first"`, `CLASSNAME="edited😀"`,
			).Replace(source)
			for index, authored := range []string{source, edited, edited} {
				result := session.Execute(Request{
					ID: fileName, Kind: "compile", Source: authored, Target: target, SourceMap: true,
				})
				if result.Error != "" || hasErrorDiagnostic(result.Diagnostics) {
					t.Fatalf("generation %d failed: %s %#v", index, result.Error, result.Diagnostics)
				}
				marker := "first"
				operation := " + "
				if index > 0 {
					marker = "edited"
					operation = " * "
				}
				for _, expected := range []string{marker, operation, "className", "value"} {
					if !strings.Contains(result.Code, expected) {
						t.Fatalf("generation %d output missing %q:\n%s", index, expected, result.Code)
					}
				}
				if index > 0 && strings.Contains(result.Code, "first") {
					t.Fatalf("stale output after editing:\n%s", result.Code)
				}
				if result.CacheHit != (index == 2) {
					t.Fatalf("unexpected cache hit at generation %d: %t", index, result.CacheHit)
				}
				if result.SourceMap == nil || len(result.SourceMap.SourcesContent) != 1 ||
					result.SourceMap.SourcesContent[0] == nil ||
					*result.SourceMap.SourcesContent[0] != authored {
					t.Fatalf("generation %d source map lost its authored content: %#v", index, result.SourceMap)
				}
				const card = "<Card {value} />"
				start := strings.Index(authored, card)
				found := false
				for _, jsx := range result.Analysis.JSX {
					if jsx.Start == start && jsx.Length == len(card) {
						found = true
					}
				}
				if !found {
					t.Fatalf("generation %d lost the authored Card span %d:%d: %#v",
						index, start, start+len(card), result.Analysis.JSX)
				}
			}
		})
	}
}
