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

test('note tecniche: paragrafi ed elenchi, con testo sempre escapato', () => {
  const app = browser();
  const h = app.run('noteTecnicheHTML("Bilancio idrico <da verificare>\\n- volume 45.000 m³\\n- pozzo 8 L/s\\n\\nSecondo paragrafo")');
  assert.equal(h, '<p>Bilancio idrico &lt;da verificare&gt;</p><ul><li>volume 45.000 m³</li><li>pozzo 8 L/s</li></ul><p>Secondo paragrafo</p>');
  assert.equal(app.run('noteTecnicheHTML("   ")'), '');
});

test('note tecniche: salvate nella pratica e riaperte', async () => {
  const app = browser();
  app.el('noteTecniche').value = 'Nota del tecnico';
  const stato = app.run('statoPratica()');
  assert.equal(stato.campi.noteTecniche, 'Nota del tecnico');
  app.el('noteTecniche').value = '';
  await app.load(stato);
  assert.equal(app.el('noteTecniche').value, 'Nota del tecnico');
});

test('note tecniche: una pratica precedente senza note non eredita quelle aperte prima', async () => {
  const app = browser();
  app.el('noteTecniche').value = 'Nota di un\'altra pratica';
  await app.load({ app:'prefattibilita-srd0105', versione:4, campi:{ ditta:'Ditta precedente' }, voci:[] });
  assert.equal(app.el('noteTecniche').value, '');
});
