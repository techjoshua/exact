package exactcompiler

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/internal/tspath"
)

func TestNormalizeAuthoredSourceRewritesPropPunning(t *testing.T) {
	source := `
		const text = "<Card {ignored} />";
		// <Card {commented} />
		export function View() {
			return () => <Card {value} expression={{ pattern: /}/ }} />;
		}
	`
	normalized, err := normalizeAuthoredSource(normalizationTestFile(t, "view.tsx"), source)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(normalized.text, "<Card value={value}") {
		t.Fatalf("punned prop was not normalized:\n%s", normalized.text)
	}
	for _, retained := range []string{
		`"<Card {ignored} />"`,
		`// <Card {commented} />`,
		`expression={{ pattern: /}/ }}`,
	} {
		if !strings.Contains(normalized.text, retained) {
			t.Fatalf("normalization changed %q:\n%s", retained, normalized.text)
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
		`function __exactComponentComputation_`,
		`this.state.subtotal = this.state.quantity * this.state.price; } __exactComponentComputation_`,
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
