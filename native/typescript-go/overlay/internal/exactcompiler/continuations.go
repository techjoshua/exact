package exactcompiler

import (
	"sort"
	"strings"

	"github.com/microsoft/typescript-go/internal/ast"
)

// createContinuationContracts materializes the process-safe transition and
// resumption records from analyzed component tasks. Only explicitly shared
// contexts cross the client/server boundary; every other context remains a
// server-side resource lookup.
func createContinuationContracts(
	components []Component,
	tasks []Task,
	operations []InvokedTaskOperation,
	stateReads []StateRead,
	policies policyAnalysis,
	boundaries []Boundary,
	clientIslands map[*ast.Node]clientElementIsland,
	serverComponents bool,
) ([]Continuation, []ComponentResumption) {
	componentByName := make(map[string]Component, len(components))
	for _, component := range components {
		componentByName[component.Name] = component
	}
	continuations := []Continuation{}
	for _, task := range tasks {
		if task.Invoked {
			continue
		}
		if task.Placement != "server" && task.Placement != "isomorphic" {
			continue
		}
		component, exists := componentByName[task.Component]
		if !exists {
			continue
		}
		if serverComponents &&
			componentOmittedFromClient(component, true) {
			continue
		}
		serverContexts := []ContextEffect{}
		publicContexts := []ContextEffect{}
		contextWrites := []ContextEffect{}
		serverContextWrites := []ContextEffect{}
		for _, effect := range task.Contexts {
			if effect.Kind == "read" {
				if contextResidency(effect.Token, policies) == "shared" {
					publicContexts = append(publicContexts, effect)
				} else {
					serverContexts = append(serverContexts, effect)
				}
			} else if effect.Kind == "write" {
				if contextResidency(effect.Token, policies) == "shared" {
					contextWrites = append(contextWrites, effect)
				} else {
					serverContextWrites = append(serverContextWrites, effect)
				}
			}
		}
		dependencies := []TaskDependency{}
		dependencyServerContexts := []ContextEffect{}
		dependencyPublicContexts := []ContextEffect{}
		hasContextDependency := false
		for _, dependency := range task.Dependencies {
			if dependency.Source != "context" {
				dependencies = append(dependencies, dependency)
				continue
			}
			if dependency.ContextToken == "" {
				continue
			}
			hasContextDependency = true
			effect := ContextEffect{
				Token:      dependency.ContextToken,
				Kind:       "read",
				Confidence: "exact",
			}
			if contextResidency(dependency.ContextToken, policies) == "shared" {
				dependencyPublicContexts = append(dependencyPublicContexts, effect)
			} else {
				dependencyServerContexts = append(dependencyServerContexts, effect)
			}
		}
		if len(task.CapturedParameters) != 0 &&
			task.ActivationArgumentCount < task.ArgumentCount {
			offset := 0
			if task.ActivationArgumentCount == 0 {
				offset = len(dependencies)
			}
			for index := task.ActivationArgumentCount; index < task.ArgumentCount; index++ {
				dependencies = append(dependencies, TaskDependency{
					Index:  offset + index,
					Source: "argument",
				})
			}
		}
		serverContexts = append(dependencyServerContexts, serverContexts...)
		publicContexts = append(dependencyPublicContexts, publicContexts...)
		if !hasContextDependency {
			contextSlots := len(uniqueContextEffects(append(
				append([]ContextEffect(nil), serverContexts...),
				publicContexts...,
			)))
			if contextSlots != 0 {
				for index := range dependencies {
					dependencies[index].Index += contextSlots
				}
			}
		}
		ownedBoundaries := boundaryIDsForComponent(
			boundaries,
			component.ID,
		)
		continuations = append(continuations, Continuation{
			ID:          task.ID,
			Kind:        "task",
			ComponentID: component.ID,
			TaskID:      task.ID,
			Placement:   task.Placement,
			Readiness:   task.Readiness,
			Async:       task.Async,
			Activation: ContinuationActivation{
				StateReads:     append([]StateEffect(nil), task.Reads...),
				Dependencies:   dependencies,
				ServerContexts: uniqueContextEffects(serverContexts),
				PublicContexts: uniqueContextEffects(publicContexts),
			},
			Effects: ContinuationEffects{
				StateWrites:         append([]StateEffect(nil), task.Writes...),
				ContextWrites:       uniqueContextEffects(contextWrites),
				ServerContextWrites: uniqueContextEffects(serverContextWrites),
				Boundaries:          ownedBoundaries,
			},
			Ownership: ContinuationOwnership{
				ComponentID: component.ID,
				Lifetime:    "component",
			},
			Cancellation: "abort-signal",
		})
	}
	for _, operation := range operations {
		if operation.Placement != "server" && operation.Placement != "isomorphic" {
			continue
		}
		component, exists := componentByName[operation.Component]
		if !exists {
			continue
		}
		if serverComponents && componentOmittedFromClient(component, true) {
			continue
		}
		serverContexts := []ContextEffect{}
		publicContexts := []ContextEffect{}
		contextWrites := []ContextEffect{}
		serverContextWrites := []ContextEffect{}
		for _, effect := range operation.Contexts {
			switch {
			case effect.Kind == "read" &&
				contextResidency(effect.Token, policies) == "shared":
				publicContexts = append(publicContexts, effect)
			case effect.Kind == "read":
				serverContexts = append(serverContexts, effect)
			case effect.Kind == "write" &&
				contextResidency(effect.Token, policies) == "shared":
				contextWrites = append(contextWrites, effect)
			case effect.Kind == "write":
				serverContextWrites = append(serverContextWrites, effect)
			}
		}
		continuations = append(continuations, Continuation{
			ID:          operation.ID,
			Kind:        "task",
			ComponentID: component.ID,
			TaskID:      operation.ID,
			Placement:   operation.Placement,
			Readiness:   "nonblocking",
			Async:       true,
			Activation: ContinuationActivation{
				StateReads:     append([]StateEffect(nil), operation.Reads...),
				Dependencies:   append([]TaskDependency(nil), operation.Arguments...),
				ServerContexts: uniqueContextEffects(serverContexts),
				PublicContexts: uniqueContextEffects(publicContexts),
			},
			Effects: ContinuationEffects{
				StateWrites:         append([]StateEffect(nil), operation.Writes...),
				ContextWrites:       uniqueContextEffects(contextWrites),
				ServerContextWrites: uniqueContextEffects(serverContextWrites),
				Boundaries: boundaryIDsForComponent(
					boundaries,
					component.ID,
				),
			},
			Ownership: ContinuationOwnership{
				ComponentID: component.ID,
				Lifetime:    "invocation",
			},
			Cancellation: "abort-signal",
			Invocation: &ContinuationInvocation{
				Arguments:   append([]TaskDependency{}, operation.Arguments...),
				Concurrency: operation.Concurrency,
			},
		})
	}
	sort.Slice(continuations, func(left int, right int) bool {
		return continuations[left].ID < continuations[right].ID
	})

	resumptions := make([]ComponentResumption, 0, len(components))
	for _, component := range components {
		serverStateReads := []string{}
		statePaths := []string{}
		valueCaptures := []string{}
		for _, island := range clientIslands {
			if island.component.Name != component.Name {
				continue
			}
			for _, path := range island.statePaths {
				statePaths = append(statePaths, strings.Join(path, "."))
			}
			for _, capture := range island.valueCaptures {
				valueCaptures = append(valueCaptures, capture.name)
			}
		}
		for _, task := range tasks {
			if task.Component != component.Name ||
				task.Invoked ||
				(task.Placement != "server" &&
					task.Placement != "isomorphic") {
				continue
			}
			for _, read := range task.Reads {
				serverStateReads = append(serverStateReads, read.Path)
				// The browser dispatch stub evaluates state dependencies before
				// invoking the server continuation. Hydration must therefore
				// restore those paths even when the only authored read is
				// inside the server-owned task body.
				if read.Confidence == "exact" && read.Path != "*" {
					statePaths = append(statePaths, read.Path)
				}
			}
			for _, input := range task.CapturedInputs {
				if input.Source != "state" ||
					!strings.HasPrefix(input.Path, "this.state.") {
					continue
				}
				statePaths = append(
					statePaths,
					strings.TrimPrefix(input.Path, "this.state."),
				)
			}
			for _, write := range task.Writes {
				if write.Confidence == "exact" && write.Path != "*" {
					statePaths = append(statePaths, write.Path)
				}
			}
		}
		for _, operation := range operations {
			if operation.Component != component.Name ||
				(operation.Placement != "server" &&
					operation.Placement != "isomorphic") {
				continue
			}
			for _, read := range operation.Reads {
				serverStateReads = append(serverStateReads, read.Path)
				if read.Confidence == "exact" && read.Path != "*" {
					statePaths = append(statePaths, read.Path)
				}
			}
			for _, write := range operation.Writes {
				if write.Confidence == "exact" && write.Path != "*" {
					statePaths = append(statePaths, write.Path)
				}
			}
		}
		for _, read := range stateReads {
			if read.Component != component.Name ||
				stateReadInsideServerTask(read, component.Name, tasks) {
				continue
			}
			statePaths = append(statePaths, strings.Join(read.Path, "."))
		}
		serverContexts := []ContextEffect{}
		for _, effect := range component.Contexts {
			if effect.Kind == "read" {
				serverContexts = append(serverContexts, effect)
			}
		}
		resumptions = append(resumptions, ComponentResumption{
			ComponentID: component.ID,
			ServerRender: ServerRenderRecord{
				StateReads:     uniqueSortedStrings(serverStateReads),
				ServerContexts: uniqueContextEffects(serverContexts),
			},
			Client: ClientResumptionRecord{
				StatePaths:    uniqueSortedStrings(statePaths),
				ValueCaptures: uniqueSortedStrings(valueCaptures),
				Contexts:      sharedContextWrites(component.Name, tasks, policies),
				Boundaries:    boundaryIDsForComponent(boundaries, component.ID),
			},
		})
	}
	sort.Slice(resumptions, func(left int, right int) bool {
		return resumptions[left].ComponentID <
			resumptions[right].ComponentID
	})
	return continuations, resumptions
}

