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
  for (const match of html.matchAll(/<(input|select)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
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
    querySelectorAll() { return [...elements.values()].filter(el => ['input','select','checkbox','date','number','text','file'].includes(el.type)); },
  };
  document.getElementById('comparto').value = 'ALTRO';
  const context = vm.createContext({document,console,setTimeout,Intl,Date});
  vm.runInContext(script, context, {filename:'index.html'});
  return {
    el:id=>document.getElementById(id),
    run:code=>vm.runInContext(code,context),
    async load(data) { await vm.runInContext('apriPratica',context)({name:'pratica.json',text:async()=>JSON.stringify(data)}); },
    calculate() { vm.runInContext('calcola()',context); return vm.runInContext('ultimoEsito',context); }
  };
}

const proposti = [ ['12',80], ['13',85], ['14',85], ['15',90], ['16',90], ['17',90] ];
for (const [codice, indice] of proposti) {
  test(`Allegato 5: metodo proposto ${codice} deriva ${indice}%`, () => {
    const app=browser();
    assert.equal(app.run(`indiceMetodoIrriguo('${codice}',true)`),indice);
    assert.equal(app.run(`metodoIrriguo('${codice}',true).proposto`),true);
    assert.match(app.run(`metodoIrriguo('${codice}',true).fonte`),/PDF pp\. 64-65/);
  });
}

test('codici 01–11 sono descrittivi ex ante ma non diventano metodi proposti', () => {
  const app=browser();
  assert.equal(app.run("indiceMetodoIrriguo('01')"),10);
  assert.equal(app.run("indiceMetodoIrriguo('11')"),70);
  assert.equal(app.run("indiceMetodoIrriguo('11',true)"),null);
  assert.equal(app.run("metodoIrriguo('11',true)"),null);
  const normalized=app.run("normalizzaIrrigazione({impiantoProposto:{codiceMetodo:'11',indiceNormativo:90}})");
  assert.equal(normalized.impiantoProposto.codiceMetodo,'11', 'dato dichiarato conservato');
  assert.equal(normalized.impiantoProposto.indiceNormativo,null, 'nessun indice progettuale attribuito');
});

