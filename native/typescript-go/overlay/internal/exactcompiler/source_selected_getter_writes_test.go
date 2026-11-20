package exactcompiler

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestComponentSelectedGetterDescriptorWrite(t *testing.T) {
	const component = `import {TaskContext,type Component} from '@exactjs/core';
declare function foreign():void;
type Metadata={readKey?:()=>string,domain:string};
function configure(_target:object){
 Object.defineProperty(Object.prototype,'readKey',{configurable:true,get:function(this:object){
  Object.defineProperty(this,'domain',{configurable:true,get:function browserDomain(){return DONOR}});
  return undefined;
 }});
}
function put(target:object){
 Object.defineProperty(target,'domain',{configurable:true,get(){return DONOR}});
}
READER
export function Page(this:Component<{label:string}>){
 this.state.label='start';
 const run=(task:TaskContext=TaskContext.server())=>{
  const metadata:Metadata={domain:'safe' SHADOW};
  const other:Metadata={domain:'other'};
  configure(other);
  foreign();
  STEPS
 };
 return()=> <button onClick={()=>run()}>{this.state.label}</button>;
}`
	const inline = "void metadata.readKey; this.state.label=metadata.domain;"
	const domain = "this.state.label=metadata.domain;"
	const reader = "function read(metadata:Metadata, other:Metadata){BODY}"
	const forward = "this.state.label=read(metadata, other);"
	const selected = "void metadata.readKey; return metadata.domain;"
	for _, test := range []struct {
		name, steps, shadow, reader string
		browser                     bool
	}{
		{"selected", inline, "", "", true},
		{"no-read", domain, "", "", false},
		{"own-shadow", inline, ",readKey:undefined", "", false},
		{"different-receiver", "void other.readKey; " + domain, "", "", false},
		{"too-late", domain + " void metadata.readKey;", "", "", false},
		{"explicit-helper", "put(metadata); " + domain, "", "", true},
		{"forwarded", forward, "", selected, true},
		{"forwarded-no-read", forward, "", "return metadata.domain;", false},
		{"forwarded-own-shadow", forward, ",readKey:undefined", selected, false},
		{"forwarded-different-receiver", forward, "", "void other.readKey; return metadata.domain;", false},
		{"forwarded-too-late", forward, "", "const before=metadata.domain; void metadata.readKey; return before;", false},
		{"forwarded-shadow-deleted", forward, ",readKey:undefined", "delete metadata.readKey; " + selected, true},
		{"imported-forwarded", forward, "", selected, true},
		{"imported-shadow", forward, ",readKey:undefined", selected, false},
		{"imported-different-receiver", forward, "", "void other.readKey; return metadata.domain;", false},
		{"imported-own-target", forward, "", selected, true},
		{"imported-other-target", forward, "", selected, false},
		{"imported-too-late", forward, "", "const before=metadata.domain; void metadata.readKey; return before;", false},
		{"imported-uncalled", forward, "", selected, false},
		{"imported-inactive", forward, "", selected, false},
		{"imported-late-install", forward + " configure(other);", "", selected, false},
		{"reexported-forwarded", forward, "", selected, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			session := NewSession()
			body := ""
			if test.reader != "" {
				body = strings.Replace(reader, "BODY", test.reader, 1)
			}
			template := strings.NewReplacer("STEPS", test.steps, "SHADOW", test.shadow, "READER", body).Replace(component)
			check := func(donor string, browser bool) {
				t.Helper()
				source := strings.ReplaceAll(template, "DONOR", donor)
				request := Request{Kind: "compile", ID: "selected-getter-write.tsx", LanguageOverlay: true, Source: source, Target: TargetServer, Diagnostics: "semantic"}
				if strings.HasPrefix(test.name, "imported-") || strings.HasPrefix(test.name, "reexported-") {
					root, err := os.MkdirTemp(".", ".selected-getter-writer-")
					if err != nil {
						t.Fatal(err)
					}
					t.Cleanup(func() { _ = os.Remove(root) })
					root, err = filepath.Abs(root)
					if err != nil {
						t.Fatal(err)
					}
					before, rest, _ := strings.Cut(source, "function configure")
					installer, after, _ := strings.Cut(rest, "function put")
					write := func(name, text string) {
						t.Helper()
						path := filepath.Join(root, name)
						if err := os.WriteFile(path, []byte(text), 0600); err != nil {
							t.Fatal(err)
						}
						t.Cleanup(func() { _ = os.Remove(path) })
					}
					if test.name == "imported-own-target" || test.name == "imported-other-target" {
						installer = strings.Replace(installer, "Object.prototype", "_target", 1)
					}
					write("installer.ts", "export function configure"+installer)
					module := "installer"
					if test.name == "reexported-forwarded" {
						module = "barrel"
						write("barrel.ts", "export {configure} from './installer.js';")
					}
					source = before + "import {configure} from './" + module + ".js';\nfunction put" + after
					switch test.name {
					case "imported-uncalled", "imported-late-install":
						source = strings.Replace(source, "configure(other);", "void configure;", 1)
					case "imported-own-target":
						source = strings.Replace(source, "configure(other);", "configure(metadata);", 1)
					case "imported-inactive":
						source = strings.Replace(source, "configure(other);", "if (false) configure(other);", 1)
					}
					request.ID, request.Root, request.Source = filepath.Join(root, request.ID), root, source
				}
				result := session.Execute(request)
				if result.Error != "" || len(result.Analysis.Tasks) != 1 {
					t.Fatal(result.Error, result.Diagnostics)
				}
				document, foreign := false, false
				for _, effect := range result.Analysis.Tasks[0].EffectSources {
					if effect.Description == "document" {
						document = true
						if test.reader != "" && !strings.Contains(strings.Join(effect.Path, " "), "browserDomain") {
							t.Fatal("browser effect lost its authored getter", effect.Path)
						}
					}
					foreign = foreign || effect.Description == "unresolved call foreign"
				}
				if document != browser || !foreign {
					t.Fatal("expected receiver-relative browser effect and independent foreign effect", result.Analysis.Tasks[0].EffectSources)
				}
				foreignEdge, installedGet, donorGet := false, false, false
				for _, callable := range result.Analysis.Callables {
					if callable.Name != "run" {
						continue
					}
					for _, edge := range callable.Calls {
						if edge.Resolved && strings.Contains(edge.ID, ":callable:"+filepath.Join(request.Root, "installer.ts")+":") {
							installedGet = installedGet || edge.Name == "metadata.readKey"
							donorGet = donorGet || edge.Name == "metadata.domain"
						}
						_, offsetText, found := strings.Cut(edge.ID, ":call:")
						offset, err := strconv.Atoi(offsetText)
						foreignEdge = foreignEdge || edge.Name == "foreign" && !edge.Resolved && found &&
							err == nil && offset >= 0 && offset < len(source) &&
							strings.HasPrefix(strings.TrimSpace(source[offset:]), "foreign();")
					}
				}
				if request.Root != "" && browser && (!installedGet || !donorGet) {
					t.Fatal("missing getter edges from the authored reads to the imported installer")
				}
				if !foreignEdge {
					t.Fatal("missing unresolved edge at the authored foreign() call")
				}
				denied := false
				for _, diagnostic := range result.Diagnostics {
					if diagnostic.Severity != "error" {
						continue
					}
					if diagnostic.Code != "EXACT2001" || !strings.Contains(diagnostic.Message, "document") || !strings.Contains(diagnostic.Message, "unresolved call foreign") {
						t.Fatal(diagnostic.Code, diagnostic.Message)
					}
					denied = true
				}
				if denied != browser || (result.Code == "") != browser {
					t.Fatal("unexpected server artifact disposition", result.Diagnostics)
				}
			}
			check("document.title", test.browser)
			if test.name == "selected" || test.name == "forwarded" {
				check("'neutral'", false)
				check("document.title", true)
			}
		})
	}
}
