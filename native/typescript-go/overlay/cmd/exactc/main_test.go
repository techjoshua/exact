package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/internal/exactcompiler"
)

func TestServeProcessesMultipleRequestsInOneSession(t *testing.T) {
	input := strings.NewReader(
		"{\"id\":\"component.tsx\",\"kind\":\"compile\",\"source\":\"const value = 1;\"}\n" +
			"{\"id\":\"component.tsx\",\"kind\":\"compile\",\"source\":\"const value = 1;\"}\n" +
			"{\"kind\":\"shutdown\"}\n",
	)
	var output bytes.Buffer
	if err := serve(input, &output, exactcompiler.NewSession()); err != nil {
		t.Fatal(err)
	}

	scanner := bufio.NewScanner(&output)
	var responses []exactcompiler.Response
	for scanner.Scan() {
		var response exactcompiler.Response
		if err := json.Unmarshal(scanner.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		responses = append(responses, response)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if len(responses) != 2 {
		t.Fatalf("received %d responses, expected 2", len(responses))
	}
	if responses[0].CacheHit {
		t.Fatal("first request unexpectedly reused native state")
	}
	if !responses[1].CacheHit {
		t.Fatal("second request did not reuse native state")
	}
}

func TestRunCorpusCompilesFilesInsideNativeHost(t *testing.T) {
	directory := t.TempDir()
	filename := directory + "/component.ts"
	if err := os.WriteFile(filename, []byte("export const value = 1;"), 0o600); err != nil {
		t.Fatal(err)
	}
	input, err := json.Marshal(corpusInput{
		Groups: []corpusGroup{{
			Filenames: []string{filename},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := runCorpus(bytes.NewReader(input), &output); err != nil {
		t.Fatal(err)
	}
	var result corpusResult
	if err := json.Unmarshal(output.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.FileCount != 1 {
		t.Fatalf("compiled %d files, expected 1", result.FileCount)
	}
	if result.OutputBytes == 0 {
		t.Fatal("native corpus returned no output")
	}
	if result.PhaseMicroseconds["totalMicroseconds"] == 0 {
		t.Fatal("native corpus returned no compiler timing")
	}
}

func TestRunCorpusAppliesPackageEnhancementSuffixes(t *testing.T) {
	directory := t.TempDir()
	config := filepath.Join(directory, "tsconfig.json")
	filename := filepath.Join(directory, "component.tsx")
	for path, source := range map[string]string{
		config:   `{"compilerOptions":{"module":"nodenext","moduleResolution":"nodenext","target":"es2022","jsx":"preserve"},"include":["*.ts","*.tsx"]}`,
		filename: `export const view = <p intl:message="greeting">Hello</p>;`,
		filepath.Join(directory, "enhancements.ts"):   `export { message } from "./implementation.js" with { type: "exact-enhancement" };`,
		filepath.Join(directory, "implementation.ts"): `export function message(props: { message?: true | string; children?: unknown }) { return props.children; }`,
	} {
		if err := os.WriteFile(path, []byte(source), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	suffix := `
import * as intl from "./enhancements.js" with { type: "exact-enhancement" };
`
	input, err := json.Marshal(corpusInput{
		Groups: []corpusGroup{{
			Config:                     config,
			Filenames:                  []string{filename},
			PackageEnhancementSuffixes: map[string]string{filename: suffix},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := runCorpus(bytes.NewReader(input), &output); err != nil {
		t.Fatal(err)
	}
}
