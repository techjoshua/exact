//go:build exactcoverage

package main

import (
	"fmt"
	"os"
	"os/signal"
	"runtime/coverage"
	"syscall"
)

// Integration workers dispose native processes with SIGTERM. Only coverage builds retain
// counters at that boundary. Atomic instrumentation allows a final snapshot during cancellation.
func init() {
	directory := os.Getenv("GOCOVERDIR")
	if directory == "" {
		return
	}
	interrupts := make(chan os.Signal, 1)
	signal.Notify(interrupts, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-interrupts
		if err := coverage.WriteMetaDir(directory); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		if err := coverage.WriteCountersDir(directory); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		os.Exit(0)
	}()
}
