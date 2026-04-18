"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";

// tiptap-markdown registers a `markdown` storage key at runtime but does not
// augment @tiptap/core's Storage interface — declare it here so TS knows about
// `editor.storage.markdown.getMarkdown()`.
declare module "@tiptap/core" {
  interface Storage {
    markdown: { getMarkdown: () => string };
  }
}

export interface DeliverableEditorHandle {
  undo: () => void;
  redo: () => void;
  getMarkdown: () => string;
  setMarkdown: (md: string) => void;
  focus: () => void;
  editor: Editor | null;
}

export interface DeliverableEditorStateChange {
  canUndo: boolean;
  canRedo: boolean;
}

interface DeliverableEditorProps {
  initialMarkdown: string;
  editable?: boolean;
  onChange?: (markdown: string) => void;
  onStateChange?: (state: DeliverableEditorStateChange) => void;
}

export const DeliverableEditor = forwardRef<DeliverableEditorHandle, DeliverableEditorProps>(
  function DeliverableEditor(
    { initialMarkdown, editable = true, onChange, onStateChange },
    ref,
  ) {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Link.configure({ openOnClick: false, autolink: true }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        Markdown.configure({
          html: false,
          tightLists: true,
          linkify: true,
          breaks: false,
          transformPastedText: true,
        }),
      ],
      content: initialMarkdown,
      editable,
      immediatelyRender: false,
      onUpdate: ({ editor }) => {
        const md = editor.storage.markdown.getMarkdown();
        onChangeRef.current?.(md);
        onStateChangeRef.current?.({
          canUndo: editor.can().undo(),
          canRedo: editor.can().redo(),
        });
      },
      onTransaction: ({ editor }) => {
        onStateChangeRef.current?.({
          canUndo: editor.can().undo(),
          canRedo: editor.can().redo(),
        });
      },
    });

    useEffect(() => {
      if (editor) editor.setEditable(editable);
    }, [editor, editable]);

    useImperativeHandle(
      ref,
      () => ({
        undo: () => {
          editor?.chain().focus().undo().run();
        },
        redo: () => {
          editor?.chain().focus().redo().run();
        },
        getMarkdown: () => editor?.storage.markdown.getMarkdown() ?? "",
        setMarkdown: (md: string) => {
          editor?.commands.setContent(md, { emitUpdate: false });
        },
        focus: () => {
          editor?.chain().focus().run();
        },
        editor: editor ?? null,
      }),
      [editor],
    );

    return (
      <>
        <style>{EDITOR_STYLES}</style>
        <EditorContent editor={editor} className="deliverable-editor" />
      </>
    );
  },
);

const EDITOR_STYLES = `
  .deliverable-editor .ProseMirror {
    outline: none;
    font-size: 14px;
    line-height: 1.7;
    color: var(--foreground);
    min-height: 120px;
  }
  .deliverable-editor .ProseMirror:focus { outline: none; }
  .deliverable-editor .ProseMirror > * + * { margin-top: 0; }
  .deliverable-editor .ProseMirror p { margin: 0 0 12px 0; color: var(--foreground); }
  .deliverable-editor .ProseMirror h1 {
    font-size: 20px; font-weight: 600; margin: 24px 0 12px; color: var(--foreground);
  }
  .deliverable-editor .ProseMirror h1:first-child { margin-top: 0; }
  .deliverable-editor .ProseMirror h2 {
    font-size: 16px; font-weight: 600; margin: 20px 0 10px; color: var(--foreground);
  }
  .deliverable-editor .ProseMirror h2:first-child { margin-top: 0; }
  .deliverable-editor .ProseMirror h3 {
    font-size: 14px; font-weight: 600; margin: 16px 0 8px; color: var(--foreground);
  }
  .deliverable-editor .ProseMirror ul,
  .deliverable-editor .ProseMirror ol { padding-left: 20px; margin: 0 0 12px 0; }
  .deliverable-editor .ProseMirror li { margin-bottom: 4px; color: var(--fg2); }
  .deliverable-editor .ProseMirror li > p { margin: 0; color: var(--fg2); }
  .deliverable-editor .ProseMirror strong { font-weight: 600; color: var(--foreground); }
  .deliverable-editor .ProseMirror em { color: var(--fg2); }
  .deliverable-editor .ProseMirror hr {
    border: none; border-top: 1px solid var(--border); margin: 16px 0;
  }
  .deliverable-editor .ProseMirror code {
    padding: 2px 5px; border-radius: 3px;
    background: rgba(255,255,255,0.06);
    font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .deliverable-editor .ProseMirror pre {
    padding: 10px 12px; border-radius: 4px;
    background: rgba(255,255,255,0.04);
    font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow-x: auto; margin: 0 0 12px 0;
  }
  .deliverable-editor .ProseMirror pre code { padding: 0; background: transparent; }
  .deliverable-editor .ProseMirror blockquote {
    border-left: 2px solid var(--border); padding-left: 12px;
    color: var(--fg3); font-style: italic; margin: 12px 0;
  }
  .deliverable-editor .ProseMirror a {
    color: var(--link, var(--accent)); text-decoration: underline;
  }
  .deliverable-editor .ProseMirror table {
    border-collapse: collapse; width: 100%;
    margin: 12px 0; font-size: 13px; table-layout: fixed;
  }
  .deliverable-editor .ProseMirror th,
  .deliverable-editor .ProseMirror td {
    border: 1px solid var(--border); padding: 6px 10px; text-align: left;
    vertical-align: top; position: relative;
  }
  .deliverable-editor .ProseMirror th {
    background: rgba(255,255,255,0.03); font-weight: 600; color: var(--foreground);
  }
  .deliverable-editor .ProseMirror td { color: var(--fg2); }
  .deliverable-editor .ProseMirror .selectedCell::after {
    content: ""; position: absolute; inset: 0;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    pointer-events: none;
  }
  .deliverable-editor .ProseMirror-focused { outline: none; }
`;
