日本語 | [English](README.en.md)

# xangi-report

AIとの会話で作ったHTMLレポートを保存し、PC・スマホから読み返すxangi拡張です。初版の対応形式と、指定がない場合の既定はHTMLです。

## 主な機能

- HTMLの追加、過去アーティファクトの取り込み、原本と更新前の版の保持。
- JavaScriptを使うグラフ・絞り込み・計算の閲覧。管理画面とはsandboxで分離。
- カテゴリ1つ・複数タグ、検索・スター・分類による絞り込み。
- 一覧の開閉とドラッグ／キーボードによる幅変更。ブラウザに状態を保存。
- 更新日・追加日・タイトルでの並び替えと、アーカイブ／復元。
- 大きいHTMLの幅合わせ・全体表示・倍率変更、縦横スクロール。
- 任意のNotion手動／自動保存。保存担当AIと利用者の保存スキルを使用。

## Quickstart

Node.js 22以上とnpmが必要です。実行時依存はありません。

```sh
npm ci
npm run configure -- --id xangi-report --name xangi-report --features ui,ai
npm test
npm run build
```

[セットアップ](XANGI_SETUP.md)に従って登録・起動します。既存環境のIDや保存先を変える場合は、先にデータの移行・復元方法を確認してください。Notion保存の既定は無効です。[操作サンプル](examples/comparison.html)も使えます。

## ドキュメント

- [セットアップ・拡張登録](XANGI_SETUP.md)
- [使い方・設定・復旧・検証](docs/usage.md)
- [構成・認証・データ管理](docs/design.md)
- [HTTP API](docs/api.md)
- [生成・登録スキル](skills/xangi-report/SKILL.md) / [Notion保存スキル](skills/xangi-report-save/SKILL.md)
- [English setup](XANGI_SETUP.en.md) / [usage](docs/en/usage.md) / [design](docs/en/design.md) / [API](docs/en/api.md)

xangi-reportは[HTML共有くん](https://github.com/minorun365/html-share)に着想を得ました。作者の皆さんに感謝します。

## License

MIT
