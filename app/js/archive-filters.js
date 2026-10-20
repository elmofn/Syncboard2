import { taskMatchesUser, taskUserFilterOptions } from './task-user-filter.js';

// Archive-only state: active-board filters must not hide completed work on entry.
const defaults = { searchQuery: '', project: 'all', user: 'all', priority: 'all', status: 'all' };
const filters = { ...defaults };
const normalize = value => String(value ?? '').trim().toLowerCase();
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const statusLabels = {done: 'Concluída', todo: 'Fila', stopped: 'Parado', inprogress: 'Andamento', homologation: 'Homologação', publication: 'Publicação'};

export function filterArchivedTasks(tasks, selected = defaults, users = []) {
    const query = selected.searchQuery.toLowerCase();
    return tasks.filter(task =>
        (selected.project === 'all' || normalize(task.project) === normalize(selected.project)) &&
        taskMatchesUser(task, selected.user, users) &&
        (!query || (task.title && task.title.toLowerCase().includes(query)) || (task.id && task.id.toLowerCase().includes(query))) &&
        (selected.priority === 'all' || task.priority === selected.priority) &&
        (selected.status === 'all' || task.status === selected.status)
    );
}

export function archiveFilterMarkup(tasks, selected = filters) {
    const select = (key, label, allLabel, values) => {
        const options = [...new Set([...values, selected[key] === 'all' ? null : selected[key]].filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt'));
        return `<label class="fidelity-sr-only" for="archive-filter-${key}">${label}</label><select id="archive-filter-${key}" data-archive-filter="${key}" aria-label="Filtrar arquivados por ${label.toLowerCase()}"><option value="all">${allLabel}</option>${options.map(value => `<option value="${escape(value)}"${value === selected[key] ? ' selected' : ''}>${escape(key === 'status' ? statusLabels[value] || value : value)}</option>`).join('')}</select>`;
    };
    return `<div class="fidelity-controls" role="search" aria-label="Filtros de tarefas arquivadas"><label class="sb-list-search"><span class="fidelity-sr-only">Buscar arquivados por título ou ID</span><i data-lucide="search" aria-hidden="true"></i><input id="archive-search-input" data-archive-filter="searchQuery" type="search" placeholder="Buscar por título ou ID" value="${escape(selected.searchQuery)}"></label>${select('project', 'Projeto', 'Todos os projetos', tasks.map(task => task.project))}${select('user', 'Usuário', 'Todos os usuários', taskUserFilterOptions(tasks, selected.user))}${select('priority', 'Prioridade', 'Todas as prioridades', tasks.map(task => task.priority))}${select('status', 'Estado', 'Todos os estados', tasks.map(task => task.status))}<button id="clear-archive-filters" type="button">Limpar</button></div><p id="archive-filter-count" class="fidelity-table-note" role="status" aria-live="polite" aria-atomic="true"></p><div id="archive-filter-results"></div>`;
}

export function mountArchiveFilters(container, tasks, {users, renderRows, applyColors, createIcons}) {
    if (!Array.isArray(tasks)) throw new Error('Resposta do arquivo inválida.');
    // A background refresh must not interrupt typing or move focus elsewhere.
    const focused = typeof document !== 'undefined' ? document.activeElement : null;
    const focusedKey = container.contains?.(focused) ? focused?.dataset.archiveFilter : null;
    const selection = focusedKey === 'searchQuery' ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
    container.innerHTML = archiveFilterMarkup(tasks);
    const results = container.querySelector('#archive-filter-results');
    const clear = container.querySelector('#clear-archive-filters');
    const controls = [...container.querySelectorAll('[data-archive-filter]')];
    const update = () => {
        const visible = filterArchivedTasks(tasks, filters, users);
        clear.disabled = Object.keys(defaults).every(key => filters[key] === defaults[key]);
        container.querySelector('#archive-filter-count').textContent = `${visible.length} ${visible.length === 1 ? 'tarefa encontrada' : 'tarefas encontradas'} de ${tasks.length} no arquivo`;
        results.innerHTML = tasks.length && !visible.length
            ? '<div class="sb-empty sb-archive-state" role="status"><h3>Nenhuma tarefa encontrada</h3><p>Altere os filtros ou use Limpar para ver todas as tarefas arquivadas.</p></div>'
            : renderRows(visible);
        applyColors(results);
        createIcons();
    };
    controls.forEach(control => control.addEventListener(control.dataset.archiveFilter === 'searchQuery' ? 'input' : 'change', () => {
        filters[control.dataset.archiveFilter] = control.value;
        update();
    }));
    clear.addEventListener('click', () => {
        Object.assign(filters, defaults);
        controls.forEach(control => { control.value = filters[control.dataset.archiveFilter]; });
        update();
        container.querySelector('#archive-search-input').focus();
    });
    update();
    if (focusedKey) {
        const restored = controls.find(control => control.dataset.archiveFilter === focusedKey);
        restored?.focus({preventScroll: true});
        if (selection && selection[0] !== null) restored?.setSelectionRange?.(...selection);
    }
}
