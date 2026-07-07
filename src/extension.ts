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

            // 6. 파일 읽어서 데이터 추가 후 저장
            const fileContent = fs.readFileSync(targetFilePath, 'utf8') || '{}';
            let snippetsJson: any = {};
            
            try {
                snippetsJson = jsonc.parse(fileContent);

                // 만약 파일이 완전히 비어있거나 올바른 객체가 아니면 빈 객체로 방어 처리
                if (!snippetsJson || typeof snippetsJson !== 'object') {
                    snippetsJson = {};
                }
            } catch (e) {
                snippetsJson = {}; // 파싱 실패 시 초기화
            }

            // 새로운 스니펫 객체 생성
            snippetsJson[snippetName] = {
                prefix: snippetPrefix,
                body: snippetBody,
                description: snippetDescription || ''
            };

            // scope가 입력되었을 때만 추가
            if (snippetScope && snippetScope.trim() !== '') {
                snippetsJson[snippetName].scope = snippetScope;
            }

            // 파일에 예쁘게 포맷팅해서 저장
            fs.writeFileSync(targetFilePath, JSON.stringify(snippetsJson, null, 4), 'utf8');
            vscode.window.showInformationMessage(`'${snippetName}' 스니펫이 성공적으로 등록되었습니다!`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`스니펫 등록 중 오류 발생: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}