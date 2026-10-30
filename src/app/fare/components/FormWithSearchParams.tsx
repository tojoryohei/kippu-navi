import { normalizeTicketPricing } from "@/app/fare/lib/ticketPricing";
import CalculatorHydration from "@/components/CalculatorHydration";
import Form from "@/app/fare/components/Form";
import CalculatorErrorBoundary from "@/components/CalculatorErrorBoundary";
import { useCalculatorLocation } from "@/lib/calculator-location";
import type { SearchType, CalculationMode } from "@/app/types";

export default function FormWithSearchParams({ pathname }: { pathname: string }) {
    const location = useCalculatorLocation();
    const url = new URL(location ?? pathname, "https://kippu-navi.com");
    const isRouteSplit = pathname.startsWith("/split/route/");
    if (isRouteSplit ? !["/split/route/ticket", "/split/route/pass"].includes(url.pathname) : !url.pathname.startsWith("/fare/")) return null;
    if (url.pathname.split("/")[1] !== pathname.split("/")[1]) return null;
    const activePathname = url.pathname;
    const searchParams = url.searchParams;
    const months = searchParams.get("months") ?? searchParams.get("month");
    const modeParam = searchParams.get("mode");
    const initialCalculationMode: CalculationMode | undefined = modeParam === "normal" || modeParam === "cheapest" || modeParam === "uncorrect"
        ? modeParam
        : undefined;
    const initialSearchType: SearchType = (activePathname === "/split/route/ticket" || activePathname.endsWith("/ticket")) ? "ticket" : months === "1" ? "pass1" : months === "3" ? "pass3" : "pass6";
    return (
        <CalculatorErrorBoundary key={location}>
            <CalculatorHydration hydrated={location !== null}>
            <Form
                initialDepartureSingleStation={activePathname === "/fare/ticket" && searchParams.get("departureSingleStation") === "true"}
                initialArrivalSingleStation={activePathname === "/fare/ticket" && searchParams.get("arrivalSingleStation") === "true"}
                initialPassengerType={activePathname === "/fare/ticket" ? normalizeTicketPricing(searchParams.get("passengerType"), searchParams.get("discountId")).passengerType : "adult"}
                initialDiscountId={activePathname === "/fare/ticket" ? normalizeTicketPricing(searchParams.get("passengerType"), searchParams.get("discountId")).discountId : "none"}
                isPreview={location === null}
                pathname={activePathname}
                initialMaxSplits={/^(?:[0-9]|10)$/.test(searchParams.get("maxSplits") ?? "") ? Number(searchParams.get("maxSplits")) : 0}
                initialNoSplitStations={[...new Set(searchParams.getAll("noSplitStation"))]}
                initialFrom={searchParams.get("from") || undefined}
                initialTo={searchParams.get("to") || undefined}
                initialSearchType={initialSearchType}
                initialRoute={searchParams.get("route") || undefined}
                initialCalculationMode={initialCalculationMode}
            />
            </CalculatorHydration>
        </CalculatorErrorBoundary>
    );
}
