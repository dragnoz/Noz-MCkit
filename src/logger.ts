// Manages the dedicated output channel for the extension
import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

export function initializeOutputChannel(): void {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel("Minecraft Resource Toolkit");
        logInfo("Output channel initialized.");
    }
}

// Function to get the output channel instance
export function getOutputChannel(): vscode.OutputChannel | undefined {
    return outputChannel;
}

export function logInfo(message: string): void {
    if (outputChannel) {
        const timestamp = new Date().toLocaleTimeString();
        outputChannel.appendLine(`[INFO ${timestamp}] ${message}`);
    } else {
        // Fallback to console if channel not ready (shouldn't happen after activation)
        console.log(`[MRT INFO] ${message}`);
    }
}

export function logWarn(message: string): void {
    if (outputChannel) {
        const timestamp = new Date().toLocaleTimeString();
        outputChannel.appendLine(`[WARN ${timestamp}] ${message}`);
    } else {
        console.warn(`[MRT WARN] ${message}`);
    }
}

export function logError(message: string, error?: any): void {
    if (outputChannel) {
        const timestamp = new Date().toLocaleTimeString();
        outputChannel.appendLine(`[ERROR ${timestamp}] ${message}`);
        if (error) {
            if (error instanceof Error) {
                outputChannel.appendLine(error.stack || error.message);
            } else {
                outputChannel.appendLine(String(error));
            }
        }
    } else {
        console.error(`[MRT ERROR] ${message}`, error);
    }
}

export function showOutputChannel(): void {
    outputChannel?.show(true); // true preserves focus
}

export function disposeOutputChannel(): void {
    if (outputChannel) {
        logInfo("Disposing output channel.");
        outputChannel.dispose();
        outputChannel = undefined;
    }
}

