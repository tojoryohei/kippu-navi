/** 差分だけを通知する。初回は即時、以降はまとめて送信する。 */
export function createSplitResultStream(
  send: (data: { type: string; requestId: unknown; capability: string; mode: string; result: { normal?: unknown; replacements?: unknown; results: unknown[] } }) => void,
  requestId: unknown,
  capability: string,
  mode: string,
  now: () => number = () => performance.now(),
) {
  const seen = new Set<string>();
  let pending: unknown[] = [];
  let normal: unknown;
  let replacements: unknown;
  let sent = false;
  let last = now();
  function flush() {
    if (!pending.length) return;
    send({ type: 'partial_result', requestId, capability, mode, result: { ...(!sent ? { normal, replacements } : {}), results: pending } });
    pending = [];
    sent = true;
    last = now();
  }
  return {
    accept(json: string) {
      const result = JSON.parse(json) as { normal: unknown; replacements?: unknown; results: unknown[] };
      normal ??= result.normal;
      replacements ??= result.replacements;
      for (const plan of result.results) {
        const raw = plan as { segments?: { start?: string; end?: string; path?: string[] }[] };
        const key = JSON.stringify(raw.segments?.[0]?.path
          ? raw.segments.map(segment => [segment.start, segment.end, segment.path])
          : plan);
        if (seen.has(key)) continue;
        seen.add(key);
        pending.push(plan);
        if (!sent || pending.length >= 50 || now() - last >= 100) flush();
      }
    },
    flush,
  };
}
