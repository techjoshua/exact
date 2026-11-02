package exactcompiler

import "testing"

// Early key rejection must retain donors at every demanded depth and through
// unknown keys. An unrelated RHS does not become a donor for another field.
func TestMemberWriterKeyDemand(t *testing.T) {
	for _, row := range []struct {
		name, put, read string
		browser         bool
	}{
		{"first segment", `box.field={get value(){return document.title}}`, `box.field.value`, true},
		{"nested segment", `box.nested.field={get value(){return document.title}}`, `box.nested.field.value`, true},
		{"unknown key", `box[key]={get value(){return document.title}}`, `box.field.value`, true},
		{"unrelated", `box.other={get value(){return document.title}}`, `box.field.value`, false},
	} {
		t.Run(row.name, func(t *testing.T) {
			source := `declare const key:string;const box:{[key:string]:any}={field:{value:'safe'},nested:{field:{value:'safe'}},other:{value:'safe'}};declare function foreign(value:object):void;foreign(box);function put(){` + row.put + `};put();export const value=` + row.read + `;`
			_, _, summary := currentProxyCaller(t, source, "export const value")
			browser := false
			for _, effect := range summary.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != row.browser {
				t.Fatal("member key donor", summary.EffectSources)
			}
		})
	}
}
