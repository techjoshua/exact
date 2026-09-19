package exactcompiler

import (
	"strings"
	"testing"
)

func TestDocumentCompositionRetainsAuthoredStructureAcrossTargets(t *testing.T) {
	for _, target := range []Target{TargetClient, TargetServer} {
		response := NewSession().Execute(Request{
			ID: "C:/tmp/document-composition.tsx", Kind: "compile", Target: target,
			Source: `import { Document as Shell } from '@exactjs/core/document';
export function Page(this: Component<{ title: string }>) {
 this.state.title = 'Example';
 return () => <Shell><html lang={this.state.title}><head><title>Title {this.state.title}</title></head><body><button onClick={() => this.state.title = 'Next'}>Body</button></body></html></Shell>;
}`,
		})
		if response.Error != "" {
			t.Fatal(response.Error)
		}
		for _, expected := range []string{`createCompiledDocumentReceipt`, `__exactIntrinsicReceipt("html"`, `__exactIntrinsicReceipt("head"`, `__exactIntrinsicReceipt("body"`} {
			if !strings.Contains(response.Code, expected) {
				t.Fatalf("%s omitted composable document structure %s:\n%s", target, expected, response.Code)
			}
		}
		if strings.Contains(response.Code, `__exactComponentReceipt(Shell`) {
			t.Fatalf("document became an ordinary component:\n%s", response.Code)
		}
	}
}
