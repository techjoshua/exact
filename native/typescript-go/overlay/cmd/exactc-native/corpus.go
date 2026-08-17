package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/microsoft/typescript-go/internal/exactcompiler"
)

type corpusInput struct {
	Groups  []corpusGroup `json:"groups"`
	Workers int           `json:"workers"`
}

type corpusGroup struct {
	Config                     string            `json:"config"`
	Filenames                  []string          `json:"filenames"`
	PackageEnhancementSuffixes map[string]string `json:"packageEnhancementSuffixes,omitempty"`
}

type corpusProjectResult struct {
	Config               string           `json:"config"`
	FileCount            int              `json:"fileCount"`
	ElapsedMilliseconds  float64          `json:"elapsedMs"`
	CallableMicroseconds int64            `json:"callableMicroseconds"`
	PhaseMicroseconds    map[string]int64 `json:"phaseMicroseconds"`
	Counters             map[string]int64 `json:"counters"`
}

type corpusResult struct {
	FileCount         int                   `json:"fileCount"`
	OutputBytes       int                   `json:"outputBytes"`
	Workers           int                   `json:"workers"`
	PhaseMicroseconds map[string]int64      `json:"phaseMicroseconds"`
	Projects          []corpusProjectResult `json:"projects"`
	Counters          map[string]int64      `json:"counters"`
}

type projectOutcome struct {
	result corpusProjectResult
	timing exactcompiler.Timings
	bytes  int
	err    error
}

// runCorpus executes one pre-discovered corpus entirely inside the native host.
// Discovery remains a harness concern so compatibility and native measurements
// use the exact same source-set contract.
func runCorpus(
	input io.Reader,
	output io.Writer,
) error {
	var request corpusInput
	if err := json.NewDecoder(input).Decode(&request); err != nil {
		return fmt.Errorf("decode native corpus request: %w", err)
	}
	result, err := compileCorpus(request)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	return encoder.Encode(result)
}

func compileCorpus(
	request corpusInput,
) (corpusResult, error) {
	workers := request.Workers
	if workers <= 0 {
		workers = runtime.GOMAXPROCS(0) - 1
	}
	if workers < 1 {
		workers = 1
	}
	if workers > len(request.Groups) {
		workers = len(request.Groups)
	}
	result := corpusResult{
		Workers:           workers,
		PhaseMicroseconds: make(map[string]int64),
		Counters:          make(map[string]int64),
		Projects:          make([]corpusProjectResult, 0, len(request.Groups)),
	}
	if workers == 0 {
		return result, nil
	}

	jobs := make(chan corpusGroup)
	outcomes := make(chan projectOutcome, len(request.Groups))
	var workerGroup sync.WaitGroup
	for range workers {
		workerGroup.Add(1)
		go func() {
			defer workerGroup.Done()
			session := exactcompiler.NewSession()
			for project := range jobs {
				outcomes <- compileCorpusProject(project, session)
			}
		}()
	}
	go func() {
		for _, project := range request.Groups {
			jobs <- project
		}
		close(jobs)
		workerGroup.Wait()
		close(outcomes)
	}()

	for outcome := range outcomes {
		if outcome.err != nil {
			return result, outcome.err
		}
		result.FileCount += outcome.result.FileCount
		result.OutputBytes += outcome.bytes
		result.Projects = append(result.Projects, outcome.result)
		addCorpusTimings(result.PhaseMicroseconds, outcome.timing)
		addCorpusCounterMap(result.Counters, outcome.result.Counters)
	}
	return result, nil
}

