import ChoiceSelect from "@/components/ChoiceSelect";
import { ticketDiscounts, type PassengerType, type DiscountId } from "@/app/fare/lib/ticketPricing";

interface Props {
  passengerType: PassengerType;
  discountId: DiscountId;
  onChange: (passenger: PassengerType, discount: DiscountId) => void;
}

export default function TicketPricingOptions({ passengerType, discountId, onChange }: Props) {
  return (
    <fieldset className="min-w-0">
        <div className="flex items-center gap-6" role="radiogroup" aria-label="年齢区分">
            {(["adult", "child"] as const).map(value => <label
                key={value}
                className="flex cursor-pointer items-center gap-2 text-slate-800"
            >
                <input
                    type="radio"
                    name="passengerType"
                    value={value}
                    checked={passengerType === value}
                    onChange={() => onChange(value, discountId)}
                    className="size-4 accent-blue-600"
                />
                {value === "adult" ? "大人" : "小児"}
            </label>)}
        </div>
        <label htmlFor="ticket-discount" className="sr-only">割引</label>
        <ChoiceSelect
            inputId="ticket-discount"
            className="station-select split-options-search split-count-select mt-4 min-w-0"
            options={[...ticketDiscounts]}
            value={ticketDiscounts.find(discount => discount.id === discountId) ?? null}
            getLabel={discount => discount.label}
            getKey={discount => discount.id}
            isOptionDisabled={discount => passengerType === "child" && !discount.allowChild}
            onChange={discount => onChange(passengerType, discount.id)}
        />
    </fieldset>
  );
}
