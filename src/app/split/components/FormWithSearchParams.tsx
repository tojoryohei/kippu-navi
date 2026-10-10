import CalculatorHydration from "@/components/CalculatorHydration";
import Form from "@/app/split/components/Form";
import CalculatorErrorBoundary from "@/components/CalculatorErrorBoundary";
import { useCalculatorLocation } from "@/lib/calculator-location";
import type { SearchType } from "@/app/types";

export default function FormWithSearchParams({ pathname }: { pathname: string }) {
    const location = useCalculatorLocation();
    const url = new URL(location ?? pathname, "https://kippu-navi.com");
    if (url.pathname.split("/")[1] !== pathname.split("/")[1]) return null;
    if (!url.pathname.startsWith("/split/auto/")) return null;
    const activePathname = url.pathname;
    const searchParams = url.searchParams;
    const month = searchParams.get("month");
    const initialSearchType: SearchType = activePathname.endsWith("/ticket") ? "ticket" : month === "1" ? "pass1" : month === "3" ? "pass3" : "pass6";
    const parsedMaxSplits = searchParams.get("maxSplits");
    const parsedMaxSplitsValue = parsedMaxSplits !== null && /^(?:[0-9]|10)$/.test(parsedMaxSplits)
        ? Number(parsedMaxSplits)
        : 0;
    const initialMaxSplits = activePathname.endsWith("/ic-pass") ? 1 : parsedMaxSplitsValue;
    return (
        <CalculatorErrorBoundary key={location}>
            <CalculatorHydration hydrated={location !== null}>
            <Form
                isPreview={location === null}
                pathname={activePathname}
                initialFrom={searchParams.get("from") || undefined}
                initialTo={searchParams.get("to") || undefined}
                initialSearchType={initialSearchType}
                initialForbiddenStations={searchParams.has("noSplitStation") ? searchParams.getAll("noSplitStation") : undefined}
                initialMaxSplits={initialMaxSplits}
            />
            </CalculatorHydration>
        </CalculatorErrorBoundary>
    );
}
