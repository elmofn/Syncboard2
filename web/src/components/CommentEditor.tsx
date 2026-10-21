import { useRef, useState } from 'react';
import { File, ListBullets, PaperPlaneRight, Paperclip, X } from '@phosphor-icons/react';
import type { Attachment, User } from '../types/api';
import { api } from '../lib/api';

interface Props {
  users: User[];
  onSubmit: (html: string, attachments: Attachment[]) => Promise<void> | void;
  notify?: (msg: string) => void;
}

export function CommentEditor({ users, onSubmit, notify }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef('');
  const [menu, setMenu] = useState<string | null>(null); // query atual do @ ou null
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);

  const matches = (menu !== null
    ? users.filter((u) => u.email && `${u.displayName || u.name} ${u.email}`.toLowerCase().includes(menu.toLowerCase()))
    : []
  ).slice(0, 6);

  const exec = (cmd: string) => {
    ref.current?.focus();
    document.execCommand(cmd);
  };

  const detectMention = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !ref.current) return setMenu(null);
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return setMenu(null);
    const before = (node.textContent ?? '').slice(0, range.startOffset);
    const m = /(?:^|\s)@([\p{L}\p{N}._-]*)$/u.exec(before);
    if (!m) return setMenu(null);
    queryRef.current = m[1];
    setMenu(m[1]);
  };

  const pickMention = (user: User) => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      const back = queryRef.current.length + 1; // '@' + query
      if (node.nodeType === Node.TEXT_NODE && range.startOffset >= back) {
        range.setStart(node, range.startOffset - back);
        range.deleteContents();
        const span = document.createElement('span');
        span.className = 'mention-tag';
        span.setAttribute('data-email', user.email);
        span.setAttribute('contenteditable', 'false');
        span.textContent = `@${user.displayName || user.name}`;
        range.insertNode(span);
        const space = document.createTextNode(' ');
        span.after(space);
        const r2 = document.createRange();
        r2.setStartAfter(space);
        r2.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r2);
      }
    }
    setMenu(null);
    ref.current?.focus();
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const att = await api.uploadAttachment(file);
        setAttachments((prev) => [...prev, att]);
      } catch {
        notify?.(`Falha ao anexar ${file.name}.`);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const send = async () => {
    const html = ref.current?.innerHTML.trim() ?? '';
    const text = ref.current?.textContent?.trim() ?? '';
    if (!text && attachments.length === 0) return;
    setBusy(true);
    try {
      await onSubmit(html, attachments);
      if (ref.current) ref.current.innerHTML = '';
      setAttachments([]);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (menu !== null && e.key === 'Enter') {
      e.preventDefault();
      if (matches[0]) pickMention(matches[0]);
      return;
    }
    if (e.key === 'Escape') {
      if (menu !== null) {
        e.stopPropagation();
        setMenu(null);
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="editor">
      <div className="editor__toolbar" role="toolbar" aria-label="Formatação">
        <button type="button" onClick={() => exec('bold')} aria-label="Negrito"><b>B</b></button>
        <button type="button" onClick={() => exec('italic')} aria-label="Itálico"><i>I</i></button>
        <button type="button" onClick={() => exec('underline')} aria-label="Sublinhado"><u>U</u></button>
        <button type="button" onClick={() => exec('insertUnorderedList')} aria-label="Lista"><ListBullets /></button>
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Anexar"><Paperclip /></button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
      </div>

      <div
        ref={ref}
        className="editor__area"
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder="Escreva um comentário (use @ para mencionar)…"
        onInput={detectMention}
        onKeyUp={detectMention}
        onKeyDown={onKeyDown}
        suppressContentEditableWarning
      />

      {menu !== null && matches.length > 0 && (
        <div className="mention-menu" role="listbox">
          {matches.map((u) => (
            <button key={u.email} type="button" role="option" onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}>
              <strong>{u.displayName || u.name}</strong>
              <small className="sb-meta">{u.email}</small>
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="editor__attachments">
          {attachments.map((a, i) => (
            <span key={i} className="editor__attach-chip">
              <File /> {a.name}
              <button type="button" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} aria-label="Remover"><X /></button>
            </span>
          ))}
        </div>
      )}

      <button type="button" className="editor__send sb-button" onClick={send} disabled={busy} aria-label="Enviar">
        <PaperPlaneRight weight="fill" />
      </button>
    </div>
  );
}
