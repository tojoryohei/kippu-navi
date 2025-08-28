import InputMR from "@/components/InputMR"
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JR運賃計算（経路入力）",
};

export default function MrPage() {
  return (
    <InputMR />
  );
}
