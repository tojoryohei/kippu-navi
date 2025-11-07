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

export interface SplitFormInput {
    startStation: Station | null;
    endStation: Station | null;
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

export interface SplitApiRequest {
    startStationName: string;
    endStationName: string;
}

export interface SplitApiResponse {
    totalFare: number;
    segments: SplitSegment[];
}

export interface ApiFullResponse {
    data: ApiResponse;
    time: number;
}

export interface ApiSplitFullResponse {
    data: SplitApiResponse;
    time: number;
}

export interface RouteSegment {
    line: string;
    station0: string;
    station1: string;
    eigyoKilo: number;
    giseiKilo: number;
    isLocal: boolean;
    company: number;
}

export interface SplitSegment {
    departureStation: string;
    arrivalStation: string;
    fare: number;
    printedViaLines: string[];
}

export interface SpecificFare {
    sections: PathStep[];
    fare: number;
}

export interface SpecificSection {
    incorrectPath: PathStep[];
    correctPath: PathStep[];
}

export interface Section {
    line: string;
    station0: string;
    station1: string;
}

export interface TrainSpecificSection {
    山手線内: Set<string>;
    東京附近: Set<string>;
    大阪附近: Set<string>;
    名古屋附近: Set<string>;
    電車大環状線: Set<string>;
}

export interface City {
    name: string;
    stations: string[];
}

export interface Printing {
    kana: string;
    print: string;
}

export interface Kana {
    line: string;
    kana: string;
    station0: string;
    station1: string;
}
