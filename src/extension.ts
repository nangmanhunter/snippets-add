import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// VS Code 템플릿에 기본 내장되어 있는 주석 있는 JSON 파서야!
import * as jsonc from 'jsonc-parser';

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('extension.createSnippetFromSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        // 1. Get the selected text (This will become the snippet body)
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        if (!selectedText) {
            vscode.window.showWarningMessage('Please select the code you want to make into a snippet first.');
            return;
        }

        // Format snippet body (Split by line breaks into an array)
        const snippetBody = selectedText.split(/\r?\n/);

        try {
            // 2. Specify the VS Code user snippets directory path
            // Handle different OS paths
            let appDataPath = '';
            if (process.platform === 'win32') {
                appDataPath = process.env.APPDATA || '';
            } else if (process.platform === 'darwin') {
                appDataPath = path.join(os.homedir(), 'Library', 'Application Support');
            } else {
                appDataPath = path.join(os.homedir(), '.config');
            }
            const snippetsDir = path.join(appDataPath, 'Code', 'User', 'snippets');

            // Create directory if it doesn't exist
            if (!fs.existsSync(snippetsDir)) {
                fs.mkdirSync(snippetsDir, { recursive: true });
            }

            // 3. Get existing snippet files
            const files = fs.readdirSync(snippetsDir).filter(file => file.endsWith('.json') || file.endsWith('.code-snippets'));
            
            // Provide an option to create a new file if needed
            const createNewOption = '+ Create new snippet file...';
            const pickOptions = [createNewOption, ...files];

            // 4. File selection QuickPick
            let selectedFile = await vscode.window.showQuickPick(pickOptions, {
                placeHolder: 'Select a snippet file to add to.'
            });

            if (!selectedFile) return;

            let targetFilePath = '';
            if (selectedFile === createNewOption) {
                // Get new file name
                const newFileName = await vscode.window.showInputBox({
                    placeHolder: 'e.g., my-global-snippets',
                    prompt: 'Enter the name of the snippet file (.code-snippets extension will be added automatically)'
                });
                if (!newFileName) return;
                targetFilePath = path.join(snippetsDir, `${newFileName}.code-snippets`);
                // Create an empty json file
                if (!fs.existsSync(targetFilePath)) {
                    fs.writeFileSync(targetFilePath, '{}', 'utf8');
                }
            } else {
                targetFilePath = path.join(snippetsDir, selectedFile);
            }

            // 5. Get metadata inputs (Name, Prefix, Scope, Description)
            const snippetName = await vscode.window.showInputBox({
                placeHolder: 'Snippet Name (Used as ID)',
                prompt: 'Enter a unique name for this snippet.'
            });
            if (!snippetName) return;

            const snippetPrefix = await vscode.window.showInputBox({
                placeHolder: 'Trigger prefix (e.g., fc, myfunc)',
                prompt: 'Enter the prefix shortcut to trigger the snippet in the editor.'
            });
            if (!snippetPrefix) return;

            const snippetScope = await vscode.window.showInputBox({
                placeHolder: 'Scope (e.g., javascript,typescript) - Leave empty for global',
                prompt: 'Enter the languages this snippet applies to, separated by commas (Only valid for global snippet files).'
            });

            const snippetDescription = await vscode.window.showInputBox({
                placeHolder: 'Snippet Description',
                prompt: 'Enter a short description of what this snippet does.'
            });

            // 6. Read the file and edit it while maintaining the original string format
            const fileContent = fs.readFileSync(targetFilePath, 'utf8') || '{}';
            

            // 💡 1. 빈 객체를 만들고, scope 조건에 따라 순서를 보장하며 데이터 채우기
            const newSnippetData: any = {};

            // scope가 있으면 가장 먼저 객체에 주입 (순서 1등)
            if (snippetScope && snippetScope.trim() !== '') {
                newSnippetData.scope = snippetScope;
            }
            // 나머지 속성들을 순서대로 주입
            newSnippetData.prefix = snippetPrefix;
            newSnippetData.body = snippetBody;
            newSnippetData.description = snippetDescription || '';


            // jsonc.modify calculates the 'edits' to insert newSnippetData at [snippetName] 
            // path without breaking the original comments or formatting.
            const edits = jsonc.modify(fileContent, [snippetName], newSnippetData, {
                formattingOptions: {
                    insertSpaces: true,
                    tabSize: 4,
                    eol: '\n'
                }
            });

            
            // Apply the calculated edits to the original text (Comments are preserved!)
            const updatedContent = jsonc.applyEdits(fileContent, edits);

            // Overwrite the file
            fs.writeFileSync(targetFilePath, updatedContent, 'utf8');
            vscode.window.showInformationMessage(`Snippet '${snippetName}' has been successfully registered with comments preserved!`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Error occurred while registering snippet: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}