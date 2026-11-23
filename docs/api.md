# HTTP API

[English](en/api.md)

全APIにhost注入のmanaged bearerが必要です。ブラウザはhostのservice proxyを使います。資源とAPIはproxy配下で相対解決します。更新はContent-Type: application/json、リクエスト上限4 MiB。HTML上限はUTF-8で2 MiBです。

## レポート

- GET /health: readiness。
- GET /api/reports?q=TEXT: タイトル・案件・分類名・タグの部分一致。starredパラメータがあればスターのみ。本文なし。archiveはactive（既定）/archived/all、sortはupdated_desc（既定）/updated_asc/created_desc/created_asc/title_asc。未知の条件は400。同値はIDで順序を固定。
- POST /api/reports: title（必須、200文字）、content（必須）、project（任意、100文字）、sourceNotes（任意、16000文字）、format（省略時html）。201でid/revision等を返す。
- GET /api/reports/{id}: 現在のcontent、メタデータ、versions、saves。content=0を指定すると最上位のcontentを省略。
- PUT /api/reports/{id}: 新規と同じ項目にexpectedRevisionを必須追加。既存版保持。競合409。
- PATCH /api/reports/{id}: starred（boolean）。
- POST /api/reports/{id}/archive: archivedとexpectedArchived（両方boolean）。競合は409。本文・更新日時・分類・保存結果は変えず、Notion保存を依頼しない。応答のarchivedは旧データでもfalseを既定として返す。
- GET /api/reports/{id}/versions/{revision}: 対象版のcontent、format、mediaType、タイトル等。
- GET /api/reports/{id}/versions/{revision}/view: 制限付きHTML。presentation=1の場合のみ、表示用コピーへ寸法通知のscriptを追加。通常viewとdownloadは原本のまま。sandboxは同一origin化せず、管理画面は自分のiframeからのURL一致・有限の寸法だけを受け取り、上限を幅12000px・高さ120000pxとして調整。
- GET /api/reports/{id}/versions/{revision}/download: attachmentとして原本。

版は1始まり。未対応形式415、空HTML400、大きすぎるHTML413、存在しないID/版404。削除APIと相対ファイルの自動読取はありません。

## 分類

POST /api/reportsはcategory（任意、60文字）とtags（任意の文字列配列、20個まで・各40文字）にも対応します。空白を除去して重複タグをまとめます。GET /api/reportsはcategory、tag、uncategorized=trueを検索・starredと併用できます。検索対象にはカテゴリ・タグも含まれます。

POST /api/reports/{id}/classificationにcategory、tags、expectedClassificationRevisionを渡すと、HTML本文の版を増やさず分類を変更します。現在値はGETのclassificationRevisionです。競合は409。本文更新のPUTは分類を変更しません。分類変更のみではNotion自動保存を実行しません。

## アーティファクト取り込み

POST /api/imports/previewへpath（.html/.htmのファイルパス）と任意のworkspaceIdまたはsessionIdを渡します。親hostが許可した対象だけを読み、content・title候補・sha256を返します。この時点でレポートは保存しません。

POST /api/imports/artifactへ同じ出所とexpectedSha256、title、任意のproject/sourceNotes/category/tagsを渡します。元の内容が変わっていれば409、成功時は原本コピーを保存し201。同じ出所・同じ内容は200とduplicate:trueを返し、importedRevisionで既存の取込版を示します。重複時はメタデータを上書きせず、Notion自動保存も再依頼しません。異なる内容は新レポートです。GETのoriginに取り込み出所・ハッシュ・取込版を保持します。

外部URLは受け付けません。UIはこのhostのプレビューURLをファイルパス等に分解してから送信します。元ファイルの編集・削除、履歴の一括走査は行いません。

## 保存設定

GET /api/settingsはsaveMode、saveAgentId、saveSkillName、notionDestinationとhost接続状況・aiEnabledを返します。PUTはこの4設定全てを受け付けます。AI機能を無効にした構成では、保存済み設定を保持したまま実効saveModeをoff、設定値をconfiguredSaveModeとして返し、新しいAI保存を拒否します。送信済み依頼の結果報告は引き続き受け付けます。

```json
{
  "saveMode": "manual",
  "saveAgentId": "",
  "saveSkillName": "xangi-report-save",
  "notionDestination": "利用者が指定したページ・データベース"
}
```

saveModeはoff/manual/auto。有効時はnotionDestination必須。GET /api/agentsはparent hostのAI一覧と既定AI情報。設定をプロセス環境へ書き戻しません。

## 保存依頼・結果

POST /api/reports/{id}/saveへrequestId（UUID）、revision（整数）を指定すると202で依頼状態を返します。同じrequestIdは同じ結果。他対象への再利用は409。同じレポートに未完了依頼があれば既存依頼を返し、並行送信しません。

queued/creating/sending/requestedは受付側の状態。担当AIがsaved/partial/needs_input/errorを報告します。uncertainは配送結果不明で自動再送しません。会話とNotionで結果を確認後、新requestIdとretryAfterCheck:trueでuncertainを閉じて再依頼できます。needs_inputは元会話で回答します。

依頼は版・保存方針・担当AI・保存先を固定して永続化。更新が重なると進行中のsaved報告後に最新版を依頼します。partial/error/needs_input/uncertainで自動継続せず、利用者が内容を確認します。結果は実際に送った版に紐付けます。

POST /api/reports/{id}/save-resultは保存AI用。managed bearerに加え、promptの識別値が必要です。callbackTokenはUIへ返しません。

```json
{
  "requestId": "依頼UUID",
  "sessionId": "保存用会話ID",
  "revision": 1,
  "callbackToken": "依頼に渡された値",
  "status": "saved",
  "pageUrl": "https://www.notion.so/11111111111111111111111111111111",
  "verified": true,
  "summary": "本文と出典を保存し、読み戻して照合"
}
```

savedにはverified:trueと実Notion URL、partialにも実URLが必須。依頼ID・会話ID・版・callbackToken・URL形式を検査します。verifiedは担当AIの報告で、拡張の直接照合ではありません。完了済み依頼の再報告は409。失敗時も既存ページURLを保持します。
