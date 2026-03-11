import AboutClient from "@/app/about/AboutClient";

export const metadata = {
    title: "運賃計算と分割乗車券の仕組み",
    description: "JRの乗車券を分割すると安くなる理由や，当サイトが採用している経路探索アルゴリズムについて解説します．",
};

export default function Page() {
    return (
        <AboutClient />
    );
}