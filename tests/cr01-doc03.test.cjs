const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'script applicativo presente');

function browser() {
  const elements = new Map();
  for (const match of html.matchAll(/<(input|select)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [, tag, attrs, id] = match;
    const body = tag === 'select' ? html.slice(match.index + match[0].length, html.indexOf('</select>', match.index)) : '';
    const type = /type="([^"]+)"/.exec(attrs)?.[1] || tag;
    const value = /value="([^"]*)"/.exec(attrs)?.[1] || (tag === 'select' ? /<option\b[^>]*value="([^"]*)"/.exec(body)?.[1] || '' : '');
    elements.set(id, element(id, type, value));
  }
  function element(id, type = 'div', value = '') {
    return {
      id, type, value, checked: false, disabled: false, textContent: '', innerHTML: '',
      style: {}, className: '', classList: { add() {}, remove() {} }, scrollIntoView() {},
    };
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    querySelectorAll() { return [...elements.values()].filter(el => el.type === 'input' || el.type === 'select' || el.type === 'checkbox' || el.type === 'date' || el.type === 'number' || el.type === 'text' || el.type === 'file'); },
  };
  document.getElementById('comparto').value = 'ALTRO';
  const context = vm.createContext({ document, console, setTimeout, Intl, Date });
  vm.runInContext(script, context, { filename: 'index.html' });
  return {
    el: id => document.getElementById(id),
    run: code => vm.runInContext(code, context),
    calculate() { vm.runInContext('calcola([])', context); return vm.runInContext('ultimoEsito', context); },
    async loadFile(file) { await vm.runInContext('apriPratica', context)(file); },
    async load(data) { await vm.runInContext('apriPratica', context)({ name: 'legacy.json', text: async () => JSON.stringify(data) }); },
    async importPdf(text) {
      context.mockPdfText = text;
      vm.runInContext(`
        leggiBytesFile = async () => new Uint8Array([1]);
        caricaPdfJs = async () => ({});
        apriPdfConFallback = async () => ({ numPages: 1, getPage: async () => ({
          getTextContent: async () => ({ items: mockPdfText.split('\\n').map(str => ({ str })) })
        }) });
      `, context);
      await vm.runInContext('importaFascicolo', context)({ name: 'fascicolo.pdf', type: 'application/pdf' });
    },
  };
}

function criterion(result) { return result.killerCriteria.find(item => item.cod === 'CR01'); }
function doc03(result) { return result.documenti.find(item => item.cod === 'DOC03'); }
function otherKillerCriteriaConforming(app) {
  app.el('psTotale').value = '20000';
  app.el('costoTot').value = '50000';
}
function cr01Cell(app) {
  const html = app.el('report').innerHTML;
  const match = html.match(/<tr><td><b>CR01<\/b><\/td><td>[^<]*<\/td>\s*<td class="[^"]*">([^<]+)<\/td>/);
  assert.ok(match, 'cella CR01 nel report');
  return match[1];
}

for (const [conduzione, expected] of [
  ['', 'NON VERIFICABILE'],
  ['DICHIARATA', 'DA VERIFICARE'],
  ['VERIFICATA', 'CONFORME'],
  ['NON_CONDUZIONE', 'NON CONFORME'],
  ['DUBBIA', 'VALUTAZIONE AGRONOMO'],
]) {
  test(`CR01 cooperativa ${conduzione || 'non documentata'} → ${expected}`, () => {
    const app = browser();
    app.el('soggettivita').value = 'COOP';
    app.el('coopConduzione').value = conduzione;
    const result = app.calculate();
    assert.equal(criterion(result).stato, expected);
    assert.equal(cr01Cell(app), expected);
  });
}

for (const soggettivita of ['OP', 'RETE']) {
  for (const conduzione of ['', 'VERIFICATA', 'NON_CONDUZIONE']) {
    test(`CR01 ${soggettivita} + forma cooperativa ignora conduzione ${conduzione || 'vuota'}`, () => {
      const app = browser();
      app.el('soggettivita').value = soggettivita;
      app.el('genere').value = 'NA';
      app.el('tipoSoc').value = 'COOP';
      app.el('coopConduzione').value = conduzione;
      otherKillerCriteriaConforming(app);
      app.run('aggiornaSoggetto()');
      assert.equal(app.el('coopConduzioneBox').style.display, 'none');
      const result = app.calculate();
      assert.equal(criterion(result).stato, 'CONFORME');
      assert.equal(cr01Cell(app), 'CONFORME');
      assert.equal(result.esito, 'DA RIVEDERE');
      assert.ok(doc03(result), 'la forma societaria resta disponibile per DOC03');
    });
  }
}

