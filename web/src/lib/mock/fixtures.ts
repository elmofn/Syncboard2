import type { Task, User, Notification, ClientPrincipal } from '../../types/api';

// Dados fictícios para o modo mock (nenhum dado real). Suficientes para
// exercitar quadro, status, responsáveis, projetos e notificações.

export const mockCurrentPrincipal: ClientPrincipal = {
  identityProvider: 'mock',
  userId: 'mock-user',
  userDetails: 'ana@exemplo.com',
  userRoles: ['authenticated', 'syncboard_user', 'admin'],
  claims: [
    { typ: 'name', val: 'Ana Souza' },
    { typ: 'picture', val: '' },
  ],
};

export const mockUsers: User[] = [
  { id: 'ana@exemplo.com', email: 'ana@exemplo.com', name: 'Ana Souza', displayName: 'Ana', role: 'Dev', isAdmin: true },
  { id: 'bia@exemplo.com', email: 'bia@exemplo.com', name: 'Bia Lima', displayName: 'Bia', role: 'QA' },
  { id: 'caio@exemplo.com', email: 'caio@exemplo.com', name: 'Caio Melo', displayName: 'Caio', role: 'Dev' },
  { id: 'dot@exemplo.com', email: 'dot@exemplo.com', name: 'DOT (Agente)', displayName: 'DOT', role: 'IA', isAiAgent: true },
];

const P = {
  ana: { email: 'ana@exemplo.com', name: 'Ana Souza' },
  bia: { email: 'bia@exemplo.com', name: 'Bia Lima' },
  caio: { email: 'caio@exemplo.com', name: 'Caio Melo' },
};

const now = Date.now();
const iso = (offsetMin: number) => new Date(now - offsetMin * 60000).toISOString();

export const mockTasks: Task[] = [
  {
    id: 'TC-001', numericId: 1, title: 'Tela de login nova', description: 'Reconstruir o login no web/.',
    responsible: [P.ana], status: 'inprogress', priority: 'Alta', progress: 40, project: 'Frontend', projectColor: '#244FDB',
    order: -now, createdAt: iso(600), createdBy: 'Ana Souza', requester: P.ana, _etag: '"m1"',
    assignmentHistory: [{ at: iso(300), actorEmail: 'ana@exemplo.com', from: [P.bia], to: [P.ana] }],
    comments: [{ id: 'c1', text: 'Comecei pelo layout split.', author: P.ana, timestamp: iso(120) }],
    history: [
      { action: 'created', description: 'Tarefa criada por <b>Ana Souza</b>', timestamp: iso(600) },
      { action: 'edited', description: 'Status alterado para <b>Andamento</b>', timestamp: iso(300) },
    ],
  },
  {
    id: 'TC-002', numericId: 2, title: 'Contrato da API', description: 'Documentar endpoints.',
    responsible: [P.ana, P.caio], status: 'publication', priority: 'Média', progress: 100, project: 'Docs', projectColor: '#17674D',
    order: -now + 1000, createdAt: iso(800), createdBy: 'Ana Souza', requester: P.ana, _etag: '"m2"',
    assignmentHistory: [
      { at: iso(800), actorEmail: 'ana@exemplo.com', from: [], to: [P.ana] },
      { at: iso(400), actorEmail: 'ana@exemplo.com', from: [P.ana], to: [P.ana, P.caio] },
    ],
  },
  {
    id: 'TC-003', numericId: 3, title: 'Mapear acesso do agente', description: 'API direta para o DOT.',
    responsible: [P.caio], homologador: P.bia, status: 'homologation', priority: 'Alta', progress: 100, project: 'Backend', projectColor: '#713AA3',
    order: -now + 2000, createdAt: iso(400), createdBy: 'Caio Melo', requester: P.ana, _etag: '"m3"',
    continuityInstructions: 'Validar o fluxo de chave de API antes de publicar.',
    attachments: [{ url: 'https://example.com/spec.pdf', name: 'spec-agente.pdf', contentType: 'application/pdf' }],
    comments: [
      { id: 'c3a', text: 'Subi a proposta de endpoints <b>/api/agent</b>.', author: P.caio, timestamp: iso(90) },
      { id: 'c3b', text: 'Revisando a parte de autenticação.', author: P.bia, timestamp: iso(30) },
    ],
    history: [
      { action: 'created', description: 'Tarefa criada por <b>Caio Melo</b>', timestamp: iso(400) },
      { action: 'edited', description: 'Status alterado para <b>Homologação</b><br>Homologador designado: <b>Bia Lima</b>', timestamp: iso(120) },
    ],
  },
  {
    id: 'TC-004', numericId: 4, title: 'Limpeza do CSS legado', description: 'Remover custom.css e *-v2.css.',
    responsible: [P.bia], status: 'todo', priority: 'Baixa', progress: 0, project: 'Frontend', projectColor: '#244FDB',
    order: -now + 3000, createdAt: iso(200), createdBy: 'Bia Lima', _etag: '"m4"',
  },
  {
    id: 'TC-005', numericId: 5, title: 'Modelagem de dados', description: 'Separar comentários do doc de tarefa.',
    responsible: [P.caio], status: 'stopped', priority: 'Média', progress: 60, project: 'Backend', projectColor: '#713AA3',
    order: -now + 4000, createdAt: iso(300), createdBy: 'Caio Melo', _etag: '"m5"',
    pendingAlerts: [{ targetUser: 'Caio Melo', signaledBy: 'Ana Souza', timestamp: iso(30) }],
  },
  {
    id: 'TC-006', numericId: 6, title: 'Guardrails do agente', description: 'AGENTS.md e CI.',
    responsible: [P.ana], status: 'todo', priority: 'Baixa', progress: 0, project: 'Processo', projectColor: '#8C5000',
    order: -now + 5000, createdAt: iso(100), createdBy: 'Ana Souza', _etag: '"m6"',
  },
  {
    id: 'TC-007', numericId: 7, title: 'Setup inicial do repositório', description: 'Concluída.',
    responsible: [P.ana], status: 'done', priority: 'Média', progress: 100, project: 'Docs', projectColor: '#17674D',
    order: -now + 6000, createdAt: iso(5000), createdBy: 'Ana Souza', _etag: '"m7"',
  },
];

export const mockNotifications: Notification[] = [
  {
    id: 'n1', targetUserEmail: 'ana@exemplo.com', type: 'mention', taskId: 'TC-003',
    taskTitle: 'Mapear acesso do agente', message: 'Você foi mencionada por Caio Melo',
    commentPreview: 'Ana, dá uma olhada no fluxo?', isRead: false, createdAt: iso(45),
  },
  {
    id: 'n2', targetUserEmail: 'ana@exemplo.com', taskId: 'TC-005',
    message: 'Atenção Solicitada', commentPreview: 'Lembrete: você foi sinalizada na TC-005',
    isRead: false, createdAt: iso(20),
  },
];
