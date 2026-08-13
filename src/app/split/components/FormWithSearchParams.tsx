"use client";

import { useSearchParams } from "next/navigation";
import Form from "./Form";
import { SearchType } from "@/app/types";

export default function FormWithSearchParams() {
    const searchParams = useSearchParams();
    const fromVal = searchParams.get("from") || undefined;
    const toVal = searchParams.get("to") || undefined;
    const monthVal = searchParams.get("month");

    let initialSearchType: SearchType | undefined;
    if (monthVal === "1") initialSearchType = "pass1";
    else if (monthVal === "3") initialSearchType = "pass3";
    else if (monthVal === "6") initialSearchType = "pass6";

    return (
        <Form
            initialFrom={fromVal}
            initialTo={toVal}
            initialSearchType={initialSearchType}
        />
    );
}
