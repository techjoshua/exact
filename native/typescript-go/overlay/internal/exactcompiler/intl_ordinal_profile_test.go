package exactcompiler

import "testing"

// Wrapper evidence covers exact and partial text consumption, absent neighbors and shared values.
func TestIntlOrdinalWrapperSourceProfiles(t *testing.T) {
	for _, c := range []struct {
		content, prefix, suffix string
		ordinal                 bool
	}{
		{`第{value}位`, "第", "位", true},
		{`順位: 第{value}位です`, "第", "位", true},
		{`第{value}`, "第", "", true},
		{`{value}º`, "", "º", true},
		{`順位: {value}ºです`, "", "º", true},
		{`{value}`, "第", "位", false},
		{`第{value}`, "第", "位", false},
		{`第{value}個`, "第", "位", false},
		{`他{value}位`, "第", "位", false},
		{`{other}{value}位`, "第", "位", false},
		{`第{value}{other}`, "第", "位", false},
		{`第{value}位 第{value}位`, "第", "位", true},
	} {
		source := `export function Page(value:number,other:string){return()=> <p intl:message>` + c.content + `</p>;}`
		g := intlCacheGeneration(t, source)
		result, err := analyzeIntlSourceNative(Request{ID: g.sourceFile.FileName(), Source: source, Extension: &ExtensionRequest{Payload: map[string]any{"owner": "fixture", "sourceLocale": "ja-JP", "ordinalWrappers": []intlOrdinalWrapper{{Prefix: c.prefix, Suffix: c.suffix}}}}}, g.sourceFile, g.checker)
		if err != nil || len(result.Descriptors) != 1 {
			t.Fatalf("lost wrapper lexical content: %v %#v", err, result)
		}
		found := false
		for _, n := range result.Descriptors[0].Source {
			if n.Selection == "plural-ordinal" {
				found = true
			}
		}
		if found != c.ordinal {
			t.Fatalf("changed wrapper proof %s: %#v", c.content, result.Descriptors[0].Source)
		}
	}
}
