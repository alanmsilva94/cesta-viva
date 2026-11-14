/* =========================================================
   Cesta Viva — landing page e formulário "Monte seu plano"
   ========================================================= */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const { esc, money } = Util;

  const form = $('#plan-form');

  /* ---------- links de WhatsApp genéricos ---------- */
  const helloLink = Util.waLink(CONFIG.whatsapp, `Olá, ${CONFIG.brand}! Quero saber mais sobre a assinatura de cestas.`);
  $('#wa-float').href = helloLink;
  $('#footer-wa').href = helloLink;

  /* ---------- menu mobile ---------- */
  const toggle = $('.nav-toggle');
  const menu = $('#menu');
  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  $$('#menu a').forEach((a) => a.addEventListener('click', () => {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }));

  /* ---------- cards de planos ---------- */
  $('#plan-cards').innerHTML = CONFIG.sizes.map((s) => `
    <article class="plan${s.featured ? ' featured' : ''}">
      ${s.featured ? '<span class="badge">Mais escolhida</span>' : ''}
      <h3>${esc(s.name)}</h3>
      <p class="people">${esc(s.people)}</p>
      <div class="price">${money(s.price)} <small>/ entrega</small></div>
      <ul>
        <li>${esc(s.weight)} de alimentos</li>
        <li>${esc(s.items)} da estação</li>
        <li>Troque até 2 itens por entrega</li>
      </ul>
      <a href="#montar" class="btn ${s.featured ? '' : 'btn-ghost'}" data-pick="${esc(s.id)}">Escolher ${esc(s.name)}</a>
    </article>`).join('');

  $$('[data-pick]').forEach((a) => a.addEventListener('click', () => {
    const input = form.querySelector(`input[name="size"][value="${a.dataset.pick}"]`);
    if (input) { input.checked = true; updateSummary(); }
  }));

  /* ---------- opções do formulário ---------- */
  const choice = (name, value, title, sub, checked) => `
    <div class="choice">
      <input type="radio" name="${name}" id="${name}-${value}" value="${esc(value)}"${checked ? ' checked' : ''}>
      <label for="${name}-${value}"><strong>${esc(title)}</strong>${sub ? `<small>${sub}</small>` : ''}</label>
    </div>`;

  $('#f-size').innerHTML = CONFIG.sizes.map((s) =>
    choice('size', s.id, s.name, `${esc(s.people)}<br>${money(s.price)} / entrega`, s.featured)).join('');
  $('#f-frequency').innerHTML = CONFIG.frequencies.map((f) =>
    choice('frequency', f.id, f.name, esc(f.label), f.id === 'semanal')).join('');
  $('#f-day').innerHTML = CONFIG.days.map((d) => choice('day', d.id, d.name, '')).join('');
  $('#f-preferences').innerHTML = CONFIG.preferences.map((p) => `
    <label class="chip"><input type="checkbox" name="preferences" value="${esc(p)}"><span>${esc(p)}</span></label>`).join('');
  $('#f-extras').innerHTML = CONFIG.extras.map((e) => `
    <label class="extra"><input type="checkbox" name="extras" value="${esc(e.id)}"><span>${esc(e.name)}</span><b>+ ${money(e.price)}</b></label>`).join('');

  /* ---------- leitura do formulário ---------- */
  function readForm() {
    const fd = new FormData(form);
    return {
      size: fd.get('size') || '',
      frequency: fd.get('frequency') || '',
      day: fd.get('day') ?? '',
      preferences: fd.getAll('preferences'),
      extras: fd.getAll('extras'),
      notes: (fd.get('notes') || '').trim(),
      name: (fd.get('name') || '').trim(),
      phone: Util.digits(fd.get('phone')),
      email: (fd.get('email') || '').trim(),
      neighborhood: (fd.get('neighborhood') || '').trim(),
      consent: fd.get('consent') === 'on',
    };
  }

  /* ---------- resumo ao vivo ---------- */
  function updateSummary() {
    const data = readForm();
    const c = Plan.calc(data);
    const body = $('#summary-body');
    if (!c) {
      body.innerHTML = '<p class="muted">Escolha o tamanho e a frequência para ver o valor.</p>';
      return;
    }
    const s = Plan.size(data.size);
    const f = Plan.freq(data.frequency);
    const d = Plan.day(data.day);
    const extras = data.extras.map((id) => Plan.extra(id));
    const full = (s.price + c.extrasTotal) * f.perMonth;
    body.innerHTML = `
      <dl>
        <dt>Cesta</dt><dd>${esc(s.name)} · ${esc(s.people)}</dd>
        <dt>Frequência</dt><dd>${esc(f.name)}</dd>
        <dt>Entrega</dt><dd>${d ? esc(d.name) : '<span style="opacity:.6">a escolher</span>'}</dd>
        ${extras.map((e) => `<dt>+ ${esc(e.name)}</dt><dd>${money(e.price)}</dd>`).join('')}
      </dl>
      <hr>
      <div class="total"><span>Por entrega</span><strong>${money(c.perDelivery)}</strong></div>
      <p class="monthly">${c.deliveries} entrega${c.deliveries > 1 ? 's' : ''}/mês ≈ <strong>${money(c.monthly)}</strong></p>
      ${c.discount ? `<span class="save">Você economiza ${money(full - c.monthly)}/mês</span>` : ''}`;
  }
  form.addEventListener('change', updateSummary);
  updateSummary();

  /* ---------- máscara de telefone ---------- */
  const phoneInput = form.elements.phone;
  phoneInput.addEventListener('input', () => {
    const d = Util.digits(phoneInput.value).slice(0, 11);
    let out = d;
    if (d.length > 2) out = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) out = `(${d.slice(0, 2)}) ${d.slice(2, d.length === 11 ? 7 : 6)}-${d.slice(d.length === 11 ? 7 : 6)}`;
    phoneInput.value = out;
  });

  /* ---------- validação ---------- */
  function validate(data) {
    const errors = [];
    const mark = (el, bad) => el && el.setAttribute('aria-invalid', bad ? 'true' : 'false');
    if (!data.size) errors.push('o tamanho da cesta');
    if (!data.frequency) errors.push('a frequência');
    if (data.day === '') errors.push('o dia de entrega');
    mark(form.elements.name, !data.name);
    if (!data.name) errors.push('seu nome');
    const phoneOk = data.phone.length === 10 || data.phone.length === 11;
    mark(phoneInput, !phoneOk);
    if (!phoneOk) errors.push('um WhatsApp válido com DDD');
    const emailOk = !data.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
    mark(form.elements.email, !emailOk);
    if (!emailOk) errors.push('um e-mail válido (ou deixe em branco)');
    mark(form.elements.neighborhood, !data.neighborhood);
    if (!data.neighborhood) errors.push('seu bairro');
    if (!data.consent) errors.push('o aceite de contato pelo WhatsApp');
    return errors;
  }

  /* ---------- envio ---------- */
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = readForm();
    const errors = validate(data);
    const box = $('#form-error');
    if (errors.length) {
      box.textContent = `Falta informar: ${errors.join(', ')}.`;
      box.hidden = false;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    box.hidden = true;

    const { consent, ...lead } = data;
    lead.day = Number(lead.day);
    const c = Plan.calc(lead);
    lead.monthly = c ? Math.round(c.monthly * 100) / 100 : 0;
    const saved = Store.addLead(lead);
    sendWebhook(saved);

    const link = Util.waLink(CONFIG.whatsapp, Plan.whatsappMessage(saved));
    $('#success-name').textContent = saved.name.split(' ')[0];
    $('#success-wa').href = link;
    form.closest('.builder').hidden = true;
    const ok = $('#success');
    ok.hidden = false;
    ok.focus();
    ok.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.open(link, '_blank', 'noopener');
  });

  $('#success-back').addEventListener('click', () => {
    form.reset();
    $('#success').hidden = true;
    form.closest('.builder').hidden = false;
    updateSummary();
    $('#montar').scrollIntoView({ behavior: 'smooth' });
  });

  /* Envio opcional para um webhook (Google Sheets, n8n, Make...). */
  function sendWebhook(lead) {
    if (!CONFIG.leadWebhookUrl) return;
    fetch(CONFIG.leadWebhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(lead),
    }).catch((e) => console.warn('Webhook falhou', e));
  }
})();
