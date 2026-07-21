/* Battery Card page — traveler card ka online version.
 * Serial load karo → card khulta hai → har stage pe worker select + ✓ tick →
 * tick seedha existing scan action se Google Sheets me save hota hai. */

var CONFIG = { stages:[], workers:[], settings:{} };
var CURRENT = null; // {serial, hall, model, created, history}
var TODAY_PLANS = [];

/* ---------- JSONP helper ---------- */
var jsonpCount = 0;
function api(params, cb){
  document.getElementById('loader').style.display='block';
  var name = 'jp' + (++jsonpCount);
  window[name] = function(res){
    document.getElementById('loader').style.display='none';
    delete window[name]; s.remove();
    cb(res || {ok:false, error:'Empty response from server'});
  };
  params.callback = name;
  var q = Object.keys(params).map(function(k){
    return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);
  }).join('&');
  var s = document.createElement('script');
  s.src = API_URL + '?' + q;
  s.onerror = function(){ document.getElementById('loader').style.display='none';
    cb({ok:false, error:'Could not connect to the server'}); };
  document.body.appendChild(s);
}

api({action:'getConfig'}, function(r){
  if(!r.ok) return;
  CONFIG = r;
  loadPending();
  loadTodayPlan();
  document.getElementById('planDate').value = new Date().toISOString().slice(0,10);
  api({action:'todayPlan'}, function(tp){ if(tp.ok) TODAY_PLANS = tp.plans; });
  document.getElementById('genHall').innerHTML =
    (r.halls||[]).map(function(h){ return '<option>'+h+'</option>'; }).join('');
  fillGenModels();
});

function loadPending(){
  api({action:'pendingSerials'}, function(r){
    if(!r.ok) return;
    var sel = document.getElementById('serialSelect');
    sel.innerHTML = '<option value="">— Pending batteries ('+r.serials.length+') —</option>' +
      r.serials.map(function(x){
        return '<option value="'+x.serial+'">'+x.serial+' — '+(x.model||'')+' ('+x.stage+')</option>';
      }).join('');
  });
}

function loadTodayPlan(){
  var box = document.getElementById('todayPlan');
  box.innerHTML = '';
  (CONFIG.halls||[]).forEach(function(h){
    api({action:'target', hall:h}, function(t){
      if(!t.ok) return;
      var d = document.createElement('div');
      d.className = 'stat';
      d.innerHTML = '<div class="n">' +
        (t.planned>0 ? t.achieved+'/'+t.planned : t.achieved) +
        '</div><div class="l">'+t.hall+" — today's plan" +
        (t.planned>0 ? ' ('+t.pct+'%)' : ' (no plan set)')+'</div>';
      box.appendChild(d);
    });
  });
}

function fillGenModels(){
  var hall = document.getElementById('genHall').value;
  var models = (CONFIG.models||[]).filter(function(m){
    return m.hall.toUpperCase() === String(hall).toUpperCase();
  });
  document.getElementById('genModel').innerHTML = models.length
    ? models.map(function(m){ return '<option>'+m.name+'</option>'; }).join('')
    : '<option value="">No models for this hall</option>';
}

/* ---------- Generate + blank cards ---------- */
function generateCards(){
  var hall = document.getElementById('genHall').value;
  var model = document.getElementById('genModel').value;
  var qty = Math.max(1, Math.min(100, Number(document.getElementById('genQty').value)||1));
  if(!hall) return;
  var pDate = document.getElementById('planDate').value;
  api({action:'todayPlan', date:pDate}, function(tp){
    if(tp.ok) TODAY_PLANS = tp.plans;
    api({action:'generate', register:'1', hall:hall, model:model, count:qty}, function(r){
      if(!r.ok){ alert(r.error); return; }
      var box = document.getElementById('genCards');
      box.innerHTML = '';
      var stages = hallStages(hall);
      var today = new Date().toLocaleDateString('en-GB');
      r.serials.forEach(function(sn){
        var d = document.createElement('div');
        d.className = 'bcard';
        d.innerHTML = blankCardHtml(sn, model, hall, today, stages);
        box.appendChild(d);
        try{ new QRCode(d.querySelector('.bc-qr'),
          {text:sn, width:64, height:64, correctLevel:QRCode.CorrectLevel.M}); }catch(e){}
      });
      document.getElementById('genCount').textContent =
        r.serials.length + ' card(s) ready — ' + r.serials[0] +
        (r.serials.length>1 ? ' → ' + r.serials[r.serials.length-1] : '');
      document.getElementById('genWrap').style.display='block';
      box.scrollIntoView({behavior:'smooth'});
      loadPending();
    });
  });
}

