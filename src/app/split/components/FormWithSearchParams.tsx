import Form from "./Form";
import CalculatorErrorBoundary from "@/components/CalculatorErrorBoundary";
import { useCalculatorLocation } from "@/lib/calculator-location";
import type { SearchType } from "@/app/types";

export default function FormWithSearchParams({ pathname }: { pathname: string }) {
    const location = useCalculatorLocation();
    if (location === null) return <p role="status">計算画面を読み込んでいます…</p>;
    const url = new URL(location, "https://kippu-navi.com");
    if (url.pathname.split("/")[1] !== pathname.split("/")[1]) return null;
    const activePathname = url.pathname;
    const searchParams = url.searchParams;
    const month = searchParams.get("month");
    const initialSearchType: SearchType = activePathname.endsWith("/ticket") ? "ticket" : month === "1" ? "pass1" : month === "3" ? "pass3" : "pass6";
    return (
        <CalculatorErrorBoundary key={location}>
            <Form
                pathname={activePathname}
                initialFrom={searchParams.get("from") || undefined}
                initialTo={searchParams.get("to") || undefined}
                initialSearchType={initialSearchType}
            />
        </CalculatorErrorBoundary>
    );
}
