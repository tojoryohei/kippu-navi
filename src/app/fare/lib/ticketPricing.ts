export type PassengerType = "adult" | "child";

// 金額・適用判定はGoで行う。ここでは表示と選択可否のみを管理する。
export const ticketDiscounts = [
    { id: "none", resultLabel: "", label: "割引なし", allowChild: true },
    { id: "student", resultLabel: "[学割]", label: "学割", allowChild: false },
    { id: "zipangu20", resultLabel: "[ジ2割]", label: "ジパング2割", allowChild: false },
    { id: "zipangu30", resultLabel: "[ジ3割]", label: "ジパング3割", allowChild: false },
    { id: "disability", resultLabel: "[身割]", label: "身障（単独）", allowChild: true },
    { id: "otona05", resultLabel: "[大休05]", label: "大人休日05", allowChild: false },
    { id: "otona30", resultLabel: "[大休30]", label: "大人休日30", allowChild: false },
    { id: "east40", resultLabel: "[東優4割53]", label: "東優4割", allowChild: true },
    { id: "central10", resultLabel: "[海優1割75]", label: "海優1割", allowChild: true },
    { id: "central20", resultLabel: "[海優2割76]", label: "海優2割", allowChild: true },
    { id: "west50", resultLabel: "[西優5割65]", label: "西優5割", allowChild: true },
] as const;
export type DiscountId = typeof ticketDiscounts[number]["id"];

export function normalizeTicketPricing(passenger: string | null, discount: string | null) {
    const passengerType: PassengerType = passenger === "child" ? "child" : "adult";
    const selected = ticketDiscounts.find(item => item.id === discount);
    const discountId: DiscountId = selected && (passengerType !== "child" || selected.allowChild) ? selected.id : "none";
    return { passengerType, discountId };
}
