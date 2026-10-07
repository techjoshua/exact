package exactcompiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// timeSemanticConfig selects real standard declarations without replacing package resolution.
func timeSemanticConfig(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	config := filepath.Join(root, "tsconfig.json")
	for file, source := range map[string]string{config: `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","lib":["esnext","dom"],"jsx":"preserve","skipLibCheck":true}}`, filepath.Join(root, "entry.ts"): "export {};"} {
		if err := os.WriteFile(file, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return config
}

// Whole-source witnesses protect range ownership, formatter planning and stateless owner typing.
func TestTimeSubsystemSourceBoundaries(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, c := range []struct{ name, setup, view, diagnostic, emitted string }{
		{"self-closing", "", `<time time:update data-clock={Math.floor(Date.now()/1000)}/>`, "", "createTimeActivation"},
		{"nested-owned-clocks", "", `<time time:update>{Math.floor(Date.now()/1000)}<time time:update="millisecond">{Date.now()}</time></time>`, "", "createTimeActivation"},
		{"nested-clock-cannot-own-parent", "", `<time time:update="millisecond"><time time:update="millisecond">{Date.now()}</time></time>`, "EXACT_TIME_NO_CLOCK", ""},
		{"nested-formatter-cannot-own-parent", "", `<time time:update="millisecond"><time time:update>{new Intl.DateTimeFormat("en-US",{second:"numeric",timeZone:"UTC"}).format(Date.now())}</time></time>`, "EXACT_TIME_NO_CLOCK", ""},
		{"date-time-without-clock", "", `<time time:update>{new Intl.DateTimeFormat("en-US",{year:"numeric"}).format(42)}</time>`, "EXACT_TIME_NO_CLOCK", ""},
		{"stateless-date-time-clock", "", `<time time:update>{new Intl.DateTimeFormat("en-US",{second:"numeric",timeZone:"UTC"}).format(Date.now())}</time>`, "", "__exactComponentIntl"},
		{"stateless-date-time-no-enhancement", "", `<output>{new Intl.DateTimeFormat("en-US",{year:"numeric",timeZone:"UTC"}).format(props.anchor)}</output>`, "", "__exactComponentIntl"},
		{"calendar-month", "", `<time time:update>{new Intl.DateTimeFormat("en-US",{month:"numeric"}).format(new Date())}</time>`, "", "calendar"},
		{"calendar-axes", "", `<time time:update>{new Intl.DateTimeFormat("en-US",{year:"numeric",calendar:"iso8601",timeZone:"UTC"}).format(new Date())}</time>`, "", "calendar"},
		{"duration-multiple-plans", "", `<time time:update>{new Intl.DurationFormat("en-US").format({minutes:Math.floor(Date.now()/60000),seconds:Math.floor(Date.now()/1000)})}</time>`, "", "earliest"},
		{"duration-no-quantization", "", `<time time:update>{new Intl.DurationFormat("en-US").format({seconds:Date.now()})}</time>`, "EXACT_TIME_AUTO", ""},
		{"formatter-argument-effect", `let calls=0;function extra(){calls++;return 1}`, `<time time:update="millisecond">{new Intl.DateTimeFormat("en-US",{second:"numeric"}).format(Date.now()+extra())}</time>`, "EXACT_TIME_UNSAFE", ""},
		{"formatter-argument-pure", `function extra(){return 1}`, `<time time:update="millisecond">{new Intl.DateTimeFormat("en-US",{second:"numeric"}).format(Date.now()+extra())}</time>`, "", "createTimeActivation"},
		{"multiple-helper-calls", `function elapsed(start:number,now:number){return Math.floor((now-start)/1000)}`, `<time time:update>{elapsed(props.anchor,Date.now())+elapsed(props.second,Date.now())}</time>`, "", "earliest"},
		{"dynamic-explicit-policy", "", `<time time:update={props.policy}>{Date.now()}</time>`, "", "createTimeActivation"},
		{"computed-absolute-condition", "", `<time time:update>{Math["abs"](Math["floor"]((Date["now"]()-props.anchor)/1000))<2?"inside":"outside"}</time>`, "", "threshold"},
		{"deferred-call-effects", `let calls=0;function extra(){calls++;return 1}`, `<time time:update="millisecond" {...{"data-clock":Date.now(),onClick:()=>extra()}}>{Date.now()}</time>`, "", "createTimeActivation"},
		{"spread-live-policy", `const settings={'time:update':props.policy};`, `<time {...settings}>{Date.now()}</time>`, "", "createTimeActivation"},
		{"spread-static-policy", `const settings={'time:update':'millisecond' as const};`, `<time {...settings}>{Date.now()}</time>`, "", "createTimeActivation"},
		{"helper-function-expression", `const elapsed=function(start:number,now:number){return Math.floor((now-start)/1000)};`, `<time time:update>{elapsed(props.anchor,Date.now())}</time>`, "", "quantized"},
		{"helper-arrow-expression", `const elapsed=(start:number,now:number)=>Math.floor((now-start)/1000);`, `<time time:update>{elapsed(props.anchor,Date.now())}</time>`, "", "quantized"},
		{"helper-date-input-unproven-auto", `function elapsed(now:Date){return Math.floor(now.getTime()/1000)}`, `<time time:update>{elapsed(new Date())}</time>`, "EXACT_TIME_AUTO", ""},
		{"helper-date-anchor", `function elapsed(start:Date,now:number){return Math.floor((now-start.getTime())/1000)}`, `<time time:update>{elapsed(new Date(props.anchor),Date.now())}</time>`, "", "quantized"},
		{"helper-date-input-explicit", `function elapsed(now:Date){return Math.floor(now.getTime()/1000)}`, `<time time:update="millisecond">{elapsed(new Date())}</time>`, "", "createTimeActivation"},
		{"array-clock-destructuring", `const [stamp]=[Date.now()];`, `<time time:update>{Math.floor(stamp/1000)}</time>`, "", "quantized"},
		{"renamed-clock-destructuring", `const {stamp:reading}={stamp:Date.now()};`, `<time time:update>{Math.floor(reading/1000)}</time>`, "", "quantized"},
		{"nested-clock-destructuring", `const {clock:{stamp}}={clock:{stamp:Date.now()}};`, `<time time:update>{Math.floor(stamp/1000)}</time>`, "", "quantized"},
		{"nonquantized-safe-math", "", `<time time:update='millisecond'>{Math.sin(Date.now())}</time>`, "", "createTimeActivation"},
		{"recursive-static-selection", `const record:{stamp:number}={stamp:Date.now()};const reading=record;const {stamp}=reading;`, `<time time:update>{Math.floor(stamp/1000)}</time>`, "", "readEpochMilliseconds"},
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			t.Run(c.name+"/"+string(target), func(t *testing.T) {
				response := NewSession().Execute(Request{Kind: "compile", ID: "time-subsystem-boundary.tsx", ConfigFile: config, Target: target, Diagnostics: "semantic", Source: `import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};export function Page(props:{anchor:number;second:number;policy:'millisecond'|'disabled'}){` + c.setup + `return()=> ` + c.view + `;}`})
				if response.Error != "" {
					t.Fatal(response.Error)
				}
				if c.diagnostic != "" {
					if !hasDiagnosticCode(response.Diagnostics, c.diagnostic) {
						t.Fatalf("lost %s: %#v", c.diagnostic, response.Diagnostics)
					}
				} else if len(response.Diagnostics) != 0 {
					t.Fatalf("supported source rejected: %#v", response.Diagnostics)
				}
				for _, d := range response.Diagnostics {
					if strings.HasPrefix(d.Code, "TS") {
						t.Fatalf("invalid source or emitted TypeScript: %s %s", d.Code, d.Message)
					}
				}
				if c.emitted != "" && !strings.Contains(response.Code, c.emitted) {
					t.Fatalf("missing %s in source lowering", c.emitted)
				}
				if c.diagnostic == "" && (len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic") {
					t.Fatalf("source lost portable placement: %#v", response.Analysis.Components)
				}
			})
		}
	}
}

// Late owner typing must not capture authored utility names in any component definition form.
func TestTimeStatelessLocalizationOwnerForms(t *testing.T) {
	config := timeSemanticConfig(t)
	for _, definition := range []string{
		`export function Page(){return()=> VIEW}`,
		`export const Page=()=>()=> VIEW`,
		`export const Page=function(){return()=> VIEW}`,
	} {
		for _, target := range []Target{TargetClient, TargetServer} {
			source := `type Parameters<T>=number;` + strings.ReplaceAll(definition, "VIEW", `<output>{new Intl.DateTimeFormat("en-US",{year:"numeric"}).format(42)}</output>`)
			response := NewSession().Execute(Request{Kind: "compile", ID: "time-stateless-forms.tsx", ConfigFile: config, Target: target, Diagnostics: "semantic", Source: source})
			if response.Error != "" || len(response.Diagnostics) != 0 {
				t.Fatalf("stateless native formatter rejected: %s %#v", response.Error, response.Diagnostics)
			}
			if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "isomorphic" || !strings.Contains(response.Code, "ComponentLocalizationOwner") {
				t.Fatalf("native owner proof missing: %#v\n%s", response.Analysis.Components, response.Code)
			}
		}
	}
}
