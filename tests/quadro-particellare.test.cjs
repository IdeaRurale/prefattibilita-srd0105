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


const particelle = [
  { comune:'GALLIPOLI', foglio:'34', particella:'43', forma:'Proprietà', supHa:0.262, supCatastale:0.262 },
  { comune:'GALLIPOLI', foglio:'34', particella:'48', forma:'Proprietà', supHa:1.4214, supCatastale:1.453 },
  { comune:'GALLIPOLI', foglio:'34', particella:'141', forma:'Proprietà', supHa:36.1463, supCatastale:36.1463 },
  { comune:'GALLIPOLI', foglio:'34', particella:'45', forma:'Affitto', supHa:2.0327, supCatastale:2.087 },
];

test('quadro particellare: righe delle voci e con superfici indicate, totali in ettari', () => {
  const app = browser();
  app.run(`particelleFascicolo = ${JSON.stringify(particelle)}`);
  app.run("aggiornaSupParticella(0,'supIrrigua','0,05'); aggiornaSupParticella(1,'supIrrigua','0.4'); aggiornaSupParticella(2,'supIrrigua','29.55'); aggiornaSupParticella(2,'supProgetto','6')");
  const h = app.run(`quadroParticellareHTML(particelleFascicolo, [{cat:'ARB', particelle:['GALLIPOLI|34|141']}])`);
  assert.match(h, /<td>43<\/td>/);
  assert.match(h, /<td>48<\/td>/);
  assert.match(h, /<td>141<\/td>/);
  assert.doesNotMatch(h, /<td>45<\/td>/, 'particella senza voci né superfici esclusa');
  assert.match(h, /1,4530/, 'usa la superficie catastale, non la condotta');
  assert.match(h, /Totale<\/td><td class="num">37,8613<\/td><td class="num">30,0000<\/td><td class="num">6,0000<\/td>/);
});

test('quadro particellare: vuoto senza voci su terreno né superfici; i beni mobili non lo attivano', () => {
  const app = browser();
  app.run(`particelleFascicolo = ${JSON.stringify(particelle)}`);
  assert.equal(app.run(`quadroParticellareHTML(particelleFascicolo, [{cat:'M', particelle:['GALLIPOLI|34|141']}])`), '');
});

test('quadro particellare: senza catastale usa la superficie del fascicolo; valori non numerici azzerano il campo', () => {
  const app = browser();
  app.run(`particelleFascicolo = [{ comune:'NARDO\\'', foglio:'1', particella:'2', supHa:1.5 }]`);
  app.run("aggiornaSupParticella(0,'supProgetto','abc')");
  assert.equal(app.run('particelleFascicolo[0].supProgetto'), null);
  const h = app.run(`quadroParticellareHTML(particelleFascicolo, [{cat:'IRR', particelle:["NARDO'|1|2"]}])`);
  assert.match(h, /1,5000/);
});

test('quadro particellare: superfici salvate con la pratica e riaperte', async () => {
  const app = browser();
  app.run(`particelleFascicolo = ${JSON.stringify(particelle)}`);
  app.run("aggiornaSupParticella(2,'supProgetto','6')");
  const stato = app.run('statoPratica()');
  assert.equal(stato.particelle[2].supProgetto, 6);
  app.run('particelleFascicolo = []');
  await app.load(stato);
  assert.equal(app.run('particelleFascicolo[2].supProgetto'), 6);
});
