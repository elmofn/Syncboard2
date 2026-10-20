// Comments already contain the rich HTML rendered in the task feed. Keep that
// representation while editing, including line breaks, mentions and images.
export function openCommentEditor(originalText, onSave, onSaved = () => {}, restoreFocus) {
    const existing = document.getElementById('comment-edit-dialog');
    if (existing) { existing.querySelector('[contenteditable]')?.focus(); return true; }
    const dialog = document.createElement('dialog');
    if (typeof dialog.showModal !== 'function') return false;
    const previousFocus = document.activeElement;
    dialog.id = 'comment-edit-dialog';
    dialog.className = 'sb-comment-edit';
    dialog.setAttribute('aria-labelledby', 'comment-edit-title');
    dialog.innerHTML = `<form>
        <h2 id="comment-edit-title">Editar comentário</h2>
        <p id="comment-edit-help">Enter cria uma linha. Use Salvar alterações para confirmar.</p>
        <div id="comment-edit-content" class="sb-comment-edit-content" role="textbox" aria-label="Comentário" aria-multiline="true" aria-describedby="comment-edit-help comment-edit-feedback" contenteditable="true"></div>
        <p id="comment-edit-feedback" role="status" aria-live="polite"></p>
        <div class="sb-comment-edit-actions"><button type="button">Cancelar</button><button type="submit">Salvar alterações</button></div>
    </form>`;
    const editor = dialog.querySelector('[contenteditable]');
    const form = dialog.querySelector('form');
    const feedback = dialog.querySelector('[role="status"]');
    const [cancel, save] = dialog.querySelectorAll('button');
    editor.innerHTML = originalText;
    // Browser HTML serialization can normalize quotes/entities without an edit.
    const initialHTML = editor.innerHTML;
    let busy = false;
    cancel.addEventListener('click', () => { if (!busy) dialog.close(); });
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => {
        dialog.remove();
        if (restoreFocus) restoreFocus();
        else if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }, { once: true });
    // A plain Enter belongs to the editor, never to the form submission path.
    editor.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
            event.preventDefault();
            form.requestSubmit();
        }
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const nextText = editor.innerHTML;
        if (nextText === initialHTML) { dialog.close(); return; }
        if (!editor.innerText.trim() && !editor.querySelector('img')) {
            feedback.textContent = 'Comentário não pode ficar vazio.';
            editor.focus();
            return;
        }
        busy = true;
        editor.contentEditable = 'false';
        editor.setAttribute('aria-busy', 'true');
        cancel.disabled = save.disabled = true;
        feedback.textContent = 'Salvando…';
        try {
            await onSave(nextText);
        } catch (error) {
            feedback.textContent = error?.code === 'COMMENT_CHANGED'
                ? 'O comentário mudou durante a edição. Copie seu rascunho e reabra o comentário atualizado antes de salvar.'
                : error?.code === 'COMMENT_IDENTITY' || error?.status === 401
                ? 'Sua sessão não está disponível. Copie seu rascunho e entre novamente antes de salvar.'
                : error?.status === 403
                ? 'A sessão atual não tem permissão para editar este comentário. Seu rascunho foi mantido.'
                : error?.status === 404
                ? 'O comentário ou a tarefa não está mais disponível. Seu rascunho foi mantido.'
                : error?.status === 409
                ? 'A tarefa mudou durante a gravação. Copie seu rascunho e reabra o comentário atualizado antes de salvar.'
                : 'Não foi possível salvar. Seu texto foi mantido. Tente novamente.';
            return;
        } finally {
            busy = false;
            editor.contentEditable = 'true';
            editor.removeAttribute('aria-busy');
            cancel.disabled = save.disabled = false;
        }
        dialog.close();
        // A rendering failure must not present a persisted edit as a failed save.
        onSaved();
    });
    document.body.appendChild(dialog);
    try { dialog.showModal(); editor.focus(); }
    catch { dialog.remove(); return false; }
    return true;
}