func stateReadInsideServerTask(
	read StateRead,
	component string,
	tasks []Task,
) bool {
	for _, task := range tasks {
		if task.Component == component &&
			!task.Invoked &&
			(task.Placement == "server" || task.Placement == "isomorphic") &&
			read.Start >= task.Start &&
			read.Start+read.Length <= task.Start+task.Length {
			return true
		}
	}
	return false
}

func boundaryIDsForComponent(
	boundaries []Boundary,
	componentID string,
) []string {
	values := []string{}
	for _, boundary := range boundaries {
		if boundary.OwnerComponentID == componentID {
			values = append(values, boundary.ID)
		}
	}
	return uniqueSortedStrings(values)
}

func contextResidency(token string, policies policyAnalysis) string {
	if subject, exists := policies.contextPolicies[token]; exists {
		return subject.Policy.Residency
	}
	return "server"
}

func sharedContextWrites(
	component string,
	tasks []Task,
	policies policyAnalysis,
) []string {
	values := []string{}
	for _, task := range tasks {
		if task.Component != component ||
			task.Invoked ||
			(task.Placement != "server" && task.Placement != "isomorphic") {
			continue
		}
		for _, effect := range task.Contexts {
			if effect.Kind == "write" &&
				contextResidency(effect.Token, policies) == "shared" {
				values = append(values, effect.Token)
			}
		}
	}
	return uniqueSortedStrings(values)
}

func uniqueSortedStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
