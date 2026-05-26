# Changelog

## [1.19.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.18.2...kippu-navi-v1.19.0) (2026-05-26)


### Features

* 定期運賃計算の基盤となる型定義と共通計算ロジックを実装 ([#171](https://github.com/tojoryohei/kippu-navi/issues/171)) ([36f9d48](https://github.com/tojoryohei/kippu-navi/commit/36f9d4895b7e48a5d95e6667ff8263961bae1834))

## [1.18.2](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.18.1...kippu-navi-v1.18.2) (2026-05-23)


### Bug Fixes

* Int32ArrayのInfinityキャストによる運賃計算破綻の緊急修正 ([#149](https://github.com/tojoryohei/kippu-navi/issues/149)) ([1c47f9d](https://github.com/tojoryohei/kippu-navi/commit/1c47f9d594cc1fca7f8d7c925cdd56555f6b4cab))
* 検索ボタン押下時のURL即時反映 ([#147](https://github.com/tojoryohei/kippu-navi/issues/147)) ([10fcb2e](https://github.com/tojoryohei/kippu-navi/commit/10fcb2ea06a966447e27f4863b255abea8e13bc9))

## [1.18.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.18.0...kippu-navi-v1.18.1) (2026-05-23)


### Performance Improvements

* 運賃計算キロ20km閾値による枝刈り強化 ([#144](https://github.com/tojoryohei/kippu-navi/issues/144)) ([76bd4fb](https://github.com/tojoryohei/kippu-navi/commit/76bd4fbbb6dbbb74071290e391e0d6667c5f8919)), closes [#143](https://github.com/tojoryohei/kippu-navi/issues/143)

## [1.18.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.17.0...kippu-navi-v1.18.0) (2026-05-22)


### Features

* スクロールトップボタンの全ページ共通化とレイアウトの品質改善 ([#141](https://github.com/tojoryohei/kippu-navi/issues/141)) ([155c3f6](https://github.com/tojoryohei/kippu-navi/commit/155c3f69764b1f581d1770f8265c870985de9e28))

## [1.17.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.16.0...kippu-navi-v1.17.0) (2026-05-22)


### Features

* セキュリティヘッダ（CSP, HSTS等）の導入 ([#132](https://github.com/tojoryohei/kippu-navi/issues/132)) ([dc900b8](https://github.com/tojoryohei/kippu-navi/commit/dc900b80715b1a16be6e76edc9c30071efd927c4))

## [1.16.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.15.1...kippu-navi-v1.16.0) (2026-05-22)


### Features

* URLクエリパラメータを用いた検索状態の同期とUX最適化 ([#129](https://github.com/tojoryohei/kippu-navi/issues/129)) ([c4ca4d5](https://github.com/tojoryohei/kippu-navi/commit/c4ca4d5a2137b2045dc73502a4e969f771dc7ad3))

## [1.15.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.15.0...kippu-navi-v1.15.1) (2026-05-22)


### Bug Fixes

* SelectStationのハイドレーションエラー解消および状態同期の修正 ([#126](https://github.com/tojoryohei/kippu-navi/issues/126)) ([52625ae](https://github.com/tojoryohei/kippu-navi/commit/52625ae260553310e39c5b583c3a596bd60c32b8))

## [1.15.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.14.3...kippu-navi-v1.15.0) (2026-05-22)


### Features

* 乗車券の有効日数を表示する機能の追加 ([#124](https://github.com/tojoryohei/kippu-navi/issues/124)) ([515cb0a](https://github.com/tojoryohei/kippu-navi/commit/515cb0af5be4f93b70343d7df84a4d8bcef00520))

## [1.14.3](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.14.2...kippu-navi-v1.14.3) (2026-05-22)


### Bug Fixes

* SelectStationのハイドレーションエラー解消および状態同期の修正 ([#121](https://github.com/tojoryohei/kippu-navi/issues/121)) ([7edf934](https://github.com/tojoryohei/kippu-navi/commit/7edf934bb1b0b6e9451c69e0f4e129965159cfb8))

## [1.14.2](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.14.1...kippu-navi-v1.14.2) (2026-05-21)


### Bug Fixes

* 宇部線（宇部〜新山口）の経路補正処理における配列範囲外アクセスによるエラーの修正 ([#118](https://github.com/tojoryohei/kippu-navi/issues/118)) ([29e216a](https://github.com/tojoryohei/kippu-navi/commit/29e216ac53f3303a2336767f1e0027e2a765e3c4)), closes [#115](https://github.com/tojoryohei/kippu-navi/issues/115)

## [1.14.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.14.0...kippu-navi-v1.14.1) (2026-05-21)


### Bug Fixes

* 経路分割ロジックでの TypeError を防止し、バグ調査用のJSONダンプを出力するガード節を追加 ([#116](https://github.com/tojoryohei/kippu-navi/issues/116)) ([9063161](https://github.com/tojoryohei/kippu-navi/commit/906316143e7ff689d0d987c15806c92a538a0a10))

## [1.14.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.13.2...kippu-navi-v1.14.0) (2026-05-20)


### Features

* オブザーバビリティ向上のためのAPIログ拡張（キャッシュHit/Missステータスの可視化） ([#111](https://github.com/tojoryohei/kippu-navi/issues/111)) ([4fcdc4d](https://github.com/tojoryohei/kippu-navi/commit/4fcdc4d2405a3c4a62de0538aaf8a6d16b3691bd))

## [1.13.2](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.13.1...kippu-navi-v1.13.2) (2026-05-20)


### Performance Improvements

* 15kmルールのドメイン知識を活用した運賃計算DPの枝刈りと計算量爆発の抑制 ([#107](https://github.com/tojoryohei/kippu-navi/issues/107)) ([8cb06b2](https://github.com/tojoryohei/kippu-navi/commit/8cb06b2374d03f2c56bf4f2f80d3c5b1c2fb06c5))

## [1.13.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.13.0...kippu-navi-v1.13.1) (2026-05-20)


### Performance Improvements

* 経路計算の負荷対策を強化（経由駅数上限を200駅から100駅へ引き下げ） ([#103](https://github.com/tojoryohei/kippu-navi/issues/103)) ([9868a12](https://github.com/tojoryohei/kippu-navi/commit/9868a127a284ab307c73ec0551c2c1a39b79aa13))

## [1.13.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.12.0...kippu-navi-v1.13.0) (2026-05-19)


### Features

* 経路計算の負荷制限を「直線距離」から計算量に直結する「経由駅数（200駅）」へ変更 ([#101](https://github.com/tojoryohei/kippu-navi/issues/101)) ([6868eff](https://github.com/tojoryohei/kippu-navi/commit/6868efff6624a3268138ff48e5a547c00efadd3a))

## [1.12.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.11.1...kippu-navi-v1.12.0) (2026-05-19)


### Features

* 分割乗車券の経路計算に発着駅間の距離制限（300km）を追加 ([#99](https://github.com/tojoryohei/kippu-navi/issues/99)) ([cea29ec](https://github.com/tojoryohei/kippu-navi/commit/cea29ec8b81eecba52f6cf5b29349513a288bec0))

## [1.11.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.11.0...kippu-navi-v1.11.1) (2026-05-17)


### Bug Fixes

* トップページFAQの「仕組み」リンク先を修正 ([#96](https://github.com/tojoryohei/kippu-navi/issues/96)) ([707f8b2](https://github.com/tojoryohei/kippu-navi/commit/707f8b2687e422686dc3eb3f773eeae1870be99e))

## [1.11.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.10.0...kippu-navi-v1.11.0) (2026-05-16)


### Features

* **ui:** 長い計算結果一覧のナビゲーション改善（トップへ戻るボタンの追加） ([#85](https://github.com/tojoryohei/kippu-navi/issues/85)) ([e2bd1f1](https://github.com/tojoryohei/kippu-navi/commit/e2bd1f130bc4f20fcafc0964b9809c4987b72ca9))

## [1.10.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.9.3...kippu-navi-v1.10.0) (2026-05-16)


### Features

* 分割乗車券の計算結果表示の改善（複数パターンの折り畳みとアクセシビリティ対応） ([#83](https://github.com/tojoryohei/kippu-navi/issues/83)) ([82f50ae](https://github.com/tojoryohei/kippu-navi/commit/82f50ae1fb55f0b560b8384f04b9e3ff03d6f86f))

## [1.9.3](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.9.2...kippu-navi-v1.9.3) (2026-05-13)


### Bug Fixes

* 特定運賃の早期リターンによるバリデーション漏れの修正 ([#80](https://github.com/tojoryohei/kippu-navi/issues/80)) ([4cdc2b8](https://github.com/tojoryohei/kippu-navi/commit/4cdc2b8932fc54bd7475312eb78756ec568e5dd0))

## [1.9.2](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.9.1...kippu-navi-v1.9.2) (2026-05-13)


### Bug Fixes

* 経路が存在しない(経路数1未満)場合の運賃計算でエラーを投げる仕様変更 ([#78](https://github.com/tojoryohei/kippu-navi/issues/78)) ([77d2190](https://github.com/tojoryohei/kippu-navi/commit/77d219026670b71895e93b31c8e6d8b5475888a6))

## [1.9.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.9.0...kippu-navi-v1.9.1) (2026-05-09)


### Bug Fixes

* 新大阪・大阪〜姫路以遠の特例判定から「JR西日本完結」の誤条件を削除 ([#75](https://github.com/tojoryohei/kippu-navi/issues/75)) ([915ba20](https://github.com/tojoryohei/kippu-navi/commit/915ba20025e628701f3464bfed2e3685f4d1fa8d))

## [1.9.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.8.2...kippu-navi-v1.9.0) (2026-05-08)


### Features

* 大都市近郊区間の最安運賃算出ロジックの改善 ([#72](https://github.com/tojoryohei/kippu-navi/issues/72)) ([420c238](https://github.com/tojoryohei/kippu-navi/commit/420c238907542040adaa9925652aa9d9d11077c2))

## [1.8.2](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.8.1...kippu-navi-v1.8.2) (2026-05-07)


### Performance Improvements

* 距離に応じた最安キロ単価の算出による、経路探索の枝刈りの強化 ([#70](https://github.com/tojoryohei/kippu-navi/issues/70)) ([015a4fe](https://github.com/tojoryohei/kippu-navi/commit/015a4fe9a7ebe400f7d92c0cd2979bd9f6d4315b))

## [1.8.1](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.8.0...kippu-navi-v1.8.1) (2026-05-06)


### Bug Fixes

* 鉄道駅バリアフリー料金が運賃に加算されない不具合の修正 ([#64](https://github.com/tojoryohei/kippu-navi/issues/64)) ([9d9816e](https://github.com/tojoryohei/kippu-navi/commit/9d9816e1cd89886d89d5348ee52e2bd1af8daac3))

## [1.8.0](https://github.com/tojoryohei/kippu-navi/compare/kippu-navi-v1.7.0...kippu-navi-v1.8.0) (2026-05-06)


### Features

* 大都市近郊区間内相互発着の最安経路計算特例の実装および最適化 ([#62](https://github.com/tojoryohei/kippu-navi/issues/62)) ([9ed9782](https://github.com/tojoryohei/kippu-navi/commit/9ed9782913d35c4a6b12310f6034b02a970c3bdf))

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
