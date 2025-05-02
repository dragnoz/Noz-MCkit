// src/graph/graphViewProvider.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getAllFunctionCallsForGraph } from '../linker/identifierIndexer'; // Import the data function

export class GraphViewProvider {
    private static currentPanel: vscode.WebviewPanel | undefined;
    private static readonly viewType = 'mrtGraphView';

    public static createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (GraphViewProvider.currentPanel) {
            GraphViewProvider.currentPanel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            GraphViewProvider.viewType,
            'Function Call Graph',
            column || vscode.ViewColumn.One,
            {
                // Enable javascript in the webview
                enableScripts: true,
                // Restrict the webview to only loading content from our extension's `media` and `webviews/graph` directories
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media'),
                    vscode.Uri.joinPath(context.extensionUri, 'webviews', 'graph') // Assuming HTML/JS/CSS will be here
                ]
            }
        );

        GraphViewProvider.currentPanel = panel;

        // Set the webview's initial html content
        panel.webview.html = GraphViewProvider._getHtmlForWebview(panel.webview, context);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programatically
        panel.onDidDispose(() => GraphViewProvider.currentPanel = undefined, null, context.subscriptions);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'getGraphData':
                        // Get data from the indexer
                        const graphData = getAllFunctionCallsForGraph();
                        // Send data to the webview
                        panel.webview.postMessage({ command: 'loadGraphData', data: graphData });
                        return;
                    case 'nodeClicked':
                        const nodeId = message.nodeId;
                        console.log(`Node clicked in webview: ${nodeId}`);
                        try {
                            // Attempt to parse the nodeId as a URI
                            const uri = vscode.Uri.parse(nodeId, true); // Use strict parsing
                            const doc = await vscode.workspace.openTextDocument(uri);
                            await vscode.window.showTextDocument(doc);
                        } catch (e) {
                            // If it's not a valid URI, it might be a function ID without a file
                            // Or an error occurred opening the file
                            console.warn(`Could not open file for node ID: ${nodeId}`, e);
                            vscode.window.showWarningMessage(`Could not open file associated with node: ${nodeId}`);
                        }
                        return;
                    case 'alert': // Keep existing alert handler for debugging
                        vscode.window.showErrorMessage(message.text);
                        return;
                }
            },
            null,
            context.subscriptions
        );
    }

    private static _getHtmlForWebview(webview: vscode.Webview, context: vscode.ExtensionContext): string {
        // Get paths to resources on disk
        const scriptPathOnDisk = vscode.Uri.joinPath(context.extensionUri, 'webviews', 'graph', 'graph.js');
        const stylePathOnDisk = vscode.Uri.joinPath(context.extensionUri, 'webviews', 'graph', 'graph.css');
        const htmlPathOnDisk = vscode.Uri.joinPath(context.extensionUri, 'webviews', 'graph', 'graph.html');

        // And get the special URIs to use with the webview
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
        const styleUri = webview.asWebviewUri(stylePathOnDisk);

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        // Read the html file from disk
        let htmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');

        // Replace placeholders in the HTML
        htmlContent = htmlContent.replace(/{{cspSource}}/g, webview.cspSource);
        htmlContent = htmlContent.replace(/{{nonce}}/g, nonce);
        htmlContent = htmlContent.replace(/graph.js/g, scriptUri.toString());
        htmlContent = htmlContent.replace(/graph.css/g, styleUri.toString());

        return htmlContent;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

