import { IconType } from "react-icons";
import { SingleValue } from "react-select";

export interface menuItem {
    href: string;
    icon: IconType;
    label: string;
}

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
    printedName: string | null;
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

export interface RouteRequest {
    path: PathStep[];
}

export interface ApiResponse {
    totalEigyoKilo: number;
    totalGiseiKilo: number;
    departureStation: string;
    arrivalStation: string;
    printedViaLines: string[];
    fare: number;
    validDays: number;
}

export interface RouteSegment {
    line: string;
    stations: [string, string];
    eigyoKilo: number;
    giseiKilo: number;
    isLocal: boolean;
    company: number;
}

export interface SpecificFare {
    sections: PathStep[];
    fare: number;
}

export interface SpecificSection {
    incorrectPath: string[];
    correctPath: PathStep[];
}

export interface City {
    name: string;
    stations: string[];
}