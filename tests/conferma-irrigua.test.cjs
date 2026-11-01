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
    calculate() { vm.runInContext("calcola()",context); return vm.runInContext("ultimoEsito",context); },
    async load(data) { await vm.runInContext('apriPratica',context)({name:'pratica.json',text:async()=>JSON.stringify(data)}); },
  };
}


function voceIrrigua(app, codice, classificazione = 'NUOVO_IMPIANTO') {
  app.run('addVoce()');
  app.run("cambiaCat(0,'IRR')");
  app.run('vociState[0].importo=50000');
  app.run(`aggiornaClassificazioneIrrigua(0,'${classificazione}')`);
  app.run(`aggiornaMetodoIrriguo(0,'${codice}')`);
}
const conferme = ['classificazione','titolo','particelle','parametri','contatore'];
const confermaTutto = app => conferme.forEach(k => app.run(`aggiornaConfermaIrrigua(0,'${k}',true)`));

test('nuovo impianto con tutte le conferme e indice ≥ 85%: ammissibile, prioritaria, P1 definitivo', () => {
  const app = browser();
  voceIrrigua(app, '17');
  confermaTutto(app);
  const r = app.calculate();
  assert.equal(r.analisiVoci[0].statoAmmissibilita, null);
  assert.equal(r.analisiVoci[0].ammissibile, true);
  assert.equal(r.analisiVoci[0].prioritaria, true);
  assert.equal(r.punteggi.find(p => p.cod === 'P1').pt, 17);
  assert.notEqual(r.totale, null);
});

for (const manca of conferme) {
  test(`senza la conferma «${manca}» la voce resta non verificabile`, () => {
    const app = browser();
    voceIrrigua(app, '17');
    confermaTutto(app);
    app.run(`aggiornaConfermaIrrigua(0,'${manca}',false)`);
    const r = app.calculate();
    assert.equal(r.analisiVoci[0].statoAmmissibilita, 'NON VERIFICABILE');
    assert.equal(r.punteggi.find(p => p.cod === 'P1').pt, null);
    assert.equal(r.totale, null);
  });
}

test('indice 80% (codice 12) consolidato: ammissibile ma non prioritario', () => {
  const app = browser();
  voceIrrigua(app, '12');
  confermaTutto(app);
  const r = app.calculate();
  assert.equal(r.analisiVoci[0].ammissibile, true);
  assert.equal(r.analisiVoci[0].prioritaria, false);
});

test('ammodernamento: le conferme non consolidano (serve la valutazione CR21)', () => {
  const app = browser();
  voceIrrigua(app, '17', 'AMMODERNAMENTO');
  confermaTutto(app);
  const r = app.calculate();
  assert.equal(r.analisiVoci[0].statoAmmissibilita, 'NON VERIFICABILE');
});

test('le conferme si salvano nella pratica e i JSON precedenti le hanno tutte a false', async () => {
  const app = browser();
  voceIrrigua(app, '17');
  confermaTutto(app);
  const stato = app.run('statoPratica()');
  assert.equal(stato.voci[0].irrigazione.confermaTecnico.titolo, true);
  await app.load({ app:'prefattibilita-srd0105', versione:5, campi:{}, voci:[{ cat:'IRR', importo:1000, irrigazione:{ classificazione:{ dichiarata:'NUOVO_IMPIANTO' } } }] });
  assert.deepEqual({ ...app.run('vociState[0].irrigazione.confermaTecnico') }, { classificazione:false, titolo:false, particelle:false, parametri:false, contatore:false });
});
