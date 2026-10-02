# Scheda preliminare di prefattibilità SRD01.05 — CSR Puglia 2023–2027

Web app per compilare una scheda preliminare orientativa per il bando **SRD01.05 — Investimenti produttivi agricoli per la competitività** (Regione Puglia), aggiornata all'Avviso DAdG 37/2026 nel testo consolidato della **DAdG 49 del 24/07/2026** e alle FAQ del 06/08/2026.

Lo strumento è pensato per il primo colloquio con la ditta: raccoglie i dati dichiarati dal richiedente, produce un pre-studio firmabile per presa visione e rimanda le verifiche documentali al successivo conferimento di incarico.

## Come si usa

Apri `index.html` nel browser (oppure la versione online su GitHub Pages), carica eventualmente il fascicolo aziendale AGEA in PDF per precompilare i dati disponibili, integra o correggi manualmente le informazioni dichiarate dalla ditta e la prima ipotesi di investimento, premi **Calcola prefattibilità** e poi **Salva PDF** per scaricare il report. Con **Salva pratica** / **Apri pratica salvata** tutti i dati inseriti si salvano su file JSON e si riprendono in seguito.

Tutto il calcolo avviene nel browser: nessun dato viene inviato a server esterni. La lettura del PDF usa PDF.js dalla copia locale in `vendor/pdfjs` (con CDN solo come ripiego se la copia locale non è raggiungibile), quindi il fascicolo resta sul dispositivo; se il fascicolo non è leggibile automaticamente, la compilazione manuale resta sempre disponibile. Nota: i file su Google Drive/iCloud vanno prima resi disponibili offline o scaricati in locale, altrimenti il browser non riesce a leggerli.

## Cosa calcola

- **Fase 1 — Requisiti minimi (killer criteria):** CR01 soggettività, CR02 dimensione economica (PS ≥ 15.000 €, deroga olivicola ≥ 5.000 €), CR27 soglia minima di spesa (30.000 €), CR28 massimale cumulativo (3.000.000 € nel periodo 2023-2027), CR32 titolo di disponibilità degli immobili (ex CR31, rinumerato dalla DAdG 49; il comodato è controllato voce per voce sulle particelle selezionate).
- **CR01 cooperative:** una generica cooperativa agricola resta **NON VERIFICABILE** finché non è accertato che sia di conduzione, anche quando è classificata IA con genere «Società» e tipo «Cooperativa». La dichiarazione richiede verifica; documenti ambigui richiedono valutazione dell'agronomo. Per una cooperativa non di conduzione classificata IA, l'eventuale domanda come imprenditore agricolo singolo resta in valutazione agronomica. Il solo fascicolo AGEA non imposta la verifica. Riferimenti: DAdG 49/2026, Avviso BURP 62, p. 20; FAQ 06/08/2026, p. 3.
- **Import fascicolo AGEA:** precompilazione orientativa di anagrafica (anche società agricole), CUAA, genere (dal codice fiscale), data di nascita, sede, OTE/PS, PS olivicola, affitto e quote P3 ricavabili dai vincoli del fascicolo.
- **Selezione particelle catastali:** dall'elenco del fascicolo si selezionano, per ogni voce di spesa su terreno (impianti arborei, irrigui, opere edili, invasi, ecc.), le particelle interessate con la relativa superficie; per gli impianti irrigui è possibile indicare la presenza del pozzo. Le particelle sono orientative e vanno verificate sulla visura.
- **Fase 2 — Aliquota e contributo:** aliquota per voce secondo la DAdG 49/2026: 80% giovane agricoltore (meno di 41 anni alla scadenza della DdS); 65% per gli investimenti fissi localizzati in zone montane o con svantaggi naturali e per i beni mobili con oltre il 50% della SAU in tali zone; 60% base. **Spese generali** stimate con la Metodologia ISMEA nov. 2025 per linea d'intervento EIP (o inserite a mano), con l'aliquota dell'investimento prevalente della linea.
- **Fase 3 — Punteggio di selezione** (soglia minima 30 pt): principi P1–P8 con dettaglio analitico del calcolo.
- **Fase 4 — Analisi tecnica dell'investimento:** per ogni voce di spesa (macchinari standard e 4.0, impianti arborei, opere edili, impianti irrigui, invasi, rinnovabili, filiera corta, silos/celle frigo) l'app applica le regole di validazione e determina se la voce è prioritaria ai fini del P1:
  - **Macchinari 4.0:** requisito verificato con almeno 2 caratteristiche su 6 (programmazione HW/SW, interconnessione remota, integrazione logistica, interfaccia uomo-macchina, telemanutenzione, monitoraggio di processo).
  - **Impianti arborei:** esclusione di rinfittimenti/ripristino fallanze; specie già finanziate in precedenti Avvisi SRD01 non prioritarie; valorizzazione a Costi Standard (Metodologia UCS Impianti Arborei — RRN).
  - **Impianti arborei:** olivo, ciliegio, uva da tavola e agrumi riconosciuti in automatico come specie già finanziate (non prioritarie, FAQ 06/08/2026).
  - **Opere edili:** ammissibili se consentite dagli strumenti urbanistici vigenti, con destinazione produttiva; computo metrico sul Prezzario regionale OOPP Puglia edizione 2026 (DGR 774/2026).
  - **Investimenti irrigui — M2.1:** registra la classificazione dichiarata dell'intervento e il metodo proposto dell'Allegato 5. L'indice ufficiale deriva esclusivamente dal codice 12–17; la stima percentuale libera resta un dato dichiarato senza valore normativo automatico. Ammissibilità, titoli, CR21 e P1 irrigui restano `NON VERIFICABILE` fino alle milestone successive e alla verifica tecnica.
  - **Esclusioni DAdG 49 / FAQ:** mezzi di trasporto e movimento terra (anche dalla descrizione), cisterne alimentate solo da acque meteoriche, rinnovabili non in esclusivo autoconsumo o sovradimensionate rispetto al fabbisogno.
