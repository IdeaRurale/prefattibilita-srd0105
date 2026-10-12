const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);

function browser(){
  const elements=new Map();
  function element(id,type='div',value=''){
    return {id,type,value,checked:false,disabled:false,textContent:'',innerHTML:'',style:{},className:'',
      classList:{add(){},remove(){}},scrollIntoView(){}};
  }
  for (const m of html.matchAll(/<(input|select)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
    const [,tag,attrs,id]=m;
    const body=tag==='select'?html.slice(m.index+m[0].length,html.indexOf('</select>',m.index)):'';
    const type=/type="([^"]+)"/.exec(attrs)?.[1]||tag;
    const value=/value="([^"]*)"/.exec(attrs)?.[1]||(tag==='select'?/<option\b[^>]*value="([^"]*)"/.exec(body)?.[1]||'':'');
    elements.set(id,element(id,type,value));
  }
  const document={getElementById(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id);},
    querySelectorAll(){return [...elements.values()].filter(x=>['input','select','checkbox','date','number','text','file'].includes(x.type));}};
  document.getElementById('comparto').value='ALTRO';
  const context=vm.createContext({document,console,setTimeout,Intl,Date});
  vm.runInContext(script,context,{filename:'index.html'});
  const run=code=>vm.runInContext(code,context);
  return {run,el:id=>document.getElementById(id),
    async load(data){await run('apriPratica')({name:'pratica.json',text:async()=>JSON.stringify(data)});},
    calculate(){run('calcola()');return JSON.parse(JSON.stringify(run('ultimoEsito')));}};
}
function well(app){
  app.run("addVoce(); cambiaCat(0,'IRR'); aggiungiFonteIrrigua(0)");
  app.run("aggiornaFonteIrrigua(0,0,'tipo','POZZO'); aggiornaFonteIrrigua(0,0,'usataDaInvestimento',true)");
  app.run("aggiornaDataDdSIrrigua(0,'2026-10-22')");
  return app;
}
function title(app,tipo,overrides={}){
  const json=JSON.stringify(overrides);
  app.run(`(()=>{const a=fonteAtto(0,0,'${tipo}');Object.assign(a,${json});a.verifica={autore:'Tecnico',data:'2026-10-02',motivazione:'Documento controllato'};})()`);
  app.run(`impostaStatoAttoIrriguo(0,0,'${tipo}','VERIFICATO')`);
}
function outcome(app,code){
  return app.run(`verificaIrrigazione(vociState[0]).fonti[0].esiti.${code}.stato`);
}

