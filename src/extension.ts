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

    const selectRepositoryCommand = vscode.commands.registerCommand('githubIssues.selectRepository', async () => {
        const config = vscode.workspace.getConfiguration('githubIssues');
        let authToken = config.get<string>('authToken');

        // トークンが設定されていない場合は、設定を促す
        if (!authToken) {
            vscode.window.showWarningMessage('Please set your GitHub Personal Access Token first.');
            await vscode.commands.executeCommand('githubIssues.setToken');
            // コマンド実行後に再度トークンを取得
            authToken = config.get<string>('authToken');
            // それでもトークンがなければ処理を中断
            if (!authToken) {
                return;
            }
        }
        
        const octokit = new Octokit({ auth: authToken });

        const repoOwner = await vscode.window.showInputBox({
            prompt: 'Enter the repository owner (user or organization)',
            value: config.get<string>('repoOwner') || '',
            ignoreFocusOut: true,
        });

        if (!repoOwner) {
            return;
        }

        let repos: { name: string; }[] = [];
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Fetching repositories for ${repoOwner}...`,
                cancellable: false
            }, async () => {
                try {
                    repos = await octokit.paginate(octokit.repos.listForUser, {
                        username: repoOwner,
                        type: 'all',
                    });
                } catch (error: any) {
                    if (error.status === 404) {
                        // User not found, try as organization
                        repos = await octokit.paginate(octokit.repos.listForOrg, {
                            org: repoOwner,
                            type: 'all',
                        });
                    } else {
                        throw error;
                    }
                }
            });

        } catch (e: any) {
            console.error(e);
            vscode.window.showErrorMessage(`Could not fetch repositories for ${repoOwner}. Please check if the owner exists and your token has the correct permissions.`);
            return;
        }

        if (repos.length === 0) {
            vscode.window.showInformationMessage(`No repositories found for ${repoOwner}.`);
            return;
        }

        const repoNames = repos.map(repo => repo.name).sort((a, b) => a.localeCompare(b));

        const repoName = await vscode.window.showQuickPick(repoNames, {
            placeHolder: `Select a repository from ${repoOwner}`,
            ignoreFocusOut: true,
        });

        if (!repoName) {
            return;
        }

        await config.update('repoOwner', repoOwner, vscode.ConfigurationTarget.Global);
        await config.update('repoName', repoName, vscode.ConfigurationTarget.Global);

        vscode.window.showInformationMessage(`Repository changed to ${repoOwner}/${repoName} 🎉`);
    });

    const refreshCommand = vscode.commands.registerCommand('githubIssues.refresh', () => {
        issueProvider.refresh();
    });

    context.subscriptions.push(setTokenCommand, selectRepositoryCommand, refreshCommand);

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
            const selectRepoItem = new IssueItem(
                'Select Repository to show issues', 
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'githubIssues.selectRepository',
                    title: 'Select Repository',
                }
            );
            return [selectRepoItem];
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