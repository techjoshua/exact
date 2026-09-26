package exactcompiler

// Setup and interaction calls share a durable binding, but setup calls retain their reactive
// activation. Observing status or calling from an event must not discard setup input subscriptions.
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
