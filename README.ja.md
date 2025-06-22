# Github Issues in Sidebar 🔘

VSCodeのサイドバーで、直接GitHubのイシューを閲覧・管理するための拡張機能です。

![Github Issues](https://raw.githubusercontent.com/MonaLisaLab/Github-Issues-in-Sidebar/main/resources/GithubIssues.png)

[English Version](./README.md)

## ✨ 機能

- **イシューの閲覧**: アクセス可能なすべてのリポジトリのオープンなイシューを閲覧できます。
- **リポジトリの選択**: プライベートや組織のリポジトリを含む、あなたがアクセスできるすべてのリポジトリのリストを表示します。
- **イシューの管理**:
  - サイドバーから直接**イシューをクローズ**できます。
  - 任意のイシューに**コメントを追加**できます。
- **クイックアクション**: ビューのヘッダーにあるアイコンから、これらの操作へ素早くアクセスできます。
- **診断ツール**: 接続や権限の問題が発生した際のトラブルシューティングに役立ちます。

## 🔑 セットアップ

この拡張機能を使用するには、GitHubのPersonal Access Token（PAT）を作成し、拡張機能に設定する必要があります。

### 1. Personal Access Token（Classic）の作成

1.  GitHubの[Personal Access Token](https://github.com/settings/tokens)ページに移動します。
2.  **Generate new token** をクリックし、**Generate new token (classic)** を選択します。
3.  トークンに分かりやすい **Note**（例：`vscode-issues-sidebar`）を付けます。
4.  トークンの **Expiration**（有効期限）を選択します。
5.  **Select scopes** の下にある **`repo`** スコープにチェックを入れます。これはプライベートリポジトリにアクセスするために必要です。
6.  **Generate token** をクリックし、**表示されたトークンをコピーします**。このトークンは二度と表示されません！

> **組織のリポジトリに関する注意点:**
> SAML SSOを使用している組織に属するプライベートリポジトリにアクセスする必要がある場合、PATを作成した後にその組織での利用を**許可（Authorize）**する必要があるかもしれません。リストであなたのトークンを見つけ、「Configure SSO」ボタンをクリックしてください。

### 2. VSCodeにトークンを設定する

1.  コマンドパレットを開きます（`Cmd+Shift+P` または `Ctrl+Shift+P`）。
2.  **`GitHub Issues: Set GitHub Personal Access Token`** コマンドを実行します。
3.  コピーしたトークンを貼り付けて `Enter` を押します。

## 🚀 使い方

- **`✏️ Select Repository`**: 鉛筆アイコンをクリックしてリポジトリを選択します。アクセス可能なすべてのリポジトリのリストが表示されます。
- **`🔄 Refresh`**: 更新アイコンをクリックしてイシューリストを再読み込みします。
- **`🔑 Set Token`**: 鍵アイコンをクリックしてPersonal Access Tokenを更新します。
- **`🧪 Run Diagnostics`**: ビーカーアイコンをクリックして、問題が発生した場合に診断を実行します。

### イシューの管理

サイドバーのイシューを右クリックすると、コンテキストメニューが開きます：

- **`Add Comment`**: イシューにコメントを追加するための入力ボックスを開きます。
- **`Close Issue`**: 確認後、イシューをクローズします。

---

**Enjoy!** 