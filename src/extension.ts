import * as vscode from 'vscode';

export function activate(ctx: vscode.ExtensionContext) {
  // 1) Return workspace-relative path (for snippets): ${command:relpath.insert}
  const returnRel = vscode.commands.registerCommand('relpath.insert', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return '';
    const doc = editor.document;
    const rel = vscode.workspace.asRelativePath(doc.uri, false);
    const ws = vscode.workspace.getWorkspaceFolder(doc.uri);
    return ws ? rel : doc.fileName; // fallback absolute when no workspace
  });

  // 2) Insert/update a header comment with the relative path
  const insertHeader = vscode.commands.registerCommand('relpath.insertHeader', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    await ensureHeader(editor.document);
  });

  // Optional: auto insert/update when switching files
  const cfg = vscode.workspace.getConfiguration();
  if (cfg.get<boolean>('relpath.autoInsertOnOpen', false)) {
    ctx.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(ed => ed && ensureHeader(ed.document)),
      vscode.workspace.onDidSaveTextDocument(doc => ensureHeader(doc))
    );
  }

  ctx.subscriptions.push(returnRel, insertHeader);
}

export function deactivate() {}

/* ----------------------------- helpers ----------------------------- */

type CommentTokens =
  | { kind: 'line'; start: string }
  | { kind: 'block'; start: string; end: string };

function getCommentTokens(languageId: string): CommentTokens {
  // Prefer single-line comments when known; else fallback to a sensible block or //.
  const lineMap: Record<string, string> = {
    // C-like / web
    javascript: '// ', javascriptreact: '// ',
    typescript: '// ', typescriptreact: '// ',
    jsonc: '// ', java: '// ', c: '// ', cpp: '// ', csharp: '// ',
    go: '// ', kotlin: '// ', swift: '// ', rust: '// ', dart: '// ',
    php: '// ', scala: '// ', fsharp: '// ', zig: '// ', verilog: '// ', systemverilog: '// ',

    // shells / scripting
    python: '# ', ruby: '# ', perl: '# ', powershell: '# ', shellscript: '# ',
    tcl: '# ', makefile: '# ', r: '# ', julia: '# ', nim: '# ', crystal: '# ',

    // data / config
    yaml: '# ', toml: '# ', dotenv: '# ', dockerfile: '# ', properties: '# ', ini: '; ',

    // others
    haskell: '-- ', sql: '-- ', vhdl: '-- ', lua: '-- ',
    clojure: '; ', clojurescript: '; ', lisp: '; ', scheme: '; ',
    erlang: '% ', prolog: '% ', matlab: '% ', latex: '% ', bibtex: '% ',
  };

  const blockMap: Record<string, { start: string; end: string }> = {
    html: { start: '<!-- ', end: ' -->' },
    xml: { start: '<!-- ', end: ' -->' },
    svg: { start: '<!-- ', end: ' -->' },
    css: { start: '/* ', end: ' */' },
    markdown: { start: '<!-- ', end: ' -->' },
    vue: { start: '<!-- ', end: ' -->' },
    svelte: { start: '<!-- ', end: ' -->' },
    ocaml: { start: '(* ', end: ' *)' },
    pascal: { start: '{ ', end: ' }' },
    handlebars: { start: '{{!-- ', end: ' --}}' },
    twig: { start: '{# ', end: ' #}' },
  };

  const line = lineMap[languageId];
  if (line) return { kind: 'line', start: line };
  const block = blockMap[languageId];
  if (block) return { kind: 'block', ...block };
  return { kind: 'line', start: '// ' }; // safe default
}

function headerText(tokens: CommentTokens, label: string, rel: string, eol: vscode.EndOfLine): string {
  const nl = eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
  const txt = `${label}: ${rel}`;
  return tokens.kind === 'line'
    ? `${tokens.start}${txt}${nl}`
    : `${tokens.start}${txt}${tokens.end}${nl}`;
}

function headerRegex(tokens: CommentTokens, label: string): RegExp {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (tokens.kind === 'line') {
    return new RegExp(`^\\s*${esc(tokens.start)}${esc(label)}:\\s*(.+)\\r?\\n?`);
  }
  return new RegExp(`^\\s*${esc(tokens.start)}${esc(label)}:\\s*(.+)${esc(tokens.end)}\\r?\\n?`);
}

function insertionPosition(doc: vscode.TextDocument): vscode.Position {
  // Place after shebang and leading empty lines
  let line = 0;
  if (doc.lineCount > 0 && doc.lineAt(0).text.startsWith('#!')) line = 1;
  while (line < doc.lineCount && doc.lineAt(line).text.trim() === '') line++;
  return new vscode.Position(line, 0);
}

async function ensureHeader(doc: vscode.TextDocument) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document !== doc) return;

  const label = (vscode.workspace.getConfiguration().get<string>('relpath.label') || 'Path').trim() || 'Path';
  const tokens = getCommentTokens(doc.languageId);
  const rel = vscode.workspace.asRelativePath(doc.uri, false);
  const txt = headerText(tokens, label, rel, doc.eol);
  const re = headerRegex(tokens, label);

  // Only scan the first few lines for an existing header
  const toLine = Math.min(10, doc.lineCount);
  const firstChunk = doc.getText(new vscode.Range(0, 0, toLine, 0));
  const match = re.exec(firstChunk);

  await editor.edit(eb => {
    if (match) {
      // Replace existing header if the path changed
      const start = new vscode.Position(0, 0);
      const end = doc.positionAt(match[0].length);
      const current = (match[1] || '').trim();
      if (current !== rel) {
        eb.replace(new vscode.Range(start, end), txt);
      }
    } else {
      eb.insert(insertionPosition(doc), txt);
    }
  });
}
