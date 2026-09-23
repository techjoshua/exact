package exactcompiler

// Setup and interaction calls share a durable client binding. Preserve setup activation facts
// for the direct server projection, whose request-local frame must schedule and await that work.
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
			if task.Placement == "client" {
				continue
			}
			task.ReusesInvokedDefinition = true
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
