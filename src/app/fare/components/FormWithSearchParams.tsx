"use client";

import { useSearchParams, usePathname } from "next/navigation";
import Form from "./Form";
import { SearchType, CalculationMode } from "@/app/types";

export default function FormWithSearchParams() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const routeParam = searchParams.get("route") || undefined;
    const fromParam = searchParams.get("from") || undefined;
    const toParam = searchParams.get("to") || undefined;
    const modeParam = (searchParams.get("mode") as CalculationMode) || undefined;
    const monthParam = searchParams.get("month");

    let initialSearchType: SearchType = "ticket";
    if (pathname === "/fare/pass") {
        if (monthParam === "1") initialSearchType = "pass1";
        else if (monthParam === "3") initialSearchType = "pass3";
        else initialSearchType = "pass6";
    }

    return (
        <Form
            initialRoute={routeParam}
            initialFrom={fromParam}
            initialTo={toParam}
            initialSearchType={initialSearchType}
            initialCalculationMode={modeParam}
        />
    );
}
