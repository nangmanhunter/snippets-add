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
            vscode.window.showErrorMessage('활성화된 에디터가 없습니다.');
            return;
        }

        // 1. Selection 잡힌 텍스트 가져오기 (Snippet의 body가 됨)
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        if (!selectedText) {
            vscode.window.showWarningMessage('스니펫으로 만들 코드를 먼저 선택(selection)해주세요.');
            return;
        }

        // 스니펫 body 포맷팅 (줄바꿈 기준으로 배열화)
        const snippetBody = selectedText.split(/\r?\n/);

        try {
            // 2. VS Code의 사용자 스니펫 디렉토리 경로 지정
            // OS별로 설정 경로가 조금씩 달라서 처리해줘야 해.
            let appDataPath = '';
            if (process.platform === 'win32') {
                appDataPath = process.env.APPDATA || '';
            } else if (process.platform === 'darwin') {
                appDataPath = path.join(os.homedir(), 'Library', 'Application Support');
            } else {
                appDataPath = path.join(os.homedir(), '.config');
            }
            const snippetsDir = path.join(appDataPath, 'Code', 'User', 'snippets');

            // 디렉토리가 없으면 생성
            if (!fs.existsSync(snippetsDir)) {
                fs.mkdirSync(snippetsDir, { recursive: true });
            }

            // 3. 기존 snippet 파일 목록 긁어오기
            const files = fs.readdirSync(snippetsDir).filter(file => file.endsWith('.json') || file.endsWith('.code-snippets'));
            
            // 만약 기존 파일이 없다면 새로 만들 수 있도록 옵션 제공
            const createNewOption = '+ 새 스니펫 파일 생성...';
            const pickOptions = [createNewOption, ...files];

            // 4. 스니펫 파일 선택창 (QuickPick)
            let selectedFile = await vscode.window.showQuickPick(pickOptions, {
                placeHolder: '스니펫을 추가할 파일을 선택하세요.'
            });

            if (!selectedFile) return;

            let targetFilePath = '';
            if (selectedFile === createNewOption) {
                // 새 파일명 입력받기
                const newFileName = await vscode.window.showInputBox({
                    placeHolder: '예: my-global-snippets',
                    prompt: '생성할 스니펫 파일 이름을 입력하세요 (.code-snippets 확장자가 자동으로 붙습니다)'
                });
                if (!newFileName) return;
                targetFilePath = path.join(snippetsDir, `${newFileName}.code-snippets`);
                // 빈 json 파일 생성
                if (!fs.existsSync(targetFilePath)) {
                    fs.writeFileSync(targetFilePath, '{}', 'utf8');
                }
            } else {
                targetFilePath = path.join(snippetsDir, selectedFile);
            }

            // 5. 메타데이터 입력 받기 (Name, Prefix, Scope, Description)
            const snippetName = await vscode.window.showInputBox({
                placeHolder: '스니펫 이름 (ID로 사용됨)',
                prompt: '스니펫의 고유 이름을 입력하세요.'
            });
            if (!snippetName) return;

            const snippetPrefix = await vscode.window.showInputBox({
                placeHolder: '호출 prefix (예: fc, myfunc)',
                prompt: '에디터에서 입력할 단축어(prefix)를 입력하세요.'
            });
            if (!snippetPrefix) return;

            const snippetScope = await vscode.window.showInputBox({
                placeHolder: 'scope (예: javascript,typescript) - 공백 시 전역',
                prompt: '스니펫이 적용될 언어를 쉼표로 구분해 입력하세요 (글로벌 스니펫 파일인 경우에만 유효).'
            });

            const snippetDescription = await vscode.window.showInputBox({
                placeHolder: '스니펫 설명',
                prompt: '이 스니펫이 무엇을 하는지 설명을 적어주세요.'
            });



            
            // 6. 파일 읽어서 원래 문자열 그대로 유지한 채 편집하기
            const fileContent = fs.readFileSync(targetFilePath, 'utf8') || '{}';
            
            // 삽입할 스니펫 데이터 객체 준비
            const newSnippetData = {
                prefix: snippetPrefix,
                body: snippetBody,
                description: snippetDescription || ''
            };

            // scope가 있으면 추가
            if (snippetScope && snippetScope.trim() !== '') {
                Object.assign(newSnippetData, { scope: snippetScope });
            }

            // jsonc.modify가 마법을 부리는 핵심 함수야!
            // 기존 텍스트(fileContent)에서 [snippetName] 경로를 찾아 newSnippetData를 집어넣는 '변경 내역(Edits)'을 계산해줘.
            const edits = jsonc.modify(fileContent, [snippetName], newSnippetData, {
                formattingOptions: {
                    insertSpaces: true,
                    tabSize: 4,
                    eol: '\n'
                }
            });

            // 계산된 변경 내역(Edits)을 원래 소스코드에 적용해서 최종 문자열을 완성해 (주석 유지됨!)
            const updatedContent = jsonc.applyEdits(fileContent, edits);

            // 파일에 그대로 덮어쓰기
            fs.writeFileSync(targetFilePath, updatedContent, 'utf8');
            vscode.window.showInformationMessage(`'${snippetName}' 스니펫이 주석을 유지하며 성공적으로 등록되었습니다!`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`스니펫 등록 중 오류 발생: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}