for (const [soggettivita, expectedStato, expectedEsito] of [
  ['COOP', 'NON CONFORME', 'CRITICITÀ RILEVANTI'],
  ['IA', 'VALUTAZIONE AGRONOMO', 'DA APPROFONDIRE'],
]) {
  test(`CR01 ${soggettivita} + cooperativa non di conduzione: stato ed esito generale`, () => {
    const app = browser();
    app.el('soggettivita').value = soggettivita;
    app.el('genere').value = 'NA';
    app.el('tipoSoc').value = 'COOP';
    app.el('coopConduzione').value = 'NON_CONDUZIONE';
    otherKillerCriteriaConforming(app);
    const result = app.calculate();
    assert.equal(criterion(result).stato, expectedStato);
    assert.equal(cr01Cell(app), expectedStato);
    assert.equal(result.esito, expectedEsito);
  });
}

for (const [conduzione, expected] of [
  ['', 'NON VERIFICABILE'],
  ['VERIFICATA', 'CONFORME'],
  ['NON_CONDUZIONE', 'VALUTAZIONE AGRONOMO'],
]) {
  test(`CR01 IA + Società + Cooperativa con conduzione ${conduzione || 'assente'} → ${expected}`, () => {
    const app = browser();
    app.el('soggettivita').value = 'IA';
    app.el('genere').value = 'NA';
    app.el('tipoSoc').value = 'COOP';
    app.el('coopConduzione').value = conduzione;
    app.run('aggiornaSoggetto()');
    assert.notEqual(app.el('coopConduzioneBox').style.display, 'none');
    assert.equal(criterion(app.calculate()).stato, expected);
    assert.equal(cr01Cell(app), expected);
  });
}

test('CR01 altra soggettività e attività esclusa mantengono NON CONFORME', () => {
  const app = browser();
  app.el('soggettivita').value = 'ALTRO';
  assert.equal(criterion(app.calculate()).stato, 'NON CONFORME');
  app.el('soggettivita').value = 'IA';
  app.el('soloSilvAcqua').checked = true;
  assert.equal(criterion(app.calculate()).stato, 'NON CONFORME');
});

test('DOC03 compare per società agricola classificata IA, con ove necessario', () => {
  const app = browser();
  app.el('soggettivita').value = 'IA';
  app.el('genere').value = 'NA';
  const doc = doc03(app.calculate());
  assert.ok(doc);
  assert.equal(doc.stato, 'DA VERIFICARE');
  assert.match(doc.desc, /ove necessario/i);
});

for (const [necessita, documenti, expected] of [
  ['RICHIESTO', 'VERIFICATI', 'CONFORME'],
  ['RICHIESTO', 'MANCANTI', 'NON CONFORME'],
  ['', '', 'DA VERIFICARE'],
  ['DUBBIA', '', 'VALUTAZIONE AGRONOMO'],
  ['RICHIESTO', '', 'NON VERIFICABILE'],
]) {
  test(`DOC03 verifica condizionata ${necessita || 'non svolta'} / ${documenti || 'non acquisiti'} → ${expected}`, () => {
    const app = browser();
    app.el('genere').value = 'NA';
    app.el('doc03Necessita').value = necessita;
    app.el('doc03Documenti').value = documenti;
    assert.equal(doc03(app.calculate()).stato, expected);
  });
}

test('DOC03 non dovuto è conforme solo con motivazione documentata', () => {
  const app = browser();
  app.el('genere').value = 'NA';
  app.el('doc03Necessita').value = 'NON_RICHIESTO';
  assert.equal(doc03(app.calculate()).stato, 'DA VERIFICARE');
  app.el('doc03Motivo').value = 'Verifica statuto e disciplina applicabile: verbale non previsto';
  assert.equal(doc03(app.calculate()).stato, 'CONFORME');
});

