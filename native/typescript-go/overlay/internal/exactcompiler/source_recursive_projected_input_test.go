package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A recursive render dependency can carry a symbolic input and independently
// acquired children. Bound that symbolic work while retaining the original
// getter's target requirement on either recursive branch.
func TestRecursiveProjectedInputRetainsRenderGetters(t *testing.T) {
	root, config := formsSourceFixture(t)
	entry := filepath.Join(root, "Forms.tsx")
	const source = `
type Input = {
	kind: 'leaf' | 'branch';
	value?: string;
	children?: Input[];
	fallback?: Input[];
	cases?: {value: Input[]}[];
};
function scan(input: readonly Input[]): string {
	const labels: string[] = [];
	const visit = (rows: readonly Input[]) => {
		for (let index = 0; index < rows.length; index++) {
			const row = rows[index]!;
			if (row.kind === 'leaf') {
				labels.push(row.value!);
				continue;
			}
			if (row.children) visit(row.children);
			if (row.fallback) visit(row.fallback);
			if (row.cases) {
				for (let branch = 0; branch < row.cases.length; branch++) {
					visit(row.cases[branch]!.value);
				}
			}
		}
	};
	visit(input);
	return labels.join(' ');
}
export function Page() { return () => <p>{scan(INPUT)}</p> }
`
	for _, test := range []struct {
		name, input, placement string
	}{
		{"separate children", "[{kind:'branch',children:[{kind:'leaf',get value(){return document.title}}]}]", "client"},
		{"nested fallback", "[{kind:'branch',cases:[{value:[{kind:'branch',fallback:[{kind:'leaf',get value(){return document.title}}]}]}]}]", "client"},
		{"neutral", "[{kind:'branch',fallback:[{kind:'leaf',value:'safe'}]}]", "unknown"},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := strings.Replace(source, "INPUT", test.input, 1)
			if err := os.WriteFile(entry, []byte(input), 0600); err != nil {
				t.Fatal(err)
			}
			response := NewSession().Execute(Request{
				ID: entry, Kind: "compile", Target: TargetServer, Source: input, ConfigFile: config,
				Diagnostics: "semantic", TraceAnalysisCost: true,
			})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) || response.Code == "" {
				t.Fatal(response.Error, response.Diagnostics)
			}
			page := findComponent(t, response.Analysis.Components, "Page")
			if page.Placement != test.placement {
				t.Fatalf("placement=%s want %s", page.Placement, test.placement)
			}
			if cost := response.Counters.EstimatedAnalysisCost; cost <= 0 || cost > 250_000 {
				t.Fatalf("recursive projected input estimated work=%d", cost)
			}
		})
	}
}
