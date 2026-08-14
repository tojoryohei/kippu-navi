"use client";

import { useSearchParams, usePathname } from "next/navigation";
import Form from "./Form";
import { SearchType } from "@/app/types";

export default function FormWithSearchParams() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const fromParam = searchParams.get("from") || undefined;
    const toParam = searchParams.get("to") || undefined;
    const monthParam = searchParams.get("month");

    let initialSearchType: SearchType = "ticket";
    if (pathname === "/split/pass" || pathname === "/split/ic-pass") {
        if (monthParam === "1") initialSearchType = "pass1";
        else if (monthParam === "3") initialSearchType = "pass3";
        else initialSearchType = "pass6";
    }

    return (
        <Form
            initialFrom={fromParam}
            initialTo={toParam}
            initialSearchType={initialSearchType}
        />
    );
}
