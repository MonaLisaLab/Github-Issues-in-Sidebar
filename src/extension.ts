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

        let repos: any[] = [];
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Fetching your accessible repositories...`,
                cancellable: false
            }, async () => {
                // 認証ユーザーがアクセスできるすべてのリポジトリを取得する
                repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
                    type: 'all',
                    sort: 'full_name',
                });
            });

        } catch (e: any) {
            console.error(e);
            let errorMessage = `Could not fetch repositories.`;
            if (e.status === 401) {
                errorMessage += `\nAuthentication failed. Please check if your token is correct and has 'repo' scope.`;
                await vscode.commands.executeCommand('githubIssues.setToken');
            } else {
                errorMessage += `\nPlease check your token, network connection, and try again.`;
            }
            vscode.window.showErrorMessage(errorMessage, { modal: true });
            return;
        }

        if (repos.length === 0) {
            vscode.window.showInformationMessage(`No repositories found that you have access to.`);
            return;
        }

        const repoItems = repos
            .map(repo => ({
                label: repo.full_name,
                description: repo.private ? '🔒 Private' : '🌐 Public',
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

        const selectedRepoItem = await vscode.window.showQuickPick(repoItems, {
            placeHolder: `Select a repository to show issues`,
            ignoreFocusOut: true,
        });

        if (!selectedRepoItem) {
            return;
        }
        
        const [owner, name] = selectedRepoItem.label.split('/');

        await config.update('repoOwner', owner, vscode.ConfigurationTarget.Global);
        await config.update('repoName', name, vscode.ConfigurationTarget.Global);

        vscode.window.showInformationMessage(`Repository changed to ${selectedRepoItem.label} 🎉`);
    });

    const refreshCommand = vscode.commands.registerCommand('githubIssues.refresh', () => {
        issueProvider.refresh();
    });

    const diagnoseCommand = vscode.commands.registerCommand('githubIssues.diagnose', async () => {
        const outputChannel = vscode.window.createOutputChannel("GitHub Issues Diagnostics");
        outputChannel.show(true);
        outputChannel.appendLine("Starting GitHub Issues extension diagnostics...");

        const config = vscode.workspace.getConfiguration('githubIssues');
        const authToken = config.get<string>('authToken');

        if (!authToken) {
            outputChannel.appendLine("❌ ERROR: GitHub Personal Access Token is not set.");
            vscode.window.showErrorMessage("GitHub Token not set. Please set it first using the 'Set GitHub Personal Access Token' command.");
            return;
        }
        outputChannel.appendLine("✅ Token found in configuration.");

        const octokit = new Octokit({ auth: authToken });

        try {
            outputChannel.appendLine("\nChecking API rate limit and token scopes...");
            const rateLimitResponse = await octokit.rateLimit.get();
            
            const scopes = rateLimitResponse.headers['x-oauth-scopes'];
            outputChannel.appendLine(`✅ Token Scopes: ${scopes}`);

            if (!scopes || !scopes.split(',').map(s => s.trim()).includes('repo')) {
                outputChannel.appendLine("❌ WARNING: Token does not appear to have the required 'repo' scope.");
                vscode.window.showWarningMessage("Your GitHub token seems to be missing the 'repo' scope, which is required for private repositories.");
            } else {
                 outputChannel.appendLine("✅ Token has 'repo' scope.");
            }

            outputChannel.appendLine("\nFetching authenticated user info...");
            const { data: user } = await octokit.users.getAuthenticated();
            outputChannel.appendLine(`✅ Successfully authenticated as: ${user.login}`);

            outputChannel.appendLine("\nFetching accessible repositories...");
            const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
                type: 'all',
                per_page: 100,
            });
            outputChannel.appendLine(`✅ Found ${repos.length} accessible repositories.`);

            if (repos.length > 0) {
                const privateRepos = repos.filter(repo => repo.private).length;
                const publicRepos = repos.length - privateRepos;
                outputChannel.appendLine(`   - Public: ${publicRepos}, Private: ${privateRepos}`);
                outputChannel.appendLine("\nFirst 10 repositories found:");
                repos.slice(0, 10).forEach(repo => {
                    outputChannel.appendLine(`- ${repo.full_name} (${repo.private ? '🔒 Private' : '🌐 Public'})`);
                });
            } else {
                outputChannel.appendLine("❌ WARNING: No repositories were found. This is unexpected if you have access to any repositories.");
            }
            
            outputChannel.appendLine("\n---");
            outputChannel.appendLine("💡 Next Steps:");
            outputChannel.appendLine("1. Check the 'Token Scopes' above. It MUST include 'repo'. If not, create a new token with the 'repo' scope.");
            outputChannel.appendLine("2. If scopes are correct but you're missing private org repos, you may need to authorize the token for that org's SAML SSO.");
            outputChannel.appendLine("   - Go to your Personal Access Tokens page on GitHub.");
            outputChannel.appendLine("   - Find your token, and click the 'Configure SSO' or 'Enable SSO' button next to it.");
            outputChannel.appendLine("   - Authorize it for the organization(s) you need to access.");
            
            vscode.window.showInformationMessage("Diagnostics finished. Check the 'GitHub Issues Diagnostics' output channel for details.");

        } catch (error: any) {
            outputChannel.appendLine(`\n❌ An error occurred during diagnostics:`);
            outputChannel.appendLine(error.toString());
            if (error.status) {
                outputChannel.appendLine(`Status: ${error.status}`);
            }
            if(error.response?.headers) {
                outputChannel.appendLine("Response Headers:");
                outputChannel.appendLine(JSON.stringify(error.response.headers, null, 2));
            }
            vscode.window.showErrorMessage("An error occurred during diagnostics. Check the output channel for details.");
        }
    });

    context.subscriptions.push(setTokenCommand, selectRepositoryCommand, refreshCommand, diagnoseCommand);

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