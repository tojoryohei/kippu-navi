import { SingleValue } from "react-select";

export interface Station {
    name: string;
    kana: string;
    lines: string[]
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
    station: string;
    line: string | null;
}

export interface RouteRequest {
    path: PathStep[];
}

export interface ApiResponse {
    totalEigyoKilo: number;
    totalGiseiKilo: number;
    departureStation: string;
    arrivalStation: string;
    via: string[];
    fare: number;
    validDays: number;
}
