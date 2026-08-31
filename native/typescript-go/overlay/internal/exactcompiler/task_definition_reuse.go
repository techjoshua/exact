package exactcompiler

// A function task referenced by an interaction already owns one durable compiled binding. Calls
// from component setup invoke that binding normally; retaining a second setup task would clone its
// body, dependency plan, task identity, and status owner into the same component artifact.
func reuseInvokedFunctionTaskDefinitions(tasks []Task) []Task {
	invokedDefinitions := make(map[int]struct{})
	for _, task := range tasks {
		if task.FunctionDefined && task.Invoked {
			invokedDefinitions[task.WorkStart] = struct{}{}
		}
	}
	if len(invokedDefinitions) == 0 {
		return tasks
	}
	additionalDiagnostics := make(map[int][]string)
	for _, task := range tasks {
		if _, bound := invokedDefinitions[task.WorkStart]; bound && task.FunctionDefined && !task.Invoked {
			additionalDiagnostics[task.WorkStart] = append(
				additionalDiagnostics[task.WorkStart],
				task.Diagnostics...,
			)
		}
	}
	result := make([]Task, 0, len(tasks))
	for _, task := range tasks {
		_, bound := invokedDefinitions[task.WorkStart]
		if bound && task.FunctionDefined && !task.Invoked {
			continue
		}
		if task.FunctionDefined && task.Invoked {
			task.Diagnostics = uniqueStrings(append(
				task.Diagnostics,
				additionalDiagnostics[task.WorkStart]...,
			))
		}
		result = append(result, task)
	}
	return result
}
