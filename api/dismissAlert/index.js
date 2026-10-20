const { createStageNotification } = require('../shared/notificationProgress');
const { CosmosClient } = require("@azure/cosmos");

const connectionString = process.env.CosmosDB;
const client = new CosmosClient(connectionString);
const database = client.database("TasksDB");
const tasksContainer = database.container("Tasks");
const usersContainer = database.container("Users");
const notificationsContainer = database.container("Notifications"); // <-- Referência às Notificações

function getUser(request) {
    const header = request.headers['x-ms-client-principal'];
    if (!header) return null;
    const encoded = Buffer.from(header, 'base64');
    const decoded = encoded.toString('ascii');
    return JSON.parse(decoded);
}

module.exports = async function (context, req) {
    const taskId = context.bindingData.id;
    context.log(`Iniciando dismissAlert para a tarefa: ${taskId}`);

    try {
        const user = getUser(req);
        if (!user) {
             context.res = { status: 401, body: "Usuário não identificado." };
             return;
        }

        const userEmail = user.userDetails;
        let userNameToRemove = userEmail;

        try {
            const { resource: userProfile } = await usersContainer.item(userEmail.toLowerCase(), userEmail.toLowerCase()).read();
            if (userProfile && userProfile.name) {
                userNameToRemove = userProfile.name;
            } else if (user.claims) {
                const nameClaim = user.claims.find(c => c.typ === 'name');
                if (nameClaim) userNameToRemove = nameClaim.val;
            }
        } catch (dbError) {
            context.log.warn(`Erro ao buscar perfil do usuário: ${dbError.message}`);
        }

        const { resource: existingTask } = await tasksContainer.item(taskId, taskId).read();
        if (!existingTask) {
            context.res = { status: 404, body: "Tarefa não encontrada." };
            return;
        }

        // TC495: do not acknowledge a newer signal from an older displayed popup.
        if (req.body?.expectedEtag && req.body.expectedEtag !== existingTask._etag) {
            context.res = {status: 409, body: 'O alerta foi alterado. Atualize e confirme novamente.'};
            return;
        }

        if (existingTask.pendingAlerts && Array.isArray(existingTask.pendingAlerts)) {
            let changed = false;
            const receivedAt = new Date().toISOString();
            existingTask.pendingAlerts = existingTask.pendingAlerts.map(alertItem => {
                const target = alertItem && typeof alertItem === 'object' ? alertItem.targetUser : alertItem;
                if (target !== userNameToRemove && target !== userEmail) return alertItem;
                if (alertItem?.acknowledgedAt) return alertItem; // TC495: already received; do not notify twice.
                changed = true;
                return {
                    ...(typeof alertItem === 'object' ? alertItem : {targetUser: alertItem}),
                    acknowledgedAt: receivedAt // TC495: retain badge until a committed status change.
                };
            });

            if (changed) {
                context.log(`Recebimento do alerta registrado com sucesso.`);

                if (!existingTask._etag) throw new Error('ETag ausente na tarefa lida.');
                const { resource: replaced } = await tasksContainer.item(taskId, taskId).replace(existingTask, {
                    accessCondition: {type: 'IfMatch', condition: existingTask._etag}
                });
                
                // --- NOVO: CRIAR A NOTIFICAÇÃO NA FILA NORMAL DO USUÁRIO ---
                try {
                    await createStageNotification(notificationsContainer, tasksContainer, replaced, {
                        targetUserEmail: userEmail, // Email do usuário que clicou em "vou olhar"
                        taskId: taskId,
                        message: "Atenção Solicitada",
                        commentPreview: `Lembrete: Você foi sinalizado na tarefa #${taskId} - ${existingTask.title}`,
                        createdAt: new Date().toISOString(),
                        isRead: false // Deixamos false para o sininho ficar com a bolinha vermelha!
                    }, context.log);
                } catch (notifErr) {
                    context.log.warn(`Erro ao gerar notificação pós-alerta: ${notifErr.message}`);
                }
                // -------------------------------------------------------------

                // TC495: side effects may yield while another tab commits a newer task.
                const { resource: latestTask } = await tasksContainer.item(taskId, taskId).read();
                if (!latestTask) { context.res = {status: 404, body: 'Tarefa não encontrada.'}; return; }

                context.bindings.signalRMessage = {
                    target: 'taskUpdated',
                    arguments: [latestTask]
                };
                context.res = { body: latestTask };
            } else {
                context.res = { body: existingTask }; 
            }
        } else {
            context.res = { body: existingTask };
        }

    } catch (error) {
        if (Number(error.code || error.statusCode) === 412) {
            context.res = {status: 409, body: 'A tarefa foi alterada. Atualize e tente novamente.'};
            return;
        }
        context.log.error(`ERRO CRÍTICO ao dispensar alerta: ${error.message}`, error);
        context.res = { status: 500, body: `Erro interno: ${error.message}` };
    }
};
