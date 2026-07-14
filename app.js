var CONFIG = { settings:{WorkerIdPrefix:'W-'}, stages:[], workers:[] };
var SESSION = null;           // {id, name, stage}
var sessionScans = [];
var ADMIN_PIN = '';

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
    document.getElementById('coName').textContent = r.settings.CompanyName || '';
    var wSel = document.getElementById('loginWorker');
    wSel.innerHTML = '<option value="">— Select employee —</option>' +
      r.workers.map(function(w){ return '<option value="'+w.id+'">'+w.name+' ('+w.id+')</option>'; }).join('');
    var opts = r.stages.map(function(s){ return '<option>'+s.name+'</option>'; }).join('');
    document.getElementById('stageSelect').innerHTML = opts;
    document.getElementById('nwStage').innerHTML = '<option value="">Default stage</option>'+opts;
  });
}
loadConfig();

/* ---------- Tabs ---------- */
function showTab(id, btn){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active')});
  document.querySelectorAll('nav button').forEach(function(b){b.classList.remove('active')});
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  if(id==='dash') loadDashboard();
  if(id==='emp') loadEmployeeStats();
  if(id==='station') focusScan();
}

/* ---------- Login ---------- */
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
  var p = {action:'login', workerId:id};
  if(pin!==null){ p.mode='pin'; p.pin=pin; }
  api(p, function(r){
    if(!r.ok){ beep(false); return setLoginMsg(r.error); }
    startSession(r.worker);
  });
}
function setLoginMsg(m){ document.getElementById('loginMsg').textContent = m; }

