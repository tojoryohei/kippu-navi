# Changelog

## [1.7.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.6.5...kippu-navi-v1.7.0) (2026-05-03)


### Features

* 比較基準となる非分割乗車券を「最短経路」から「最安経路」に変更 ([#59](https://github.com/tojoryohei/kippu-navi/issues/59)) ([f87709d](https://github.com/tojoryohei/kippu-navi/commit/f87709d7cb842d390b37d14c66ff0fd04cd1435f))

## [1.6.5](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.6.4...kippu-navi-v1.6.5) (2026-05-01)


### Bug Fixes

* PC表示時にヘッダーメニューが背景に隠れてしまう不具合を修正 ([#56](https://github.com/tojoryohei/kippu-navi/issues/56)) ([762a9af](https://github.com/tojoryohei/kippu-navi/commit/762a9afbf93da29b5f4f34285f5c1f86c1581e30))

## [1.6.4](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.6.3...kippu-navi-v1.6.4) (2026-04-30)


### Bug Fixes

* 上野～大宮を新幹線を使って70条区間を通過する際、最短経路で運賃計算されるように修正 ([#54](https://github.com/tojoryohei/kippu-navi/issues/54)) ([4231a71](https://github.com/tojoryohei/kippu-navi/commit/4231a71a5458710db07550aeb748e17e3f8312c0))

## [1.6.3](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.6.2...kippu-navi-v1.6.3) (2026-04-30)


### Bug Fixes

* スマホ用メニューがヘッダーの背面からスライドインするようにz-indexを修正 ([#52](https://github.com/tojoryohei/kippu-navi/issues/52)) ([b812461](https://github.com/tojoryohei/kippu-navi/commit/b812461a80f8bbdce33b659e58ddc7acf0ee343a))

## [1.6.2](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.6.1...kippu-navi-v1.6.2) (2026-04-30)


### Bug Fixes

* スマホ表示時のボタンテキストの意図しない改行を修正 ([#50](https://github.com/tojoryohei/kippu-navi/issues/50)) ([6009185](https://github.com/tojoryohei/kippu-navi/commit/600918529e47bf96e5324e47560b77ea03735fd4))

## [1.6.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.6.0...kippu-navi-v1.6.1) (2026-04-30)


### Bug Fixes

* 山手線内発着における第114条適用の足切り閾値を適正化し、適用漏れを解消 ([#48](https://github.com/tojoryohei/kippu-navi/issues/48)) ([b4f32ee](https://github.com/tojoryohei/kippu-navi/commit/b4f32eee26ab1183eaa4b82fcc61de7c6a5248e0))

## [1.6.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.5.2...kippu-navi-v1.6.0) (2026-04-29)


### Features

* 発着駅の入れ替えボタンおよび経路逆転機能の実装 ([#46](https://github.com/tojoryohei/kippu-navi/issues/46)) ([802b157](https://github.com/tojoryohei/kippu-navi/commit/802b1577c9695924e1436a961d4971fc4cea7f35))

## [1.5.2](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.5.1...kippu-navi-v1.5.2) (2026-04-28)


### Bug Fixes

* 依存パッケージの脆弱性対応 ([#44](https://github.com/tojoryohei/kippu-navi/issues/44)) ([550d4b3](https://github.com/tojoryohei/kippu-navi/commit/550d4b39f3ed3ce9f352f5ed210e589265dd7726))

## [1.5.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.5.0...kippu-navi-v1.5.1) (2026-04-27)


### Bug Fixes

* スマホメニュー展開時のオーバーレイ表示領域と背景スクロールのバグ修正 ([#38](https://github.com/tojoryohei/kippu-navi/issues/38)) ([cec6ec2](https://github.com/tojoryohei/kippu-navi/commit/cec6ec28b90389cc8d28046894de5c5b860fc45a))

## [1.5.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.4.1...kippu-navi-v1.5.0) (2026-04-27)


### Features

* 検索エンジン最適の強化とユーザー目線でのタイトル改修 ([#36](https://github.com/tojoryohei/kippu-navi/issues/36)) ([1042244](https://github.com/tojoryohei/kippu-navi/commit/10422441f15f22d0858140b3091c11753ba10304))

## [1.4.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.4.0...kippu-navi-v1.4.1) (2026-04-26)


### Bug Fixes

* 鉄道駅バリアフリー料金の判定条件の誤りを修正 ([#32](https://github.com/tojoryohei/kippu-navi/issues/32)) ([c29b834](https://github.com/tojoryohei/kippu-navi/commit/c29b834a4fc1fcdc8c9fdadced980a0afaf8335d))

## [1.4.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.3.3...kippu-navi-v1.4.0) (2026-04-26)


### Features

* 新幹線経由の運賃計算機能の追加 ([#30](https://github.com/tojoryohei/kippu-navi/issues/30)) ([2e94b13](https://github.com/tojoryohei/kippu-navi/commit/2e94b1352ea7d90554a10b3b11e82b8fb096c04e)), closes [#18](https://github.com/tojoryohei/kippu-navi/issues/18)

## [1.3.3](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.3.2...kippu-navi-v1.3.3) (2026-04-25)


### Bug Fixes

* JR東日本の幹線と地方交通線を連続乗車した際の運賃計算を修正 ([9abbb1f](https://github.com/tojoryohei/kippu-navi/commit/9abbb1f19d67226279ae8518e5f7c5db0d8869eb))

## [1.3.2](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.3.1...kippu-navi-v1.3.2) (2026-04-23)


### Bug Fixes

* 最安探索モード適用時に安くなった運賃が正しく出力・表示されない不具合を修正 ([c710d69](https://github.com/tojoryohei/kippu-navi/commit/c710d69d55258337e9f7f80b51e039867dc9928d))

## [1.3.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.3.0...kippu-navi-v1.3.1) (2026-04-22)


### Bug Fixes

* バリアフリー料金に伴う運賃逆転現象の特例マスタ更新対応 ([ff6b231](https://github.com/tojoryohei/kippu-navi/commit/ff6b231dc0e5c69a9baeaa139f10d556216737ca))

## [1.3.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.2.0...kippu-navi-v1.3.0) (2026-04-22)


### Features

* 運賃計算モード（通常/最安/補正禁止）の選択機能を追加 ([e4890c3](https://github.com/tojoryohei/kippu-navi/commit/e4890c32212ae12e0f5ea90c0aabdad0c269588d))

## [1.2.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.1.1...kippu-navi-v1.2.0) (2026-04-20)


### Features

* CHANGELOG.mdからの更新履歴自動生成ロジックを実装 ([8c85e40](https://github.com/tojoryohei/kippu-navi/commit/8c85e408510dbb88e8d13fe5e6086d721df30f9c))

## [1.1.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.1.0...kippu-navi-v1.1.1) (2026-04-19)


### Bug Fixes

* 発着駅名が長い場合に画面外にはみ出るレイアウト問題を修正 ([3c6e0de](https://github.com/tojoryohei/kippu-navi/commit/3c6e0de03be2b23970eaa3879645bc4a22c11bac))


## [1.1.0](https://github.com/tojoryohei/kippu-navi/releases/tag/kippu-navi-v1.1.0) (2026-04-18)


### Features

* GitHub PRと連携したCI/CDパイプラインの構築 ([0e18ddd](https://github.com/tojoryohei/kippu-navi/commit/0e18ddddd88f4e2646d220144255d87ae55121a0))


### Bug Fixes

* 旅客営業取扱基準規程 第114条のバグ修正 ([babe053](https://github.com/tojoryohei/kippu-navi/commit/babe053f001070e58510d1fe5cbb92a2b8899604))


### Performance Improvements

* Core Web Vitals（INP/TBT）の改善とアクセシビリティ修正 ([7215bbf](https://github.com/tojoryohei/kippu-navi/commit/7215bbf0b47e3b2855c8efb2e18d3fa71e718720))


## [1.0.2](https://github.com/tojoryohei/kippu-navi/blob/main/CHANGELOG.md) (2026-04-18)


### Bug Fixes
* 運賃計算プログラムの鹿島線全駅において路線が選択できないバグを修正


## [1.0.1](https://github.com/tojoryohei/kippu-navi/blob/main/CHANGELOG.md) (2026-04-13)


### Documentation
* よくある質問（FAQ）のセクションを追加


## [1.0.0](https://github.com/tojoryohei/kippu-navi/blob/main/CHANGELOG.md) (2026-03-14)


### Features
* 公式版リリース
* JR東日本の運賃改定に対応
