package exactcompiler

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// These source witnesses cross finite topology, namespace, serialization, and update planning.
// Runtime corpus assertions separately protect observable DOM and hydration behavior.
func TestRenderProgramSourceContracts(t *testing.T) {
	cases := []struct{ name, view string }{
		{"spread-before-literal", `<div {...props.bag} title="fixed" id="fixed-id" />`},
		{"spread-after-literal", `<div title="fixed" id="fixed-id" {...props.bag} />`},
		{"two-spreads", `<section><input {...props.bag} required maxLength={4} {...props.other} title="fixed" /></section>`},
		{"text-prefix", `<p>before {props.label}<b>boundary</b></p>`},
		{"text-suffix", `<p><b>boundary</b>{props.label} after</p>`},
		{"text-both", `<p>before {props.label} after</p>`},
		{"two-text-runs", `<section><p>{props.label} {/*empty*/} / {props.otherLabel}</p><p>{props.otherLabel} / {props.label}</p></section>`},
		{"structural-before-text", `<div>{props.active && <b>active</b>}{props.label}<span title={props.label}/></div>`},
		{"structural-both-sides", `<div>{props.active && <b>before</b>}<span title={props.label}/>{props.active && <b>after</b>}</div>`},
		{"component-bounded", `<div><Child label={props.label}/><span title={props.label}/><i>after</i></div>`},
		{"component-nested", `<div><section><Child label={props.label}/>{/*empty*/}<span title={props.label}/><i/></section></div>`},
		{"component-deep", `<div><section><article><Child label={props.label}/><span title={props.label}/></article></section></div>`},
		{"component-unbounded", `<div><Child label={props.label}/><span title={props.label}/><Child label={props.label}/></div>`},
		{"component-spread", `<div><Child {...props.bag}/><span/></div>`},
		{"component-key", `<div><Child key={props.label} label={props.label}/><span/></div>`},
		{"component-children", `<div><Child label={props.label}><b>child</b></Child><span/></div>`},
		{"component-empty-props", `<div><Child/><span/></div>`},
		{"svg-html-integration", `<svg><g><Child label={props.label}/><circle data-label={props.label}/></g><foreignObject><div title={props.label}/></foreignObject></svg>`},
		{"mathml-integration", `<math><mtext><mglyph title={props.label}/><malignmark/><button>{props.label}</button></mtext></math>`},
		{"mathml-annotation", `<math><annotation-xml encoding="text/html"><div>{props.label}</div></annotation-xml></math>`},
		{"mathml-other-encoding", `<math><annotation-xml encoding="application/xml"><mrow>{props.label}</mrow></annotation-xml></math>`},
		{"mathml-dynamic-encoding", `<math><annotation-xml {...props.bag} encoding={props.label}><div>{props.label}</div></annotation-xml></math>`},
		{"mathml-encoding-overridden", `<math><annotation-xml encoding="text/html" {...props.bag}><div/></annotation-xml></math>`},
		{"document-comments", `<html>{/*empty*/}<head><meta charSet="UTF-8"/><title>Page</title></head>{/*empty*/}<body><main>{props.label}</main></body></html>`},
		{"document-dynamic-head", `<html><head><meta content={props.label}/><script src="/app.js" crossOrigin="anonymous" fetchPriority="high" noModule referrerPolicy="no-referrer"/></head><body><main/></body></html>`},
		{"document-dynamic-script", `<html><head><script src={props.label}/><script src="/app.js" title={props.label}/></head><body/></html>`},
		{"document-script-spread", `<html><head><script {...props.bag} src="/app.js"/></head><body/></html>`},
		{"noncanonical-document", `<html><body/><head/></html>`},
		{"style-fallback", `<div><style>{props.label}</style><span/></div>`},
		{"text-host-structural", `<div><textarea>{props.active && <b>value</b>}</textarea><title><Child/></title></div>`},
		{"text-replay-descendant", `<span className="static" title={props.label}><button onClick={() => {}}>text</button></span>`},
		{"text-host-scalar", `<div><textarea>{/*empty*/}{props.label}</textarea><title>{props.otherLabel}</title></div>`},
		{"url-kinds", `<section><form action="/submit"><button formAction="../send" commandFor={props.label}/></form><button formaction="#local"/><a href={props.label}/><img srcSet={props.label}/><video poster={props.label}/><blockquote cite={props.label}/><object data={props.label}/></section>`},
		{"unsafe-url", `<section><a href="javascript:alert(1)"/><img src="data:text/html,x"/><x-link href="/custom"/></section>`},
		{"property-kinds", `<div><span className={props.label} style={{color:props.label}}/><iframe srcDoc={props.label}/><input value={props.label}/></div>`},
		{"class-proof-safe", `<div className={props.active ? 'safe_name' : 'other-name'}>{props.label}</div>`},
		{"class-proof-unsafe", `<div className={props.active ? 'safe_name' : 'quote"'}>{props.label}</div>`},
		{"scalar-root-boolean-neighbor", `<input required title={props.label}/>`},
		{"scalar-root-numeric-neighbor", `<input maxLength={4} title={props.label}/>`},
		{"nested-object-reader", `<div title={props.bag.title}>{props.bag['title']}</div>`},
		{"tagged-reader", "<div title={tag`${props.label}`}>{tag`${props.otherLabel}`}</div>"},
		{"function-reader", `<div title={(() => props.label)()}>{(() => props.otherLabel)()}</div>`},
		{"function-expression-reader", `<div title={(function(){return props.label;})()}>{(function(){return props.otherLabel;})()}</div>`},
		{"factory-call-reader", `<div title={(() => () => props.label)()()}>{props.otherLabel}</div>`},
		{"native-call-reader", `<div title={(() => props.label).call(undefined)}>{props.otherLabel}</div>`},
		{"native-apply-reader", `<div title={(() => props.label).apply(undefined,[])}>{props.otherLabel}</div>`},
		{"native-bound-reader", `<div title={(() => props.label).bind(undefined)()}>{props.otherLabel}</div>`},
		{"non-null-reader", `<div title={props.label!}>{props.otherLabel!}</div>`},
		{"select-after-option", `<section><select value={props.label}><option value={props.otherLabel}>{props.label}</option></select></section>`},
	}
	staticAttributes := map[string]string{"htmlFor": "label", "class": "div", "for": "label", "placeholder": "input", "inputmode": "input", "pattern": "input", "min": "input", "max": "input", "step": "input", "width": "img", "height": "img", "colspan": "td", "rowspan": "td", "scope": "th", "kind": "track", "label": "track", "media": "link", "target": "a", "download": "a", "crossorigin": "script", "referrerpolicy": "script", "fetchpriority": "img", "decoding": "img", "dir": "div", "aria-label": "div", "data-label": "div"}
	for name, tag := range staticAttributes {
		cases = append(cases, struct{ name, view string }{"static-" + name, `<` + tag + ` ` + name + `="a&amp;&quot;&lt;"/>`})
	}
	for _, tag := range []string{"area", "base", "br", "col", "embed", "hr", "param", "source", "track", "wbr"} {
		cases = append(cases, struct{ name, view string }{"void-" + tag, `<div><` + tag + ` title={props.label}/></div>`})
	}
	for _, depth := range []int{7, 8, 10} {
		cases = append(cases, struct{ name, view string }{fmt.Sprint("claim-depth-", depth), strings.Repeat("<g>", depth) + `<circle data-label={props.label}/>{props.label}<Child/>` + strings.Repeat("</g>", depth)})
	}
	for _, width := range []int{63, 64, 65, 130} {
		cases = append(cases, struct{ name, view string }{fmt.Sprint("claim-width-", width), `<div>` + strings.Repeat(`<i/>`, width) + `<span title={props.label}/>` + strings.Repeat(`<i/>`, width) + `</div>`})
	}
	cases = append(cases, struct{ name, view string }{"wide-list-mask", `<section>` + strings.Repeat(`<span>{props.label}</span>`, 32) + `{[props.label].map((label)=><b key={label}>{label}</b>)}</section>`})
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
				response := NewSession().Execute(Request{ID: "render-contract-" + test.name + ".tsx", Kind: "compile", Target: target,
					Source: `function tag(parts:TemplateStringsArray,...values:string[]){return values.join('');} function Child(props:{label?:string;children?:unknown}){return()=> <b>{props.label}</b>;} export function Page(props:{label:string;otherLabel:string;active:boolean;bag:{title?:string};other:{title?:string}}){return()=> ` + test.view + `;}`,
				})
				if response.Error != "" || response.Code == "" || len(response.Diagnostics) != 0 {
					t.Fatalf("%s source failed to lower: %s\n%+v", target, response.Error, response.Diagnostics)
				}
				if target == TargetClient && strings.HasPrefix(test.name, "spread-") && !strings.Contains(response.Code, `__exactApply("title", "fixed")`) {
					t.Fatalf("literal bypassed ordered spread writer:\n%s", response.Code)
				}
				if target == TargetServer && strings.Contains(response.Code, "template:") {
					t.Fatalf("server serialization retained client topology:\n%s", response.Code)
				}
			}
		})
	}
}

