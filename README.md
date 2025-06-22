# Github Issues in Sidebar 🔘

A VSCode extension to view and manage GitHub issues directly in your sidebar.

![Github Issues](./resources/GithubIssues.png)

[日本語版はこちら](./README.ja.md)


## ✨ Features

- **Browse Issues**: View all open issues from any of your accessible repositories.
- **Select any Repository**: Displays a list of all repositories you have access to, including private and organization repos.
- **Manage Issues**:
  - **Close issues** directly from the sidebar.
  - **Add comments** to any issue.
- **Quick Actions**: Easy-to-use icons in the view header for quick access to common actions.
- **Diagnostics Tool**: Helps troubleshoot connection or permission problems.

## 🔑 Setup

To use this extension, you need to create a GitHub Personal Access Token (PAT) and set it in the extension.

### 1. Create a Personal Access Token (Classic)

1.  Go to your [Personal access tokens](https://github.com/settings/tokens) page on GitHub.
2.  Click **Generate new token**, and select **Generate new token (classic)**.
3.  Give your token a descriptive **Note** (e.g., `vscode-issues-sidebar`).
4.  Select an **Expiration** for your token.
5.  Under **Select scopes**, check the **`repo`** scope. This is required to access your private repositories.
6.  Click **Generate token** and **copy the token**. You won't be able to see it again!

> **Note for Organization Repositories:**
> If you need to access issues in a private repository that belongs to an organization using SAML SSO, you may need to **authorize** the PAT for that organization after creating it. Find your token in the list and click the **Configure SSO** button.

### 2. Set the Token in VSCode

1.  Open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).
2.  Run the **`GitHub Issues: Set GitHub Personal Access Token`** command.
3.  Paste your copied token and press `Enter`.

## 🚀 How to Use

- **`✏️ Select Repository`**: Click the pencil icon to choose a repository. A list of all your accessible repositories will be shown.
- **`🔄 Refresh`**: Click the refresh icon to reload the issue list.
- **`🔑 Set Token`**: Click the key icon to update your Personal Access Token.
- **`🧪 Run Diagnostics`**: Click the beaker icon to run diagnostics if you encounter any problems.

### Managing an Issue

Right-click on an issue in the sidebar to open the context menu:

- **`Add Comment`**: Opens an input box to add a comment to the issue.
- **`Close Issue`**: Closes the issue after confirmation. 

---

**Enjoy!** 