test('DOC03 non compare per ditta individuale IA; OP/RETE restano in verifica condizionata', () => {
  const app = browser();
  app.el('soggettivita').value = 'IA';
  app.el('genere').value = 'M';
  assert.equal(doc03(app.calculate()), undefined);
  app.el('soggettivita').value = 'OP';
  assert.equal(doc03(app.calculate()).stato, 'NON VERIFICABILE');
});

for (const soggettivita of ['OP', 'RETE']) {
  test(`DOC03 ${soggettivita} risponde ai controlli compilati`, () => {
    const app = browser();
    app.el('soggettivita').value = soggettivita;
    app.el('genere').value = 'M';
    app.run('aggiornaSoggetto()');
    assert.notEqual(app.el('doc03Box').style.display, 'none');
    app.el('doc03Necessita').value = 'RICHIESTO';
    app.el('doc03Documenti').value = 'VERIFICATI';
    if (soggettivita === 'RETE') app.el('doc03Regolamento').value = 'VERIFICATO';
    assert.equal(doc03(app.calculate()).stato, 'CONFORME');
    app.el('doc03Documenti').value = 'MANCANTI';
    assert.equal(doc03(app.calculate()).stato, 'NON CONFORME');
  });
}

test('DOC03 Rete: Regolamento Interno non presunto, mancante e verificato', () => {
  const app = browser();
  app.el('soggettivita').value = 'RETE';
  app.el('genere').value = 'M';
  app.el('doc03Necessita').value = 'RICHIESTO';
  app.el('doc03Documenti').value = 'VERIFICATI';
  assert.equal(doc03(app.calculate()).stato, 'NON VERIFICABILE');
  assert.match(doc03(app.calculate()).desc, /Regolamento Interno/);
  app.el('doc03Regolamento').value = 'MANCANTE';
  assert.equal(doc03(app.calculate()).stato, 'NON CONFORME');
  app.el('doc03Regolamento').value = 'VERIFICATO';
  assert.equal(doc03(app.calculate()).stato, 'CONFORME');
});

test('JSON v2 COOP azzera dati nuovi preesistenti, conserva il file e segnala il cambio CR01', async () => {
  const app = browser();
  app.el('coopConduzione').value = 'VERIFICATA';
  app.el('doc03Necessita').value = 'RICHIESTO';
  app.el('doc03Documenti').value = 'VERIFICATI';
  const old = { app: 'prefattibilita-srd0105', versione: 2, campi: { ditta: 'Coop precedente', soggettivita: 'COOP', genere: 'NA' }, voci: [], particelle: [] };
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srd0105-json-'));
  const oldPath = path.join(tempDir, 'pratica-v2.json');
  try {
    fs.writeFileSync(oldPath, JSON.stringify(old));
    const before = fs.readFileSync(oldPath);
    await app.loadFile({ name: 'pratica-v2.json', text: async () => fs.promises.readFile(oldPath, 'utf8') });
    assert.equal(app.el('coopConduzione').value, '');
    assert.equal(app.el('doc03Necessita').value, '');
    assert.equal(app.el('doc03Documenti').value, '');
    assert.equal(criterion(app.calculate()).stato, 'NON VERIFICABILE');
    assert.equal(doc03(app.calculate()).stato, 'DA VERIFICARE');
    assert.match(app.el('importStatus').textContent, /CR01.*NON VERIFICABILE/s);
    assert.deepEqual(fs.readFileSync(oldPath), before, 'il JSON v2 su disco non deve cambiare');
    assert.equal(app.run('statoPratica()').versione, 4);
  } finally {
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    fs.rmdirSync(tempDir);
  }
});

test('JSON v2 società IA segnala DOC03; nuovi salvataggi restano leggibili', async () => {
  const app = browser();
  await app.load({ app: 'prefattibilita-srd0105', versione: 2, campi: { soggettivita: 'IA', genere: 'NA' }, voci: [] });
  assert.equal(doc03(app.calculate()).stato, 'DA VERIFICARE');
  assert.match(app.el('importStatus').textContent, /DOC03.*ove necessario/s);
  const saved = app.run('statoPratica()');
  assert.equal(saved.versione, 4);
  assert.ok(Object.hasOwn(saved.campi, 'coopConduzione'));
  assert.ok(Object.hasOwn(saved.campi, 'doc03Necessita'));
});

