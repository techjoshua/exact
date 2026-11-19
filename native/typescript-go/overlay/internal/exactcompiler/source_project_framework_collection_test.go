package exactcompiler

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/microsoft/TypeScript/tsc/internal/ast"
)

// This uses real package exports/DTS and the same preparation, canonical queue,
// first resolve and publication owners as the project entry. No source frame,
// selected value, scope, stamp or ACK is supplied by the test.
func TestProjectFrameworkTwoFileCollection(t *testing.T) {
	const saved = "/home/techj/.t3/worktrees/exact/t3-5179cb70/.tmp/staged-analysis-first-slice/m08-fresh-runtime-provider-build/source"
	root := t.TempDir()
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(root, name), []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	write("package.json", `{"private":true,"type":"module"}`)
	write("tsconfig.json", `{"compilerOptions":{"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext","strict":true,"skipLibCheck":true,"types":[],"lib":["ES2023","DOM"],"jsx":"preserve"},"files":["reader.ts","producer.ts"]}`)
	manifests, err := filepath.Glob(filepath.Join(saved, "packages", "*", "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, manifest := range manifests {
		var pkg struct {
			Name string `json:"name"`
		}
		data, err := os.ReadFile(manifest)
		if err != nil {
			t.Fatal(err)
		}
		if err = json.Unmarshal(data, &pkg); err != nil {
			t.Fatal(err)
		}
		if pkg.Name == "" {
			continue
		}
		link := filepath.Join(root, "node_modules", filepath.FromSlash(pkg.Name))
		if err = os.MkdirAll(filepath.Dir(link), 0700); err != nil {
			t.Fatal(err)
		}
		if err = os.Symlink(filepath.Dir(manifest), link); err != nil {
			t.Fatal(err)
		}
	}
	const reader = `/// <reference lib="dom" />
function same(){return 2}
import type {Component} from '@exactjs/core';
import {make,type Context} from './producer.js';
export const readerLabel='reader';
export function Reader(this:Component<{}>){same();const context:Context=make();context.boundary=this;return ()=>null}`
	producer := func(browser bool) string {
		body := "return 1"
		if browser {
			body = "document.title;return 1"
		}
		return `/// <reference lib="dom" />
function same(){` + body + `}
import {reactiveObjects} from '@exactjs/reactive/framework/objects';
import {readerLabel} from './reader.js';
export type Context={errors:object[];boundary?:unknown};
export function make(errors:object[]=[]):Context{same();return {errors:reactiveObjects(errors)}}
export function cycle(){return readerLabel}`
	}
	// Disk and the original requested overlay differ deliberately; the real
	// synchronization and requested context, never a provisional disk analysis,
	// must own the reader's component/source bindings.
	write("reader.ts", `export function DiskOnly(){return 0}`)
	write("producer.ts", producer(true))
	entry, dependency := filepath.Join(root, "reader.ts"), filepath.Join(root, "producer.ts")
	request := Request{Kind: "analyze", Root: root, ConfigFile: filepath.Join(root, "tsconfig.json"), ID: entry, Source: reader, Diagnostics: "semantic"}
	session := NewSession()
	t.Cleanup(func() { session.Execute(Request{Kind: "reset"}) })
	var oldWork *callableEffectWork
	var oldObserved *sourceFrameworkGetObservation
	for _, row := range []struct {
		name    string
		browser bool
	}{{"initial", true}, {"edited-generation", false}} {
		if !t.Run(row.name, func(t *testing.T) {
			batch := []ProjectSource{{ID: entry, Source: reader}, {ID: dependency, Source: producer(row.browser)}}
			response := session.Execute(Request{Kind: "synchronize", Root: root, ConfigFile: request.ConfigFile, Sources: batch})
			if response.Error != "" || hasErrorDiagnostic(response.Diagnostics) {
				t.Fatal("real two-file synchronization", response.Error, response.Diagnostics)
			}
			project := session.projects[nativeProjectKey(request, entry)]
			if project == nil {
				t.Fatal("synchronized project absent")
			}
			generation, err := project.advance(context.Background(), entry, reader)
			if err != nil {
				t.Fatal(err)
			}
			defer generation.release()
			if generation.sourceFile.Text() != reader {
				t.Fatal("requested overlay replaced by disk")
			}
			for _, id := range []string{entry, dependency} {
				file := project.program.GetSourceFile(id)
				if file == nil {
					t.Fatal("genuine selected source absent", id)
				}
				for _, d := range generation.checker.GetDiagnostics(context.Background(), file) {
					converted := projectDiagnostic(d)
					if hasErrorDiagnostic([]Diagnostic{converted}) {
						t.Fatal(converted)
					}
				}
			}
			source := generation.sourceFile
			components := collectComponents(source)
			_, reads, writes := collectStateAnalysis(source, generation.checker)
			bindings, bindingWrites, _ := analyzeComponentBindings(source, generation.checker, collectEnhancementImports(source, generation.checker, nil, 0))
			writes = append(writes, bindingWrites...)
			cache, changed := prepareProjectCallableContexts(project, source, generation.checker, components, reads, writes, bindings, analyzeAssets(source, generation.checker, request), request.AssetRules)
			if !changed {
				t.Fatal("fresh/edited project source contexts were not prepared")
			}
			collection := beginProjectCallableCollection(cache, cache.owner)
			defer collection.close()
			work := &collection.work
			if project.activeGeneration != generation || work.operationGeneration != generation {
				t.Fatal("canonical collection outside actual current generation")
			}
			var readerSame, producerSame, readerBody *ast.Node
			for _, fact := range collection.facts {
				if fact.sourceFile != source && fact.sourceFile != project.program.GetSourceFile(dependency) {
					t.Fatal("unexpected nondeclaration source", fact.sourceFile.FileName())
				}
				if !ast.IsFunctionDeclaration(fact.node) || fact.node.Name() == nil {
					continue
				}
				if fact.node.Name().Text() == "same" {
					if fact.sourceFile == source {
						readerSame = fact.node
					} else {
						producerSame = fact.node
					}
				}
				if fact.node.Name().Text() == "Reader" {
					readerBody = fact.node
				}
			}
			if readerSame == nil || producerSame == nil || readerBody == nil || readerSame.Pos() != producerSame.Pos() || readerSame == producerSame {
				t.Fatal("same-name/position fixture or canonical union absent")
			}
			if work.memberNodes[readerSame] == work.memberNodes[producerSame] {
				t.Fatal("source-local nodes collided before extraction")
			}
			collection.collect()
			result := collection.resolve(source)
			if len(result.pending) != 0 {
				t.Fatalf("two-file original collector pending; later currency/replacement UNREACHED: %#v", result.pending)
			}
			caller := work.memberNodes[readerBody]
			browser := false
			for _, effect := range collection.facts[caller].summary.EffectSources {
				browser = browser || effect.Environment == "browser"
			}
			if browser != row.browser {
				t.Fatal("known imported donor not retained/retired", browser, row.browser)
			}
			// Actual local symbol/Call association must keep same spellings separate.
			for _, target := range []struct {
				body   *ast.Node
				source *ast.SourceFile
			}{{readerSame, source}, {producerSame, project.program.GetSourceFile(dependency)}} {
				reached := false
				for _, fact := range collection.facts {
					for _, edge := range fact.summary.Calls {
						operation := fact.fieldEdgeOperations[edge.ID]
						if operation != nil && ast.IsCallExpression(operation) && ast.IsIdentifier(operation.Expression()) && operation.Expression().Text() == "same" && ast.GetSourceFileOfNode(operation) == target.source {
							reached = true
							if !edge.Resolved || edge.TargetID != collection.facts[work.memberNodes[target.body]].summary.ID {
								t.Fatal("local-to-global Call target rebase lost source association", edge)
							}
						}
					}
				}
				if !reached {
					t.Fatal("original source-local same() Call unreached")
				}
			}
			var observed *sourceFrameworkGetObservation
			for key, recipe := range work.operationRecipes {
				if !validFrameworkGetResumptionRecipe(recipe) || key.declaration != readerBody {
					continue
				}
				id, adopted := work.operationIDs[key]
				if !adopted || !work.operations[id.index].delta.extracted {
					t.Fatal("original Get continuation did not complete")
				}
				observed = work.operations[id.index].frameworkGetObservation
				if !work.frameworkGetObservationCurrent(observed) || !work.closedOperationDependencies()[id.index] {
					t.Fatal("actual source DATA/C/subscriber delivery not current")
				}
				requiredSnapshot := append([]sourceStagedOperationRequest(nil), observed.required...)
				semanticSnapshot := append([]sourceFrameworkGetDependency(nil), observed.dependencies...)
				work.prepareFrameworkGetResumption(collection.facts, id, cache.owner)
				if work.operations[id.index].frameworkGetObservation != observed || !reflect.DeepEqual(requiredSnapshot, observed.required) || !reflect.DeepEqual(semanticSnapshot, observed.dependencies) {
					t.Fatal("idempotent source dispatch rewrote the semantic observation")
				}
				cloned := cloneStagedCallResultSource(recipe.callResult)
				cloned.getResult.frameworkResume.cut.initializing = readerBody
				bad := recipe
				bad.callResult = cloned
				if validFrameworkGetResumptionRecipe(bad) {
					t.Fatal("changed original Get cut accepted")
				}
			}
			if observed == nil {
				t.Fatal("original Get/reader connection UNREACHED, not a registry-only pass")
			}
			copied := *observed
			if work.frameworkGetObservationCurrent(&copied) {
				t.Fatal("copied observation gained source currentness")
			}
			required := observed.required
			observed.required = append([]sourceStagedOperationRequest(nil), required...)
			observed.required[0].cut.reading = readerBody
			if work.frameworkGetObservationCurrent(observed) {
				t.Fatal("foreign required association accepted")
			}
			observed.required = required
			if !work.frameworkGetObservationCurrent(observed) {
				t.Fatal("genuine observation did not survive refuser control")
			}
			if oldObserved != nil && oldWork.frameworkGetObservationCurrent(oldObserved) {
				t.Fatal("expired generation observation remained current")
			}
			if oldWork != nil && oldWork.operationEpoch == work.operationEpoch {
				t.Fatal("new generation reused an old graph namespace")
			}
			oldWork, oldObserved = work, observed
			// A real dependency entry is still provisional until requested with its
			// actual state/component binding metadata. Replacement rebuilds publication.
			producerFile := project.program.GetSourceFile(dependency)
			oldContext := cache.bySource[producerFile].sourceContext
			if oldContext == nil || cache.owned[producerFile] {
				t.Fatal("dependency context did not retain its ownership distinction")
			}
			producerComponents := collectComponents(producerFile)
			_, producerReads, producerWrites := collectStateAnalysis(producerFile, generation.checker)
			producerBindings, extraWrites, _ := analyzeComponentBindings(producerFile, generation.checker, collectEnhancementImports(producerFile, generation.checker, nil, 0))
			producerWrites = append(producerWrites, extraWrites...)
			replaced, rebuild := prepareProjectCallableContexts(project, producerFile, generation.checker, producerComponents, producerReads, producerWrites, producerBindings, analyzeAssets(producerFile, generation.checker, request), request.AssetRules)
			if !rebuild || !replaced.owned[producerFile] || replaced.bySource[producerFile].sourceContext == oldContext {
				t.Fatal("authoritative requested context failed to replace dependency preparation")
			}
			collection.close()
			rebuildProjectCallableCache(project.program, replaced, replaced.owner)
			if len(replaced.merged.pending) != 0 {
				t.Fatalf("authoritative replacement publication remains pending: %#v", replaced.merged.pending)
			}
		}) {
			return
		}
	}
}
