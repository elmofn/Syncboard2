// TC501: transient composer state only. Persisted attachments use the upload descriptor.
let activeComposer = null;

export function commentAttachments(value) {
    if (!Array.isArray(value)) return [];
    return value.flatMap(file => {
        if (!file || typeof file !== 'object' || Array.isArray(file) || typeof file.name !== 'string' || !file.name.trim() ||
            typeof file.url !== 'string' || typeof file.contentType !== 'string' || !file.contentType.trim()) return [];
        if (!/^https:\/\/[^/?#]/i.test(file.url) || /[\u0000-\u0020\u007f\\]/.test(file.url) || /^https:\/\/[^/?#]*@/i.test(file.url)) return [];
        try {
            const url = new URL(file.url);
            if (url.protocol !== 'https:' || url.username || url.password) return [];
            return [{name: file.name, url: url.href, contentType: file.contentType}];
        } catch { return []; }
    });
}

export function captureCommentComposer(taskId) {
    if (!activeComposer) return;
    if (activeComposer.taskId !== taskId) { closeCommentComposer(activeComposer.taskId); return; }
    if (!activeComposer.busy && activeComposer.view) activeComposer.text = activeComposer.view.editor.innerHTML;
}

export function closeCommentComposer(taskId) {
    if (activeComposer?.taskId !== taskId) return;
    activeComposer.active = false;
    activeComposer.view = null;
    activeComposer = null;
}

export function mountCommentComposer(taskId, view, actions) {
    if (activeComposer && activeComposer.taskId !== taskId) closeCommentComposer(activeComposer.taskId);
    const session = activeComposer || {taskId, text: '', files: [], busy: false, uncertain: false, feedback: '', active: true};
    activeComposer = session;
    session.view = view;
    session.actions = actions;
    const live = () => activeComposer === session && session.active && session.actions.isCurrent();
    view.editor.innerHTML = session.text;

    function paint() {
        if (!live() || !session.view) return;
        const current = session.view;
        current.send.disabled = session.busy || session.uncertain;
        current.input.disabled = session.busy || session.uncertain;
        current.editor.contentEditable = session.busy ? 'false' : 'true';
        current.editor.setAttribute('aria-busy', String(session.busy));
        for (const button of current.toolbar || []) button.disabled = session.busy;
        current.feedback.textContent = session.feedback;
        session.actions.renderFiles(session.files.map(entry => entry.uploaded || entry.file));
        for (const button of current.list.querySelectorAll('.remove-attachment-btn')) button.disabled = session.busy || session.uncertain;
    }

    view.editor.addEventListener('input', () => {
        if (live() && !session.busy && session.view === view) session.text = view.editor.innerHTML;
    });
    view.input.addEventListener('change', event => {
        if (!live() || session.busy || session.uncertain || session.view !== view) return;
        for (const file of event.target.files || []) session.files.push({file, uploaded: null});
        view.input.value = '';
        paint();
    });
    view.list.addEventListener('click', event => {
        const button = event.target.closest('.remove-attachment-btn');
        if (!button || !live() || session.busy || session.uncertain || session.view !== view) return;
        const index = Number(button.dataset.index);
        if (!Number.isInteger(index) || index < 0 || index >= session.files.length) return;
        session.files.splice(index, 1);
        paint(); // Removing a reference never deletes a possibly shared blob.
    });

    view.send.onclick = async () => {
        if (!live() || session.busy || session.uncertain || session.view !== view) return;
        session.text = view.editor.innerHTML.trim();
        // Preserve the existing text/inline-image requirement; files alone do not send.
        if (!view.editor.innerText.trim() && !session.text.includes('<img')) {
            session.feedback = session.files.length ? 'Escreva um comentário para enviar os anexos.' : '';
            paint();
            return;
        }
        session.busy = true;
        session.feedback = session.files.length ? 'Enviando anexos…' : 'Enviando comentário…';
        paint();
        let savingComment = false;
        try {
            const api = await session.actions.loadApi();
            if (!live()) return;
            for (const entry of session.files) {
                if (!live()) return;
                if (!entry.uploaded) {
                    const uploaded = await api.uploadAttachment(entry.file);
                    const valid = commentAttachments([uploaded]);
                    if (valid.length !== 1) throw new Error('Resposta de upload inválida.');
                    entry.uploaded = valid[0];
                }
            }
            if (!live()) return; // Closing or switching tasks during upload cancels the later POST.
            session.feedback = 'Salvando comentário…';
            paint();
            const before = session.actions.beforeSave();
            const payload = {text: session.text};
            if (session.files.length) payload.attachments = session.files.map(entry => entry.uploaded);
            savingComment = true;
            const updated = await api.addComment(taskId, payload);
            if (!updated || updated.id !== taskId || !Array.isArray(updated.comments)) {
                throw new Error('Não foi possível confirmar a resposta do comentário.');
            }
            // From here the comment is committed. Rendering failures must never suggest a retry.
            session.text = '';
            session.files = [];
            session.feedback = '';
            session.busy = false;
            if (activeComposer === session && session.active && session.view) session.view.editor.innerHTML = '';
            try { session.actions.onCommitted(updated, before); } catch (error) { console.error(error); }
            if (live()) {
                paint();
                try { session.actions.onSaved(); } catch (error) { console.error(error); }
            }
        } catch (error) {
            // Editing the task can temporarily hide its detail without ending this
            // composer. Remember an uncertain POST even while that view is hidden.
            if (activeComposer !== session || !session.active) return;
            session.uncertain = savingComment && (!error.status || error.status >= 500);
            session.feedback = session.uncertain
                ? 'Não foi possível confirmar o envio. Copie seu texto e reabra a tarefa para conferir os comentários antes de tentar novamente.'
                : savingComment
                ? error.status === 401 || error.status === 403
                    ? 'Sua sessão não permite enviar o comentário. O texto e os anexos foram mantidos.'
                    : error.status === 409
                    ? 'A tarefa mudou durante o envio. Seu texto e anexos foram mantidos; confira a tarefa antes de tentar novamente.'
                    : 'Não foi possível salvar o comentário. Seu texto e anexos foram mantidos.'
                : 'Não foi possível enviar todos os anexos. Seu texto e arquivos foram mantidos; tente novamente.';
        } finally {
            session.busy = false;
            paint();
        }
    };
    paint();
}