function reprintCards(){
  var from = document.getElementById('rpFrom').value.trim();
  var to = document.getElementById('rpTo').value.trim();
  if(!from) return;
  var pDate = document.getElementById('planDate').value;
  api({action:'todayPlan', date:pDate}, function(tp){
    if(tp.ok) TODAY_PLANS = tp.plans;
    api({action:'cardReprint', from:from, to:to}, function(r){
      if(!r.ok){ alert(r.error); return; }
      var box = document.getElementById('genCards');
      box.innerHTML = '';
      r.cards.forEach(function(c){
        var d = document.createElement('div');
        d.className = 'bcard';
        d.innerHTML = blankCardHtml(c.serial, c.model, c.hall,
          c.created || new Date().toLocaleDateString('en-GB'), hallStages(c.hall));
        box.appendChild(d);
        try{ new QRCode(d.querySelector('.bc-qr'),
          {text:c.serial, width:64, height:64, correctLevel:QRCode.CorrectLevel.M}); }catch(e){}
      });
      document.getElementById('genCount').textContent = r.cards.length + ' card(s) — reprint';
      document.getElementById('genWrap').style.display='block';
      box.scrollIntoView({behavior:'smooth'});
    });
  });
}
function blankCardHtml(serial, model, hall, dateStr, stages){
  return '<div class="bc-head">' +
      '<div><div class="bc-co">LITPAX TECHNOLOGY</div>' +
      '<div class="bc-title">Routing card</div>' +
      '<div class="bc-serial">'+serial+'</div></div>' +
      '<div class="bc-qr"></div>' +
    '</div>' +
    '<table class="bc-meta"><tr>' +
      '<td><span>Model</span><b>'+(model||'—')+'</b></td>' +
      '<td><span>Hall</span><b>'+hall+'</b></td>' +
      '<td><span>Created</span><b>'+dateStr+'</b></td>' +
    '</tr></table>' +
    planBlockHtml(hall) +
    '<table class="bc-stages"><thead><tr>' +
      '<th style="width:28%">Stage</th><th style="width:34%">Emp ID</th>' +
      '<th style="width:16%">Done ✓</th><th style="width:22%">Date & Time</th>' +
    '</tr></thead><tbody>' +
    stages.map(function(st, i){
      return '<tr><td><b>'+(i+1)+'. '+st+'</b></td><td></td>' +
        '<td style="text-align:center"><span class="bc-tickbox" style="display:inline-block"></span></td>' +
        '<td></td></tr>';
    }).join('') +
    '</tbody></table>' +
    '<div class="bc-foot">Apna stage complete karke ✓ tick karein. Final stage ke baad card supervisor ko jama karein — entry card.html se hogi.</div>';
}

function planBlockHtml(hall){
  var rows = TODAY_PLANS.filter(function(p){
    return p.hall.toUpperCase() === String(hall).toUpperCase();
  });
  if(!rows.length) return '';
  var total = 0; rows.forEach(function(p){ total += p.qty; });
  return '<table class="bc-meta" style="margin-top:8px"><tr>' +
    "<td><span>TODAY'S PRODUCTION PLAN</span><b>" +
    rows.map(function(p){ return p.model+': '+p.qty; }).join(' · ') +
    ' &nbsp;—&nbsp; Total: '+total+'</b></td></tr></table>';
}

function printGen(){
  document.body.classList.remove('print-fill');
  document.body.classList.add('print-gen');
  setTimeout(function(){ window.print();
    setTimeout(function(){ document.body.classList.remove('print-gen'); }, 500);
  }, 50);
}
function printFill(){
  document.body.classList.remove('print-gen');
  document.body.classList.add('print-fill');
  setTimeout(function(){ window.print();
    setTimeout(function(){ document.body.classList.remove('print-fill'); }, 500);
  }, 50);
}

/* ---------- Load card ---------- */
function loadCard(serialArg){
  var serial = (serialArg || document.getElementById('serialInput').value).trim();
  if(!serial) return;
  document.getElementById('loadMsg').textContent = '';
  api({action:'timeline', serial:serial}, function(r){
    if(!r.ok){
      document.getElementById('cardWrap').style.display='none';
      document.getElementById('loadMsg').textContent = r.error;
      return;
    }
    CURRENT = r;
    renderCard();
  });
}
document.getElementById('serialInput').addEventListener('keydown', function(e){
  if(e.key==='Enter') loadCard();
});

