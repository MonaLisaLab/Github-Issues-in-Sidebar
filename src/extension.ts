import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "github-issues-in-sidebar" is now active!');
    const issueProvider = new IssueProvider();
    vscode.window.registerTreeDataProvider('githubIssues', issueProvider);
}

class IssueItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

class IssueProvider implements vscode.TreeDataProvider<IssueItem> {
    getTreeItem(element: IssueItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: IssueItem): Promise<IssueItem[]> {
        // This is a placeholder.
        // We will fetch real issues from GitHub later.
        return [
            new IssueItem('Issue 1: A bug to fix', vscode.TreeItemCollapsibleState.None),
            new IssueItem('Issue 2: A new feature', vscode.TreeItemCollapsibleState.None),
            new IssueItem('Issue 3: Documentation update', vscode.TreeItemCollapsibleState.None),
        ];
    }
}

export function deactivate() {} 