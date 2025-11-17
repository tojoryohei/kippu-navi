import Form from "@/app/split/componens/Form"
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "分割乗車券プログラム",
};

export default function Page() {
  return (
    <main className="max-w-md mx-auto">
      <h1 className="text-xl font-bold m-4">分割乗車券プログラム</h1>
      <div className="text-l m-4">現在では，最短経路上のみの探索をしているため厳密な最安解を出力しない場合があります．</div>
      <Form />
    </main>
  );
}