function hallStages(hall){
  return CONFIG.stages.filter(function(s){
    return s.hall.toUpperCase() === String(hall).toUpperCase();
  }).map(function(s){ return s.name; });
}
function stageWorkers(hall, stage){
  var hw = CONFIG.workers.filter(function(w){
    return (w.hall||'').toUpperCase() === String(hall).toUpperCase();
  });
  var mapped = hw.filter(function(w){ return w.defaultStage === stage; });
  return mapped.length ? mapped : hw; // station-mapped pehle, warna poora hall
}

/* ---------- Render ---------- */
function renderCard(){
  var r = CURRENT;
  var stages = hallStages(r.hall);
  var doneMap = {}; // stage -> history entry
  r.history.forEach(function(h){ if(!doneMap[h.stage]) doneMap[h.stage] = h; });

  // Agla actionable stage = pehla jo done nahi hai
  var nextIdx = -1;
  for(var i=0;i<stages.length;i++){
    if(!doneMap[stages[i]]){ nextIdx = i; break; }
  }

  var el = document.getElementById('bcard');
  var html =
    '<div class="bc-head">' +
      '<div><div class="bc-co">LITPAX TECHNOLOGY</div>' +
      '<div class="bc-title">Battery production card</div>' +
      '<div class="bc-serial">'+r.serial+'</div></div>' +
      '<div id="bcQr"></div>' +
    '</div>' +
    '<table class="bc-meta"><tr>' +
      '<td><span>Model</span><b>'+(r.model||'—')+'</b></td>' +
      '<td><span>Hall</span><b>'+r.hall+'</b></td>' +
      '<td><span>Created</span><b>'+(r.created||'—')+'</b></td>' +
    '</tr></table>' +
    '<table class="bc-stages"><thead><tr>' +
      '<th style="width:30%">Stage</th><th style="width:44%">Worker</th><th style="width:26%">Done</th>' +
    '</tr></thead><tbody>';

  stages.forEach(function(st, i){
    var h = doneMap[st];
    html += '<tr><td><b>'+(i+1)+'. '+st+'</b></td>';
    if(h){
      html += '<td>'+h.workerName+' <span class="hint">('+h.workerId+')</span></td>' +
        '<td><span class="bc-done">✓ Done<small>'+h.time+'</small></span>' +
        '<span class="bc-tickbox"></span></td>';
    } else {
      html += '<td><input id="wsel_'+i+'" placeholder="Emp ID (W-104)" autocomplete="off" ' +
        'oninput="detectWorker('+i+')" style="max-width:140px;text-transform:uppercase">' +
        '<div id="wname_'+i+'" class="hint" style="margin-top:4px;font-weight:600"></div>' +
        '<div style="margin-top:6px;display:flex;gap:6px">' +
        '<input type="date" id="wdate_'+i+'" style="padding:5px;font-size:12px">' +
        '<input type="time" id="wtime_'+i+'" style="padding:5px;font-size:12px;max-width:110px">' +
        '</div></td>' +
        '<td><span class="bc-tickbox"></span></td>';
    }
    html += '</tr>';
  });

  html += '</tbody></table>';
  if(stages.some(function(st){ return !doneMap[st]; })){
    html += '<div style="margin:12px 0"><button class="btn" onclick="saveAll()">✓ Save all filled</button></div>';
  }
  html += '<div class="bc-foot">Jitni bhi stages ki Emp ID bhari hai, unhe order me ek saath save karo. Beech me koi blank chhoda to wahin ruk jayega (sequence). Print par khali tick boxes aate hain.</div>';

  el.innerHTML = html;
  try{ new QRCode(document.getElementById('bcQr'),
    {text:r.serial, width:64, height:64, correctLevel:QRCode.CorrectLevel.M}); }catch(e){}
  document.getElementById('cardWrap').style.display='block';
}

function detectWorker(i){
  var v = document.getElementById('wsel_'+i).value.trim().toUpperCase();
  var w = (CONFIG.workers||[]).filter(function(x){ return x.id.toUpperCase() === v; })[0];
  var el = document.getElementById('wname_'+i);
  if(w){ el.style.color = 'var(--ok)'; el.textContent = '✓ ' + w.name; }
  else { el.style.color = 'var(--err)'; el.textContent = v ? 'ID not found' : ''; }
}

