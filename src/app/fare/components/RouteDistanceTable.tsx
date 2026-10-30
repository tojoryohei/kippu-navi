import type { CompanyDistance } from "@/app/types";

const companies = ["北", "東", "海", "西", "四", "九", "社"];
const order = [1, 2, 3, 4, 5, 6, 0];

export default function RouteDistanceTable({ title, distances }: { title: string; distances: CompanyDistance[] }) {
    if (!distances) return null;
    return (
        <div className="my-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm text-center whitespace-nowrap">
                <caption className="mb-2 text-left font-bold">{title}の営業キロ・換算キロ（km）</caption>
                <thead><tr>
                    <th scope="col" className="border p-2">距離</th>
                    {companies.map(company => <th scope="col" className="border p-2" key={company}>{company}</th>)}
                    <th scope="col" className="border p-2">合計</th>
                </tr></thead>
                <tbody>{([["営業キロ", "eigyoKilo"], ["換算キロ", "giseiKilo"]] as const).map(([label, key]) => (
                    <tr key={key}>
                        <th scope="row" className="border p-2">{label}</th>
                        {order.map(id => <td className="border p-2 tabular-nums" key={id}>{(distances[id][key] / 10).toFixed(1)}</td>)}
                        <td className="border p-2 font-bold tabular-nums">{(distances.reduce((sum, company) => sum + company[key], 0) / 10).toFixed(1)}</td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
    );
}
