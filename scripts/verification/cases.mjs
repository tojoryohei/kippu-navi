// 通信へ送る入力は、レビュー済みの固定ケースだけを使う。
export const cases = Object.freeze([
  {
    "kind": "ticket",
    "months": null,
    "from": "茂原",
    "to": "新茂原"
  },
  {
    "kind": "pass",
    "months": 3,
    "from": "茂原",
    "to": "新茂原"
  },
  {
    "kind": "ic-pass",
    "months": 6,
    "from": "茂原",
    "to": "新茂原"
  }
].map(c => Object.freeze(c)));
