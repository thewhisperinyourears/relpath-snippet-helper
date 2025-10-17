import * as vscode from 'vscode';

export function activate(ctx: vscode.ExtensionContext) {
  // Insert relative path at cursor
  const insertAtCursor = vscode.commands.registerCommand('relpath.insertAtCursor', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = getRelPathOrAbs(editor.document);
    editor.edit(eb => {
      for (const sel of editor.selections) {
        eb.insert(sel.active, text);
      }
    });
  });

  // Insert/update header comment with relative path
  const insertHeader = vscode.commands.registerCommand('relpath.insertHeader', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    await ensureHeader(editor.document);
  });

  // Copy relative path
  const copyRelativePath = vscode.commands.registerCommand('relpath.copyRelativePath', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const text = getRelPathOrAbs(editor.document);
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage(`RelPath copied: ${text}`, 2000);
  });

  ctx.subscriptions.push(insertAtCursor, insertHeader, copyRelativePath);

  // Auto insert/update header if enabled
  const cfg = vscode.workspace.getConfiguration();
  if (cfg.get<boolean>('relpath.autoInsertOnOpen', false)) {
    ctx.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(ed => { if (ed) ensureHeader(ed.document); }),
      vscode.workspace.onDidSaveTextDocument(doc => { void ensureHeader(doc); })
    );
  }

  // Status bar item
  if (cfg.get<boolean>('relpath.statusBar.enabled', true)) {
    const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    sb.command = 'relpath.insertAtCursor';
    ctx.subscriptions.push(sb);

    const updateSb = () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed) { sb.hide(); return; }
      const rel = vscode.workspace.asRelativePath(ed.document.uri, false);
      sb.text = `$(file-code) ${rel}`;
      sb.tooltip = 'RelPath: Click to insert at cursor';
      sb.show();
    };

    ctx.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => updateSb()),
      vscode.workspace.onDidOpenTextDocument(() => updateSb()),
      vscode.workspace.onDidSaveTextDocument(() => updateSb()),
      vscode.workspace.onDidCloseTextDocument(() => updateSb())
    );
    updateSb();
  }
}

export function deactivate() {}

/* ----------------------------- helpers ----------------------------- */

function getRelPathOrAbs(doc: vscode.TextDocument): string {
  const ws = vscode.workspace.getWorkspaceFolder(doc.uri);
  const rel = vscode.workspace.asRelativePath(doc.uri, false);
  if (!ws) return doc.fileName;

  const cfg = vscode.workspace.getConfiguration();
  const includeWsName = cfg.get<boolean>('relpath.includeWorkspaceFolder', true);
  return includeWsName ? `${ws.name}/${rel}` : rel;
}


type CommentTokens =
  | { kind: 'line'; start: string }
  | { kind: 'block'; start: string; end: string };

function getCommentTokens(languageId: string): CommentTokens {
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
    twig: { start: '{# ', end: ' #}' }
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

/** Correct escape for building regex from literal strings. */
function reEscape(lit: string): string {
  // Escapes: - / \ ^ $ * + ? . ( ) | [ ] { }
  return lit.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function headerRegex(tokens: CommentTokens, label: string): RegExp {
  const start = tokens.kind === 'line' ? tokens.start : tokens.start;
  const end = tokens.kind === 'line' ? '' : tokens.end;
  const pattern =
    '^\\s*' + reEscape(start) + reEscape(label) + ':\\s*(.+)' + (end ? reEscape(end) : '') + '\\r?\\n?';
  return new RegExp(pattern);
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
  const rel = getRelPathOrAbs(doc);
  const txt = headerText(tokens, label, rel, doc.eol);
  const re = headerRegex(tokens, label);

  const toLine = Math.min(10, doc.lineCount);
  const firstChunk = doc.getText(new vscode.Range(0, 0, toLine, 0));
  const match = re.exec(firstChunk);

  await editor.edit(eb => {
    if (match) {
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
