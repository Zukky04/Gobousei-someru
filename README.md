# 五芒星そめる

五芒星（★）を24色で塗って遊ぶ、シンプルなぬりえアプリです。
スマホ・タブレット・パソコンのブラウザで動きます。インストール不要。

## 遊びかた

1. 下の色の丸をおす → 指がその色を持ちます
2. 星の好きな場所をおす → その色に染まります
3. 「クリア」→「しろにもどす」で、星がまっ白に戻ります

## ファイル

- `index.html` … アプリ本体（このファイル1つで完結）
- `docs/requirements.md` … 要件書
- `docs/test-captures/` … テスト時の画面キャプチャ
- `tests/e2e.mjs` … Chrome で動きを確かめるテスト

## テストの実行（Mac + Google Chrome）

```bash
node tests/e2e.mjs "$PWD/index.html" "$PWD/docs/test-captures"
```

## クレジット

指のアイコンは [Tabler Icons](https://tabler.io/icons)（MIT License）の形を元にしています。