func TestTextHostObservesCopiedIntrinsicSpreads(t *testing.T) {
	for _, child := range []string{
		`<span {...this.state.bag}>text</span>`,
		`<span><b {...this.state.bag}>text</b></span>`,
		`<span {...this.state.bag} title="fixed">text</span>`,
		`<span title="before" {...this.state.bag}>text</span>`,
		`<><span {...this.state.bag}>text</span></>`,
		`<_><span {...this.state.bag}>text</span></_>`,
		`<span>text</span>`,
		`<span><Child/></span>`,
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			response := NewSession().Execute(Request{ID: "text-spread.tsx", Kind: "compile", Target: target,
				Source: `import type {Component} from '@exactjs/core';function Child(){return()=> <b>child</b>;}export function Page(this:Component<{bag:{title?:string}}>){this.state.bag={title:'first'};return()=> <textarea>` + child + `</textarea>;}`,
			})
			if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
				t.Fatalf("%s failed: %s %+v", target, response.Error, response.Diagnostics)
			}
			if target == TargetClient && strings.Contains(child, "...") && !strings.Contains(response.Code, "__exactExpression(") {
				t.Fatalf("copied text-host props have no owned observation:\n%s", response.Code)
			}
		}
	}
}

func TestRenderProgramEnhancementSourceBoundaries(t *testing.T) {
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	entry := filepath.Join(root, "entry.tsx")
	for name, source := range map[string]string{
		config:                                   `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		filepath.Join(root, "motion.ts"):         `export { Motion as fade } from "./implementation.js" with { type: "exact-enhancement" };`,
		filepath.Join(root, "implementation.ts"): `export function Motion(props: { fade?: boolean; children?: unknown }) { return props.children; }`,
	} {
		if err := os.WriteFile(name, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	for _, view := range []string{
		`<div motion:fade title="root">root</div>`,
		`<section><div motion:fade/><i/></section>`,
		`<section><div motion:fade>text</div><i/></section>`,
		`<section><div motion:fade/></section>`,
		`<section><div motion:fade>text</div></section>`,
		`<div {...config} title="fixed"/>`,
		`<html><head><script motion:fade src="/app.js"/></head><body/></html>`,
	} {
		for _, target := range []Target{TargetDefault, TargetClient, TargetServer} {
			source := `import * as motion from "./motion.js" with { type: "exact-enhancement" };const config={"motion:fade":true,title:"spread"} as const;export function Page(){return()=> ` + view + `;}`
			if err := os.WriteFile(entry, []byte(source), 0o600); err != nil {
				t.Fatal(err)
			}
			response := NewSession().Execute(Request{ID: entry, Kind: "compile", Target: target, Source: source, ConfigFile: config})
			if response.Error != "" || len(response.Diagnostics) != 0 || response.Code == "" {
				t.Fatalf("%s %s failed: %s %+v", target, view, response.Error, response.Diagnostics)
			}
		}
	}
}
