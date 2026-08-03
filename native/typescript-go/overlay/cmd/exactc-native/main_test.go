package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
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
