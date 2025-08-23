import SelectStation from "@/component/SerectStation";

export default function Home() {
  return (
    <main>
      <h1>JR運賃計算サイト</h1>
      <p>出発駅を選択してください:</p>
      <SelectStation />

      <p>到着駅を選択してください:</p>
      <SelectStation />
    </main>
  );
}
