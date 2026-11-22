[English](XANGI_SETUP.en.md) | 日本語

# AI主導のセットアップ

README.md、extension.config.json、xangi-extension.jsonと[使い方](docs/usage.md)を読みます。利用者が指定したinstance・workspaceだけを対象にし、個人memoryや無関係なファイルへ範囲を広げません。

1. 新規導入ではID・表示名・UI/AIの有無を確認してconfigureを実行します。UIとAIは独立して選べます。deviceは未対応です。既存導入のID・保存先は保持し、変更時は先にバックアップと移行を計画します。
2. npm ci、npm test、npm run buildを実行します。buildは構文とconfig/manifest一致を検査します。利用先CLIの絶対パスとhelpを確認します。
3. 許可範囲でmanifestを登録し、対象拡張だけを起動してstatus/doctorを確認します。以下のパスは置換例です。本体の再起動は不要です。
4. 生成・登録スキルを利用先workspaceへコピーする場合は、同名の既存スキルを比較し、無条件に上書きしません。保存方針を調整する場合も利用者側の保存スキルを優先します。
5. サンプル追加、JavaScript操作、一覧の開閉・幅変更、再起動後の本文・版・分類の保持を確認します。既存データを移した場合は件数・ID・全版・設定・Notionページ対応を読み戻して比較します。
6. Notionは必要な場合だけ、保存担当AIの接続済みツールと保存先・保存スキルを確認して有効化します。原本添付の可否、実保存・読み戻しを確認し、mockのみなら実保存済みと報告しません。実効設定・結果・未確認範囲を返します。

```sh
/absolute/path/to/xangi extension --help
/absolute/path/to/xangi extension link /absolute/path/to/xangi-report/xangi-extension.json
/absolute/path/to/xangi extension start xangi-report
/absolute/path/to/xangi extension status xangi-report
/absolute/path/to/xangi extension doctor xangi-report
```

必要なhost機能はschema-2 managed HTTP、readiness、認証付きservice/UI proxyです。AI保存にはagents/runtime-settings/sessions/chat API、アーティファクト取り込みにはartifact-previewまたはsession-attachment APIも必要です。

参照hostのpackage表示は0.1.0ですが、互換性の保証番号ではありません。利用先で確認した機能と未確認範囲を記録します。manifestにhost対応版の機械判定はありません。公開・merge・無関係な設定変更・指定外の外部送信はこのセットアップに含めません。[保存先と復旧](docs/usage.md#保存先と復旧)も確認してください。
