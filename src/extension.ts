import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';

// アイテムの種類を管理しやすくするための型だよ
type ItemType = 'issue' | 'subtask' | 'info';

class IssueItem extends vscode.TreeItem {
    // イシューやサブタスクの情報を全部持っておくためのプロパティを追加したよ
    public owner?: string;
    public repo?: string;
    public issueNumber?: number;
    public subtasks: IssueItem[] = [];

    constructor(
        public readonly label: string,
        public readonly itemType: ItemType,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        // いろんな情報を渡せるように、コンストラクタをちょっと変更したよ
        public readonly command?: vscode.Command,
        public readonly issueUrl?: string,
        issueDetails?: { owner: string; repo: string; issueNumber: number }
    ) {
        super(label, collapsibleState);
        
        // `contextValue` を設定することで、package.jsonの`when`句で出し分けるメニューを制御できるんだ
        this.contextValue = itemType;

        if (issueUrl) {
            // デフォルトのコマンドは、ブラウザでイシューを開くコマンドだよ
            this.command = {
                command: 'vscode.open',
                title: 'Open Issue',
                arguments: [vscode.Uri.parse(issueUrl)]
            };
        }
        
        if (issueDetails) {
            this.owner = issueDetails.owner;
            this.repo = issueDetails.repo;
            this.issueNumber = issueDetails.issueNumber;
        }

        // アイテムの種類によってアイコンを変えるよ
        if (itemType === 'issue') {
            this.iconPath = new vscode.ThemeIcon('issues');
        }
    }
}


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

    const closeIssueCommand = vscode.commands.registerCommand('githubIssues.closeIssue', async (issueItem: IssueItem) => {
        if (!issueItem || issueItem.itemType !== 'issue' || !issueItem.issueNumber || !issueItem.owner || !issueItem.repo) {
            vscode.window.showErrorMessage('Cannot close issue. Invalid item selected.');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to close issue #${issueItem.issueNumber}?`,
            { modal: true },
            'Yes, close issue'
        );

        if (confirm !== 'Yes, close issue') {
            return;
        }

        const octokit = new Octokit({ auth: vscode.workspace.getConfiguration('githubIssues').get<string>('authToken') });

        try {
            await octokit.issues.update({
                owner: issueItem.owner,
                repo: issueItem.repo,
                issue_number: issueItem.issueNumber,
                state: 'closed'
            });
            vscode.window.showInformationMessage(`Successfully closed issue #${issueItem.issueNumber}.`);
            issueProvider.refresh();
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to close issue: ${e.message}`);
        }
    });

    const addCommentCommand = vscode.commands.registerCommand('githubIssues.addComment', async (issueItem: IssueItem) => {
        if (!issueItem || issueItem.itemType !== 'issue' || !issueItem.issueNumber || !issueItem.owner || !issueItem.repo) {
            vscode.window.showErrorMessage('Cannot comment on issue. Invalid item selected.');
            return;
        }
        
        const comment = await vscode.window.showInputBox({
            prompt: `Enter your comment for issue #${issueItem.issueNumber}`,
            placeHolder: 'Your comment here... (Markdown is supported)'
        });

        if (!comment) {
            return;
        }

        const octokit = new Octokit({ auth: vscode.workspace.getConfiguration('githubIssues').get<string>('authToken') });

        try {
            await octokit.issues.createComment({
                owner: issueItem.owner,
                repo: issueItem.repo,
                issue_number: issueItem.issueNumber,
                body: comment
            });
            vscode.window.showInformationMessage(`Successfully commented on issue #${issueItem.issueNumber}.`);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to add comment: ${e.message}`);
        }
    });

    context.subscriptions.push(setTokenCommand, selectRepositoryCommand, refreshCommand, diagnoseCommand, closeIssueCommand, addCommentCommand);

    // 設定が変更されたらビューをリフレッシュする
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('githubIssues')) {
            issueProvider.refresh();
        }
    });
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
        // もし`element`があれば、それは親イシューってことだから、そのサブタスクを返すよ
        if (element) {
            return Promise.resolve(element.subtasks);
        }

        // `element`がなければ、一番上の階層のイシューを取得しにいくよ
        const config = vscode.workspace.getConfiguration('githubIssues');
        const authToken = config.get<string>('authToken');
        const repoOwner = config.get<string>('repoOwner');
        const repoName = config.get<string>('repoName');

        if (!authToken) {
            const setTokenItem = new IssueItem(
                'Set GitHub Token', 
                'info',
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
                'info',
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
                return [new IssueItem('No open issues found.', 'info', vscode.TreeItemCollapsibleState.None)];
            }

            // APIから受け取ったイシューを、画面に表示する`IssueItem`に変換するよ
            return issues.data.map(issue => {
                // イシューの本文（body）からサブタスクを抜き出すんだ
                const subtasks = this.parseSubtasks(issue.body || '');

                const issueItem = new IssueItem(
                    `#${issue.number}: ${issue.title}`,
                    'issue',
                    // サブタスクがあれば、フォルダみたいに開けられるようにするよ
                    subtasks.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    undefined,
                    issue.html_url,
                    { owner: repoOwner, repo: repoName, issueNumber: issue.number }
                );
                // 見つけたサブタスクを、親イシューの中に保存しておくんだ
                issueItem.subtasks = subtasks;
                issueItem.tooltip = `[${repoOwner}/${repoName}] #${issue.number}\n\n${issue.title}`;
                
                return issueItem;
            });
        } catch (error: any) {
            console.error(error);
            // 認証エラーの場合の特別なメッセージ
            if (error.status === 401) {
                 const setTokenItem = new IssueItem(
                    'Authentication failed. Set new Token?', 
                    'info',
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'githubIssues.setToken',
                        title: 'Set GitHub Personal Access Token',
                    }
                );
                return [setTokenItem];
            }
            vscode.window.showErrorMessage('Failed to fetch issues from GitHub.');
            return [new IssueItem('Error fetching issues. Check logs for details.', 'info', vscode.TreeItemCollapsibleState.None)];
        }
    }

    /**
     * イシューの本文から、GitHubのタスクリスト（- [ ] や - [x]）を正規表現で探し出して、
     * IssueItemの配列として返すヘルパー関数だよ。
     */
    private parseSubtasks(body: string): IssueItem[] {
        const subtasks: IssueItem[] = [];
        const taskRegex = /-\s\[( |x)\]\s(.*)/g;
        let match;
        while ((match = taskRegex.exec(body)) !== null) {
            const isCompleted = match[1] === 'x';
            const label = match[2].trim();
            
            const subtaskItem = new IssueItem(label, 'subtask', vscode.TreeItemCollapsibleState.None);
            subtaskItem.iconPath = new vscode.ThemeIcon(isCompleted ? 'check' : 'circle-large-outline');
            subtaskItem.description = isCompleted ? "Completed" : "";
            
            subtasks.push(subtaskItem);
        }
        return subtasks;
    }
}

export function deactivate() {} 