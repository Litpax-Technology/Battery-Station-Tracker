/* Battery Station Tracker — employee app
 * Screens: Scan Station (sign in + scanning + new battery labels) and My Dashboard.
 * All configuration comes from the backend (getConfig) — nothing hardcoded here. */

var CONFIG = { settings:{WorkerIdPrefix:'W-'}, halls:[], stages:[], workers:[] };
var HALL = '';                // selected hall
var SESSION = null;           // {id, name, hall, stage}
var sessionScans = [];

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

/* ---------- Beeps ---------- */
function beep(ok){
  try{
    var ctx = beep.ctx || (beep.ctx = new (window.AudioContext||window.webkitAudioContext)());
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220; g.gain.value = .15;
    o.start(); o.stop(ctx.currentTime + (ok ? .12 : .3));
  }catch(e){}
}

/* ---------- Boot ---------- */
function loadConfig(){
  api({action:'getConfig'}, function(r){
    if(!r.ok) return;
    CONFIG = r;
    document.getElementById('hallButtons').innerHTML = r.halls.map(function(h){
      return '<button class="btn" style="min-width:160px;padding:16px" onclick="selectHall(\''+h.replace(/'/g,"\\'")+'\')">'+h+'</button>';
    }).join('');
  });
}
loadConfig();

/* ---------- Hall selection ---------- */
function hallStages(){
  return CONFIG.stages.filter(function(s){
    return s.hall.toUpperCase() === HALL.toUpperCase();
  }).map(function(s){ return s.name; });
}
function selectHall(h){
  HALL = h;
  document.getElementById('hallBadge').textContent = h;
  var wSel = document.getElementById('loginWorker');
  wSel.innerHTML = '<option value="">— Select employee —</option>' +
    CONFIG.workers.filter(function(w){
      return (w.hall||'').toUpperCase() === h.toUpperCase();
    }).map(function(w){ return '<option value="'+w.id+'">'+w.name+' ('+w.id+')</option>'; }).join('');
  document.getElementById('stageSelect').innerHTML =
    hallStages().map(function(s){ return '<option>'+s+'</option>'; }).join('');
  document.getElementById('hallView').style.display='none';
  document.getElementById('loginView').style.display='block';
  focusScan();
}
function changeHall(){
  HALL = '';
  setLoginMsg('');
  document.getElementById('loginView').style.display='none';
  document.getElementById('hallView').style.display='block';
}

/* ---------- Tabs ---------- */
function showTab(id, btn){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active')});
  document.querySelectorAll('.nav button').forEach(function(b){b.classList.remove('active')});
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  if(id==='my') loadMyStats();
  if(id==='station') focusScan();
}

/* ---------- Sign in / session ---------- */
document.getElementById('loginScan').addEventListener('keydown', function(e){
  if(e.key!=='Enter') return;
  var v = this.value.trim(); this.value='';
  if(!v) return;
  doLogin(v, null);
});
function pinLogin(){
  var id = document.getElementById('loginWorker').value;
  var pin = document.getElementById('loginPin').value;
  if(!id) return setLoginMsg('Please select an employee');
  doLogin(id, pin);
}
function doLogin(id, pin){
  var p = {action:'login', workerId:id, hall:HALL};
  if(pin!==null){ p.mode='pin'; p.pin=pin; }
  api(p, function(r){
    if(!r.ok){ beep(false); return setLoginMsg(r.error); }
    startSession(r.worker);
  });
}
function setLoginMsg(m){ document.getElementById('loginMsg').textContent = m; }

function startSession(w){
  if(w.hall) HALL = w.hall; // employee's own hall always wins
  SESSION = { id:w.id, name:w.name, hall:HALL, stage:'' };
  sessionScans = [];
  var sel = document.getElementById('stageSelect');
  var stages = hallStages();
  sel.innerHTML = stages.map(function(s){ return '<option>'+s+'</option>'; }).join('');
  SESSION.stage = stages.indexOf(w.defaultStage) !== -1 ? w.defaultStage : (stages[0]||'');
  sel.value = SESSION.stage;

  document.getElementById('hallView').style.display='none';
  document.getElementById('loginView').style.display='none';
  document.getElementById('scanView').style.display='block';
  document.getElementById('employeeChip').style.display='block';
  document.getElementById('wName').textContent = w.name;
  document.getElementById('wHall').textContent = HALL;
  document.getElementById('wStage').textContent = SESSION.stage;
  document.getElementById('stageLabel').textContent = SESSION.stage;
  document.getElementById('todayCount').textContent = '0';
  renderRecent();
  updateGenBox();
  loadTarget();
  focusScan();
}
function loadTarget(){
  if(!SESSION) return;
  api({action:'target', hall:SESSION.hall}, function(r){ renderTarget(r); });
}
function renderTarget(t){
  var card = document.getElementById('targetCard');
  if(!t || !t.ok || !(t.planned > 0)){ card.style.display='none'; return; }
  card.style.display='block';
  document.getElementById('tgtHall').textContent = t.hall;
  document.getElementById('tgtNums').textContent =
    t.achieved + ' / ' + t.planned + ' · ' + t.pct + '%';
  document.getElementById('tgtFill').style.width = t.pct + '%';
}
function logout(){
  SESSION = null;
  HALL = '';
  document.getElementById('targetCard').style.display='none';
  document.getElementById('scanView').style.display='none';
  document.getElementById('loginView').style.display='none';
  document.getElementById('hallView').style.display='block';
  document.getElementById('employeeChip').style.display='none';
  document.getElementById('loginPin').value='';
  setLoginMsg('');
  loadMyStats();
}
function stageChanged(){
  if(!SESSION) return;
  SESSION.stage = document.getElementById('stageSelect').value;
  document.getElementById('wStage').textContent = SESSION.stage;
  document.getElementById('stageLabel').textContent = SESSION.stage;
  document.getElementById('todayCount').textContent = '0';
  updateGenBox();
  focusScan();
}
function updateGenBox(){
  var stages = hallStages();
  var first = stages.length ? stages[0] : '';
  document.getElementById('genBox').style.display =
    (SESSION && SESSION.stage === first) ? 'block' : 'none';
  var models = (CONFIG.models||[]).filter(function(m){
    return m.hall.toUpperCase() === HALL.toUpperCase();
  });
  var sel = document.getElementById('genModel');
  sel.style.display = models.length ? 'inline-block' : 'none';
  sel.innerHTML = '<option value="">— Model —</option>' +
    models.map(function(m){ return '<option>'+m.name+'</option>'; }).join('');
}
function focusScan(){
  var el = SESSION ? document.getElementById('scanInput') : document.getElementById('loginScan');
  setTimeout(function(){ el && el.focus(); }, 100);
}

/* ---------- Scanning ---------- */
document.getElementById('scanInput').addEventListener('keydown', function(e){
  if(e.key!=='Enter') return;
  var v = this.value.trim(); this.value='';
  if(!v) return;
  handleScanValue(v);
});
function handleScanValue(v){
  var wPrefix = (CONFIG.settings.WorkerIdPrefix||'W-').toUpperCase();
  var bPrefix = (CONFIG.settings.BatchIdPrefix||'B-').toUpperCase();
  var V = v.toUpperCase();
  if(V.indexOf(wPrefix)===0){
    doSwitch(v);              // employee ID — session switch
  } else if(V.indexOf(bPrefix)===0){
    submitBatch(v);           // batch label — poore batch ki entry
  } else {
    submitScan(v);            // single battery
  }
}
function submitBatch(batchId){
  if(!SESSION) return;
  api({action:'batchScan', batchId:batchId, stage:SESSION.stage,
       workerId:SESSION.id, hall:SESSION.hall}, function(r){
    var skipBox = document.getElementById('skipList');
    if(!r.ok){ skipBox.innerHTML=''; flash(false, '✖ ' + batchId + ' — ' + r.error); return; }
    var msg = '✔ ' + batchId + ': ' + r.saved + ' saved';
    if(r.skipped.length) msg += ', ' + r.skipped.length + ' skipped';
    flash(r.saved > 0, msg);
    skipBox.innerHTML = r.skipped.length
      ? '<b>Skipped:</b> ' + r.skipped.map(function(x){
          return x.serial + ' (' + x.reason + ')';
        }).join(' · ')
      : '';
    document.getElementById('todayCount').textContent = r.todayCount;
    if(r.target) renderTarget(r.target);
    if(r.saved > 0){
      sessionScans.unshift({serial: batchId + ' × ' + r.saved, time: new Date()});
      while(sessionScans.length>15) sessionScans.pop();
      renderRecent();
    }
  });
}

/* ---------- Camera scanning (phone) ---------- */
var CAM = null, lastCamValue = '', lastCamTime = 0;
function toggleCam(){
  var box = document.getElementById('camBox');
  var btn = document.getElementById('camBtn');
  if(CAM){
    CAM.stop().then(function(){ CAM.clear(); }).catch(function(){});
    CAM = null; box.style.display='none'; box.innerHTML='';
    btn.textContent = '📷 Camera scan';
    focusScan();
    return;
  }
  if(typeof Html5Qrcode === 'undefined'){ flash(false,'Camera library not loaded'); return; }
  box.style.display='block';
  box.innerHTML = '<div id="camReader"></div>';
  CAM = new Html5Qrcode('camReader');
  CAM.start({ facingMode:'environment' }, { fps:10, qrbox:{width:220,height:220} },
    function(text){
      var now = Date.now();
      if(text === lastCamValue && now - lastCamTime < 3000) return; // duplicate frame guard
      lastCamValue = text; lastCamTime = now;
      handleScanValue(text.trim());
    }, function(){}
  ).then(function(){ btn.textContent = '⏹ Stop camera'; })
   .catch(function(){ flash(false,'Camera could not start — allow camera permission');
     box.style.display='none'; CAM = null; });
}
function doSwitch(id){
  api({action:'login', workerId:id}, function(r){
    if(!r.ok){ flash(false, r.error); return; }
    startSession(r.worker);
    flash(true, 'Signed in: ' + r.worker.name);
  });
}
function submitScan(serial){
  if(!SESSION) return;
  document.getElementById('skipList').innerHTML='';
  api({action:'scan', serial:serial, stage:SESSION.stage, workerId:SESSION.id, hall:SESSION.hall, mode:'scan'}, function(r){
    if(r.ok){
      flash(true, '✔ ' + r.serial + ' saved');
      document.getElementById('todayCount').textContent = r.todayCount;
      if(r.target) renderTarget(r.target);
      sessionScans.unshift({serial:r.serial, time:new Date()});
      if(sessionScans.length>15) sessionScans.pop();
      renderRecent();
    } else {
      flash(false, '✖ ' + serial + ' — ' + r.error);
    }
  });
}
function flash(ok, msg){
  beep(ok);
  var z = document.getElementById('scanZone');
  var m = document.getElementById('scanMsg');
  m.textContent = msg; m.className = ok ? 'ok' : 'err';
  z.classList.remove('flash-ok','flash-err');
  void z.offsetWidth;
  z.classList.add(ok ? 'flash-ok' : 'flash-err');
  setTimeout(function(){ z.classList.remove('flash-ok','flash-err'); }, 900);
  focusScan();
}
function renderRecent(){
  var ul = document.getElementById('recentList');
  if(!sessionScans.length){ ul.innerHTML = '<li class="hint" style="border:none">No scans yet</li>'; return; }
  ul.innerHTML = sessionScans.map(function(s){
    return '<li><b>'+s.serial+'</b><span class="t">'+s.time.toLocaleTimeString()+'</span></li>';
  }).join('');
}

/* ---------- New battery + labels ---------- */
function generateBatteries(){
  if(!SESSION) return;
  var count = Math.max(1, Math.min(100, Number(document.getElementById('genCount').value)||1));
  var modelSel = document.getElementById('genModel');
  var model = modelSel.style.display === 'none' ? '' : modelSel.value;
  if(modelSel.style.display !== 'none' && !model){
    flash(false, 'Please select a model first');
    return;
  }
  api({action:'generate', workerId:SESSION.id, hall:SESSION.hall, model:model, count:count}, function(r){
    if(!r.ok){ flash(false, r.error); return; }
    flash(true, '✔ ' + r.serials.length + ' new batteries created — labels below');
    document.getElementById('todayCount').textContent = r.todayCount;
    r.serials.forEach(function(sn){
      sessionScans.unshift({serial:sn, time:new Date()});
    });
    while(sessionScans.length>15) sessionScans.pop();
    renderRecent();
    renderLabels(r);
  });
}
function qr(el, text, size){
  try{ new QRCode(el, {text:text, width:size, height:size,
    correctLevel: QRCode.CorrectLevel.M}); }catch(e){}
}
function renderLabels(r){
  var card = document.getElementById('labelCard');
  var sheet = document.getElementById('labelSheet');
  card.style.display='block';
  sheet.innerHTML = '';

  // Batch label (tray ke liye) — sirf multi-qty pe
  if(r.batchId){
    var b = document.createElement('div');
    b.className = 'label label-batch';
    b.innerHTML = '<div class="qrbox"></div>' +
      '<div class="lbl-title">'+r.batchId+'</div>' +
      '<div class="lbl-meta">'+(r.model||'')+' · Qty '+r.serials.length+'<br>' +
      r.serials[0]+' → '+r.serials[r.serials.length-1]+'<br>' +
      new Date().toLocaleDateString()+'</div>';
    sheet.appendChild(b);
    qr(b.querySelector('.qrbox'), r.batchId, 110);
  }

  // Har battery ka apna label
  r.serials.forEach(function(sn){
    var d = document.createElement('div');
    d.className = 'label';
    d.innerHTML = '<div class="qrbox"></div><div class="lbl-title">'+sn+'</div>' +
      '<div class="lbl-meta">'+(r.model||'')+'</div>';
    sheet.appendChild(d);
    qr(d.querySelector('.qrbox'), sn, 84);
  });

  card.scrollIntoView({behavior:'smooth'});
}

/* ---------- My Dashboard ---------- */
function loadMyStats(){
  var locked = document.getElementById('myLocked');
  var stats = document.getElementById('myStats');
  if(!SESSION){
    locked.style.display='block'; stats.style.display='none';
    return;
  }
  locked.style.display='none'; stats.style.display='block';
  document.getElementById('myDashSub').textContent =
    SESSION.name + ' (' + SESSION.id + ')';

  var days = document.getElementById('myPeriod').value;
  api({action:'employeeStats', days:days, workerId:SESSION.id}, function(r){
    var cards = document.getElementById('myCards');
    var tb = document.querySelector('#myTable tbody');
    if(!r.ok){ tb.innerHTML = '<tr><td colspan="3" class="hint">'+r.error+'</td></tr>'; return; }
    var me = r.employees[0];
    if(!me){
      cards.innerHTML = stat(0,'Total output') + stat(0,'Days worked') + stat(0,'Avg / day');
      tb.innerHTML = '<tr><td colspan="3" class="hint">No activity in this period</td></tr>';
      return;
    }
    cards.innerHTML =
      stat(me.total,'Total output') +
      stat(me.daysWorked,'Days worked') +
      stat(me.avgPerDay,'Avg / day');
    tb.innerHTML = Object.keys(me.byStage).map(function(st){
      var pace = me.speed[st] !== undefined
        ? '<b>'+me.speed[st]+'</b> min / battery'
        : '<span class="hint">Not enough data</span>';
      return '<tr><td>'+st+'</td><td><b>'+me.byStage[st]+'</b></td><td>'+pace+'</td></tr>';
    }).join('');
  });
}
function stat(n,l){ return '<div class="stat"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'; }

focusScan();
