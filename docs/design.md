[English](en/design.md) | 日本語

# 構成・認証・データ管理

## UIの文字と密度の基準（推奨）

本体のファイラーを基準に、画面を切り替えても一覧・操作の密度が変わりにくい既定値を使います。拡張名・アイコンは本体の拡張開発ガイドに合わせ、既存IDを自動改名しません。これは新規UI・保守時の推奨で、利用者指定と用途に合う表示を優先します。例外申請や必須SDKは不要です。

- 一覧の主文字・ボタン・ナビ・通常ラベル: 13px（`--xangi-font-ui`）。
- 日時・説明などの補足: 12px（`--xangi-font-caption`）。短い件数やバッジ: 11px（`--xangi-font-micro`）。主要情報を小さい文字へ押し込みません。
- 画面名: 18px（`--xangi-font-heading`）。節見出し: 16px（`--xangi-font-section`）。一覧を巨大な見出しで占有しません。
- 記事・メール・Markdown・会話など読む本文: 16px、行高1.6〜1.75（`--xangi-font-reading`）。長文の見出しは24/18/16pxを目安にします。
- コード・ファイル編集: 13px、等幅（`--xangi-font-code`）。グラフ等の主要数値は24px（`--xangi-font-metric`）。

UIの書体はInter、system sans-serif、Noto Sans JP等の日本語fallbackを同じ順で使います。ブラウザの文字拡大を妨げず、親iframeから全子要素へフォントを強制注入しません。各拡張が同名のCSS変数を持ち、単体でも同じ基準を使います。取り込んだレポートHTMLや外部プレビューの本文は書き換えません。

余白は4px単位、薄い境界・中立色と青の操作色、角丸6〜8pxを既存画面に合わせて使います。情報の配置・機能・読み順は維持します。スマホでは入力欄16px、操作領域44px程度を確保し、文字だけでタップ領域を決めません。画面名はPC/スマホとも18pxを基本にし、長文本文を画面幅だけで縮小しません。

PC/スマホ・明暗テーマで、実際のcomputed style、長いラベル、スクロール、フォーカス、入力と戻る操作を確認します。本体の中と単体の両方を確認し、未確認の実機条件を報告します。

## テンプレートと構成

[xangi-extension-template](https://github.com/karaage0703/xangi-extension-template) 0.1.1、参照commit 8680333fef6840596b0e12dae8475282786e065aを基準に、共通の設定・manifest生成・起動・保存・機能モジュール・日英docsの配置を採用しています。Reportの版番号はテンプレートと独立です。

- extension.config.json / src/config.mjs: ID・表示名・版・機能の検証、ID別環境変数、manifest生成。
- scripts/configure.mjs: 設定とmanifestを同時に生成。buildでも一致を確認。
- scripts/xangi-extension / src/main.mjs: managed HTTPの入口、readinessとshutdown。
- src/server.mjs: bearer/Origin検査、基本API、選択した機能、終了処理。
- src/storage.mjs: 保存先検証、単一writer、原本・版・設定・依頼結果、移行。
- src/features/ui.mjs: 信頼済み管理画面資源の埋め込み。編集元はpublic/。
- src/features/ai.mjs: 親hostへの認証付き接続、保存AIの会話・送信と原本取得。
- src/classification.mjs / imports.mjs / saves.mjs / formats/html.mjs: Report固有の分類・原本取り込み・保存依頼・形式の処理。

テンプレートのカウンターをReportのデータモデルへ置き換えています。UI/AIは独立選択、deviceは実装していないため有効化を拒否します。AI保存は回答待ち・結果不明の回復のため会話を保持し、同期応答後に会話を閉じるサンプルとは異なります。これらは用途上の差分です。

## 認証と閲覧

hostが渡すmanaged bearerで全APIを認証し、異なるOriginを拒否します。UI資源/APIはservice proxy配下で相対解決し、UI proxyのインライン限定CSPにも対応します。直接UIを開く場合は埋め込み資源のSHA-256をCSPに指定します。host API用認証とservice bearerを分け、ブラウザに渡しません。

原本・通常view・ダウンロードは改変せず、管理画面内のallow-scripts付きiframeと閲覧レスポンスのsandbox/CSPで分離します。allow-same-originは付けません。外部通信・フォーム・別フレームを制限し、直接閲覧でも同じレスポンス制限を適用します。

管理UIからのpresentation=1閲覧時だけ、表示用コピーに寸法通知のscriptを追加します。parentは自分のiframeのWindow・現在URL・有限の寸法を照合し、幅12000px／高さ120000pxまでを採用します。DOMを共有せず、本文の固定サイズを確保したiframeを外側で拡縮し、外側の領域でスクロールします。viewport相対の寸法が通知ループで増え続けないように計測します。独自CSPでscriptを禁止するHTML等は自動計測できない場合があります。

## データと更新

レポートID・メタデータ・分類・HTML各版・Notion依頼結果を保持します。分類のrevisionと本文revisionは独立です。取り込みは明示した対象をhostで検証し、出所/内容hashで原子的に重複を防ぎます。確認時のhashと変われば保存しません。元ファイルを編集しません。

アーカイブは本文の版と独立したbooleanで、旧schema 2の省略値はfalseとして読みます。読込だけでstateを書き換えず、変更はexpectedArchivedで競合を検出します。版・更新日時・分類・保存結果を保持し、通常一覧はactiveだけを返します。並び順は更新／追加日時の昇降順・日本語タイトル順で、同値はID順です。表示条件と並び順はブラウザに保存します。

workspace/instance単位でソース外へ保存し、既存保存先と旧環境変数を維持します。schema 1の原文バックアップを作ってschema 2へ移行します。逐次更新とrename、lock、破損時の起動失敗を使い、勝手に初期化しません。復旧の詳細は[使い方](usage.md)にあります。

Notion依頼はrequest ID・会話ID・対象版・callback tokenを照合し、再取得照合の報告と実ページURLを要求します。配送不明を自動再送せず、旧版の結果を新版に転用しません。自動保存は利用者の有効化した設定に従います。

## 画面

閲覧ヘッダーは1行に限定し、取込元や編集操作は初期状態で閉じた開閉パネルへまとめます。長いタイトルは閲覧バーで省略し、パネルで全文を読めます。表示を広げる操作は保存済みの一覧設定を変えず、上部メニューと一覧を一時的に隠します。メニューを開く・操作する・閉じて読む・通常表示へ戻る経路をPC／スマホで検証します。

中立色と青のアクセント、system font、light/darkを使用します。PCは一覧/本文、スマホは一画面ずつ表示します。一覧は開閉・幅変更でき、本文領域を確保します。ラベル、フォーカス、44px程度の操作対象、状態とエラー、入力保持を提供します。hostのHome/Back/Forwardを重複させず、レポート本文DOMを親から編集しません。

## 検証範囲

設定/manifest、対応4構成、保存・移行・認証、import・分類、Notion状態と、PC/スマホの主操作を検査します。実hostのparser/proxyと実画面でも確認しています。mockを実AI/Notion検証とは扱いません。必要なhost機能・利用先での確認は[セットアップ](../XANGI_SETUP.md)を参照してください。