function nowLabel(){
  var d = new Date();
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) +
         ', ' + d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}

/* ---------- Tick = save ---------- */
function tick(stage, idx){
  var sel = document.getElementById('wsel_'+idx);
  var workerId = sel ? sel.value.trim().toUpperCase() : '';
  var known = (CONFIG.workers||[]).some(function(x){ return x.id.toUpperCase() === workerId; });
  if(!workerId || !known){ alert('Valid Emp ID daalo — sahi hone par naam green me dikhta hai'); return; }
  var d = document.getElementById('wdate_'+idx);
  var t = document.getElementById('wtime_'+idx);
  var when = (d && d.value && t && t.value) ? (d.value + ' ' + t.value) : '';
  api({action:'scan', serial:CURRENT.serial, stage:stage, workerId:workerId,
       hall:CURRENT.hall, mode:'manual', when:when}, function(r){
    if(!r.ok){ alert(r.error); return; }
    // Local update — koi reload nahi (turant / fast)
    var wObj = (CONFIG.workers||[]).filter(function(x){ return x.id.toUpperCase() === workerId; })[0];
    CURRENT.history.push({ stage:stage, workerId:workerId,
      workerName: wObj ? wObj.name : workerId,
      time: when || nowLabel(), hall:CURRENT.hall, mode:'manual' });
    renderCard();
    if(r.target){ loadPending(); loadTodayPlan(); }
  });
}

function saveAll(){
  var stages = hallStages(CURRENT.hall);
  var doneMap = {};
  CURRENT.history.forEach(function(h){ if(!doneMap[h.stage]) doneMap[h.stage]=h; });

  var items = [];
  for(var i=0;i<stages.length;i++){
    var st = stages[i];
    if(doneMap[st]) continue;
    var sel = document.getElementById('wsel_'+i);
    var id = sel ? sel.value.trim().toUpperCase() : '';
    if(!id) break;                 // blank → ruk jao (sequence)
    var known = (CONFIG.workers||[]).some(function(x){ return x.id.toUpperCase()===id; });
    if(!known){ alert('Stage '+(i+1)+' ('+st+') me Emp ID galat hai'); return; }
    var d = document.getElementById('wdate_'+i);
    var t = document.getElementById('wtime_'+i);
    var when = (d&&d.value&&t&&t.value) ? (d.value+' '+t.value) : '';
    items.push({ stage:st, workerId:id, when:when });
  }
  if(!items.length){ alert('Kam se kam ek stage me Emp ID daalo'); return; }

  api({action:'multiScan', serial:CURRENT.serial, hall:CURRENT.hall,
       items: JSON.stringify(items)}, function(r){
    if(!r.ok){ alert(r.error); return; }
    (r.saved||[]).forEach(function(sv){
      CURRENT.history.push({ stage:sv.stage, workerId:sv.workerId,
        workerName:sv.workerName, time:sv.when, hall:CURRENT.hall, mode:'manual' });
    });
    renderCard();
    if(r.stopReason) alert('Yahan ruka: '+r.stopReason);
    if(r.target){ loadPending(); loadTodayPlan(); }
  });
}

/* ---------- Camera ---------- */
var CAM = null, lastCamValue = '', lastCamTime = 0;
function toggleCam(){
  var box = document.getElementById('camBox');
  var btn = document.getElementById('camBtn');
  if(CAM){
    CAM.stop().then(function(){ CAM.clear(); }).catch(function(){});
    CAM = null; box.style.display='none'; box.innerHTML='';
    btn.textContent = '📷 Camera';
    return;
  }
  if(typeof Html5Qrcode === 'undefined'){ alert('Camera library not loaded'); return; }
  box.style.display='block';
  box.innerHTML = '<div id="camReader"></div>';
  CAM = new Html5Qrcode('camReader');
  CAM.start({ facingMode:'environment' }, { fps:10, qrbox:{width:200,height:200} },
    function(text){
      var now = Date.now();
      if(text === lastCamValue && now - lastCamTime < 3000) return;
      lastCamValue = text; lastCamTime = now;
      document.getElementById('serialInput').value = text.trim();
      loadCard(text.trim());
    }, function(){}
  ).then(function(){ btn.textContent = '⏹ Stop'; })
   .catch(function(){ alert('Camera could not start — allow camera permission');
     box.style.display='none'; CAM = null; });
}
