import FormMR from "@/components/FormMR"
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JR運賃計算（経路入力）",
};

export default function MrPage() {
  return (
    <div className="min-h-screen"><FormMR /></div>

  );
}