test('titolo valido verificato e autorizzazione del pozzo restano documenti distinti',()=>{
  const app=well(browser());
  title(app,'CONCESSIONE',{dichiarazione:'PRESENTE',prova:'Concessione 11',scadenza:'2027-01-01'});
  assert.equal(outcome(app,'IR06b'),'CONFORME');
  assert.equal(outcome(app,'IR06a'),'NON VERIFICABILE');
  title(app,'AUTORIZZAZIONE_POZZO',{dichiarazione:'PRESENTE',prova:'Autorizzazione regionale 7'});
  assert.equal(outcome(app,'IR06a'),'CONFORME');
});
test('titolo dichiarato senza prova, campo vuoto e assenza accertata hanno tre esiti distinti',()=>{
  const app=well(browser());
  assert.equal(outcome(app,'IR06b'),'NON VERIFICABILE');
  app.run("fonteAtto(0,0,'CONCESSIONE').dichiarazione='PRESENTE'");
  assert.equal(outcome(app,'IR06b'),'NON VERIFICABILE');
  assert.match(app.run("verificaIrrigazione(vociState[0]).fonti[0].esiti.IR06b.nota"),/senza prova/);
  app.run("fonteAtto(0,0,'CONCESSIONE').dichiarazione='ASSENTE_DICHIARATO'; fonteAtto(0,0,'CONCESSIONE').verifica={autore:'Tecnico',data:'2026-10-02',motivazione:'Ricerca titolo negativa'}");
  app.run("impostaStatoAttoIrriguo(0,0,'CONCESSIONE','ASSENZA_ACCERTATA')");
  assert.equal(outcome(app,'IR06b'),'NON CONFORME');
});
test('titolo scaduto alla DdS non è valido',()=>{
  const app=well(browser());
  title(app,'CONCESSIONE',{prova:'Titolo scaduto',scadenza:'2026-01-01'});
  assert.equal(outcome(app,'IR06b'),'NON CONFORME');
});
test('autorizzazione del pozzo dichiarata, acquisita e scaduta non diventa valida',()=>{
  const app=well(browser());
  app.run("fonteAtto(0,0,'AUTORIZZAZIONE_POZZO').dichiarazione='PRESENTE'");
  assert.equal(outcome(app,'IR06a'),'NON VERIFICABILE');
  app.run("aggiornaCampoAttoIrriguo(0,0,'AUTORIZZAZIONE_POZZO','prova','Autorizzazione regionale')");
  app.run("impostaStatoAttoIrriguo(0,0,'AUTORIZZAZIONE_POZZO','ACQUISITO_DA_VERIFICARE')");
  assert.equal(outcome(app,'IR06a'),'DA VERIFICARE');
  title(app,'AUTORIZZAZIONE_POZZO',{prova:'Autorizzazione regionale',scadenza:'2026-01-01'});
  assert.equal(outcome(app,'IR06a'),'NON CONFORME');
});
function procedure(app,oggetto){
  app.run(`(()=>{const p=fonteAtto(0,0,'CONCESSIONE').procedimento;p.oggetto='${oggetto}';p.stato='DICHIARATO_SENZA_PROVA';p.provaIstanza='Protocollo 42';p.dataIstanza='2026-09-01';p.concessionePrecedente='Concessione 9';p.verifica={autore:'Tecnico',data:'2026-10-02'};})()`);
  app.run("impostaStatoProcedimentoIrriguo(0,0,'VERIFICATO')");
}
for(const [oggetto,stato] of [['RINNOVO','DA VERIFICARE'],['NUOVA_CONCESSIONE','VALUTAZIONE AGRONOMO'],['IGNOTO','NON VERIFICABILE']]){
  test(`iter documentato ${oggetto} segue F1/F2/F3: ${stato}`,()=>{
    const app=well(browser());procedure(app,oggetto);
    assert.equal(outcome(app,'IR06b'),stato);
    assert.notEqual(outcome(app,'IR06b'),'CONFORME');
    if(oggetto==='RINNOVO') assert.equal(app.run("verificaIrrigazione(vociState[0]).fonti[0].esiti.IR06b.prescrizione.termine"),'PRIMA_DDP_NON_GARANTITA');
  });
}
test('F3 passa a F1 e F2 solo dopo identificazione e nuova verifica della prova',()=>{
  const app=well(browser());procedure(app,'IGNOTO');
  assert.equal(outcome(app,'IR06b'),'NON VERIFICABILE');
  app.run("aggiornaProcedimentoIrriguo(0,0,'oggetto','RINNOVO')");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).fonti[0].esiti.IR06b.riepilogo"),'DOCUMENTI_DA_CONTROLLARE');
  app.run("impostaStatoProcedimentoIrriguo(0,0,'VERIFICATO')");
  assert.equal(outcome(app,'IR06b'),'DA VERIFICARE');
  app.run("aggiornaProcedimentoIrriguo(0,0,'oggetto','NUOVA_CONCESSIONE')");
  app.run("impostaStatoProcedimentoIrriguo(0,0,'VERIFICATO')");
  assert.equal(outcome(app,'IR06b'),'VALUTAZIONE AGRONOMO');
});
test('iter dichiarato senza prova non è iter documentato',()=>{
  const app=well(browser());
  app.run("fonteAtto(0,0,'CONCESSIONE').procedimento.stato='DICHIARATO_SENZA_PROVA'");
  assert.equal(outcome(app,'IR06b'),'NON VERIFICABILE');
});
test('pozzo di terzi: emungimento verificato, assente e ignoto distinti',()=>{
  const app=well(browser());
  app.run("aggiornaPozzoIrriguo(0,0,'proprieta','TERZI'); aggiornaPozzoIrriguo(0,0,'provaProprieta','Contratto pozzo')");
  app.run("aggiornaPozzoIrriguo(0,0,'verifica',{autore:'Tecnico',data:'2026-10-02'})");
  app.run("impostaStatoProprietaIrrigua(0,0,'VERIFICATO')");
  assert.equal(outcome(app,'IR07'),'NON VERIFICABILE');
  title(app,'EMUNGIMENTO',{prova:'Permesso emungimento',dichiarazione:'PRESENTE',intestatario:'Richiedente'});
  assert.equal(outcome(app,'IR07'),'CONFORME');
  app.run("aggiornaCampoAttoIrriguo(0,0,'EMUNGIMENTO','prova',''); aggiornaCampoAttoIrriguo(0,0,'EMUNGIMENTO','dichiarazione','ASSENTE_DICHIARATO')");
  app.run("impostaStatoAttoIrriguo(0,0,'EMUNGIMENTO','ASSENZA_ACCERTATA')");
  assert.equal(outcome(app,'IR07'),'NON CONFORME');
});
test('pozzo di terzi con emungimento solo dichiarato resta prudenziale',()=>{
  const app=well(browser());
  app.run("aggiornaPozzoIrriguo(0,0,'proprieta','TERZI'); aggiornaPozzoIrriguo(0,0,'provaProprieta','Contratto pozzo')");
  app.run("aggiornaPozzoIrriguo(0,0,'verifica',{autore:'Tecnico',data:'2026-10-02'}); impostaStatoProprietaIrrigua(0,0,'VERIFICATO')");
  app.run("fonteAtto(0,0,'EMUNGIMENTO').dichiarazione='PRESENTE'");
  assert.equal(outcome(app,'IR07'),'NON VERIFICABILE');
  app.run("aggiornaCampoAttoIrriguo(0,0,'EMUNGIMENTO','prova','Permesso da leggere'); impostaStatoAttoIrriguo(0,0,'EMUNGIMENTO','ACQUISITO_DA_VERIFICARE')");
  assert.equal(outcome(app,'IR07'),'DA VERIFICARE');
});
test('pozzo di terzi: atto verificato senza intestatario non prova l’emungimento del richiedente',()=>{
  const app=well(browser());
  app.run("aggiornaPozzoIrriguo(0,0,'proprieta','TERZI'); aggiornaPozzoIrriguo(0,0,'provaProprieta','Contratto pozzo')");
  app.run("aggiornaPozzoIrriguo(0,0,'verifica',{autore:'Tecnico',data:'2026-10-02'}); impostaStatoProprietaIrrigua(0,0,'VERIFICATO')");
  title(app,'EMUNGIMENTO',{prova:'Permesso senza titolare'});
  assert.equal(outcome(app,'IR07'),'NON VERIFICABILE');
});
test('copertura particelle: documentata, non coperta, non verificata e aumento',()=>{
  const app=well(browser());
  app.run("vociState[0].particelle=['P1']; aggiornaFonteIrrigua(0,0,'particelleServite',['P1'])");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR02.stato"),'NON VERIFICABILE');
  title(app,'CONCESSIONE',{prova:'Titolo particelle',scadenza:'2027-01-01',particelleCoperte:['P1']});
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR02.stato"),'CONFORME');
  app.run("aggiornaSuperficieIrrigua(0,'superficiePrima','1'); aggiornaSuperficieIrrigua(0,'superficieDopo','2')");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR02.stato"),'VALUTAZIONE AGRONOMO');
  app.run("alternaParticellaIrrigua(0,0,'CONCESSIONE','P1',false)");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR02.stato"),'DA VERIFICARE');
  app.run("vociState[0].particelle.push('P2'); aggiornaFonteIrrigua(0,0,'particelleServite',['P1','P2'])");
  app.run("alternaParticellaIrrigua(0,0,'CONCESSIONE','P1',true)");
  app.run("impostaStatoAttoIrriguo(0,0,'CONCESSIONE','VERIFICATO')");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR02.stato"),'NON CONFORME');
});
test('contatore esistente, previsto, assente e non verificabile',()=>{
  const app=well(browser());
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR05.stato"),'NON VERIFICABILE');
  app.run("aggiornaContatoreIrriguo(0,'stato','ESISTENTE'); aggiornaContatoreIrriguo(0,'prova','Foto contatore'); aggiornaContatoreIrriguo(0,'pertinenza','VERIFICATA')");
  app.run("aggiornaVerificaContatoreIrriguo(0,'autore','Tecnico'); aggiornaVerificaContatoreIrriguo(0,'data','2026-10-02')");
  app.run("impostaStatoContatoreIrriguo(0,'VERIFICATO')");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR05.stato"),'CONFORME');
  app.run("aggiornaContatoreIrriguo(0,'stato','DA_INSTALLARE'); aggiornaContatoreIrriguo(0,'voceProgettuale','Computo 8')");
  app.run("impostaStatoContatoreIrriguo(0,'VERIFICATO')");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR05.stato"),'CONFORME');
  app.run("aggiornaContatoreIrriguo(0,'stato','ASSENTE'); impostaStatoContatoreIrriguo(0,'ASSENZA_ACCERTATA')");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR05.stato"),'NON CONFORME');
});
test('contatore previsto senza voce progettuale resta non verificabile e prova da controllare resta DA VERIFICARE',()=>{
  const app=well(browser());
  app.run("aggiornaContatoreIrriguo(0,'stato','DA_INSTALLARE'); aggiornaContatoreIrriguo(0,'prova','Progetto')");
  app.run("aggiornaVerificaContatoreIrriguo(0,'autore','Tecnico'); aggiornaVerificaContatoreIrriguo(0,'data','2026-10-02')");
  app.run("impostaStatoContatoreIrriguo(0,'VERIFICATO')");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR05.stato"),'NON VERIFICABILE');
  app.run("impostaStatoContatoreIrriguo(0,'ACQUISITO_DA_VERIFICARE')");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR05.stato"),'DA VERIFICARE');
});
test('contatore esistente provato senza pertinenza verificata non è conforme',()=>{
  const app=well(browser());
  app.run("aggiornaContatoreIrriguo(0,'stato','ESISTENTE'); aggiornaContatoreIrriguo(0,'prova','Foto contatore')");
  app.run("aggiornaVerificaContatoreIrriguo(0,'autore','Tecnico'); aggiornaVerificaContatoreIrriguo(0,'data','2026-10-02'); impostaStatoContatoreIrriguo(0,'VERIFICATO')");
  assert.equal(app.run("verificaIrrigazione(vociState[0]).IR05.stato"),'NON VERIFICABILE');
});
for(const [tipo,doc,regola] of [['CONSORTILE','CONSORTILE','IR08'],['REFLUE','REFLUE','IR09']]){
  test(`${tipo}: documento della fonte distinto da dichiarazione e prova da controllare`,()=>{
    const app=well(browser());
    app.run(`aggiornaFonteIrrigua(0,0,'tipo','${tipo}')`);
    assert.equal(outcome(app,regola),'NON VERIFICABILE');
    app.run(`aggiornaCampoAttoIrriguo(0,0,'${doc}','prova','Documento ente'); impostaStatoAttoIrriguo(0,0,'${doc}','ACQUISITO_DA_VERIFICARE')`);
    assert.equal(outcome(app,regola),'DA VERIFICARE');
    title(app,doc,{prova:'Documento ente'});
    assert.equal(outcome(app,regola),'CONFORME');
  });
}
test('più fonti usate richiedono prove autonome; reflue non significa affinate',()=>{
  const app=well(browser());
  app.run("aggiungiFonteIrrigua(0); aggiornaFonteIrrigua(0,1,'tipo','REFLUE'); aggiornaFonteIrrigua(0,1,'usataDaInvestimento',true)");
  assert.equal(app.run('vociState[0].irrigazione.fontiIdriche[1].reflue.affinamentoDichiarato'),null);
  assert.equal(app.run('verificaIrrigazione(vociState[0]).fonti.length'),2);
  app.run("aggiornaReflueIrrigue(0,1,'affinamentoDichiarato',true)");
  assert.equal(app.run('vociState[0].irrigazione.fontiIdriche[1].reflue.statoProva'),'PROVA_NON_ACQUISITA');
});
test('due fonti con lo stesso riferimento documentale conservano due verifiche autonome',async()=>{
  const app=well(browser());
  app.run("aggiungiFonteIrrigua(0); aggiornaFonteIrrigua(0,1,'tipo','POZZO'); aggiornaFonteIrrigua(0,1,'usataDaInvestimento',true)");
  title(app,'CONCESSIONE',{prova:'Atto condiviso',scadenza:'2027-01-01'});
  app.run("(()=>{const a=fonteAtto(0,1,'CONCESSIONE');a.prova='Atto condiviso';a.scadenza='2027-01-01';a.verifica={autore:'Tecnico',data:'2026-10-02'};})()");
  app.run("impostaStatoAttoIrriguo(0,1,'CONCESSIONE','VERIFICATO')");
  const saved=JSON.parse(JSON.stringify(app.run('statoPratica()')));
  await app.load(saved);
  assert.equal(app.run("verificaIrrigazione(vociState[0]).fonti[0].esiti.IR06b.stato"),'CONFORME');
  assert.equal(app.run("verificaIrrigazione(vociState[0]).fonti[1].esiti.IR06b.stato"),'CONFORME');
});
test('JSON manipolato v5 non promuove falsi stati verificati e conserva dichiarazioni',async()=>{
  const app=browser();
  const ir={classificazione:{dichiarata:'NUOVO_IMPIANTO',confermata:'NUOVO_IMPIANTO',statoVerifica:'CONFORME'},
    p1:{qualifica:'CONFORME',statoConsolidamento:'CONSOLIDATO',punteggioDefinitivo:17},
    fontiIdriche:[{id:'F1',tipo:'POZZO',usataDaInvestimento:true}],
    titoliProcedimenti:[{fonteId:'F1',tipoDocumento:'CONCESSIONE',prova:'Documento',statoVerifica:'VERIFICATO'}]};
  await app.load({versione:5,campi:{},voci:[{cat:'IRR',importo:50000,irrigazione:ir}]});
  const loaded=JSON.parse(JSON.stringify(app.run('vociState[0].irrigazione')));
  assert.equal(loaded.classificazione.dichiarata,'NUOVO_IMPIANTO');
  assert.equal(loaded.classificazione.confermata,'');
  assert.equal(loaded.p1.statoConsolidamento,'NON_CONSOLIDATO');
  assert.equal(loaded.p1.punteggioDefinitivo,null);
  assert.equal(loaded.titoliProcedimenti[0].statoVerifica,'ACQUISITO_DA_VERIFICARE');
  assert.match(app.el('importStatus').textContent,/declassati/);
});
test('JSON v6 con tracciabilità incoerente non conserva verifica documentale',async()=>{
  const app=well(browser());
  title(app,'CONCESSIONE',{prova:'Titolo originale',scadenza:'2027-01-01'});
  const saved=JSON.parse(JSON.stringify(app.run('statoPratica()')));
  saved.voci[0].irrigazione.titoliProcedimenti[0].numero='Numero alterato';
  await app.load(saved);
  assert.equal(app.run('vociState[0].irrigazione.titoliProcedimenti[0].statoVerifica'),'ACQUISITO_DA_VERIFICARE');
  assert.notEqual(outcome(app,'IR06b'),'CONFORME');
});
test('importo della voce prevale sul duplicato e round trip JSON v6 conserva prove valide',async()=>{
  const app=well(browser());
  app.run("updVoce(0,'importo',40000)");
  title(app,'CONCESSIONE',{prova:'Concessione round trip',scadenza:'2027-01-01'});
  let saved=JSON.parse(JSON.stringify(app.run('statoPratica()')));
  assert.equal(saved.versione,6);
  assert.equal(saved.voci[0].irrigazione.importi.richiesto,40000);
  saved.voci[0].irrigazione.importi.richiesto=99999;
  await app.load(saved);
  assert.equal(app.run('vociState[0].importo'),40000);
  assert.equal(app.run('vociState[0].irrigazione.importi.richiesto'),40000);
  assert.equal(app.run('vociState[0].irrigazione.importi.richiestoPrecedenteNonSincronizzato'),99999);
  assert.equal(outcome(app,'IR06b'),'CONFORME');
  assert.match(app.el('importStatus').textContent,/importo richiesto interno divergente/);
});
for(const [cod,nonIrr,irr,gia] of [['CR27',20000,20000,0],['CR28',20000,20000,2970000]]){
  test(`${cod} resta non verificabile quando la voce irrigua cambia la soglia`,()=>{
    const app=well(browser());
    app.run(`updVoce(0,'importo',${irr}); addVoce(); updVoce(1,'importo',${nonIrr})`);
    app.el('speseGenManuale').value='0';app.el('giaAmmesso').value=String(gia);
    let result=app.calculate();
    assert.equal(result.killerCriteria.find(k=>k.cod===cod).stato,'NON VERIFICABILE');
    app.run('delVoce(0)');
    result=app.calculate();
    assert.notEqual(result.killerCriteria.find(k=>k.cod===cod).stato,'NON VERIFICABILE');
  });
}
test('CR27 e CR28 restano definiti se la voce irrigua incerta non può cambiare la soglia',()=>{
  const app=well(browser());
  app.run("updVoce(0,'importo',10000); addVoce(); updVoce(1,'importo',50000)");
  app.el('speseGenManuale').value='0'; app.el('giaAmmesso').value='0';
  const result=app.calculate();
  assert.equal(result.killerCriteria.find(k=>k.cod==='CR27').ok,true);
  assert.equal(result.killerCriteria.find(k=>k.cod==='CR28').ok,true);
});
test('atto futuro alla DdS non è titolo già valido',()=>{
  const app=well(browser());
  title(app,'CONCESSIONE',{prova:'Concessione futura',data:'2026-11-01',scadenza:'2027-11-01'});
  assert.equal(outcome(app,'IR06b'),'NON CONFORME');
});
test('assenza accertata contraddetta dal documento non viene registrata',()=>{
  const app=well(browser());
  title(app,'CONCESSIONE',{dichiarazione:'PRESENTE',prova:'Concessione 7',scadenza:'2027-01-01'});
  app.run("impostaStatoAttoIrriguo(0,0,'CONCESSIONE','ASSENZA_ACCERTATA')");
  assert.equal(app.run("vociState[0].irrigazione.titoliProcedimenti[0].statoVerifica"),'ACQUISITO_DA_VERIFICARE');
  assert.notEqual(outcome(app,'IR06b'),'NON CONFORME');
});
test('JSON legacy v4 non promuove verifiche irrigue preesistenti',async()=>{
  const app=browser();
  await app.load({versione:4,campi:{},voci:[{cat:'IRR',importo:40000,irrigazione:{
    classificazione:{confermata:'NUOVO_IMPIANTO'},p1:{statoConsolidamento:'CONSOLIDATO',punteggioDefinitivo:17},
    titoliProcedimenti:[{fonteId:'F1',tipoDocumento:'CONCESSIONE',statoVerifica:'VERIFICATO',prova:'Titolo storico'}]
  }}]});
  const ir=app.run('vociState[0].irrigazione');
  assert.equal(ir.classificazione.confermata,'');
  assert.equal(ir.p1.punteggioDefinitivo,null);
  assert.equal(ir.titoliProcedimenti[0].statoVerifica,'ACQUISITO_DA_VERIFICARE');
});
