import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用案内",
};

export default function Page() {
  return (
    <>
      <div className="container mx-auto px-4">
        <h1 className="font-semibold">利用案内</h1>
      </div>
    </>
  );
}