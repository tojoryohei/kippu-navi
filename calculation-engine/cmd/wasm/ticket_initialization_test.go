//go:build js && wasm

package main

import (
	"encoding/json"
	"syscall/js"
	"testing"
)

func assertTicketCalculationsUninitialized(t *testing.T) {
	t.Helper()
	for _, tc := range []struct {
		name      string
		calculate func(js.Value, []js.Value) interface{}
	}{
		{"fare", calculateRouteTicket},
		{"auto split", calculateOptimalSplitTicket},
		{"route split", calculateRouteSplitTicket},
	} {
		t.Run(tc.name, func(t *testing.T) {
			response := tc.calculate(js.Undefined(), nil).(js.Value)
			var body struct {
				Error string `json:"error"`
			}
			if err := json.Unmarshal([]byte(response.String()), &body); err != nil {
				t.Fatal(err)
			}
			if body.Error != "ticket graph not initialized" {
				t.Fatalf("error = %q", body.Error)
			}
		})
	}
}

func TestTicketCalculationsBeforeInitialization(t *testing.T) {
	previous := ticketGraphInitialized
	t.Cleanup(func() { ticketGraphInitialized = previous })
	ticketGraphInitialized = false
	assertTicketCalculationsUninitialized(t)
}

func TestFailedTicketInitializationClearsReadyState(t *testing.T) {
	previous, previousBuffer := ticketGraphInitialized, ticketTempBuffer
	t.Cleanup(func() { ticketGraphInitialized, ticketTempBuffer = previous, previousBuffer })
	ticketGraphInitialized = true
	ticketTempBuffer = nil
	response := initTicketGraphFromBuffer(js.Undefined(), nil).(js.Value)
	if response.String() != "error: buffer is too small" {
		t.Fatalf("response = %s", response.String())
	}
	if ticketGraphInitialized {
		t.Fatal("failed initialization left the graph ready")
	}
	assertTicketCalculationsUninitialized(t)
}

func TestPassAutoSearchRequiresSuccessfulInitialization(t *testing.T) {
	previous, buffer := passGraphInitialized, passTempBuffer
	t.Cleanup(func() { passGraphInitialized, passTempBuffer = previous, buffer })
	passGraphInitialized = true
	passTempBuffer = nil
	initPassGraphFromBuffer(js.Undefined(), nil)
	response := calculateOptimalSplitPass(js.Undefined(), nil).(js.Value).String()
	if response != `{"error":"pass graph not initialized"}` {
		t.Fatal(response)
	}
}
