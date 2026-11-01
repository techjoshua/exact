package exactcompiler

import (
	"strings"
	"testing"
)

// Source witnesses prove ownership selection. Adapter tests execute the emitted server HTML.
func TestNativeOpenMetadataSourceContracts(t *testing.T) {
	cases := []struct {
		name    string
		view    string
		native  bool
		literal bool
	}{
		{"details-before-open", `<details data-exact-ssr-open="false" open/>`, true, true},
		{"details-after-open", `<details open data-exact-ssr-open="false"/>`, true, true},
		{"dialog-before-open", `<dialog data-exact-ssr-open="false" open/>`, true, true},
		{"dialog-after-open", `<dialog open data-exact-ssr-open="false"/>`, true, true},
		{"nested-native", `<section><details data-exact-ssr-open="false" open/><dialog data-exact-ssr-open="false" open/></section>`, true, true},
		{"uppercase-native", `<dialog DATA-EXACT-SSR-OPEN="false" open/>`, true, false},
		{"dynamic-native", `<dialog data-exact-ssr-open={props.baseline} open={props.open}/>`, true, false},
		{"custom-control", `<x-dialog data-exact-ssr-open="false" open/>`, false, true},
		{"ordinary-host", `<section data-exact-ssr-open="false"/>`, false, true},
		{"ordinary-native-attribute", `<details title="more" open/>`, true, false},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			for _, kind := range []string{"analyze", "compile"} {
				for _, target := range []Target{TargetClient, TargetServer} {
					response := NewSession().Execute(Request{
						ID: "native-open-metadata-" + test.name + ".tsx", Kind: kind, Target: target,
						Source: `export function Page(props:{baseline:string;open:boolean}){return()=> ` + test.view + `;}`,
					})
					if response.Error != "" || len(response.Diagnostics) != 0 {
						t.Fatalf("%s %s failed: %s %+v", kind, target, response.Error, response.Diagnostics)
					}
					if kind != "compile" {
						continue
					}
					literal := strings.Contains(response.Code, " data-exact-ssr-open=")
					if target == TargetServer && test.native && literal {
						t.Fatal("Authored metadata bypassed native SSR baseline ownership through literal HTML")
					}
					if test.literal && (target == TargetClient || !test.native) && !literal {
						t.Fatal("Non-owned metadata lost its ordinary attribute behavior")
					}
				}
			}
		})
	}
}