func compileCorpusProject(
	group corpusGroup,
	session *exactcompiler.Session,
) projectOutcome {
	projectStarted := time.Now()
	var timings exactcompiler.Timings
	outputBytes := 0
	counters := make(map[string]int64)
	requests := make([]exactcompiler.Request, 0, len(group.Filenames))
	for _, filename := range group.Filenames {
		source, err := os.ReadFile(filename)
		if err != nil {
			return projectOutcome{err: fmt.Errorf("%s: %w", filename, err)}
		}
		authoredSource := string(source)
		preparedSource := authoredSource
		packageEnhancementBoundary := 0
		if suffix := group.PackageEnhancementSuffixes[filename]; suffix != "" {
			packageEnhancementBoundary = len(authoredSource)
			preparedSource += suffix
		}
		requests = append(requests, exactcompiler.Request{
			ID:                         filename,
			Kind:                       "compile",
			Source:                     preparedSource,
			ConfigFile:                 group.Config,
			Diagnostics:                "syntax",
			PackageEnhancementBoundary: packageEnhancementBoundary,
		})
	}
	sources := make([]exactcompiler.ProjectSource, 0, len(requests))
	for _, request := range requests {
		sources = append(sources, exactcompiler.ProjectSource{
			ID:                         request.ID,
			Source:                     request.Source,
			PackageEnhancementBoundary: request.PackageEnhancementBoundary,
		})
	}
	synchronized := session.Execute(exactcompiler.Request{
		Kind:       "synchronize",
		ConfigFile: group.Config,
		Sources:    sources,
	})
	if synchronized.Error != "" {
		return projectOutcome{err: fmt.Errorf("%s: %s", group.Config, synchronized.Error)}
	}
	accumulateCorpusTimings(&timings, synchronized.Timings)
	addCorpusCounters(counters, synchronized.Counters)
	for _, request := range requests {
		response := session.Execute(request)
		if response.Error != "" {
			return projectOutcome{err: fmt.Errorf("%s: %s", request.ID, response.Error)}
		}
		for _, diagnostic := range response.Diagnostics {
			if diagnostic.Severity == "error" {
				return projectOutcome{err: fmt.Errorf(
					"%s: %s %s",
					request.ID,
					diagnostic.Code,
					diagnostic.Message,
				)}
			}
		}
		outputBytes += len(response.Code)
		accumulateCorpusTimings(&timings, response.Timings)
		addCorpusCounters(counters, response.Counters)
	}
	return projectOutcome{
		result: corpusProjectResult{
			Config:               group.Config,
			FileCount:            len(group.Filenames),
			ElapsedMilliseconds:  float64(time.Since(projectStarted).Microseconds()) / 1_000,
			CallableMicroseconds: timings.CallableMicroseconds,
			PhaseMicroseconds:    corpusTimingMap(timings),
			Counters:             counters,
		},
		timing: timings,
		bytes:  outputBytes,
	}
}

func addCorpusCounters(target map[string]int64, counters exactcompiler.WorkCounters) {
	target["programRebuilds"] += counters.ProgramRebuilds
	target["callableSourceAnalyses"] += counters.CallableSourceAnalyses
	target["componentSourceAnalyses"] += counters.ComponentSourceAnalyses
	target["componentLinkWalks"] += counters.ComponentLinkWalks
	target["componentResultCacheHits"] += counters.ComponentResultCacheHits
}

func addCorpusCounterMap(target map[string]int64, counters map[string]int64) {
	for name, value := range counters {
		target[name] += value
	}
}

func corpusTimingMap(timings exactcompiler.Timings) map[string]int64 {
	result := make(map[string]int64)
	addCorpusTimings(result, timings)
	return result
}

func accumulateCorpusTimings(target *exactcompiler.Timings, value exactcompiler.Timings) {
	target.ParseMicroseconds += value.ParseMicroseconds
	target.ProgramMicroseconds += value.ProgramMicroseconds
	target.AnalysisMicroseconds += value.AnalysisMicroseconds
	target.SourceMicroseconds += value.SourceMicroseconds
	target.CallableMicroseconds += value.CallableMicroseconds
	target.PolicyTaskMicroseconds += value.PolicyTaskMicroseconds
	target.ProjectLinkMicroseconds += value.ProjectLinkMicroseconds
	target.CheckMicroseconds += value.CheckMicroseconds
	target.LoweringMicroseconds += value.LoweringMicroseconds
	target.PrintMicroseconds += value.PrintMicroseconds
	target.TotalMicroseconds += value.TotalMicroseconds
}

func addCorpusTimings(target map[string]int64, timings exactcompiler.Timings) {
	target["parseMicroseconds"] += timings.ParseMicroseconds
	target["programMicroseconds"] += timings.ProgramMicroseconds
	target["analysisMicroseconds"] += timings.AnalysisMicroseconds
	target["sourceMicroseconds"] += timings.SourceMicroseconds
	target["callableMicroseconds"] += timings.CallableMicroseconds
	target["policyTaskMicroseconds"] += timings.PolicyTaskMicroseconds
	target["projectLinkMicroseconds"] += timings.ProjectLinkMicroseconds
	target["checkMicroseconds"] += timings.CheckMicroseconds
	target["loweringMicroseconds"] += timings.LoweringMicroseconds
	target["printMicroseconds"] += timings.PrintMicroseconds
	target["totalMicroseconds"] += timings.TotalMicroseconds
}
