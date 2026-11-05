import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import { useEffect, useRef } from "react";
import type { CodeEditorProps } from "./CodeEditor";
import { jsonErrorPosition } from "../lib/template";

// Bundle Monaco locally (no CDN) — MockDock must work fully offline.
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    return label === "json" ? new JsonWorker() : new EditorWorker();
  },
};
loader.config({ monaco });

const THEME = "mockdock-dark";
let themeDefined = false;

function defineTheme(m: typeof monaco) {
  if (themeDefined) return;
  themeDefined = true;
  m.editor.defineTheme(THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "string.key.json", foreground: "8FB8FF" },
      { token: "string.value.json", foreground: "7AF0DC" },
      { token: "string", foreground: "7AF0DC" },
      { token: "number", foreground: "FBBF77" },
      { token: "number.json", foreground: "FBBF77" },
      { token: "keyword", foreground: "D19CFF" },
      { token: "keyword.json", foreground: "D19CFF" },
      { token: "delimiter", foreground: "6C7486" },
      { token: "delimiter.bracket.json", foreground: "A2A9B8" },
      { token: "comment", foreground: "4A5161", fontStyle: "italic" },
    ],
    colors: {
      "editor.background": "#0A0C10",
      "editor.foreground": "#E8EAEF",
      "editorLineNumber.foreground": "#343B48",
      "editorLineNumber.activeForeground": "#7A8396",
      "editor.lineHighlightBackground": "#12161C",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#2DD4BF33",
      "editor.inactiveSelectionBackground": "#2DD4BF1A",
      "editorCursor.foreground": "#2DD4BF",
      "editorIndentGuide.background1": "#1D222B",
      "editorIndentGuide.activeBackground1": "#343B48",
      "editorBracketMatch.background": "#2DD4BF22",
      "editorBracketMatch.border": "#2DD4BF55",
      "editorGutter.background": "#0A0C10",
      "editorWidget.background": "#12161C",
      "editorWidget.border": "#262C37",
      "editorSuggestWidget.background": "#12161C",
      "editorSuggestWidget.border": "#262C37",
      "editorSuggestWidget.selectedBackground": "#1D222B",
      "editorHoverWidget.background": "#12161C",
      "editorHoverWidget.border": "#262C37",
      "scrollbarSlider.background": "#262C3799",
      "scrollbarSlider.hoverBackground": "#343B48",
      "editorError.foreground": "#FB7185",
      "editorWarning.foreground": "#FBBF24",
      "focusBorder": "#00000000",
      "editorOverviewRuler.border": "#00000000",
    },
  });
  // Monaco's own JSON validator would flag MockDock's bare {{placeholders}}, so
  // we turn it off and publish markers from our template-aware validator instead.
  m.json.jsonDefaults.setDiagnosticsOptions({ validate: false });
}

const TEMPLATE_RE = /\{\{\s*[A-Za-z_][\w.\-]*\s*\}\}/g;

export default function MonacoEditor({
  value,
  onChange,
  language = "json",
  readOnly = false,
  height = 280,
  onSave,
  onSubmit,
  highlightTemplates = false,
  ariaLabel,
  lineNumbers = true,
}: CodeEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorations = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const saveRef = useRef(onSave);
  const submitRef = useRef(onSubmit);
  saveRef.current = onSave;
  submitRef.current = onSubmit;

  const refreshDecorations = () => {
    const ed = editorRef.current;
    const model = ed?.getModel();
    if (!ed || !model || !highlightTemplates) return;
    const text = model.getValue();
    const ranges: monaco.editor.IModelDeltaDecoration[] = [];
    for (const m of text.matchAll(TEMPLATE_RE)) {
      const start = model.getPositionAt(m.index ?? 0);
      const end = model.getPositionAt((m.index ?? 0) + m[0].length);
      ranges.push({
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        options: { inlineClassName: "md-template-token", hoverMessage: { value: "MockDock template variable" } },
      });
    }
    decorations.current?.set(ranges);
  };

  const onMount: OnMount = (ed, m) => {
    editorRef.current = ed;
    decorations.current = ed.createDecorationsCollection();
    ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, () => saveRef.current?.());
    ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => submitRef.current?.());
    refreshDecorations();
  };

  useEffect(refreshDecorations, [value, highlightTemplates]);

  // Error squiggle at the first JSON syntax error (template-aware).
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    const err = language === "json" && !readOnly ? jsonErrorPosition(value) : null;
    if (!err) {
      monaco.editor.setModelMarkers(model, "mockdock", []);
      return;
    }
    const pos = model.getPositionAt(Math.min(err.offset, value.length));
    monaco.editor.setModelMarkers(model, "mockdock", [
      {
        severity: monaco.MarkerSeverity.Error,
        message: err.message,
        startLineNumber: pos.lineNumber,
        startColumn: Math.max(1, pos.column - 1),
        endLineNumber: pos.lineNumber,
        endColumn: pos.column + 1,
      },
    ]);
  }, [value, language, readOnly]);

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      theme={THEME}
      beforeMount={defineTheme}
      onMount={onMount}
      onChange={(v) => onChange?.(v ?? "")}
      loading={<div className="skeleton h-full w-full rounded-none opacity-60" />}
      options={{
        readOnly,
        ariaLabel,
        minimap: { enabled: false },
        fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
        fontSize: 12.5,
        lineHeight: 20,
        fontLigatures: false,
        tabSize: 2,
        lineNumbers: lineNumbers ? "on" : "off",
        lineNumbersMinChars: 3,
        glyphMargin: false,
        folding: true,
        renderLineHighlight: readOnly ? "none" : "line",
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        padding: { top: 12, bottom: 12 },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
        wordWrap: language === "json" ? "off" : "on",
        automaticLayout: true,
        bracketPairColorization: { enabled: false },
        guides: { indentation: true },
        stickyScroll: { enabled: false },
        domReadOnly: readOnly,
        contextmenu: !readOnly,
        fixedOverflowWidgets: true,
      }}
    />
  );
}
