---
name: xangi-report
description: xangi-report用の操作できるHTMLレポートを作成・登録・更新する。通常のチャット回答だけの依頼では登録しない。
---

# レポートを作る

依頼された内容と元資料から、読み返せるレポートを作る。形式の指定がなければHTML。初版で登録できる形式はHTMLのみなので、他形式が必要なら未対応を伝え、黙ってHTMLへ置き換えない。

HTMLはCSS・画像・必要なJavaScriptライブラリを埋め込んだ単一ファイルにする。2 MiBまで。外部CDN、ネットワーク通信、親画面のDOMやストレージに依存させない。グラフ操作・絞り込み・計算等はJavaScriptで実装できる。描画に必要なデータも埋め込む。スマホ幅で本文や操作を確認する。出典とAIによる解釈を区別し、未確認の内容を事実として補わない。

対象repoのextension.config.jsonとxangi-extension.jsonで実効IDとcapabilityを確認し、接続済み拡張ツールを使う。既定はextensionId: xangi-report / capability: xangi-report.manage。CLIが必要なら対象instanceから指定された絶対パスとhelpを確認する。認証値をレポートへ入れない。

- 新規登録: POST /api/reports に title, project（任意）, sourceNotes（任意）, content をJSONで渡す。formatは省略時html。
- 一覧: GET /api/reports。既存レポート更新の依頼では対象IDを確認する。
- 分類: 追加時にcategoryとtagsを指定できる。分類のみの編集はPOST /api/reports/{id}/classificationにcategory/tags/expectedClassificationRevisionを渡す。分類のためだけに本文の版を増やさない。
- 過去のアーティファクト: 利用者が指定したpathとworkspaceIdまたはsessionIdでPOST /api/imports/preview。contentとsha256を確認後、同じ出所とexpectedSha256・title等でPOST /api/imports/artifact。元ファイルは変更しない。同じ出所・同じ内容は既存版が返る。過去会話やファイル全体を無条件に走査しない。
- 詳細: GET /api/reports/{id}。現在のrevisionとcontentを取得できる。
- 更新: PUT /api/reports/{id} に title, project, sourceNotes, content, expectedRevision を渡す。既存版は残る。競合409なら再取得し、他の変更を上書きしない。
- 特定版: GET /api/reports/{id}/versions/{revision}。HTMLを含む保存内容を読み戻して照合する。

保存後はID・版・タイトルを報告し、登録成功とNotion保存成功を区別する。Notion自動保存は利用者が有効化した設定に従う。設定変更や追加の外部公開は、この登録操作に含めない。
