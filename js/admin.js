/* =========================================================
   Cesta Viva — painel administrativo
   Leads · Clientes · Entregas · Lembretes · Dados
   ========================================================= */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const { esc, money } = Util;

  let db = Store.load();
  const ui = {
    view: 'dashboard',
    leadStatus: '', leadQ: '',
    clientStatus: 'ativo', clientQ: '',
    delivRange: '14', delivStatus: 'abertas',
  };

  const LEAD_STATUS = { novo: 'Novo', contatado: 'Contatado', negociando: 'Negociando', convertido: 'Convertido', perdido: 'Perdido' };
  const CLIENT_STATUS = { ativo: 'Ativo', pausado: 'Pausado', cancelado: 'Cancelado' };
  const PAYMENT = { pendente: 'Pendente', em_dia: 'Em dia', atrasado: 'Atrasado' };
  const DELIVERY_STATUS = { pendente: 'Pendente', rota: 'Em rota', entregue: 'Entregue', cancelada: 'Cancelada' };
  const VIEW_TITLES = { dashboard: 'Visão geral', leads: 'Leads', clients: 'Clientes', deliveries: 'Entregas', reminders: 'Lembretes', settings: 'Dados e configurações' };

  const todayISO = () => Util.toISO(Util.today());
  const first = (name) => String(name || '').split(' ')[0];
  const monthly = (r) => Plan.calc(r)?.monthly || 0;
  const clientById = (id) => db.clients.find((c) => c.id === id);

  function persist(msg) {
    Store.save(db);
    renderAll();
    if (msg) toast(msg);
  }

  // Mantém o painel em sincronia se um lead chegar pelo site em outra aba
  window.addEventListener('storage', (e) => {
    if (e.key === Store.KEY) { db = Store.load(); renderAll(); toast('Dados atualizados'); }
  });

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  const badge = (status, labels) => `<span class="badge s-${esc(status)}">${esc(labels[status] || status)}</span>`;
  const statusSelect = (field, id, value, labels) => `
    <select class="inline badge s-${esc(value)}" data-field="${field}" data-id="${esc(id)}" aria-label="Alterar status">
      ${Object.entries(labels).map(([k, v]) => `<option value="${k}"${k === value ? ' selected' : ''}>${v}</option>`).join('')}
    </select>`;
  const waBtn = (phone, text, title = 'Abrir WhatsApp') =>
    `<a class="icon-btn" href="${esc(Util.waLink(phone, text))}" target="_blank" rel="noopener" title="${esc(title)}">💬</a>`;
  const planCell = (r) => {
    const d = Plan.day(r.day);
    const extras = (r.extras || []).map((id) => Plan.extra(id)?.name.split(' ')[0]).filter(Boolean);
    return `${esc(Plan.describe(r))}<small>${d ? esc(d.name) : 'sem dia'}${extras.length ? ' · + ' + esc(extras.join(', ')) : ''}</small>`;
  };

  /* =========================================================
     ACESSO (PIN)
     Barreira simples no navegador — não é segurança de verdade.
     ========================================================= */
  const PIN_KEY = 'cestaviva:pin';
  const AUTH_KEY = 'cestaviva:auth';

  async function hashPin(pin) {
    const salted = 'cestaviva:' + pin;
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salted));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (const ch of salted) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
    return 'djb2:' + h;
  }
  const storage = {
    get(store, k) { try { return store.getItem(k); } catch (e) { return null; } },
    set(store, k, v) { try { store.setItem(k, v); } catch (e) { /* sem storage */ } },
    del(store, k) { try { store.removeItem(k); } catch (e) { /* sem storage */ } },
  };

  function showGate() {
    const creating = !storage.get(localStorage, PIN_KEY);
    $('#gate').hidden = false;
    $('#app').hidden = true;
    $('#gate-msg').textContent = creating
      ? 'Primeiro acesso: crie um PIN (mín. 4 dígitos) para proteger o painel neste navegador.'
      : 'Digite seu PIN para entrar.';
    $('#gate-pin2').hidden = !creating;
    $('#gate-pin2').required = creating;
    $('#gate-form button').textContent = creating ? 'Criar PIN e entrar' : 'Entrar';
    $('#gate-pin').value = '';
    $('#gate-pin2').value = '';
    $('#gate-pin').focus();
  }

  $('#gate-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pin = $('#gate-pin').value.trim();
    const err = $('#gate-err');
    err.textContent = '';
    if (pin.length < 4) { err.textContent = 'O PIN precisa ter pelo menos 4 caracteres.'; return; }
    const stored = storage.get(localStorage, PIN_KEY);
    const hash = await hashPin(pin);
    if (!stored) {
      if (pin !== $('#gate-pin2').value.trim()) { err.textContent = 'Os PINs não conferem.'; return; }
      storage.set(localStorage, PIN_KEY, hash);
    } else if (stored !== hash) {
      err.textContent = 'PIN incorreto.';
      $('#gate-pin').select();
      return;
    }
    storage.set(sessionStorage, AUTH_KEY, '1');
    enterApp();
  });

  $('#logout').addEventListener('click', () => {
    storage.del(sessionStorage, AUTH_KEY);
    showGate();
  });

  function enterApp() {
    $('#gate').hidden = true;
    $('#app').hidden = false;
    db = Store.load();
    const fromHash = location.hash.slice(1);
    setView(VIEW_TITLES[fromHash] ? fromHash : 'dashboard');
  }

  /* =========================================================
     NAVEGAÇÃO
     ========================================================= */
  function setView(view) {
    ui.view = view;
    $$('.sidebar nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((s) => { s.hidden = s.dataset.view !== view; });
    $('#view-title').textContent = VIEW_TITLES[view];
    $('#sidebar').classList.remove('open');
    history.replaceState(null, '', '#' + view);
    renderAll();
  }
  $$('.sidebar nav button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#menu-btn').addEventListener('click', (e) => { e.stopPropagation(); $('#sidebar').classList.toggle('open'); });
  document.addEventListener('click', (e) => {
    const sb = $('#sidebar');
    if (sb.classList.contains('open') && !sb.contains(e.target)) sb.classList.remove('open');
  });

  function renderAll() {
    renderCounts();
    renderTopActions();
    const fn = { dashboard: renderDashboard, leads: renderLeads, clients: renderClients, deliveries: renderDeliveries, reminders: renderReminders, settings: renderSettings }[ui.view];
    fn($(`.view[data-view="${ui.view}"]`));
  }

  function renderCounts() {
    const novos = db.leads.filter((l) => l.status === 'novo').length;
    const today = todayISO();
    const entregasHoje = db.deliveries.filter((d) => d.date === today && ['pendente', 'rota'].includes(d.status)).length;
    const lembretes = db.reminders.filter((r) => !r.done && r.due <= today).length;
    $('#count-leads').textContent = novos || '';
    $('#count-deliveries').textContent = entregasHoje || '';
    $('#count-reminders').textContent = lembretes || '';
  }

  function renderTopActions() {
    const actions = {
      dashboard: '<a class="btn" href="index.html" target="_blank">🌐 Ver site</a>',
      leads: '<button class="btn" data-act="import-wa">📋 Importar do WhatsApp</button><button class="btn btn-primary" data-act="new-lead">+ Novo lead</button>',
      clients: '<button class="btn btn-primary" data-act="new-client">+ Novo cliente</button>',
      deliveries: '<button class="btn btn-primary" data-act="generate">⚡ Gerar entregas</button>',
      reminders: '',
      settings: '',
    };
    $('#top-actions').innerHTML = actions[ui.view] || '';
  }

  /* =========================================================
     VISÃO GERAL
     ========================================================= */
  function renderDashboard(el) {
    const today = todayISO();
    const in7 = Util.toISO(Util.addDays(Util.today(), 7));
    const active = db.clients.filter((c) => c.status === 'ativo');
    const mrr = active.reduce((t, c) => t + monthly(c), 0);
    const converted = db.leads.filter((l) => l.status === 'convertido').length;
    const conv = db.leads.length ? Math.round((converted / db.leads.length) * 100) : 0;
    const upcoming = db.deliveries
      .filter((d) => d.date >= today && d.date <= in7 && ['pendente', 'rota'].includes(d.status))
      .sort((a, b) => a.date.localeCompare(b.date));
    const pendingRem = db.reminders.filter((r) => !r.done).sort((a, b) => a.due.localeCompare(b.due));
    const lateRem = pendingRem.filter((r) => r.due <= today).length;
    const lateDeliv = db.deliveries.filter((d) => d.date < today && ['pendente', 'rota'].includes(d.status)).length;
    const unpaid = active.filter((c) => c.payment !== 'em_dia').length;

    const maxFunnel = Math.max(1, ...Object.keys(LEAD_STATUS).map((s) => db.leads.filter((l) => l.status === s).length));

    if (!db.leads.length && !db.clients.length) {
      el.innerHTML = `
        <div class="panel empty">
          <p style="font-size:2.4rem;margin:0">🧺</p>
          <h2 style="justify-content:center">Nenhum dado ainda</h2>
          <p>Os pedidos feitos no site aparecem aqui (neste navegador). Você também pode cadastrar um lead à mão, importar uma mensagem do WhatsApp ou carregar dados de exemplo.</p>
          <p><button class="btn btn-primary" data-act="seed">Carregar dados de exemplo</button> <a class="btn" href="index.html#montar" target="_blank">Fazer um pedido de teste</a></p>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="kpis">
        <div class="kpi accent"><span>Receita mensal estimada</span><strong>${money(mrr)}</strong><small>${active.length} assinatura${active.length === 1 ? '' : 's'} ativa${active.length === 1 ? '' : 's'}</small></div>
        <div class="kpi"><span>Leads novos</span><strong>${db.leads.filter((l) => l.status === 'novo').length}</strong><small>${db.leads.length} no total</small></div>
        <div class="kpi"><span>Conversão lead → cliente</span><strong>${conv}%</strong><small>${converted} convertido${converted === 1 ? '' : 's'}</small></div>
        <div class="kpi"><span>Entregas nos próximos 7 dias</span><strong>${upcoming.length}</strong><small>${lateDeliv ? `<b style="color:var(--red)">${lateDeliv} atrasada(s)</b>` : 'nenhuma atrasada'}</small></div>
        <div class="kpi"><span>Pagamentos a cobrar</span><strong>${unpaid}</strong><small>clientes ativos não "em dia"</small></div>
        <div class="kpi"><span>Lembretes vencendo</span><strong>${lateRem}</strong><small>${pendingRem.length} pendente(s)</small></div>
      </div>

      <div class="panels">
        <div class="panel">
          <h2>Funil de leads <button class="btn" data-goto="leads">Ver leads</button></h2>
          <div class="funnel">
            ${Object.entries(LEAD_STATUS).map(([k, v]) => {
              const n = db.leads.filter((l) => l.status === k).length;
              return `<div class="funnel-row"><span>${v}</span><div class="funnel-bar"><i style="width:${(n / maxFunnel) * 100}%"></i></div><b>${n}</b></div>`;
            }).join('')}
          </div>
        </div>

        <div class="panel">
          <h2>Próximas entregas <button class="btn" data-goto="deliveries">Ver todas</button></h2>
          ${upcoming.length ? `<ul class="list">${upcoming.slice(0, 6).map((d) => {
            const c = clientById(d.clientId);
            return `<li><span class="badge">${Util.formatDate(d.date, { weekday: 'short', day: '2-digit' })}</span>
              <div class="grow">${esc(c?.name || 'Cliente removido')}<small>${esc(c?.neighborhood || '')} · ${c ? esc(Plan.describe(c)) : ''}</small></div>
              ${badge(d.status, DELIVERY_STATUS)}</li>`;
          }).join('')}</ul>` : `<p class="empty">Sem entregas nos próximos 7 dias.<br><button class="btn" data-act="generate">⚡ Gerar entregas</button></p>`}
        </div>

        <div class="panel">
          <h2>Lembretes <button class="btn" data-goto="reminders">Ver todos</button></h2>
          ${pendingRem.length ? `<ul class="list">${pendingRem.slice(0, 6).map(reminderItem).join('')}</ul>` : '<p class="empty">Tudo em dia ✨</p>'}
        </div>

        <div class="panel">
          <h2>Leads recentes <button class="btn" data-goto="leads">Ver todos</button></h2>
          ${db.leads.length ? `<ul class="list">${[...db.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((l) => `
            <li><div class="grow">${esc(l.name)}<small>${esc(Plan.describe(l))} · ${money(monthly(l))}/mês</small></div>
            ${badge(l.status, LEAD_STATUS)}</li>`).join('')}</ul>` : '<p class="empty">Nenhum lead ainda.</p>'}
        </div>
      </div>`;
  }

  /* =========================================================
     LEADS
     ========================================================= */
  function renderLeads(el) {
    const q = ui.leadQ.toLowerCase();
    const rows = db.leads.filter((l) =>
      (!ui.leadStatus || l.status === ui.leadStatus) &&
      (!q || [l.name, l.phone, l.email, l.neighborhood].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    el.innerHTML = `
      <div class="toolbar">
        <input type="search" placeholder="Buscar nome, telefone, bairro…" value="${esc(ui.leadQ)}" data-filter="leadQ">
        <select data-filter="leadStatus">
          <option value="">Todos os status</option>
          ${Object.entries(LEAD_STATUS).map(([k, v]) => `<option value="${k}"${k === ui.leadStatus ? ' selected' : ''}>${v}</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <span class="muted small">${rows.length} lead(s)</span>
      </div>
      <div class="table-wrap">
        ${rows.length ? `<table>
          <thead><tr><th>Data</th><th>Nome</th><th>Plano</th><th>Valor/mês</th><th>Origem</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows.map((l) => `
            <tr>
              <td>${Util.formatDate(l.createdAt)}<small>${new Date(l.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></td>
              <td><strong>${esc(l.name)}</strong><small>${esc(Util.formatPhone(l.phone))}${l.neighborhood ? ' · ' + esc(l.neighborhood) : ''}</small></td>
              <td>${planCell(l)}</td>
              <td>${money(monthly(l))}</td>
              <td><span class="badge">${esc({ site: 'Site', whatsapp: 'WhatsApp', manual: 'Manual' }[l.source] || l.source)}</span></td>
              <td>${statusSelect('lead-status', l.id, l.status, LEAD_STATUS)}</td>
              <td class="actions">
                ${waBtn(l.phone, `Olá, ${first(l.name)}! Aqui é da ${CONFIG.brand} 🌱 Recebi seu pedido da ${Plan.describe(l).toLowerCase()}. Posso confirmar alguns detalhes com você?`, 'Responder no WhatsApp')}
                <button class="icon-btn" data-act="convert" data-id="${esc(l.id)}" title="${l.clientId ? 'Ver cliente' : 'Transformar em cliente'}">${l.clientId ? '👤' : '✅'}</button>
                <button class="icon-btn" data-act="edit-lead" data-id="${esc(l.id)}" title="Editar">✏️</button>
                <button class="icon-btn" data-act="del-lead" data-id="${esc(l.id)}" title="Excluir">🗑️</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `<p class="empty">${db.leads.length ? 'Nenhum lead com esses filtros.' : 'Nenhum lead ainda. Os pedidos feitos no site aparecem aqui.'}</p>`}
      </div>`;
  }

  /* =========================================================
     CLIENTES
     ========================================================= */
  function renderClients(el) {
    const q = ui.clientQ.toLowerCase();
    const rows = db.clients.filter((c) =>
      (!ui.clientStatus || c.status === ui.clientStatus) &&
      (!q || [c.name, c.phone, c.email, c.neighborhood, c.address].join(' ').toLowerCase().includes(q)));
    const total = rows.reduce((t, c) => t + (c.status === 'ativo' ? monthly(c) : 0), 0);

    el.innerHTML = `
      <div class="toolbar">
        <input type="search" placeholder="Buscar cliente…" value="${esc(ui.clientQ)}" data-filter="clientQ">
        <select data-filter="clientStatus">
          <option value="">Todos</option>
          ${Object.entries(CLIENT_STATUS).map(([k, v]) => `<option value="${k}"${k === ui.clientStatus ? ' selected' : ''}>${v}s</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <span class="muted small">${rows.length} cliente(s) · ${money(total)}/mês ativos</span>
      </div>
      <div class="table-wrap">
        ${rows.length ? `<table>
          <thead><tr><th>Cliente</th><th>Plano</th><th>Valor/mês</th><th>Pagamento</th><th>Status</th><th>Desde</th><th></th></tr></thead>
          <tbody>${rows.map((c) => `
            <tr>
              <td><strong>${esc(c.name)}</strong><small>${esc(Util.formatPhone(c.phone))}${c.neighborhood ? ' · ' + esc(c.neighborhood) : ''}</small></td>
              <td>${planCell(c)}</td>
              <td>${money(monthly(c))}</td>
              <td>${statusSelect('client-payment', c.id, c.payment, PAYMENT)}</td>
              <td>${statusSelect('client-status', c.id, c.status, CLIENT_STATUS)}</td>
              <td>${Util.formatDate(c.startDate, { day: '2-digit', month: 'short' })}</td>
              <td class="actions">
                ${waBtn(c.phone, `Olá, ${first(c.name)}! Segue o link de pagamento da sua assinatura ${CONFIG.brand} (${money(monthly(c))}/mês): `, 'Cobrar pelo WhatsApp')}
                <button class="icon-btn" data-act="edit-client" data-id="${esc(c.id)}" title="Editar">✏️</button>
                <button class="icon-btn" data-act="del-client" data-id="${esc(c.id)}" title="Excluir">🗑️</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>` : `<p class="empty">${db.clients.length ? 'Nenhum cliente com esses filtros.' : 'Nenhum cliente ainda. Converta um lead com ✅ ou cadastre um novo.'}</p>`}
      </div>`;
  }

  /* =========================================================
     ENTREGAS
     ========================================================= */
  function generateDeliveries(daysAhead = 14) {
    const today = Util.today();
    const end = Util.toISO(Util.addDays(today, daysAhead));
    let created = 0;
    db.clients.filter((c) => c.status === 'ativo' && c.day !== '' && c.day != null).forEach((c) => {
      const interval = Plan.freq(c.frequency)?.interval || 7;
      const dates = db.deliveries.filter((d) => d.clientId === c.id && d.status !== 'cancelada').map((d) => d.date);
      let d = Util.addDays(today, (Number(c.day) - today.getDay() + 7) % 7);
      for (let iso = Util.toISO(d); iso <= end; d = Util.addDays(d, 7), iso = Util.toISO(d)) {
        if (c.startDate && iso < c.startDate) continue;
        if (dates.includes(iso)) continue;
        // respeita o intervalo da frequência (quinzenal/mensal) em relação à entrega mais próxima
        const tooClose = dates.some((x) => Math.abs(Util.daysBetween(x, iso)) < interval);
        if (tooClose) continue;
        db.deliveries.push({ id: Store.uid(), clientId: c.id, date: iso, status: 'pendente', createdAt: new Date().toISOString() });
        dates.push(iso);
        created++;
      }
    });
    persist(created ? `${created} entrega(s) gerada(s) para os próximos ${daysAhead} dias` : 'Nenhuma entrega nova: agenda já está em dia');
  }

  function renderDeliveries(el) {
    const today = todayISO();
    const limit = ui.delivRange === 'all' ? null : Util.toISO(Util.addDays(Util.today(), Number(ui.delivRange)));
    const rows = db.deliveries.filter((d) => {
      const open = ['pendente', 'rota'].includes(d.status);
      if (ui.delivStatus === 'abertas' && !open) return false;
      if (ui.delivStatus === 'atrasadas' && !(open && d.date < today)) return false;
      if (ui.delivStatus === 'concluidas' && open) return false;
      if (ui.delivRange === '0') return d.date === today;
      if (limit && d.date > limit) return false;
      if (ui.delivRange !== 'all' && ui.delivStatus !== 'atrasadas' && d.date < today && !open) return false;
      return true;
    }).sort((a, b) => a.date.localeCompare(b.date) || (clientById(a.clientId)?.neighborhood || '').localeCompare(clientById(b.clientId)?.neighborhood || ''));

    const groups = rows.reduce((acc, d) => ((acc[d.date] = acc[d.date] || []).push(d), acc), {});

    const pickList = (list) => {
      const counts = {};
      list.filter((d) => d.status !== 'cancelada').forEach((d) => {
        const c = clientById(d.clientId);
        if (!c) return;
        const s = Plan.size(c.size);
        if (s) counts['Cesta ' + s.name] = (counts['Cesta ' + s.name] || 0) + 1;
        (c.extras || []).forEach((id) => { const e = Plan.extra(id); if (e) counts[e.name] = (counts[e.name] || 0) + 1; });
      });
      return Object.entries(counts).map(([k, n]) => `<span>${n}× ${esc(k)}</span>`).join('');
    };

    el.innerHTML = `
      <div class="toolbar">
        <select data-filter="delivRange">
          <option value="0"${ui.delivRange === '0' ? ' selected' : ''}>Hoje</option>
          <option value="7"${ui.delivRange === '7' ? ' selected' : ''}>Próximos 7 dias</option>
          <option value="14"${ui.delivRange === '14' ? ' selected' : ''}>Próximos 14 dias</option>
          <option value="all"${ui.delivRange === 'all' ? ' selected' : ''}>Todo o histórico</option>
        </select>
        <select data-filter="delivStatus">
          <option value="abertas"${ui.delivStatus === 'abertas' ? ' selected' : ''}>Em aberto</option>
          <option value="atrasadas"${ui.delivStatus === 'atrasadas' ? ' selected' : ''}>Atrasadas</option>
          <option value="concluidas"${ui.delivStatus === 'concluidas' ? ' selected' : ''}>Entregues/canceladas</option>
          <option value=""${ui.delivStatus === '' ? ' selected' : ''}>Todas</option>
        </select>
        <span class="spacer"></span>
        <span class="muted small">${rows.length} entrega(s)</span>
      </div>
      <div class="table-wrap">
        ${rows.length ? `<table>
          <thead><tr><th>Cliente</th><th>Endereço</th><th>Cesta</th><th>Status</th><th></th></tr></thead>
          <tbody>${Object.entries(groups).map(([date, list]) => `
            <tr class="group"><td colspan="5">
              ${esc(Util.formatDate(date, { weekday: 'long', day: '2-digit', month: 'long' }))}${date === today ? ' · hoje' : ''}${date < today ? ' · <span style="color:var(--red)">passada</span>' : ''}
              <div class="pick-list" title="Lista de separação">${pickList(list)}</div>
            </td></tr>
            ${list.map((d) => {
              const c = clientById(d.clientId);
              const extras = (c?.extras || []).map((id) => Plan.extra(id)?.name).filter(Boolean);
              return `<tr class="${['entregue', 'cancelada'].includes(d.status) ? 'done' : ''}">
                <td><strong>${esc(c?.name || 'Cliente removido')}</strong><small>${esc(Util.formatPhone(c?.phone))}</small></td>
                <td>${esc(c?.address || '—')}<small>${esc(c?.neighborhood || '')}</small></td>
                <td>${c ? esc(Plan.size(c.size)?.name || '—') : '—'}<small>${esc(extras.join(', '))}${c?.notes ? ' · ⚠ ' + esc(c.notes) : ''}</small></td>
                <td>${statusSelect('delivery-status', d.id, d.status, DELIVERY_STATUS)}</td>
                <td class="actions">
                  ${c ? waBtn(c.phone, `Olá, ${first(c.name)}! Sua ${CONFIG.brand} sai para entrega ${date === today ? 'hoje' : 'em ' + Util.formatDate(date)} 🧺🚚`, 'Avisar cliente') : ''}
                  <button class="icon-btn" data-act="del-delivery" data-id="${esc(d.id)}" title="Excluir">🗑️</button>
                </td>
              </tr>`;
            }).join('')}`).join('')}
          </tbody>
        </table>` : `<p class="empty">Nenhuma entrega neste filtro.<br>Use <b>⚡ Gerar entregas</b> para criar a agenda dos clientes ativos.</p>`}
      </div>`;
  }

  /* =========================================================
     LEMBRETES
     ========================================================= */
  function reminderItem(r) {
    const today = todayISO();
    const late = !r.done && r.due < today;
    return `<li class="reminder${late ? ' late' : ''}${r.done ? ' done' : ''}">
      <input type="checkbox" data-act="toggle-rem" data-id="${esc(r.id)}"${r.done ? ' checked' : ''} aria-label="Concluir lembrete">
      <div class="grow">${esc(r.text)}<small>${r.ref ? esc(r.ref) + ' · ' : ''}<span class="due">${r.due === today ? 'hoje' : (late ? 'atrasado · ' : '') + Util.formatDate(r.due)}</span></small></div>
      <button class="icon-btn" data-act="del-rem" data-id="${esc(r.id)}" title="Excluir">🗑️</button>
    </li>`;
  }

  function renderReminders(el) {
    const pending = db.reminders.filter((r) => !r.done).sort((a, b) => a.due.localeCompare(b.due));
    const done = db.reminders.filter((r) => r.done).sort((a, b) => b.due.localeCompare(a.due)).slice(0, 20);
    const names = [...new Set([...db.clients, ...db.leads].map((x) => x.name))];
    el.innerHTML = `
      <form class="reminder-form panel" id="rem-form">
        <input name="text" required maxlength="140" placeholder="Ex.: Enviar link de pagamento, confirmar endereço…">
        <input name="due" type="date" required value="${todayISO()}">
        <input name="ref" list="ref-names" placeholder="Relacionado a (opcional)" maxlength="80">
        <datalist id="ref-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <button class="btn btn-primary">Adicionar</button>
      </form>
      <div class="panels">
        <div class="panel"><h2>Pendentes (${pending.length})</h2>
          ${pending.length ? `<ul class="list">${pending.map(reminderItem).join('')}</ul>` : '<p class="empty">Nenhum lembrete pendente ✨</p>'}
        </div>
        <div class="panel"><h2>Concluídos</h2>
          ${done.length ? `<ul class="list">${done.map(reminderItem).join('')}</ul>` : '<p class="empty">Nada concluído ainda.</p>'}
        </div>
      </div>`;
    $('#rem-form', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      db.reminders.push({ id: Store.uid(), text: fd.get('text').trim(), due: fd.get('due'), ref: fd.get('ref').trim(), done: false, createdAt: new Date().toISOString() });
      persist('Lembrete adicionado');
    });
  }

  /* =========================================================
     DADOS / CONFIGURAÇÕES
     ========================================================= */
  function renderSettings(el) {
    const placeholder = /^550+$/.test(CONFIG.whatsapp);
    el.innerHTML = `
      <div class="settings-grid">
        <div class="panel">
          <h2>WhatsApp de vendas</h2>
          <p>Número configurado em <code>js/shared.js</code>: <strong>${esc(Util.formatPhone(CONFIG.whatsapp))}</strong></p>
          ${placeholder ? '<p style="color:var(--red)"><b>⚠ Ainda é o número de exemplo.</b> Troque pelo seu antes de publicar.</p>' : ''}
        </div>
        <div class="panel">
          <h2>Backup</h2>
          <p>Os dados ficam no navegador (localStorage). Exporte com frequência e importe em outro computador.</p>
          <button class="btn" data-act="export-json">⬇ Exportar backup (JSON)</button>
          <label class="btn">⬆ Importar backup<input type="file" accept="application/json,.json" data-act="import-json" hidden></label>
        </div>
        <div class="panel">
          <h2>Planilhas</h2>
          <p>Arquivos CSV que abrem no Excel ou Google Sheets.</p>
          <button class="btn" data-act="csv-leads">⬇ Leads (CSV)</button>
          <button class="btn" data-act="csv-clients">⬇ Clientes (CSV)</button>
        </div>
        <div class="panel">
          <h2>Demonstração</h2>
          <p>Carrega leads, clientes, entregas e lembretes fictícios para apresentar o painel.</p>
          <button class="btn" data-act="seed">Carregar dados de exemplo</button>
        </div>
        <div class="panel">
          <h2>Acesso</h2>
          <p>O PIN é uma barreira simples neste navegador, não substitui login de verdade. Para trocar, redefina e crie outro ao entrar.</p>
          <button class="btn" data-act="reset-pin">Redefinir PIN</button>
        </div>
        <div class="panel">
          <h2>Zona de perigo</h2>
          <p>${db.leads.length} leads · ${db.clients.length} clientes · ${db.deliveries.length} entregas · ${db.reminders.length} lembretes</p>
          <button class="btn btn-danger" data-act="wipe">Apagar todos os dados</button>
        </div>
      </div>`;
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function toCSV(rows, cols) {
    const cell = (v) => {
      const s = String(v ?? '');
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + [cols.map((c) => c[0]).join(';'), ...rows.map((r) => cols.map((c) => cell(c[1](r))).join(';'))].join('\n');
  }
  const planCols = [
    ['Cesta', (r) => Plan.size(r.size)?.name], ['Frequência', (r) => Plan.freq(r.frequency)?.name], ['Dia', (r) => Plan.day(r.day)?.name],
    ['Preferências', (r) => (r.preferences || []).join(', ')], ['Extras', (r) => (r.extras || []).map((id) => Plan.extra(id)?.name).join(', ')],
    ['Observações', (r) => r.notes], ['Valor mensal', (r) => monthly(r).toFixed(2).replace('.', ',')],
  ];

  function seedDemo() {
    if ((db.leads.length || db.clients.length) && !confirm('Adicionar dados de exemplo aos dados que já existem?')) return;
    const t = Util.today();
    const iso = (n) => Util.toISO(Util.addDays(t, n));
    const ts = (n, h = 10) => { const d = Util.addDays(t, n); d.setHours(h, 12); return d.toISOString(); };
    const L = (name, phone, nb, size, frequency, day, extras, status, days, source = 'site', prefs = ['Frutas', 'Verduras']) =>
      ({ id: Store.uid(), createdAt: ts(-days, 9 + (days % 8)), name, phone, email: '', neighborhood: nb, size, frequency, day, preferences: prefs, extras, notes: '', status, source });
    const leads = [
      L('Mariana Duarte', '11987650001', 'Pinheiros', 'media', 'semanal', 4, ['ovos'], 'novo', 0),
      L('Rafael Nogueira', '11987650002', 'Vila Madalena', 'pequena', 'quinzenal', 6, [], 'novo', 1, 'whatsapp'),
      L('Beatriz Lemos', '11987650003', 'Perdizes', 'grande', 'semanal', 2, ['pao', 'mel'], 'contatado', 2),
      L('Thiago Freitas', '11987650004', 'Pinheiros', 'media', 'mensal', 4, [], 'negociando', 3, 'site', ['Legumes']),
      L('Camila Rocha', '11987650005', 'Butantã', 'pequena', 'semanal', 6, ['cafe'], 'perdido', 9),
    ];
    const C = (name, phone, nb, address, size, frequency, day, extras, payment, startDays, status = 'ativo') => ({
      id: Store.uid(), createdAt: ts(-startDays), name, phone, email: '', neighborhood: nb, address, size, frequency, day, preferences: ['Frutas', 'Legumes', 'Verduras'], extras, notes: '', status, payment, startDate: iso(-startDays),
    });
    const clients = [
      C('Juliana Prado', '11987650010', 'Pinheiros', 'R. dos Pinheiros, 1200 ap. 41', 'media', 'semanal', 4, ['ovos'], 'em_dia', 40),
      C('Felipe Andrade', '11987650011', 'Vila Madalena', 'R. Harmonia, 310', 'grande', 'semanal', 6, ['pao'], 'em_dia', 30),
      C('Ana Clara Souza', '11987650012', 'Perdizes', 'R. Cardoso de Almeida, 88 ap. 12', 'pequena', 'quinzenal', 2, [], 'pendente', 6),
      C('Lucas Martins', '11987650013', 'Butantã', 'Av. Corifeu, 950 casa 2', 'media', 'mensal', 4, ['mel', 'cafe'], 'em_dia', 20, 'pausado'),
    ];
    const converted = L('Ana Clara Souza', '11987650012', 'Perdizes', 'pequena', 'quinzenal', 2, [], 'convertido', 7);
    converted.clientId = clients[2].id;
    leads.push(converted);
    db.leads.push(...leads);
    db.clients.push(...clients);
    db.reminders.push(
      { id: Store.uid(), text: 'Enviar link de pagamento', due: iso(0), ref: 'Ana Clara Souza', done: false, createdAt: ts(-1) },
      { id: Store.uid(), text: 'Responder lead no WhatsApp', due: iso(-1), ref: 'Rafael Nogueira', done: false, createdAt: ts(-1) },
      { id: Store.uid(), text: 'Mandar lista da cesta da semana', due: iso(1), ref: '', done: false, createdAt: ts(0) },
      { id: Store.uid(), text: 'Ligar para produtor de ovos', due: iso(-3), ref: '', done: true, createdAt: ts(-4) },
    );
    // histórico: uma entrega passada já realizada
    const sinceThursday = ((t.getDay() - 4 + 7) % 7) || 7; // última quinta-feira antes de hoje
    db.deliveries.push({ id: Store.uid(), clientId: clients[0].id, date: iso(-sinceThursday), status: 'entregue', createdAt: ts(-sinceThursday - 1) });
    generateDeliveries(14);
    toast('Dados de exemplo carregados');
  }

  /* =========================================================
     MODAL LEAD / CLIENTE
     ========================================================= */
  const recDlg = $('#dlg-record');
  const recForm = $('#record-form');
  let editing = null; // { kind: 'lead'|'client', id }

  $('#sel-size').innerHTML = '<option value="">—</option>' + CONFIG.sizes.map((s) => `<option value="${s.id}">${esc(s.name)} · ${money(s.price)}</option>`).join('');
  $('#sel-frequency').innerHTML = '<option value="">—</option>' + CONFIG.frequencies.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  $('#sel-day').innerHTML = '<option value="">—</option>' + CONFIG.days.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  $('#chk-preferences').innerHTML = CONFIG.preferences.map((p) => `<label><input type="checkbox" name="preferences" value="${esc(p)}">${esc(p)}</label>`).join('');
  $('#chk-extras').innerHTML = CONFIG.extras.map((e) => `<label><input type="checkbox" name="extras" value="${e.id}">${esc(e.name)} (+${money(e.price)})</label>`).join('');
  $$('dialog button[value="cancel"]').forEach((b) => { b.formNoValidate = true; });

  function openRecord(kind, rec = {}, source = 'manual') {
    editing = { kind, id: rec.id || null, source };
    const isClient = kind === 'client';
    $('#record-title').textContent = (rec.id ? 'Editar ' : 'Novo ') + (isClient ? 'cliente' : 'lead');
    $$('.only-client', recForm).forEach((el) => { el.hidden = !isClient; });
    recForm.reset();
    const els = recForm.elements;
    ['name', 'email', 'neighborhood', 'address', 'size', 'frequency', 'notes'].forEach((k) => { if (els[k]) els[k].value = rec[k] || ''; });
    els.phone.value = Util.formatPhone(rec.phone || '');
    els.day.value = rec.day ?? '';
    els.status.value = rec.status && CLIENT_STATUS[rec.status] ? rec.status : 'ativo';
    els.payment.value = rec.payment || 'pendente';
    els.startDate.value = rec.startDate || todayISO();
    $$('input[name="preferences"]', recForm).forEach((i) => { i.checked = (rec.preferences || []).includes(i.value); });
    $$('input[name="extras"]', recForm).forEach((i) => { i.checked = (rec.extras || []).includes(i.value); });
    updateRecordTotal();
    recDlg.showModal();
    els.name.focus();
  }

  function readRecord() {
    const fd = new FormData(recForm);
    const g = (k) => (fd.get(k) || '').toString().trim();
    return {
      name: g('name'), phone: Util.digits(g('phone')), email: g('email'), neighborhood: g('neighborhood'),
      size: g('size'), frequency: g('frequency'), day: g('day') === '' ? '' : Number(g('day')),
      preferences: fd.getAll('preferences'), extras: fd.getAll('extras'), notes: g('notes'),
      address: g('address'), status: g('status'), payment: g('payment'), startDate: g('startDate'),
    };
  }

  function updateRecordTotal() {
    const c = Plan.calc(readRecord());
    $('#record-total').textContent = c ? `${money(c.perDelivery)} por entrega · ${money(c.monthly)}/mês` : '';
  }
  recForm.addEventListener('change', updateRecordTotal);

  recForm.addEventListener('submit', (ev) => {
    if (ev.submitter?.value !== 'save') return; // cancelar fecha normalmente
    ev.preventDefault();
    const data = readRecord();
    if (!data.name || data.phone.length < 10) {
      toast('Informe nome e um WhatsApp com DDD');
      (data.name ? recForm.elements.phone : recForm.elements.name).focus();
      return;
    }
    if (editing.kind === 'lead') {
      const { address, status, payment, startDate, ...lead } = data;
      lead.monthly = monthly(lead);
      if (editing.id) Object.assign(db.leads.find((l) => l.id === editing.id), lead);
      else db.leads.unshift({ id: Store.uid(), createdAt: new Date().toISOString(), status: 'novo', source: editing.source, ...lead });
    } else {
      if (editing.id) Object.assign(clientById(editing.id), data);
      else db.clients.unshift({ id: Store.uid(), createdAt: new Date().toISOString(), ...data });
    }
    recDlg.close();
    persist(editing.id ? 'Alterações salvas' : 'Cadastro criado');
  });

  function convertLead(id) {
    const lead = db.leads.find((l) => l.id === id);
    if (!lead) return;
    const existing = lead.clientId && clientById(lead.clientId);
    if (existing) { setView('clients'); openRecord('client', existing); return; }
    const client = {
      id: Store.uid(), createdAt: new Date().toISOString(),
      name: lead.name, phone: lead.phone, email: lead.email, neighborhood: lead.neighborhood, address: '',
      size: lead.size, frequency: lead.frequency, day: lead.day, preferences: lead.preferences || [], extras: lead.extras || [],
      notes: lead.notes, status: 'ativo', payment: 'pendente', startDate: todayISO(), leadId: lead.id,
    };
    db.clients.unshift(client);
    lead.status = 'convertido';
    lead.clientId = client.id;
    db.reminders.push({ id: Store.uid(), text: 'Enviar link de pagamento', due: todayISO(), ref: client.name, done: false, createdAt: new Date().toISOString() });
    persist(`${first(client.name)} agora é cliente! Complete o endereço.`);
    setView('clients');
    openRecord('client', client);
  }

  /* ---------- importar mensagem do WhatsApp ---------- */
  const impDlg = $('#dlg-import');
  $('#import-form').addEventListener('submit', (ev) => {
    if (ev.submitter?.value !== 'import') return;
    ev.preventDefault();
    const parsed = Plan.parseWhatsappMessage(ev.target.elements.text.value);
    if (!parsed) { $('#import-err').textContent = 'Não encontrei a linha "Nome: ..." na mensagem.'; return; }
    impDlg.close();
    openRecord('lead', parsed, 'whatsapp');
  });


  /* =========================================================
     EVENTOS (delegação)
     ========================================================= */
  document.addEventListener('click', (ev) => {
    const goto = ev.target.closest('[data-goto]');
    if (goto) { setView(goto.dataset.goto); return; }
    const btn = ev.target.closest('[data-act]');
    if (!btn || btn.tagName === 'INPUT' && btn.type === 'file') return;
    const id = btn.dataset.id;
    switch (btn.dataset.act) {
      case 'new-lead': openRecord('lead'); break;
      case 'new-client': openRecord('client'); break;
      case 'import-wa':
        $('#import-form').reset();
        $('#import-err').textContent = '';
        impDlg.showModal();
        break;
      case 'edit-lead': openRecord('lead', db.leads.find((l) => l.id === id)); break;
      case 'edit-client': openRecord('client', clientById(id)); break;
      case 'convert': convertLead(id); break;
      case 'del-lead':
        if (confirm('Excluir este lead?')) { db.leads = db.leads.filter((l) => l.id !== id); persist('Lead excluído'); }
        break;
      case 'del-client':
        if (confirm('Excluir este cliente e as entregas dele?')) {
          db.clients = db.clients.filter((c) => c.id !== id);
          db.deliveries = db.deliveries.filter((d) => d.clientId !== id);
          persist('Cliente excluído');
        }
        break;
      case 'generate': generateDeliveries(14); break;
      case 'del-delivery': db.deliveries = db.deliveries.filter((d) => d.id !== id); persist('Entrega removida'); break;
      case 'toggle-rem': {
        const r = db.reminders.find((x) => x.id === id);
        if (r) { r.done = btn.checked; persist(r.done ? 'Lembrete concluído ✔' : 'Lembrete reaberto'); }
        break;
      }
      case 'del-rem': db.reminders = db.reminders.filter((r) => r.id !== id); persist(); break;
      case 'seed': seedDemo(); break;
      case 'export-json': download(`cesta-viva-backup-${todayISO()}.json`, JSON.stringify(db, null, 2), 'application/json'); break;
      case 'csv-leads':
        download(`leads-${todayISO()}.csv`, toCSV(db.leads, [
          ['Data', (r) => Util.formatDate(r.createdAt, { day: '2-digit', month: '2-digit', year: 'numeric' })], ['Nome', (r) => r.name],
          ['WhatsApp', (r) => Util.formatPhone(r.phone)], ['E-mail', (r) => r.email], ['Bairro', (r) => r.neighborhood],
          ...planCols, ['Origem', (r) => r.source], ['Status', (r) => LEAD_STATUS[r.status]],
        ]), 'text/csv;charset=utf-8');
        break;
      case 'csv-clients':
        download(`clientes-${todayISO()}.csv`, toCSV(db.clients, [
          ['Nome', (r) => r.name], ['WhatsApp', (r) => Util.formatPhone(r.phone)], ['E-mail', (r) => r.email],
          ['Endereço', (r) => r.address], ['Bairro', (r) => r.neighborhood], ...planCols,
          ['Pagamento', (r) => PAYMENT[r.payment]], ['Status', (r) => CLIENT_STATUS[r.status]], ['Início', (r) => r.startDate],
        ]), 'text/csv;charset=utf-8');
        break;
      case 'reset-pin':
        if (confirm('Redefinir o PIN? Você vai criar um novo no próximo acesso.')) {
          storage.del(localStorage, PIN_KEY);
          storage.del(sessionStorage, AUTH_KEY);
          showGate();
        }
        break;
      case 'wipe':
        if (confirm('Apagar TODOS os leads, clientes, entregas e lembretes deste navegador? Exporte um backup antes. Essa ação não pode ser desfeita.')) {
          db = Store.empty();
          persist('Dados apagados');
        }
        break;
      default: break;
    }
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches('[data-filter]')) { ui[t.dataset.filter] = t.value; renderAll(); return; }
    if (t.matches('input[type="file"][data-act="import-json"]')) { importJSON(t.files[0]); t.value = ''; return; }
    if (!t.matches('select[data-field]')) return;
    const id = t.dataset.id;
    const v = t.value;
    switch (t.dataset.field) {
      case 'lead-status': {
        const l = db.leads.find((x) => x.id === id);
        if (!l) return;
        if (v === 'convertido' && !l.clientId) { convertLead(id); return; }
        l.status = v;
        persist('Status do lead atualizado');
        break;
      }
      case 'client-status': clientById(id).status = v; persist('Status do cliente atualizado'); break;
      case 'client-payment': clientById(id).payment = v; persist('Pagamento atualizado'); break;
      case 'delivery-status': {
        const d = db.deliveries.find((x) => x.id === id);
        if (d) { d.status = v; persist(v === 'entregue' ? 'Entrega concluída 🧺' : 'Entrega atualizada'); }
        break;
      }
      default: break;
    }
  });

  // busca com digitação (sem perder o foco)
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!t.matches('input[type="search"][data-filter]')) return;
    ui[t.dataset.filter] = t.value;
    const pos = t.selectionStart;
    renderAll();
    const again = $(`input[data-filter="${t.dataset.filter}"]`);
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });

  function importJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.leads) || !Array.isArray(data.clients)) throw new Error('formato');
        if (!confirm(`Substituir os dados atuais por este backup (${data.leads.length} leads, ${data.clients.length} clientes)?`)) return;
        db = Object.assign(Store.empty(), data);
        persist('Backup importado');
      } catch (e) {
        toast('Arquivo inválido: não é um backup da Cesta Viva');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- início ---------- */
  if (storage.get(sessionStorage, AUTH_KEY) === '1' && storage.get(localStorage, PIN_KEY)) enterApp();
  else showGate();
})();
