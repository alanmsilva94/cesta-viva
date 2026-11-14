/* =========================================================
   Store — "banco de dados" do MVP no localStorage do navegador.
   Simples de propósito: troque por Supabase/Firebase quando a tese se confirmar.
   ========================================================= */
'use strict';

const Store = (() => {
  const KEY = 'cestaviva:db:v1';
  const empty = () => ({ leads: [], clients: [], deliveries: [], reminders: [] });

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      return Object.assign(empty(), raw || {});
    } catch (e) {
      return empty();
    }
  }

  function save(db) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      console.warn('Não foi possível salvar no localStorage', e);
      return false;
    }
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function addLead(lead) {
    const db = load();
    const record = { id: uid(), createdAt: new Date().toISOString(), status: 'novo', source: 'site', ...lead };
    db.leads.unshift(record);
    db.reminders.push({
      id: uid(),
      text: `Responder lead ${record.name} no WhatsApp`,
      due: Util.toISO(Util.today()),
      ref: record.name,
      done: false,
      createdAt: record.createdAt,
    });
    save(db);
    return record;
  }

  return { KEY, empty, load, save, uid, addLead };
})();