- **Check-list documentale (Tabella 9)** generata in base al profilo e alle voci di spesa: sempre DOC01, DOC05, DOC07, DOC11, DOC20, DOC21, DOC22; DOC02 per immobili non in proprietà con titolo idoneo; DOC03 per soggetti collettivi/società; DOC08/09/10 per edilizia; DOC12 per beni fuori prezzario; DOC13 per beni unici; DOC14 per rinnovabili; DOC19 per sostenibilità finanziaria; DOC04 per investimenti irrigui. Con avviso sull'obbligo di gestione dematerializzata dei preventivi tramite portale SIAN.
- **DOC03 (ove necessario):** compare anche per le società agricole classificate IA. Per OP e Reti le verifiche compilate producono l'esito documentale. La verifica registra se gli atti sono effettivamente dovuti e, se sì, se sono stati controllati; se non dovuti, richiede una motivazione. Per le Reti si controlla separatamente il Regolamento Interno, senza presumere che sia presente. Riferimenti: DAdG 49/2026, Avviso BURP 62, p. 35, Tabella 9, e p. 37.
- **Pratiche JSON:** i file versione 2, 3 e 4 restano leggibili e non sono riscritti all'apertura. I nuovi dati irrigui mancanti restano ignoti: le vecchie percentuali e caselle non diventano automaticamente metodi, titoli o verifiche normative. L'app avvisa quando i dati irrigui, CR01 o DOC03 richiedono una rivalutazione. I nuovi salvataggi sono versione 5.

## Test automatici

Dal repository: `node --test tests/*.test.cjs` (Milestone 1 CR01/DOC03 e fondamenta irrigue M2.1).

## Note metodologiche

- Il punteggio P3 (localizzazione) è calcolato in modo ponderato rispetto al valore dell'investimento ricadente in ciascuna zona, come previsto dall'Avviso SRD01.05 generalista. Con il fascicolo caricato il ricalcolo è automatico: le voci su terreno pesano sulle particelle selezionate, i beni mobili sull'intera superficie aziendale.
- **Area delimitata Xylella:** il fascicolo AGEA non la riporta; l'app la attribuisce per comune (tutti i comuni delle province di Lecce, Brindisi e Taranto, più i comuni indicati a mano, ad es. per la provincia di Bari).
- Zone svantaggiate (criterio 3.7 e aliquota 65%): comprendono sia le zone montane sia quelle con svantaggi naturali (DAdG 49/2026).
- P1 è calcolato sugli investimenti escluse le spese generali; CR27, CR28, P5 e il criterio 8.2.b (≤ 50.000 €) sulla spesa complessiva comprese le spese generali.
- La qualifica di Giovane Agricoltore è acquisita come dichiarazione preliminare e va verificata con la documentazione in fase di incarico.
- **Società:** il rappresentante legale (nome, codice fiscale, genere ed età) è letto dal fascicolo, ma per il criterio 4.1 e l'aliquota 80% conta la compagine sociale: società di persone almeno 2/3 dei soci (accomandatari nelle s.a.s.) giovani o donne; società di capitali oltre il 50% del capitale e maggioranza degli amministratori (DAdG 49/2026, FAQ 06/08/2026).
- Se un dato di input è assente (es. OTE per il P5), il principio è marcato "N.D." ed escluso dal calcolo.

La scheda ha valore preliminare e orientativo: non costituisce asseverazione, Domanda di Sostegno, garanzia di ammissibilità o garanzia di finanziamento. L'esito definitivo resta di competenza dell'istruttoria dell'Autorità di Gestione.

---
Dott. Agr. Ruggero Manca · ODAF Lecce n° 636 · idearurale
