(() => {
  // Tot el codi queda dins d'una funció per no afegir variables globals innecessàries.
  // Aquesta petita funció evita repetir document.getElementById a cada accés.
  const $ = id => document.getElementById(id);
  const chartEl=$('chart'), statusEl=$('status'), countEl=$('countryCount'), resetEl=$('resetButton');
  const topModeEl=$('topMode'), manualModeEl=$('manualMode'), countControlEl=$('countControl'), pickerEl=$('countryPicker');
  const searchEl=$('countrySearch'), optionsEl=$('countryOptions'), selectedCountEl=$('selectedCount'), clearCountriesEl=$('clearCountries');
  const tooltip=$('chordTooltip'), modal=$('countryModal');
  // Estat de la interfície: dades carregades, mode de selecció i país actiu.
  let data, activeCountry=null, resizeTimer, mode='top', manualSelected=new Set(), lastTopIds=[];
  // Formats numèrics locals: català per als nombres i USD per als imports comercials.
  const number=new Intl.NumberFormat('ca-ES',{maximumFractionDigits:0});
  const money=v=>new Intl.NumberFormat('ca-ES',{style:'currency',currency:'USD',notation:v>=1e9?'compact':'standard',maximumFractionDigits:v>=1e9?2:0}).format(v);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Converteix codis de país en noms en català quan hi ha una traducció disponible.
  const nameOf=nodeOrId=>{const id=typeof nodeOrId==='string'?nodeOrId:nodeOrId?.id;const node=typeof nodeOrId==='object'?nodeOrId:data?.nodes.find(n=>n.id===id);return window.COUNTRY_NAMES_CA?.[id]||node?.name||id||'';};
  const allLinks=()=>data.links.filter(d=>Number.isFinite(+d.value)&&+d.value>0);
  const clampCountryCount=()=>{const max=data?.nodes.length||237;let value=Number.parseInt(countEl.value,10);if(!Number.isFinite(value))value=12;value=Math.max(2,Math.min(max,value));countEl.value=String(value);return value;};
  // Controls principals: nombre de països, canvi de mode, cerca i reinici.
  countEl.addEventListener('change',()=>{clampCountryCount();activeCountry=null;render();});
  countEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clampCountryCount();activeCountry=null;render();countEl.blur();}});
  topModeEl.addEventListener('click',()=>setMode('top')); manualModeEl.addEventListener('click',()=>setMode('manual'));
  searchEl.addEventListener('input',renderCountryOptions);
  clearCountriesEl.addEventListener('click',()=>{manualSelected.clear();renderCountryOptions();render();});
  resetEl.addEventListener('click',()=>{countEl.value='12';mode='top';manualSelected.clear();activeCountry=null;updateModeUI();renderCountryOptions();render();hideTooltip();closeModal();});
  $('closeModal').addEventListener('click',closeModal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
  // Textos dels quatre apartats informatius, mostrats sota les icones.
  const infoPanel=$('infoPanel');
  let activeInfoKey=null;
  const infoContent={
    visualitzacio:{title:'Visualització',html:'<p>El diagrama de cordes mostra els fluxos comercials transfronterers de peix i productes aquàtics (HS 03) declarats el 2024. Cada segment representa un país i cada corda, una exportació dirigida cap a un altre país. El gruix de la connexió és proporcional al valor declarat en dòlars nord-americans (USD).</p><p>Pots explorar els països principals o seleccionar-ne manualment. En passar el cursor per una corda es mostra el valor del flux; en seleccionar un país es pot consultar el resum interactiu.</p>'},
    limitacions:{title:'Limitacions i interpretació',html:'<p>Les dades corresponen a exportacions declarades i poden presentar diferències de cobertura, valoració i registre entre països. Una exportació declarada per un país no sempre coincideix amb la importació registrada pel soci comercial.</p><p>El diagrama només mostra els països seleccionats i les connexions entre aquests països. Per tant, els resums interactius d’exportacions, importacions i socis comercials descriuen els fluxos visibles en la selecció actual, no necessàriament el comerç total mundial de cada país.</p><p>La selecció dels països i dels fluxos visibles condiciona la interpretació; el diagrama és una eina exploratòria i no un balanç comercial complet.</p>'},
    font:{title:'Font de les dades i llicència',html:'<p><strong>Font:</strong> United Nations Comtrade (UN Comtrade), base de dades d’estadístiques de comerç internacional de les Nacions Unides. <a href="https://comtradeplus.un.org/" target="_blank" rel="noopener noreferrer">Web oficial d’UN Comtrade</a>.</p><p><strong>Citació:</strong> United Nations Statistics Division. <em>UN Comtrade Database</em>. <a href="https://comtradeplus.un.org/" target="_blank" rel="noopener noreferrer">https://comtradeplus.un.org/</a>.</p><p><strong>Llicència i condicions d’ús:</strong> les dades estan subjectes als drets d’autor i a les condicions d’ús de les Nacions Unides. La visualització i l’anàlisi poden estar permeses gratuïtament, mentre que la redistribució de les dades originals està subjecta a condicions específiques.</p><p><a href="https://comtradeplus.un.org/LicenseAgreement" target="_blank" rel="noopener noreferrer">Acord de llicència</a> · <a href="https://uncomtrade.org/docs/re-dissemination-of-data/" target="_blank" rel="noopener noreferrer">Política de redistribució</a>.</p>'},
    preparacio:{title:'Fitxer original i tractament de les dades',html:'<p><strong>Fitxer original:</strong> <code>TradeData_10_26_2026_17_35_15.csv</code> La data de descàrrega indicada és el 10 d’octubre de 2026.</p><p><strong>Tractament i agregació:</strong> s’han seleccionat els registres d’exportacions de 2024 corresponents al codi de producte HS 03 i s’han exclòs els registres agregats de l’àmbit mundial (<em>World</em>) per evitar barrejar totals globals amb fluxos bilaterals. Cada registre restant es representa com una connexió dirigida entre un país exportador i un país importador, ponderada pel valor declarat de les exportacions (<code>primaryValue</code>), expressat en dòlars nord-americans (USD).</p><p>Els països principals s’ordenen segons el volum dels fluxos comercials associats. Els resums interactius d’exportacions, importacions i principals socis es calculen a partir dels fluxos visibles en la selecció actual.</p>'}
  };
  // Només un apartat informatiu pot estar obert alhora. Tornar a prémer la icona el tanca.
  document.querySelectorAll('[data-info]').forEach(button=>button.addEventListener('click',()=>{
    const key=button.dataset.info, item=infoContent[key];
    if(!item)return;
    if(activeInfoKey===key){infoPanel.hidden=true;activeInfoKey=null;button.classList.remove('is-active');button.setAttribute('aria-expanded','false');return;}
    document.querySelectorAll('[data-info]').forEach(b=>{b.classList.remove('is-active');b.setAttribute('aria-expanded','false');});
    activeInfoKey=key;
    $('infoPanelTitle').textContent=item.title;
    $('infoPanelContent').innerHTML=item.html;
    infoPanel.hidden=false;
    button.classList.add('is-active');button.setAttribute('aria-expanded','true');
    infoPanel.scrollIntoView({behavior:'smooth',block:'nearest'});
  }));
  // Escape tanca els elements oberts; el redimensionament torna a dibuixar el diagrama.
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();infoPanel.hidden=true;activeInfoKey=null;document.querySelectorAll('[data-info]').forEach(b=>{b.classList.remove('is-active');b.setAttribute('aria-expanded','false');});hideTooltip();pickerEl.hidden=true;}});
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,120);});
  // Les dades s'incorporen també a trade-data.js perquè l'HTML funcioni en obrir-se localment.
  // Si aquest fitxer no està disponible, s'intenta llegir la versió JSON de /data.
  const loadData=window.TRADE_DATA?Promise.resolve(window.TRADE_DATA):fetch('data/trade_flows.json').then(r=>{if(!r.ok)throw new Error(`Error en carregar les dades (${r.status})`);return r.json();});
  loadData.then(json=>{if(!Array.isArray(json.nodes)||!Array.isArray(json.links))throw new Error('Format de dades inesperat');data=json;if(!window.d3||typeof d3.chordDirected!=='function'||typeof d3.ribbonArrow!=='function')throw new Error('No s’ha pogut carregar D3.js. Comprova la connexió a internet.');render();}).catch(err=>{console.error(err);chartEl.innerHTML='<div class="error">No s’ha pogut carregar el diagrama. Comprova la connexió a internet.</div>';statusEl.textContent='No s’han pogut carregar les dades';});
  // Canvia entre els països principals i la selecció manual.
  function setMode(next){if(next===mode){if(next==='manual')pickerEl.hidden=!pickerEl.hidden;return;}if(next==='manual'){if(manualSelected.size<2&&lastTopIds.length)manualSelected=new Set(lastTopIds);mode='manual';pickerEl.hidden=false;searchEl.value='';renderCountryOptions();}else{mode='top';pickerEl.hidden=true;}activeCountry=null;updateModeUI();render();}
  // Manté els botons i els controls sincronitzats amb el mode actiu.
  function updateModeUI(){topModeEl.classList.toggle('is-active',mode==='top');manualModeEl.classList.toggle('is-active',mode==='manual');topModeEl.setAttribute('aria-pressed',String(mode==='top'));manualModeEl.setAttribute('aria-pressed',String(mode==='manual'));countControlEl.hidden=mode!=='top';pickerEl.hidden=mode!=='manual';}
  // Genera la llista de països seleccionables i aplica el filtre de cerca.
  function renderCountryOptions(){if(!data)return;const q=searchEl.value.trim().toLocaleLowerCase('ca');const items=[...data.nodes].sort((a,b)=>nameOf(a).localeCompare(nameOf(b),'ca'));const filtered=items.filter(d=>nameOf(d).toLocaleLowerCase('ca').includes(q)||d.id.toLocaleLowerCase().includes(q));optionsEl.replaceChildren();filtered.forEach(node=>{const label=document.createElement('label');label.className='country-option';const cb=document.createElement('input');cb.type='checkbox';cb.checked=manualSelected.has(node.id);cb.addEventListener('change',()=>{if(cb.checked)manualSelected.add(node.id);else manualSelected.delete(node.id);selectedCountEl.textContent=`${manualSelected.size} seleccionats`;render();});const n=document.createElement('span');n.textContent=nameOf(node);const code=document.createElement('small');code.textContent=node.id;label.append(cb,n,code);optionsEl.append(label);});if(!filtered.length)optionsEl.innerHTML='<div class="no-country-results">No s’han trobat països</div>';selectedCountEl.textContent=`${manualSelected.size} seleccionats`;}
  // Construeix la matriu origen-destinació i dibuixa arcs, etiquetes i cordes amb D3.
  // Cada actualització reconstrueix el SVG perquè el resultat segueixi els filtres actuals.
  function render(){if(!data||!window.d3)return;hideTooltip();chartEl.replaceChildren();const linksAll=allLinks(),totals=new Map();linksAll.forEach(d=>{totals.set(d.source,(totals.get(d.source)||0)+ +d.value);totals.set(d.target,(totals.get(d.target)||0)+ +d.value);});const nodeById=new Map(data.nodes.map(d=>[d.id,d]));const topIds=[...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,clampCountryCount()).map(d=>d[0]);lastTopIds=topIds;const ids=(mode==='manual'?[...manualSelected]:topIds).filter(id=>totals.has(id));const idSet=new Set(ids),nodes=ids.map(id=>nodeById.get(id)).filter(Boolean),links=linksAll.filter(d=>idSet.has(d.source)&&idSet.has(d.target));if(nodes.length<2||!links.length){statusEl.textContent=mode==='manual'?'Tria almenys dos països connectats':'No hi ha connexions';chartEl.innerHTML='<div class="empty-state">'+(mode==='manual'?'Tria almenys dos països per mostrar el diagrama.':'No hi ha connexions disponibles.')+'</div>';return;}
    // D3 espera una matriu quadrada: files = exportadors, columnes = importadors.
    const index=new Map(ids.map((id,i)=>[id,i])),matrix=Array.from({length:ids.length},()=>Array(ids.length).fill(0));links.forEach(d=>matrix[index.get(d.source)][index.get(d.target)]+=+d.value);
    // El radi s'adapta a l'espai disponible i deixa marge per a les etiquetes exteriors.
    const width=Math.max(320,chartEl.clientWidth||900),height=Math.max(390,chartEl.clientHeight||620),radius=Math.min(width*.35,height*.39,300),inner=radius-12;
    const svg=d3.select(chartEl).append('svg').attr('viewBox',`${-width/2} ${-height/2} ${width} ${height}`).attr('role','img').attr('aria-label','Diagrama de cordes dels fluxos comercials entre països');
    // Paleta apagada i diferenciada per identificar cada país sense competir amb les cordes.
    const palette=['#456f5c','#c58a67','#799a89','#d4b47a','#5e8298','#a6b7a1','#b97673','#8d85a5','#c3b06d','#638e87','#d19a78','#819eaf','#9d806c','#87996f','#b58f9f','#54766e','#c9aa86','#8a9eb4','#a7a28d','#73917c'];
    const color=d3.scaleOrdinal(ids,palette),chords=d3.chordDirected().padAngle(Math.min(.035,1.7/ids.length)).sortSubgroups(d3.descending).sortChords(d3.descending)(matrix),arc=d3.arc().innerRadius(inner).outerRadius(radius),ribbon=d3.ribbonArrow().radius(inner-1).padAngle(.006),root=svg.append('g');
    const group=root.append('g').selectAll('g').data(chords.groups).join('g');
    const arcs=group.append('path').attr('class','group-arc').attr('d',arc).attr('fill',d=>color(ids[d.index]));
    const labels=group.append('text').attr('class','group-label').attr('dy','.32em').attr('transform',d=>{const a=(d.startAngle+d.endAngle)/2;return `rotate(${a*180/Math.PI-90}) translate(${radius+9},0) ${a>Math.PI?'rotate(180)':''}`;}).attr('text-anchor',d=>((d.startAngle+d.endAngle)/2)>Math.PI?'end':'start').text(d=>shorten(nameOf(nodeById.get(ids[d.index])),width<560?13:19));
    const ribbons=root.append('g').selectAll('path').data(chords).join('path').attr('class','chord').attr('d',ribbon).attr('fill',d=>color(ids[d.source.index]));
    // En passar per un país, es ressalten només les connexions que hi participen.
    function highlightCountry(id){ribbons.attr('fill-opacity',d=>ids[d.source.index]===id||ids[d.target.index]===id?.9:.035);arcs.attr('opacity',d=>ids[d.index]===id?1:.28);labels.attr('opacity',d=>ids[d.index]===id?1:.3);}
    function restore(){if(activeCountry)highlightCountry(activeCountry);else{ribbons.attr('fill-opacity',.57);arcs.attr('opacity',1);labels.attr('opacity',1);}}
    arcs.on('mouseenter',(event,d)=>highlightCountry(ids[d.index])).on('mouseleave',restore).on('click',(event,d)=>{activeCountry=ids[d.index];restore();showCountryModal(ids[d.index],linksAll,nodeById);});
    labels.style('cursor','pointer').on('click',(event,d)=>{activeCountry=ids[d.index];restore();showCountryModal(ids[d.index],linksAll,nodeById);});
    ribbons.on('mouseenter',(event,d)=>{ribbons.attr('fill-opacity',x=>x===d?.98:(x.source.index===d.source.index||x.target.index===d.target.index?.36:.035));arcs.attr('opacity',g=>[d.source.index,d.target.index].includes(g.index)?1:.25);labels.attr('opacity',g=>[d.source.index,d.target.index].includes(g.index)?1:.3);showTooltip(event,ids[d.source.index],ids[d.target.index],matrix[d.source.index][d.target.index]);})
      .on('mousemove',event=>moveTooltip(event)).on('mouseleave',()=>{hideTooltip();restore();}).on('click',(event,d)=>{showConnectionModal(ids[d.source.index],ids[d.target.index],matrix[d.source.index][d.target.index],nodeById);});
    restore();statusEl.textContent=mode==='manual'?`${nodes.length} països seleccionats`:`${nodes.length} països`;}
  // El tooltip segueix el cursor i evita sortir dels límits de la finestra.
  function showTooltip(event,sourceId,targetId,value){tooltip.innerHTML=`<div class="tooltip-route">${esc(nameOf(sourceId))} <span>→</span> ${esc(nameOf(targetId))}</div><strong>${money(value)}</strong><small>Valor declarat de les exportacions · 2024</small>`;tooltip.hidden=false;moveTooltip(event);}
  function moveTooltip(event){if(tooltip.hidden)return;const pad=14;let x=event.clientX+pad,y=event.clientY+pad;const r=tooltip.getBoundingClientRect();if(x+r.width>innerWidth-8)x=event.clientX-r.width-pad;if(y+r.height>innerHeight-8)y=event.clientY-r.height-pad;tooltip.style.left=`${Math.max(8,x)}px`;tooltip.style.top=`${Math.max(8,y)}px`;}
  function hideTooltip(){tooltip.hidden=true;}
  // Detall d'una corda: flux declarat entre el país exportador i l'importador.
  function showConnectionModal(sourceId,targetId,value,nodeById){$('modalTitle').textContent=`${nameOf(sourceId)} → ${nameOf(targetId)}`;$('modalTotal').textContent=money(value);$('modalExports').textContent=money(value);$('modalImports').textContent='—';$('modalPartners').textContent='1';$('modalPartnersList').innerHTML='<div class="modal-partner-row">Valor declarat de les exportacions · 2024</div>';$('countryModal').querySelector('.detail-kicker').textContent='DETALL DE LA CONNEXIÓ';$('countryModal').querySelector('.modal-total-label').textContent='Valor comercial';modal.hidden=false;}
  // Resum del país calculat a partir dels fluxos del conjunt de dades carregat.
  function showCountryModal(id,links,nodeById){const node=nodeById.get(id);let exports=0,imports=0;const partners=new Map();links.forEach(d=>{if(d.source===id){exports+=+d.value;partners.set(d.target,(partners.get(d.target)||0)+ +d.value);}if(d.target===id){imports+=+d.value;partners.set(d.source,(partners.get(d.source)||0)+ +d.value);}});const ranked=[...partners.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);$('countryModal').querySelector('.detail-kicker').textContent='RESUM DEL PAÍS';$('countryModal').querySelector('.modal-total-label').textContent='Comerç bilateral registrat';$('modalTitle').textContent=nameOf(node||id);$('modalTotal').textContent=money(exports+imports);$('modalExports').textContent=money(exports);$('modalImports').textContent=money(imports);$('modalPartners').textContent=number.format(partners.size);$('modalPartnersList').innerHTML=ranked.map(([pid,val])=>`<div class="modal-partner-row"><span>${esc(nameOf(nodeById.get(pid)||pid))}</span><strong>${money(val)}</strong></div>`).join('')||'<div class="modal-partner-row">No hi ha dades disponibles</div>';modal.hidden=false;}
  // Tanca el resum del país.
  function closeModal(){modal.hidden=true;}
  function shorten(s,n){s=String(s||'');return s.length>n?s.slice(0,n-1).trimEnd()+'…':s;}
})();