function startSession(w){
  SESSION = { id:w.id, name:w.name, stage:'' };
  sessionScans = [];
  var sel = document.getElementById('stageSelect');
  var stages = CONFIG.stages.map(function(s){return s.name;});
  SESSION.stage = stages.indexOf(w.defaultStage) !== -1 ? w.defaultStage : (stages[0]||'');
  sel.value = SESSION.stage;

  document.getElementById('loginView').style.display='none';
  document.getElementById('scanView').style.display='block';
  document.getElementById('employeeChip').style.display='inline-flex';
  document.getElementById('wName').textContent = w.name;
  document.getElementById('wStage').textContent = SESSION.stage;
  document.getElementById('stageLabel').textContent = SESSION.stage;
  document.getElementById('todayCount').textContent = '0';
  renderRecent();
  updateGenBox();
  focusScan();
}
function logout(){
  SESSION = null;
  document.getElementById('scanView').style.display='none';
  document.getElementById('loginView').style.display='block';
  document.getElementById('employeeChip').style.display='none';
  document.getElementById('loginPin').value='';
  setLoginMsg('');
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
  var first = CONFIG.stages.length ? CONFIG.stages[0].name : '';
  document.getElementById('genBox').style.display =
    (SESSION && SESSION.stage === first) ? 'block' : 'none';
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
  var prefix = (CONFIG.settings.WorkerIdPrefix||'W-').toUpperCase();
  if(v.toUpperCase().indexOf(prefix)===0){
    // Worker ID scan hua — session switch
    doSwitch(v);
  } else {
    submitScan(v);
  }
});
function doSwitch(id){
  api({action:'login', workerId:id}, function(r){
    if(!r.ok){ flash(false, r.error); return; }
    startSession(r.worker);
    flash(true, 'Signed in: ' + r.worker.name);
  });
}
function submitScan(serial){
  if(!SESSION) return;
  api({action:'scan', serial:serial, stage:SESSION.stage, workerId:SESSION.id, mode:'scan'}, function(r){
    if(r.ok){
      flash(true, '✔ ' + r.serial + ' saved');
      document.getElementById('todayCount').textContent = r.todayCount;
      sessionScans.unshift({serial:r.serial, time:new Date()});
      if(sessionScans.length>15) sessionScans.pop();
      renderRecent();
    } else {
      flash(false, '✖ ' + serial + ' — ' + r.error);
    }
  });
}
/* ---------- Nayi battery generate + labels ---------- */
function generateBatteries(){
  if(!SESSION) return;
  var count = document.getElementById('genCount').value;
  api({action:'generate', workerId:SESSION.id, count:count}, function(r){
    if(!r.ok){ flash(false, r.error); return; }
    flash(true, '✔ ' + r.serials.length + ' new batteries created — labels below');
    document.getElementById('todayCount').textContent = r.todayCount;
    r.serials.forEach(function(sn){
      sessionScans.unshift({serial:sn, time:new Date()});
    });
    while(sessionScans.length>15) sessionScans.pop();
    renderRecent();
    renderLabels(r.serials);
  });
}
function renderLabels(serials){
  var card = document.getElementById('labelCard');
  var sheet = document.getElementById('labelSheet');
  card.style.display='block';
  sheet.innerHTML = serials.map(function(sn){
    return '<div class="label"><svg class="bc" data-sn="'+sn+'"></svg></div>';
  }).join('');
  sheet.querySelectorAll('svg.bc').forEach(function(el){
    try{
      JsBarcode(el, el.getAttribute('data-sn'),
        {format:'CODE128', width:2, height:52, fontSize:14, margin:6, displayValue:true});
    }catch(e){}
  });
  card.scrollIntoView({behavior:'smooth'});
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

/* ---------- Search ---------- */
function searchBattery(){
  var serial = document.getElementById('searchSerial').value.trim();
  if(!serial) return;
  api({action:'timeline', serial:serial}, function(r){
    var box = document.getElementById('searchResult');
    box.style.display='block';
    if(!r.ok){ box.innerHTML = '<p class="hint" style="color:var(--err)">'+r.error+'</p>'; return; }
    var html = '<h2>'+r.serial+' <span class="badge stage">Current stage: '+r.currentStage+'</span></h2><div class="tl">';
    r.history.forEach(function(h){
      html += '<div class="tl-item"><b>'+h.stage+'</b>' +
        '<div class="meta">'+h.workerName+' ('+h.workerId+') · '+h.time+' · '+h.mode+'</div></div>';
    });
    box.innerHTML = html + '</div>';
  });
}
document.getElementById('searchSerial').addEventListener('keydown', function(e){
  if(e.key==='Enter') searchBattery();
});

/* ---------- Dashboard ---------- */
function loadDashboard(){
  api({action:'dashboard'}, function(r){
    if(!r.ok) return;
    document.getElementById('dashStats').innerHTML =
      stat(r.totalBatteries,'Total batteries') +
      stat(r.completed,'Completed') +
      stat(r.totalBatteries - r.completed,'In production') +
      stat(r.todayScans,"Today's scans");
    document.querySelector('#wipTable tbody').innerHTML = r.stages.map(function(s){
      return '<tr><td>'+s+'</td><td><b>'+(r.wip[s]||0)+'</b></td></tr>';
    }).join('');
    var wt = document.querySelector('#workerTable tbody');
    wt.innerHTML = r.workersToday.length ? r.workersToday.map(function(w){
      var by = Object.keys(w.byStage).map(function(s){ return s+': <b>'+w.byStage[s]+'</b>'; }).join(' · ');
      return '<tr><td>'+w.name+'</td><td>'+by+'</td><td><b>'+w.total+'</b></td></tr>';
    }).join('') : '<tr><td colspan="3" class="hint">No entries yet today</td></tr>';
  });
}
function stat(n,l){ return '<div class="stat"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'; }

/* ---------- Employee performance ---------- */
function loadEmployeeStats(){
  var days = document.getElementById('empPeriod').value;
  api({action:'employeeStats', days:days}, function(r){
    var tb = document.querySelector('#empTable tbody');
    if(!r.ok){ tb.innerHTML = '<tr><td colspan="6" class="hint">'+r.error+'</td></tr>'; return; }
    if(!r.employees.length){
      tb.innerHTML = '<tr><td colspan="6" class="hint">No activity in this period</td></tr>';
      return;
    }
    tb.innerHTML = r.employees.map(function(e){
      var by = Object.keys(e.byStage).map(function(s){
        return s+': <b>'+e.byStage[s]+'</b>';
      }).join(' · ');
      var sp = Object.keys(e.speed).length
        ? Object.keys(e.speed).map(function(s){
            return s+': <b>'+e.speed[s]+'</b> min';
          }).join(' · ')
        : '<span class="hint">Not enough data</span>';
      return '<tr><td><b>'+e.name+'</b><br><span class="hint">'+e.id+'</span></td>' +
        '<td><b>'+e.total+'</b></td><td>'+e.daysWorked+'</td><td>'+e.avgPerDay+'</td>' +
        '<td>'+by+'</td><td>'+sp+'</td></tr>';
    }).join('');
  });
}

/* ---------- Admin ---------- */
function adminVerify(){
  var pin = document.getElementById('adminPin').value;
  api({action:'admin', op:'verify', pin:pin}, function(r){
    if(!r.ok){ document.getElementById('adminMsg').textContent = r.error; return; }
    ADMIN_PIN = pin;
    document.getElementById('adminLogin').style.display='none';
    document.getElementById('adminPanel').style.display='block';
    renderAdmin(r);
  });
}
function refreshAdmin(){
  api({action:'admin', op:'verify', pin:ADMIN_PIN}, function(r){ if(r.ok) renderAdmin(r); loadConfig(); });
}
function renderAdmin(r){
  document.querySelector('#adminWorkers tbody').innerHTML = r.workers.map(function(w){
    return '<tr><td>'+w.id+'</td><td>'+w.name+'</td><td>'+(w.defaultStage||'-')+'</td>' +
      '<td><span class="badge '+(w.active?'on':'off')+'">'+(w.active?'Active':'Inactive')+'</span></td>' +
      '<td><button class="btn ghost sm" onclick="toggleWorker(\''+w.id+'\')">'+(w.active?'Deactivate':'Activate')+'</button></td></tr>';
  }).join('');
  document.querySelector('#adminStages tbody').innerHTML = r.stages.map(function(s){
    var on = String(s.active).toUpperCase()==='YES';
    return '<tr><td>'+s.order+'</td><td>'+s.name+'</td>' +
      '<td><span class="badge '+(on?'on':'off')+'">'+(on?'Active':'Inactive')+'</span></td>' +
      '<td><button class="btn ghost sm" onclick="toggleStage(\''+s.name.replace(/'/g,"\\'")+'\')">'+(on?'Deactivate':'Activate')+'</button></td></tr>';
  }).join('');
  document.querySelector('#adminSettings tbody').innerHTML = Object.keys(r.settings).map(function(k){
    return '<tr><td>'+k+'</td><td><input id="set_'+k+'" value="'+String(r.settings[k]).replace(/"/g,'&quot;')+'" style="padding:6px 8px;font-size:13px"></td>' +
      '<td><button class="btn sm" onclick="saveSetting(\''+k+'\')">Save</button></td></tr>';
  }).join('');
}
function addWorker(){
  api({action:'admin', op:'addWorker', pin:ADMIN_PIN,
       id:val('nwId'), name:val('nwName'), stage:val('nwStage'), workerPin:val('nwPin')},
    function(r){ r.ok ? refreshAdmin() : alert(r.error); });
}
function toggleWorker(id){ api({action:'admin',op:'toggleWorker',pin:ADMIN_PIN,id:id}, function(r){ r.ok?refreshAdmin():alert(r.error); }); }
function addStage(){
  api({action:'admin', op:'addStage', pin:ADMIN_PIN, order:val('nsOrder'), name:val('nsName')},
    function(r){ r.ok ? refreshAdmin() : alert(r.error); });
}
function toggleStage(name){ api({action:'admin',op:'toggleStage',pin:ADMIN_PIN,name:name}, function(r){ r.ok?refreshAdmin():alert(r.error); }); }
function saveSetting(k){
  api({action:'admin', op:'setSetting', pin:ADMIN_PIN, key:k, value:val('set_'+k)},
    function(r){ r.ok ? refreshAdmin() : alert(r.error); });
}
function val(id){ return document.getElementById(id).value.trim(); }

focusScan();
