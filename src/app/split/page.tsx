import Form from "@/app/split/componens/Form"
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "分割乗車券プログラム",
};

export default function Page() {
  return (
    <main className="max-w-md mx-auto">
      <h1 className="text-xl font-bold m-4">分割乗車券プログラム</h1>
      <Form />
    </main>
  );
}