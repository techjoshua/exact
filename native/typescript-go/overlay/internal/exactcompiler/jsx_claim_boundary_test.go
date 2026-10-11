package exactcompiler

import (
	"strings"
	"testing"
)

// These witnesses exercise native planning at the compact claim operand boundaries.
// dom-claim-boundaries.test.ts separately verifies adoption, retained updates and identity.
func TestRenderProgramClaimBoundarySource(t *testing.T) {
	button := `<button data-count={this.state.count} onClick={()=>this.state.count++}>{this.state.count}</button>`
	property := `<button data-count={this.state.count} onClick={()=>this.state.count++}>Increment</button>`
	surround := func(content string, depth int) string {
		return strings.Repeat("<section>", depth) + content + strings.Repeat("</section>", depth)
	}
	for _, test := range []struct{ name, content string }{
		{"seven ancestors", surround(button, 7)},
		{"eight ancestors", surround(button, 8)},
		{"63 siblings", strings.Repeat("<i>static</i>", 63) + button + strings.Repeat("<i>static</i>", 63)},
		{"64 siblings", strings.Repeat("<i>static</i>", 64) + button + strings.Repeat("<i>static</i>", 64)},
		{"deep property", surround(property, 8)},
		{"wide property", strings.Repeat("<i>static</i>", 64) + property + strings.Repeat("<i>static</i>", 64)},
		{"variable ranges", `{this.state.visible ? <i>left</i> : null}` + button + `{this.state.visible ? <i>right</i> : null}`},
		{"property ranges", `{this.state.visible ? <i>left</i> : null}` + property + `{this.state.visible ? <i>right</i> : null}`},
		{"mathml text integration", `<math><mtext>` + property + `</mtext></math>`},
		{"mathml glyph exceptions", `<math><mi><mglyph/><malignmark/>` + property + `</mi></math>`},
		{"mathml annotation html", `<math><annotation-xml encoding="text/html">` + property + `</annotation-xml></math>`},
		{"mathml annotation xhtml", `<math><annotation-xml encoding="application/xhtml+xml">` + property + `</annotation-xml></math>`},
		{"mathml annotation uppercase", `<math><annotation-xml encoding="TEXT/HTML">` + property + `</annotation-xml></math>`},
		{"mathml annotation dynamic", `<math><annotation-xml encoding={this.state.visible?'text/html':'application/xhtml+xml'}>` + property + `</annotation-xml></math>`},
		{"contextual svg deep", `<svg><SvgFallback count={this.state.count} advance={()=>this.state.count++}/></svg>`},
		{"contextual svg targeted", `<svg><SvgTarget count={this.state.count} advance={()=>this.state.count++}/></svg>`},
		{"contextual mathml", `<math><mrow><MathSymbol count={this.state.count} advance={()=>this.state.count++}/></mrow></math>`},
		{"component svg integration", `<svg><foreignObject><Control count={this.state.count} advance={()=>this.state.count++}/></foreignObject></svg>`},
		{"component mathml integration", `<math><mtext><Control count={this.state.count} advance={()=>this.state.count++}/></mtext></math>`},
		{"svg transition", `<svg><g><g><g><g><g><foreignObject>` + surround(button, 2) + `</foreignObject></g></g></g></g></g></svg>`},
	} {
		t.Run(test.name, func(t *testing.T) {
			source := `import {type Component} from '@exactjs/core';
function SvgFallback(props:{count:number;advance:()=>void}){return()=> <g>` + strings.Repeat("<g>", 8) + `<circle data-count={props.count} onClick={props.advance}/>` + strings.Repeat("</g>", 8) + `</g>;}
function SvgTarget(props:{count:number;advance:()=>void}){return()=> <circle data-count={props.count} onClick={props.advance}/>;}
function MathSymbol(props:{count:number;advance:()=>void}){return()=> <mi data-count={props.count} onClick={props.advance}>x</mi>;}
function Control(props:{count:number;advance:()=>void}){return()=> <button data-count={props.count} onClick={props.advance}>Increment</button>;}
export function Page(this:Component<{count:number;visible:boolean}>){this.state.count=0;this.state.visible=true;return()=> <article>` + test.content + `</article>;}`
			for _, target := range []Target{TargetClient, TargetServer} {
				response := NewSession().Execute(Request{Kind: "compile", ID: "claim-boundary.tsx", Source: source, Target: target})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				for _, diagnostic := range response.Diagnostics {
					if diagnostic.Severity == "error" {
						t.Fatalf("valid claim boundary rejected: %#v", response.Diagnostics)
					}
				}
			}
		})
	}
}
