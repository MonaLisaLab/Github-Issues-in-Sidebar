import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "github-issues-in-sidebar" is now active!');
    
    const issueProvider = new IssueProvider();
    vscode.window.registerTreeDataProvider('githubIssues', issueProvider);

    const setTokenCommand = vscode.commands.registerCommand('githubIssues.setToken', async () => {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter your GitHub Personal Access Token',
            password: true,
            ignoreFocusOut: true,
        });

        if (token) {
            await vscode.workspace.getConfiguration('githubIssues').update('authToken', token, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('GitHub token saved successfully!');
            issueProvider.refresh();
        }
    });

    context.subscriptions.push(setTokenCommand);

    // 設定が変更されたらビューをリフレッシュする
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('githubIssues')) {
            issueProvider.refresh();
        }
    });
}

class IssueItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        public readonly issueUrl?: string
    ) {
        super(label, collapsibleState);
        // issueUrlがあれば、それを開くコマンドをデフォルトで設定する
        if (issueUrl) {
            this.command = {
                command: 'vscode.open',
                title: 'Open Issue',
                arguments: [vscode.Uri.parse(issueUrl)]
            };
        }
    }
}

class IssueProvider implements vscode.TreeDataProvider<IssueItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<IssueItem | undefined | null | void> = new vscode.EventEmitter<IssueItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<IssueItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: IssueItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: IssueItem): Promise<IssueItem[]> {
        const config = vscode.workspace.getConfiguration('githubIssues');
        const authToken = config.get<string>('authToken');
        const repoOwner = config.get<string>('repoOwner');
        const repoName = config.get<string>('repoName');

        if (!authToken) {
            const setTokenItem = new IssueItem(
                'Set GitHub Token', 
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'githubIssues.setToken',
                    title: 'Set GitHub Personal Access Token',
                }
            );
            return [setTokenItem];
        }

        if (!repoOwner || !repoName) {
            return [new IssueItem('Please set repository owner and name in settings.', vscode.TreeItemCollapsibleState.None)];
        }

        const octokit = new Octokit({ auth: authToken });

        try {
            const issues = await octokit.issues.listForRepo({
                owner: repoOwner,
                repo: repoName,
                state: 'open',
            });

            if (issues.data.length === 0) {
                return [new IssueItem('No open issues found.', vscode.TreeItemCollapsibleState.None)];
            }

            return issues.data.map(issue => {
                return new IssueItem(
                    `#${issue.number}: ${issue.title}`,
                    vscode.TreeItemCollapsibleState.None,
                    undefined, // commandをissueUrlのデフォルトで上書きするのでundefined
                    issue.html_url
                );
            });
        } catch (error: any) {
            console.error(error);
            // 認証エラーの場合の特別なメッセージ
            if (error.status === 401) {
                 const setTokenItem = new IssueItem(
                    'Authentication failed. Set new Token?', 
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'githubIssues.setToken',
                        title: 'Set GitHub Personal Access Token',
                    }
                );
                return [setTokenItem];
            }
            vscode.window.showErrorMessage('Failed to fetch issues from GitHub.');
            return [new IssueItem('Error fetching issues. Check logs for details.', vscode.TreeItemCollapsibleState.None)];
        }
    }
}

export function deactivate() {} 