# Changelog

## [1.3.2](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.3.1...kippu-navi-v1.3.2) (2026-04-23)


### Bug Fixes

* 最安探索モードで算出された安い運賃が結果に反映されない不具合を修正 ([6d6203d](https://github.com/tojoryohei/kippu-navi/commit/6d6203df1ce3389fba9ab775b3cb81f5910cd43a))
* 最安探索モード適用時に安くなった運賃が正しく出力・表示されない不具合を修正 ([c710d69](https://github.com/tojoryohei/kippu-navi/commit/c710d69d55258337e9f7f80b51e039867dc9928d))

## [1.3.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.3.0...kippu-navi-v1.3.1) (2026-04-22)


### Bug Fixes

* バリアフリー料金に伴う運賃逆転現象の特例マスタ更新対応 ([ff6b231](https://github.com/tojoryohei/kippu-navi/commit/ff6b231dc0e5c69a9baeaa139f10d556216737ca))

## [1.3.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.2.0...kippu-navi-v1.3.0) (2026-04-22)


### Features

* 運賃計算モード（通常 / 最安 / 補正禁止）の切り替え機能を実装 ([aec1642](https://github.com/tojoryohei/kippu-navi/commit/aec1642ffe43e422a857b3085fad930b8a61adf0))
* 運賃計算モード（通常/最安/補正禁止）の選択機能を追加 ([e4890c3](https://github.com/tojoryohei/kippu-navi/commit/e4890c32212ae12e0f5ea90c0aabdad0c269588d))

## [1.2.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.1.1...kippu-navi-v1.2.0) (2026-04-20)


### Features

* CHANGELOG.mdからの更新履歴自動生成ロジックを実装 ([8c85e40](https://github.com/tojoryohei/kippu-navi/commit/8c85e408510dbb88e8d13fe5e6086d721df30f9c))
* 更新履歴の運用自動化（CHANGELOG.md の動的表示と GitHub 連携） ([e125b20](https://github.com/tojoryohei/kippu-navi/commit/e125b2036f3763edd9cb24e65bb157b500b21c64))
* 更新履歴ページ上部に GitHub Releases への公式導線（ボタン）を追加 ([28af129](https://github.com/tojoryohei/kippu-navi/commit/28af129309866d60ec015e8be14b1ca3d57cc6f9))

## [1.1.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.1.0...kippu-navi-v1.1.1) (2026-04-19)


### Bug Fixes

* **ui:** 発着駅名が長い場合に画面外にはみ出るレイアウト問題を修正 ([3c6e0de](https://github.com/tojoryohei/kippu-navi/commit/3c6e0de03be2b23970eaa3879645bc4a22c11bac))
* 発着駅に長い駅名が指定された際のレイアウト崩れを修正 ([fa97f3e](https://github.com/tojoryohei/kippu-navi/commit/fa97f3eedab4349efba2af306cf92b414a44a4b3))


## [1.1.0](https://github.com/tojoryohei/kippu-navi/releases/tag/kippu-navi-v1.1.0) (2026-04-18)


### Features

* GitHub PRと連携したCI/CDパイプラインの構築 ([0e18ddd](https://github.com/tojoryohei/kippu-navi/commit/0e18ddddd88f4e2646d220144255d87ae55121a0))


### Bug Fixes

* 最安運賃計算における旅客営業取扱基準規程114条適用の足切り閾値を適正化し、適用漏れを完全に解消 ([75619e7](https://github.com/tojoryohei/kippu-navi/commit/75619e7eec6fcb9771c336d826e9c81500265f57))
* 旅客営業取扱基準規程 第114条のバグ修正 ([babe053](https://github.com/tojoryohei/kippu-navi/commit/babe053f001070e58510d1fe5cbb92a2b8899604))


### Performance Improvements

* Core Web Vitals（INP/TBT）の大幅改善とユーザー補助の警告修正 ([ddf7e31](https://github.com/tojoryohei/kippu-navi/commit/ddf7e31d5b555e038645a490861bc11ad00032bb))
* Core Web Vitals（INP/TBT）の改善とアクセシビリティ修正 ([7215bbf](https://github.com/tojoryohei/kippu-navi/commit/7215bbf0b47e3b2855c8efb2e18d3fa71e718720))


## [1.0.2](https://github.com/tojoryohei/kippu-navi/blob/main/CHANGELOG.md) (2026-04-18)


### Bug Fixes
* 運賃計算プログラムの鹿島線全駅において路線が選択できないバグを修正しました。


## [1.0.1](https://github.com/tojoryohei/kippu-navi/blob/main/CHANGELOG.md) (2026-04-13)


### Documentation
* よくある質問（FAQ）のセクションを追加。


## [1.0.0](https://github.com/tojoryohei/kippu-navi/blob/main/CHANGELOG.md) (2026-03-14)


### Features
* 公式版リリース。
* JR東日本の運賃改定に対応。
