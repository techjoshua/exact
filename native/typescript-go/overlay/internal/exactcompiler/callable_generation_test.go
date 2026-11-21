package exactcompiler

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// Checker-bound callable facts must renew with their program, not with source text alone.
func TestCallableGenerationOwnerLifecycle(t *testing.T) {
	root, err := os.MkdirTemp(".", ".callable-generation-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root) })
	root, err = filepath.Abs(root)
	if err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(root, "tsconfig.json")
	helper := filepath.Join(root, "helper.ts")
	entry := filepath.Join(root, "entry.tsx")
	helperSource := `import {createContext} from '@exactjs/core';export const Token=createContext<number>('private-probe');export function read(value:boolean){return value?document.title:'absent'}`
	entrySource := `import {read,Token} from './helper.js';import type {Component} from '@exactjs/core';export function Page(this:Component<{}>){const first=read.call(undefined,this.hasContext(Token));const second=read.call(undefined,this.hasContext(Token));return()=> <output>{String(first&&second)}</output>}`
	for name, source := range map[string]string{config: `{"compilerOptions":{"module":"esnext","moduleResolution":"bundler","target":"es2022","jsx":"preserve","skipLibCheck":true},"include":["*.ts","*.tsx"]}`, helper: helperSource} {
		if err = os.WriteFile(name, []byte(source), 0600); err != nil {
			t.Fatal(err)
		}
	}
	session := NewSession()
	request := Request{Kind: "compile", Root: root, ConfigFile: config, ID: helper, Source: helperSource, Target: TargetServer, Diagnostics: "semantic"}
	check := func(response Response) {
		t.Helper()
		if response.Error != "" || len(response.Diagnostics) != 0 {
			t.Fatalf("actual semantic compile failed: %s %#v", response.Error, response.Diagnostics)
		}
	}
	check(session.Execute(request))
	var project *projectState
	for _, candidate := range session.projects {
		project = candidate
	}
	if project == nil || project.callableCache == nil {
		t.Fatal("callable project not retained")
	}
	originalProgram, originalCache := project.program, project.callableCache
	originalOwner := originalCache.owner
	check(session.Execute(request))
	if project.program != originalProgram || project.callableCache != originalCache || project.callableCache.owner != originalOwner {
		t.Fatal("unchanged generation lost its callable owner")
	}
	if err = os.WriteFile(entry, []byte(entrySource), 0600); err != nil {
		t.Fatal(err)
	}
	request.ID, request.Source = entry, entrySource
	response := session.Execute(request)
	check(response)
	cache := project.callableCache
	if project.program == originalProgram || cache == originalCache || cache.owner == originalOwner || cache.owner.values == originalOwner.values {
		t.Fatal("replacement program retained checker-bound callable state")
	}
	currentChecker, release := project.program.GetCheckerPool().GetChecker(context.Background(), nil)
	if cache.program != project.program || cache.owner.checker != currentChecker || cache.owner.values.checker != currentChecker {
		release()
		t.Fatal("callable query is not owned by the current checker")
	}
	release()
	if cache.ownsGeneration(project.program, originalOwner.checker) || cache.ownsGeneration(originalProgram, cache.owner.checker) {
		t.Fatal("a mixed program/checker pair was admitted")
	}
	// A fresh checker recovers the imported helper's platform requirement and the component's own context probe without
	// inheriting any retired generation's proof or descriptor-history refusal.
	if len(response.Analysis.Components) != 1 || response.Analysis.Components[0].Placement != "client" || !containsString(response.Analysis.Components[0].EnhancementContexts.OptionallyConsumes, "Token") {
		t.Fatalf("current generation lost imported source requirements: %#v", response.Analysis.Components)
	}

	check(session.Execute(request))
	if project.callableCache != cache || project.callableCache.owner != cache.owner {
		t.Fatal("repeated current input lost its accepted generation")
	}
	check(session.Execute(Request{Kind: "reset"}))
	if len(session.projects) != 0 {
		t.Fatal("reset retained old projects")
	}
	request.ID, request.Source = helper, helperSource
	check(session.Execute(request))
	for _, candidate := range session.projects {
		if candidate == project || candidate.callableCache == cache || candidate.callableCache.owner == cache.owner {
			t.Fatal("reset reused retired callable ownership")
		}
	}
}
