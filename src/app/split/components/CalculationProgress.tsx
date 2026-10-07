export interface RouteCalculationProgress {
  phase: "preparing" | "exploring" | "calculating" | "organizing";
  completed: number;
  total: number;
}

const labels = {
  preparing: "計算の準備中…",
  exploring: "経路を探索中…",
  calculating: "分割パターンを計算中…",
  organizing: "結果を整理中…",
};

export default function CalculationProgress({ progress }: { progress: RouteCalculationProgress }) {
  const determinate = progress.phase === "calculating" && progress.total > 0;
  const percent = determinate ? Math.floor(100 * progress.completed / progress.total) : undefined;
  return (
    <div className="py-5 border-t text-center text-gray-500">
      <p role="status">{labels[progress.phase]}</p>
      <progress
        aria-label="分割計算の進捗"
        aria-valuetext={determinate ? `${percent}%、${progress.completed.toLocaleString()}／${progress.total.toLocaleString()}件` : labels[progress.phase]}
        className="my-2 h-3 w-full max-w-md appearance-none bg-gray-200 accent-blue-500 [&::-webkit-progress-bar]:bg-gray-200 [&::-webkit-progress-value]:bg-blue-500 [&::-moz-progress-bar]:bg-blue-500"
        max={100}
        value={percent}
      />
      {determinate && <p className="text-sm tabular-nums">{percent}%（{progress.completed.toLocaleString()}／{progress.total.toLocaleString()}件）</p>}
    </div>
  );
}
