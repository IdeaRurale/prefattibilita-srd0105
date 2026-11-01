const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'script applicativo presente');

function browser() {
  const elements = new Map();
  for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [, tag, attrs, id] = match;
    const body = tag === 'select' ? html.slice(match.index + match[0].length, html.indexOf('</select>', match.index)) : '';
    const type = /type="([^"]+)"/.exec(attrs)?.[1] || tag;
    const value = /value="([^"]*)"/.exec(attrs)?.[1] || (tag === 'select' ? /<option\b[^>]*value="([^"]*)"/.exec(body)?.[1] || '' : '');
    elements.set(id, element(id, type, value));
  }
  function element(id, type = 'div', value = '') {
    return { id, type, value, checked:false, disabled:false, textContent:'', innerHTML:'',
      style:{}, className:'', classList:{add(){},remove(){}}, scrollIntoView(){} };
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    querySelectorAll() { return [...elements.values()].filter(el => ['input','select','textarea','checkbox','date','number','text','file'].includes(el.type)); },
  };
  document.getElementById('comparto').value = 'ALTRO';
  const context = vm.createContext({document,console,setTimeout,Intl,Date});
  vm.runInContext(script, context, {filename:'index.html'});
  return {
    el:id=>document.getElementById(id),
    run:code=>vm.runInContext(code,context),
    async load(data) { await vm.runInContext('apriPratica',context)({name:'pratica.json',text:async()=>JSON.stringify(data)}); },
  };
}


const sogSrl = { societa:true, rl:{ nome:'ROSSI MARIA' } };
const inpBase = { ditta:'SOC. AGR. ESEMPIO SRL', cuaa:'01234567890', psTotale:100000, giaAmmesso:0, p4:{}, p6:0, p8cant:0, p8fin:0 };

test('dichiarazione: elenca solo i requisiti effettivamente dichiarati', () => {
  const app = browser();
  const el = app.run(`elementiDichiarati(${JSON.stringify({ ...inpBase, p4:{ cdiap:true, coop:true, nuovo:true }, p8cant:4, p8fin:4 })}, ${JSON.stringify(sogSrl)}, false, true, [], [])`);
  const testo = el.join(' | ');
  assert.match(testo, /oltre il 50% del capitale.*donne/);
  assert.match(testo, /IAP della società/);
  assert.match(testo, /OP/);
  assert.match(testo, /non essere già stato ammesso agli aiuti SRD01/);
  assert.match(testo, /non necessita di titoli abilitativi/);
  assert.match(testo, /giacenza media annua/);
  assert.doesNotMatch(testo, /biologic|Lavoro Agricolo|mutuo|SRA/);
});

test('dichiarazione: conferme irrigue e particelle dell\'intervento', () => {
  const app = browser();
  const voci = [{ cat:'IRR', particelle:['GALLIPOLI|34|141'], irrigazione:{ confermaTecnico:{ classificazione:true, titolo:true, particelle:false, parametri:false, contatore:true } } }];
  const particelle = [{ comune:'GALLIPOLI', foglio:'34', particella:'141', forma:'Proprietà', supHa:36.1463 }];
  const testo = app.run(`elementiDichiarati(${JSON.stringify(inpBase)}, ${JSON.stringify(sogSrl)}, false, false, ${JSON.stringify(voci)}, ${JSON.stringify(particelle)})`).join(' | ');
  assert.match(testo, /assenza di impianti irrigui esistenti sulle particelle servite; titolo idrico valido.*contatore/);
  assert.doesNotMatch(testo, /senza estensione/);
  assert.match(testo, /GALLIPOLI fg\. 34 p\. 141 in proprietà/);
});

test('dichiarazione: intestazione, punti con approvazione specifica e testo escapato', () => {
  const app = browser();
  const h = app.run(`dichiarazioneRichiedenteHTML(${JSON.stringify({ ...inpBase, ditta:'A <B> SRL' })}, ${JSON.stringify(sogSrl)}, false, false, [], [])`);
  assert.match(h, /ROSSI MARIA, in qualità di legale rappresentante di A &lt;B&gt; SRL/);
  for (const t of ['Veridicità e completezza', 'senza verifica documentale', 'mandato al tecnico', 'Presa d\'atto', 'Obbligo di aggiornamento', 'Manleva', 'Trattamento dei dati']) assert.ok(h.includes(t), t);
  assert.equal((h.match(/<li><b>/g) || []).length, 7);
});

test('documenti: a carico della ditta, senza quelli redatti dal tecnico, coerenti con i requisiti dichiarati', () => {
  const app = browser();
  const inp = { ...inpBase, p4:{ cdiap:true, coop:true, nuovo:true }, p8cant:4, p8fin:4 };
  const voci = [{ cat:'ARB', particelle:['GALLIPOLI|34|141'] }, { cat:'IRR', particelle:['GALLIPOLI|34|141'] }];
  const particelle = [{ comune:'GALLIPOLI', foglio:'34', particella:'141', forma:'Proprietà', supHa:36.1463 }];
  const docs = app.run(`documentiDaConsegnare(${JSON.stringify(inp)}, ${JSON.stringify(sogSrl)}, false, true, ${JSON.stringify(voci)}, ${JSON.stringify(particelle)}, ['DOC01','DOC04','DOC05','DOC06','DOC07','DOC11','DOC12','DOC15','DOC19','DOC20','DOC23'])`);
  const testo = docs.map(d => d.doc + ' [' + d.rif + ']').join(' | ');
  for (const atteso of [/Visura camerale.*quote del capitale.*\[CR01, criterio 4\.1\]/, /fg\. 34 p\. 141.*\[CR32\]/, /emungimento/, /Tre preventivi/, /giacenza media/, /qualifica CD o IAP/, /conferimenti degli ultimi tre anni/, /domande SRD01/, /non servono titoli abilitativi/, /coefficiente di variazione/, /contatore/, /DURC/]) assert.match(testo, atteso);
  assert.doesNotMatch(testo, /Relazione Tecnica|Elaborati grafici|Quadro Economico|Proposta professionale/, 'documenti del tecnico esclusi');
  assert.equal(docs.filter(d => /qualifica CD o IAP/.test(d.doc)).length, 1, 'IAP non duplicato');
  assert.equal(docs.filter(d => /giacenza media/.test(d.doc)).length, 1, 'giacenza non duplicata');
  assert.equal(docs.filter(d => /conferiment/.test(d.doc)).length, 1, 'conferimenti non duplicati');
});

test('documenti: la tabella con la colonna di consegna è nella dichiarazione', () => {
  const app = browser();
  const h = app.run(`dichiarazioneRichiedenteHTML(${JSON.stringify(inpBase)}, ${JSON.stringify(sogSrl)}, false, false, [], [], ['DOC01'])`);
  assert.match(h, /Documento a carico del richiedente/);
  assert.match(h, /Consegnato il/);
  assert.match(h, /entro il _+/);
});
