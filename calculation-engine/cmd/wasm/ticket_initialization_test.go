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
			if body.Error != "乗車券グラフが初期化されていません" {
				t.Fatalf("エラー = %q", body.Error)
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
	if response.String() != "error: バッファーが小さすぎます" {
		t.Fatalf("応答 = %s", response.String())
	}
	if ticketGraphInitialized {
		t.Fatal("初期化に失敗したグラフが利用可能な状態になっています")
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
	if response != `{"error":"定期券グラフが初期化されていません"}` {
		t.Fatal(response)
	}
}
