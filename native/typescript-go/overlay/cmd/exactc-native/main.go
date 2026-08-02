package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/microsoft/typescript-go/internal/exactcompiler"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--corpus" {
		if err := runCorpus(os.Stdin, os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if err := serve(os.Stdin, os.Stdout, exactcompiler.NewSession()); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func serve(input io.Reader, output io.Writer, session *exactcompiler.Session) error {
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 64*1024), 64*1024*1024)
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	for scanner.Scan() {
		var request exactcompiler.Request
		if err := json.Unmarshal(scanner.Bytes(), &request); err != nil {
			response := exactcompiler.Response{
				Diagnostics: []exactcompiler.Diagnostic{},
				Error:       fmt.Sprintf("invalid native compiler request: %v", err),
			}
			exactcompiler.NewResponseVersionFields(&response)
			if encodeErr := encoder.Encode(response); encodeErr != nil {
				return encodeErr
			}
			continue
		}
		if request.Kind == "shutdown" {
			return nil
		}
		if err := encoder.Encode(session.Execute(request)); err != nil {
			return err
		}
	}
	return scanner.Err()
}
