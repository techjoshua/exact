package exactcompiler

import "testing"

// Set parameters consume the original assignment's values rather than the
// selected accessor's ambient captures. These are MAY effects, not Set receipts.
func TestSourceSetterInputs(t *testing.T) {
	for _, row := range []struct{ name, source, placement string }{
		{"browser callable", `function make(){const box={set work(next:()=>string){next()}};box.work=()=>document.title;return 'safe'}export const value=make();`, "client"},
		{"safe callable", `function make(){const box={set work(next:()=>string){next()}};box.work=()=> 'safe';return 'safe'}export const value=make();`, "isomorphic"},
		{"captured caller", `function make(input:{value:string}){const box={set work(next:()=>string){next()}};box.work=()=>input.value;return 'safe'}export const value=make({get value(){return document.title}});`, "client"},
		{"receiver", `function make(){const box={get value(){return document.title},set work(next:string){this.value}};box.work='safe';return 'safe'}export const value=make();`, "client"},
		{"pattern", `function make(){const box={set work({read}:{read:()=>string}){read()}};box.work={read:()=>document.title};return 'safe'}export const value=make();`, "client"},
		{"RHS getter", `function make(){const input={get value(){return ()=>document.title}};const box={set work(next:()=>string){next()}};box.work=input.value;return 'safe'}export const value=make();`, "client"},
		{"unknown sibling", `declare function foreign():()=>string;declare const choose:boolean;function make(){const box={set work(next:()=>string){next()}};box.work=choose?()=>document.title:foreign();return 'safe'}export const value=make();`, "client"},
		{"throwing RHS donor", `function make(){const input={get value():()=>string{document.title;throw Error('stop')}};const box={set work(next:()=>string){next()}};box.work=input.value;return 'safe'}export const value=make();`, "client"},
	} {
		t.Run(row.name, func(t *testing.T) { assertClosurePlacement(t, row.source, row.placement) })
	}
}
