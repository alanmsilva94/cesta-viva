/* =========================================================
   Cesta Viva — configuração e funções compartilhadas
   Edite o CONFIG para adaptar o MVP ao SEU negócio.
   ========================================================= */
'use strict';

const CONFIG = {
  brand: 'Cesta Viva',
  // Número que recebe os pedidos: DDI + DDD + número, só dígitos.
  // ⚠️ Troque pelo seu antes de publicar.
  whatsapp: '5500000000000',
  // Opcional: URL de um webhook (Google Apps Script, Make, n8n...) que recebe
  // cada lead em JSON. Deixe vazio para não enviar a lugar nenhum.
  leadWebhookUrl: '',
  sizes: [
    { id: 'pequena', name: 'Pequena', people: '1–2 pessoas', weight: '~5 kg', items: '10–12 itens', price: 79 },
    { id: 'media', name: 'Média', people: '3–4 pessoas', weight: '~8 kg', items: '14–16 itens', price: 119, featured: true },
    { id: 'grande', name: 'Grande', people: '5+ pessoas', weight: '~12 kg', items: '18–22 itens', price: 159 },
  ],
  frequencies: [
    { id: 'semanal', name: 'Semanal', perMonth: 4, interval: 7, discount: 0.10, label: '4 entregas/mês · 10% off' },
    { id: 'quinzenal', name: 'Quinzenal', perMonth: 2, interval: 14, discount: 0.05, label: '2 entregas/mês · 5% off' },
    { id: 'mensal', name: 'Mensal', perMonth: 1, interval: 28, discount: 0, label: '1 entrega/mês' },
  ],
  extras: [
    { id: 'ovos', name: 'Ovos caipira (dúzia)', price: 18 },
    { id: 'pao', name: 'Pão de fermentação natural', price: 22 },
    { id: 'mel', name: 'Mel silvestre 300 g', price: 25 },
    { id: 'cafe', name: 'Café especial 250 g', price: 34 },
  ],
  preferences: ['Frutas', 'Legumes', 'Verduras', 'Temperos e ervas'],
  days: [
    { id: 2, name: 'Terça' },
    { id: 4, name: 'Quinta' },
    { id: 6, name: 'Sábado' },
  ],
};

/* ---------- utilidades ---------- */
const Util = {
  money(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },
  esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  digits(str) {
    return String(str ?? '').replace(/\D/g, '');
  },
  // Normaliza para o formato do wa.me (55 + DDD + número)
  waNumber(phone) {
    let d = Util.digits(phone);
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return d;
  },
  formatPhone(phone) {
    let d = Util.digits(phone);
    if (d.startsWith('55') && d.length > 11) d = d.slice(2);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return phone || '';
  },
  waLink(phone, text) {
    return `https://wa.me/${Util.waNumber(phone)}?text=${encodeURIComponent(text || '')}`;
  },
  // Datas no formato local AAAA-MM-DD (sem fuso)
  toISO(d) {
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  },
  fromISO(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  },
  today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  },
  addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  },
  daysBetween(isoA, isoB) {
    return Math.round((Util.fromISO(isoB) - Util.fromISO(isoA)) / 86400000);
  },
  formatDate(iso, opts = { day: '2-digit', month: '2-digit' }) {
    if (!iso) return '—';
    // 'AAAA-MM-DD' = data local; timestamp completo = converte do UTC para o fuso local
    const d = String(iso).length > 10 ? new Date(iso) : Util.fromISO(iso);
    return d.toLocaleDateString('pt-BR', opts);
  },
};

/* ---------- regras do plano ---------- */
const Plan = {
  size: (id) => CONFIG.sizes.find((s) => s.id === id),
  freq: (id) => CONFIG.frequencies.find((f) => f.id === id),
  day: (id) => CONFIG.days.find((d) => String(d.id) === String(id)),
  extra: (id) => CONFIG.extras.find((e) => e.id === id),

  calc({ size, frequency, extras = [] }) {
    const s = Plan.size(size);
    const f = Plan.freq(frequency);
    if (!s || !f) return null;
    const basket = s.price * (1 - f.discount);
    const extrasTotal = extras.reduce((t, id) => t + (Plan.extra(id)?.price || 0), 0);
    const perDelivery = basket + extrasTotal;
    return { basket, extrasTotal, perDelivery, monthly: perDelivery * f.perMonth, discount: f.discount, deliveries: f.perMonth };
  },

  describe(p) {
    const s = Plan.size(p.size);
    const f = Plan.freq(p.frequency);
    return [s ? `Cesta ${s.name}` : '', f ? f.name.toLowerCase() : ''].filter(Boolean).join(' · ') || '—';
  },

  /* Mensagem do WhatsApp com os dados do formulário (rótulo: valor por linha).
     O painel consegue ler essa mesma mensagem de volta (Importar do WhatsApp). */
  whatsappMessage(lead) {
    const s = Plan.size(lead.size);
    const f = Plan.freq(lead.frequency);
    const d = Plan.day(lead.day);
    const c = Plan.calc(lead);
    const extras = (lead.extras || []).map((id) => Plan.extra(id)?.name).filter(Boolean);
    const lines = [
      `Olá, ${CONFIG.brand}! Quero assinar a cesta 🧺`,
      '',
      `Nome: ${lead.name}`,
      `WhatsApp: ${Util.formatPhone(lead.phone)}`,
      lead.email ? `E-mail: ${lead.email}` : null,
      `Bairro: ${lead.neighborhood || '-'}`,
      `Cesta: ${s ? `${s.name} (${s.people})` : '-'}`,
      `Frequência: ${f ? f.name : '-'}`,
      `Dia de entrega: ${d ? d.name : '-'}`,
      `Preferências: ${(lead.preferences || []).join(', ') || 'Sem preferência'}`,
      `Extras: ${extras.join(', ') || 'Nenhum'}`,
      lead.notes ? `Restrições: ${lead.notes}` : null,
      c ? `Valor por entrega: ${Util.money(c.perDelivery)}` : null,
      c ? `Estimativa mensal: ${Util.money(c.monthly)}` : null,
    ];
    return lines.filter((l) => l !== null).join('\n');
  },

  parseWhatsappMessage(text) {
    const map = {};
    String(text).split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*\*?([^:*]+?)\*?\s*:\s*(.*)$/);
      if (m) map[m[1].trim().toLowerCase()] = m[2].trim();
    });
    const findByName = (list, value) =>
      list.find((x) => value && value.toLowerCase().startsWith(x.name.toLowerCase()));
    const list = (v) => (v ? v.split(/\s*,\s*/).filter(Boolean) : []);
    const lead = {
      name: map['nome'] || '',
      phone: Util.digits(map['whatsapp'] || map['telefone'] || ''),
      email: map['e-mail'] || map['email'] || '',
      neighborhood: map['bairro'] || '',
      size: findByName(CONFIG.sizes, map['cesta'])?.id || '',
      frequency: findByName(CONFIG.frequencies, map['frequência'] || map['frequencia'])?.id || '',
      day: findByName(CONFIG.days, map['dia de entrega'])?.id ?? '',
      preferences: list(map['preferências'] || map['preferencias']).filter((p) => CONFIG.preferences.includes(p)),
      extras: list(map['extras']).map((n) => findByName(CONFIG.extras, n)?.id).filter(Boolean),
      notes: map['restrições'] || map['restricoes'] || '',
    };
    return lead.name ? lead : null;
  },
};
