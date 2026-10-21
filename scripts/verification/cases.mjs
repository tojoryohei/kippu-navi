// 通信へ送る入力は、レビュー済みの固定ケースだけを使う。
export const cases = Object.freeze([
  {
    "kind": "ticket",
    "months": null,
    "from": "茂原",
    "to": "新茂原",
    "button": "乗車券を計算",
    "before": "分割前の乗車券",
    "fare": 160
  },
  {
    "kind": "pass",
    "months": 3,
    "from": "茂原",
    "to": "新茂原",
    "button": "定期券３箇月を計算",
    "before": "分割前の定期券３箇月",
    "fare": 13960
  },
  {
    "kind": "ic-pass",
    "months": 6,
    "from": "茂原",
    "to": "新茂原",
    "button": "IC定期券６箇月を計算",
    "before": "分割前のIC定期券６箇月",
    "fare": 26620
  }
].map(c => Object.freeze(c)));