test('importaFascicolo reale non eredita la verifica di conduzione o DOC03', async () => {
  const app = browser();
  app.el('coopConduzione').value = 'VERIFICATA';
  app.el('doc03Necessita').value = 'RICHIESTO';
  app.el('doc03Documenti').value = 'VERIFICATI';
  await app.importPdf('Denominazione: COOPERATIVA AGRICOLA PROVA\nForma giuridica: COOPERATIVA AGRICOLA');
  assert.equal(app.el('soggettivita').value, 'COOP');
  assert.equal(app.el('genere').value, 'NA');
  assert.equal(app.el('tipoSoc').value, 'COOP');
  assert.equal(criterion(app.calculate()).stato, 'NON VERIFICABILE');
  assert.equal(doc03(app.calculate()).stato, 'DA VERIFICARE');
});

test('JSON v3 Rete con atti segnati verificati richiede ancora il Regolamento Interno', async () => {
  const app = browser();
  await app.load({ app: 'prefattibilita-srd0105', versione: 3, campi: {
    soggettivita: 'RETE', genere: 'M', doc03Necessita: 'RICHIESTO', doc03Documenti: 'VERIFICATI'
  }, voci: [] });
  assert.equal(doc03(app.calculate()).stato, 'NON VERIFICABILE');
  assert.match(app.el('importStatus').textContent, /Regolamento Interno/);
});

test('JSON v3 IA + Società + Cooperativa riaperto perde la vecchia conformità automatica', async () => {
  const app = browser();
  await app.load({ app: 'prefattibilita-srd0105', versione: 3, campi: {
    soggettivita: 'IA', genere: 'NA', tipoSoc: 'COOP', coopConduzione: ''
  }, voci: [] });
  assert.equal(criterion(app.calculate()).stato, 'NON VERIFICABILE');
  assert.equal(cr01Cell(app), 'NON VERIFICABILE');
  assert.match(app.el('importStatus').textContent, /CR01.*NON VERIFICABILE/s);
});

test('JSON v2 IA + Società + Cooperativa resta leggibile e richiede conduzione', async () => {
  const app = browser();
  await app.load({ app: 'prefattibilita-srd0105', versione: 2, campi: {
    soggettivita: 'IA', genere: 'NA', tipoSoc: 'COOP'
  }, voci: [] });
  assert.equal(criterion(app.calculate()).stato, 'NON VERIFICABILE');
  assert.equal(cr01Cell(app), 'NON VERIFICABILE');
  assert.match(app.el('importStatus').textContent, /CR01.*NON VERIFICABILE/s);
});

test('nuovo JSON conserva le attestazioni esplicite dopo riapertura', async () => {
  const app = browser();
  app.el('soggettivita').value = 'COOP';
  app.el('genere').value = 'NA';
  app.el('coopConduzione').value = 'VERIFICATA';
  app.el('doc03Necessita').value = 'RICHIESTO';
  app.el('doc03Documenti').value = 'VERIFICATI';
  app.el('doc03Motivo').value = 'Motivazione conservata';
  app.el('doc03Regolamento').value = 'VERIFICATO';
  const saved = app.run('statoPratica()');
  assert.equal(saved.versione, 4);
  assert.equal(saved.campi.coopConduzione, 'VERIFICATA');
  assert.equal(saved.campi.doc03Necessita, 'RICHIESTO');
  assert.equal(saved.campi.doc03Documenti, 'VERIFICATI');
  assert.equal(saved.campi.doc03Motivo, 'Motivazione conservata');
  assert.equal(saved.campi.doc03Regolamento, 'VERIFICATO');
  app.el('coopConduzione').value = '';
  app.el('doc03Necessita').value = '';
  app.el('doc03Documenti').value = '';
  app.el('doc03Motivo').value = '';
  app.el('doc03Regolamento').value = '';
  await app.load(saved);
  for (const id of ['coopConduzione', 'doc03Necessita', 'doc03Documenti', 'doc03Motivo', 'doc03Regolamento'])
    assert.equal(app.el(id).value, saved.campi[id]);
  assert.equal(criterion(app.calculate()).stato, 'CONFORME');
  assert.equal(doc03(app.calculate()).stato, 'CONFORME');
});
