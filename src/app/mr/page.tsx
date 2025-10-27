import Form from "@/app/mr/componens/Form"
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "運賃計算（経路入力）",
};

export default function Page() {
  return (
    <main className="max-w-md mx-auto">
      <h1 className="text-xl font-bold m-4">JR運賃計算（経路入力）</h1>
      <Form />
    </main>
  );
}