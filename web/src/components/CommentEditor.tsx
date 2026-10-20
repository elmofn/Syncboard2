import { useRef, useState } from 'react';

interface Props {
  onSubmit: (html: string) => Promise<void> | void;
}

// Editor simples baseado em contentEditable. A seleção de menção (@) virá
// num próximo passo; por ora o texto com "@" é aceito como texto comum.
export function CommentEditor({ onSubmit }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const exec = (cmd: string) => {
    ref.current?.focus();
    document.execCommand(cmd);
  };

  const send = async () => {
    const html = ref.current?.innerHTML.trim();
    const text = ref.current?.textContent?.trim();
    if (!html || !text) return;
    setBusy(true);
    try {
      await onSubmit(html);
      if (ref.current) ref.current.innerHTML = '';
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
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
        <button type="button" onClick={() => exec('insertUnorderedList')} aria-label="Lista">☰</button>
      </div>
      <div
        ref={ref}
        className="editor__area"
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder="Escreva um comentário (use @ para mencionar)…"
        onKeyDown={onKeyDown}
        suppressContentEditableWarning
      />
      <button type="button" className="editor__send sb-button" onClick={send} disabled={busy} aria-label="Enviar">
        ➤
      </button>
    </div>
  );
}
