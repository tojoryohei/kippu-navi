import type { SingleValue } from "react-select";

export interface Station {
    name: string;
    kana: string;
    lines?: string[]
}

export interface SelectStationProps {
    instanceId: string;
    value: Station | null;
    onChange: (newValue: SingleValue<Station>) => void;
    options?: Station[];
    isDisabled?: boolean;
}

export interface Line {
    name: string;
    stations: string[];
}

export interface SelectLineProps {
    instanceId: string;
    value: Line | null;
    onChange: (newValue: SingleValue<Line>) => void;
    options: Line[];
    isDisabled?: boolean;
}

export interface IFormInput {
    startStation: Station | null;
    segments: {
        viaLine: Line | null;
        destinationStation: Station | null;
    }[];
}

export interface PathStep {
    stationName: string;
    lineName: string | null;
}

interface FareCalculationSummary {
    totalEigyoKilo: number;
    printedViaLines: string[];
}

export interface TicketFareResult extends FareCalculationSummary {
    departureStation: string;
    arrivalStation: string;
    fare: number;
    validDays: number;
}

export interface PassFareResult extends FareCalculationSummary {
    fare: number;
    barrierFreeFee: number;
    charge: number;
    correctedPath: string[];
}

export interface TicketFareResponse {
    data: TicketFareResult;
    time: number;
}

export interface SplitFareSummary extends FareCalculationSummary {
    departureStation: string;
    arrivalStation: string;
    fare: number;
}

export interface SplitFareSegment {
    departureStation: string;
    arrivalStation: string;
    fare: SplitFareSummary;
}

export interface SplitFarePlan {
    segments: SplitFareSegment[];
    totalFare: number;
}

export interface SplitFareResult {
    normal: SplitFareSummary;
    results: SplitFarePlan[];
}

export interface SplitStationResponse {
    normal: string[];
    results: string[][];
    error?: string;
}

export interface SplitCacheResult {
    data: SplitStationResponse;
    isCacheHit: boolean;
    time: number;
}

interface SplitCalculationBreakdown {
    Fare: number;
    BarrierFreeFee: number;
    Charge?: number;
}

export interface SplitCalculationSegment {
    start: string;
    end: string;
    path: string[];
    via: string[];
    totalEigyoKilo: number;
    result?: SplitCalculationBreakdown;
}

export interface SplitCalculationResult {
    totalAmount: number;
    segments: SplitCalculationSegment[];
}

export interface SplitCalculationResponse {
    normal: SplitCalculationResult | null;
    results: SplitCalculationResult[];
}

export interface Kana {
    line: string;
    kana: string;
    station0: string;
    station1: string;
}

export type CalculationMode = "normal" | "cheapest" | "uncorrect";

export type SearchType = "ticket" | "pass1" | "pass3" | "pass6";

export interface SearchOption {
    value: SearchType;
    label: string;
}
