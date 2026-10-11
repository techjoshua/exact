package exactcompiler

// intlDateProjectionOptions retains Date prototype default fields and rejects
// style combinations whose authored method would throw. Options are already
// proven inert literals, so only the native field-presence rules remain.
func intlDateProjectionOptions(method string, options map[string]any) bool {
	date, time := method != "toLocaleTimeString", method != "toLocaleDateString"
	_, dateStyle := options["dateStyle"]
	_, timeStyle := options["timeStyle"]
	if (!date && dateStyle) || (!time && timeStyle) {
		return false
	}
	if dateStyle || timeStyle {
		return true
	}
	fields := []string{}
	if date {
		fields = append(fields, "weekday", "year", "month", "day")
	}
	if time {
		fields = append(fields, "dayPeriod", "hour", "minute", "second", "fractionalSecondDigits")
	}
	for _, field := range fields {
		if _, explicit := options[field]; explicit {
			return true
		}
	}
	if date {
		options["year"], options["month"], options["day"] = "numeric", "numeric", "numeric"
	}
	if time {
		options["hour"], options["minute"], options["second"] = "numeric", "numeric", "numeric"
	}
	return true
}