test('la selezione del metodo aggiorna solo l’indice ufficiale derivato e mostra i parametri pertinenti', () => {
  const app=browser();
  app.run('addVoce()');
  app.run("cambiaCat(0,'IRR')");
  app.run("aggiornaMetodoIrriguo(0,'13')");
  assert.equal(app.run('vociState[0].irrigazione.impiantoProposto.indiceNormativo'),85);
  assert.match(app.el('vociBox').innerHTML,/Indice ufficiale derivato dall'Allegato 5/);
  assert.match(app.el('vociBox').innerHTML,/85%/);
  assert.match(app.el('vociBox').innerHTML,/Manometro sulla macchina/);
  app.run("aggiornaMetodoIrriguo(0,'16')");
  assert.equal(app.run('vociState[0].irrigazione.impiantoProposto.indiceNormativo'),90);
  assert.match(app.el('vociBox').innerHTML,/Coefficiente di variazione della portata/);
});

test('stima libera divergente non cambia indice, ammissibilità o P1', () => {
  const app=browser();
  app.run('addVoce()');
  app.run("cambiaCat(0,'IRR')");
  app.run("aggiornaClassificazioneIrrigua(0,'NUOVO_IMPIANTO')");
  app.run("aggiornaMetodoIrriguo(0,'12')");
  app.run("aggiornaStimaLiberaIrrigua(0,'99')");
  assert.equal(app.run('vociState[0].irrigazione.impiantoProposto.indiceNormativo'),80);
  assert.equal(app.run('statoPratica().voci[0].irrigazione.impiantoProposto.stimaLibera'),'99');
  const result=app.calculate();
  assert.equal(result.analisiVoci[0].ammissibile,null);
  assert.equal(result.analisiVoci[0].prioritaria,null);
  assert.equal(result.analisiVoci[0].statoAmmissibilita,'NON VERIFICABILE');
  assert.equal(result.punteggi.find(p=>p.cod==='P1').pt,null);
  assert.equal(result.investimentiAmmessi,null);
  assert.equal(result.contributo,null);
  assert.equal(result.totale,null);
  assert.equal(result.esito,'DA APPROFONDIRE');
});

test('sola efficienza energetica è ramo autonomo e resta tale dopo riapertura', async () => {
  const app=browser();
  app.run('addVoce()');
  app.run("cambiaCat(0,'IRR')");
  app.run("aggiornaClassificazioneIrrigua(0,'SOLO_EFFICIENZA_ENERGETICA')");
  const ir=app.run('vociState[0].irrigazione');
  assert.equal(ir.classificazione.dichiarata,'SOLO_EFFICIENZA_ENERGETICA');
  assert.equal(ir.classificazione.confermata,'');
  assert.equal(ir.classificazione.statoVerifica,'NON VERIFICABILE');
  assert.equal(ir.valutazioneCR21.applicabilita,'NON_VERIFICATA');
  assert.equal(ir.impiantoProposto.codiceMetodo,'');
  assert.equal(ir.impiantoProposto.indiceNormativo,null);
  assert.match(app.el('vociBox').innerHTML,/Sola efficienza energetica/);
  await app.load(JSON.parse(JSON.stringify(app.run('statoPratica()'))));
  assert.equal(app.run('vociState[0].irrigazione.classificazione.dichiarata'),'SOLO_EFFICIENZA_ENERGETICA');
  assert.equal(app.run('vociState[0].irrigazione.valutazioneCR21.applicabilita'),'NON_VERIFICATA');
  assert.doesNotMatch(app.el('importStatus').textContent,/Rivalutazione conservativa JSON precedente/);
});

test('nuovo JSON v5 riapre modello, parametri, fonti, titoli, importi e giudizio senza perdita', async () => {
  const app=browser();
  app.run('addVoce()');
  app.run("cambiaCat(0,'IRR')");
  app.run("aggiornaClassificazioneIrrigua(0,'AMMODERNAMENTO')");
  app.run("aggiornaMetodoIrriguo(0,'14')");
  app.run("aggiornaParametroIrriguo(0,'pressione','2.5')");
  app.run("aggiornaParametroIrriguo(0,'controlloVolumi',true)");
  app.run("vociState[0].irrigazione.impiantoExAnte.codiceMetodo='07'");
  app.run("vociState[0].irrigazione.fontiIdriche.push({...nuovaFonteIdrica(),id:'F1',tipo:'POZZO',usataDaInvestimento:true})");
  app.run("vociState[0].irrigazione.titoliProcedimenti.push({...nuovoTitoloIdrico(),fonteId:'F1',procedimento:{...nuovoTitoloIdrico().procedimento,oggetto:'IGNOTO'}})");
  app.run("vociState[0].irrigazione.importi={richiesto:10000,ammissibile:null}");
  app.run("vociState[0].irrigazione.giudizioAgronomo={motivazione:'Da valutare',autore:'Tecnico',data:'2026-10-02'}");
  const saved=JSON.parse(JSON.stringify(app.run('statoPratica()')));
  assert.equal(saved.versione,5);
  assert.equal(saved.voci[0].irrigazione.impiantoExAnte.indiceNormativo,60);
  assert.equal(saved.voci[0].irrigazione.impiantoProposto.indiceNormativo,85);
  await app.load(saved);
  const reopened=JSON.parse(JSON.stringify(app.run('statoPratica()')));
  assert.equal(reopened.voci[0].irrigazione.classificazione.dichiarata,'AMMODERNAMENTO');
  assert.equal(reopened.voci[0].irrigazione.classificazione.confermata,'');
  assert.equal(reopened.voci[0].irrigazione.impiantoProposto.parametri.pressione,'2.5');
  assert.equal(reopened.voci[0].irrigazione.impiantoProposto.parametri.controlloVolumi,true);
  assert.equal(reopened.voci[0].irrigazione.impiantoExAnte.codiceMetodo,'07');
  assert.equal(reopened.voci[0].irrigazione.impiantoExAnte.indiceNormativo,60);
  assert.equal(reopened.voci[0].irrigazione.fontiIdriche[0].usataDaInvestimento,true);
  assert.equal(reopened.voci[0].irrigazione.titoliProcedimenti[0].procedimento.oggetto,'IGNOTO');
  assert.equal(reopened.voci[0].irrigazione.importi.richiesto,10000);
  assert.equal(reopened.voci[0].irrigazione.importi.ammissibile,null);
  assert.equal(reopened.voci[0].irrigazione.giudizioAgronomo.motivazione,'Da valutare');
});

for (const versione of [2,3,4]) {
  test(`JSON legacy v${versione} con percentuale e flag apre senza promuoverli a prova`, async () => {
    const app=browser();
    await app.load({app:'prefattibilita-srd0105',versione,campi:{soggettivita:'IA',genere:'M'},voci:[
      {cat:'IRR',desc:'Impianto storico',importo:10000,efficienza:'88',nuovo:true,reflue:true,autorizzazione:true,contatori:true}
    ],particelle:[]});
    const saved=JSON.parse(JSON.stringify(app.run('statoPratica()')));
    const v=saved.voci[0], ir=v.irrigazione;
    assert.equal(saved.versione,5);
    assert.equal(v.efficienza,'88', 'dato originale conservato');
    assert.equal(ir.impiantoProposto.stimaLibera,'88');
    assert.equal(ir.classificazione.dichiarata,'');
    assert.equal(ir.classificazione.confermata,'');
    assert.equal(ir.classificazione.statoVerifica,'NON VERIFICABILE');
    assert.equal(ir.impiantoProposto.codiceMetodo,'');
    assert.equal(ir.impiantoProposto.indiceNormativo,null);
    assert.equal(ir.impiantoProposto.parametri.controlloVolumi,null);
    assert.equal(ir.fontiIdriche.length,0);
    assert.equal(ir.titoliProcedimenti.length,0);
    assert.equal(ir.p1.qualifica,'NON VERIFICABILE');
    assert.match(app.el('importStatus').textContent,/Irrigazione M2\.1.*non diventano automaticamente/s);
    const result=app.calculate();
    assert.equal(result.analisiVoci[0].prioritaria,null);
    assert.equal(result.punteggi.find(p=>p.cod==='P1').pt,null);
  });
}

test('indice salvato non ufficiale viene ricalcolato dal codice alla riapertura', async () => {
  const app=browser();
  await app.load({app:'prefattibilita-srd0105',versione:5,campi:{},voci:[{
    cat:'IRR',irrigazione:{impiantoProposto:{codiceMetodo:'17',indiceNormativo:99,stimaLibera:'99'}}
  }]});
  assert.equal(app.run('vociState[0].irrigazione.impiantoProposto.indiceNormativo'),90);
  assert.equal(app.run('statoPratica().voci[0].irrigazione.impiantoProposto.indiceNormativo'),90);
});

test('classificazione e catalogo conservano i cinque rami e le dimensioni future separate', () => {
  const app=browser();
  assert.equal(app.run('Object.keys(CLASSIFICAZIONI_IRRIGUE).length'),5);
  const ir=app.run('nuovaIrrigazione()');
  assert.equal(ir.valutazioneCR21.applicabilita,'NON_VERIFICATA');
  assert.equal(ir.p1.statoConsolidamento,'NON_CONSOLIDATO');
  assert.equal(ir.importi.richiesto,null);
  assert.equal(ir.importi.ammissibile,null);
  assert.equal(app.run('nuovoTitoloIdrico().procedimento.oggetto'),'IGNOTO');
  assert.equal(app.run('nuovoTitoloIdrico().statoVerifica'),'PROVA_NON_ACQUISITA');
  assert.equal(app.run('nuovaFonteIdrica().usataDaInvestimento'),null);
  assert.equal(app.run('nuovaTracciaRegola().esito'),'NON VERIFICABILE');
});
