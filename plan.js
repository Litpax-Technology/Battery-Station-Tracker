/* Production Plan page — production manager/supervisor ke liye.
 * PIN (Settings → AdminPin) se unlock hota hai. */

var CONFIG = { halls:[], models:[] };
var PIN = '';

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

/* ---------- Boot ---------- */
api({action:'getConfig'}, function(r){
  if(!r.ok) return;
  CONFIG = r;
  document.getElementById('planHall').innerHTML =
    r.halls.map(function(h){ return '<option>'+h+'</option>'; }).join('');
  fillModels();
  loadPlans();
});
document.getElementById('planDate').value = todayStr();

function todayStr(){
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

function fillModels(){
  var hall = document.getElementById('planHall').value;
  var models = (CONFIG.models||[]).filter(function(m){
    return m.hall.toUpperCase() === hall.toUpperCase();
  });
  document.getElementById('planModel').innerHTML = models.length
    ? models.map(function(m){ return '<option>'+m.name+'</option>'; }).join('')
    : '<option value="">No models for this hall</option>';
}

/* ---------- Unlock ---------- */
function pmUnlock(){
  var pin = document.getElementById('pmPin').value;
  api({action:'getPlans', pin:pin}, function(r){
    if(!r.ok){ document.getElementById('pmMsg').textContent = r.error; return; }
    PIN = pin;
    document.getElementById('pmLogin').style.display='none';
    document.getElementById('pmPanel').style.display='block';
    renderPlans(r);
  });
}
document.getElementById('pmPin').addEventListener('keydown', function(e){
  if(e.key==='Enter') pmUnlock();
});

/* ---------- Save + list ---------- */
function savePlan(mode){
  var msg = document.getElementById('saveMsg');
  msg.textContent = '';
  api({action:'addPlan', pin:PIN, mode: mode || 'add',
       date: document.getElementById('planDate').value,
       hall: document.getElementById('planHall').value,
       model: document.getElementById('planModel').value,
       qty: document.getElementById('planQty').value},
    function(r){
      if(!r.ok){ msg.style.color='var(--err)'; msg.textContent = r.error; return; }
      msg.style.color='var(--ok)';
      msg.textContent = r.updated ? 'Quantity updated ✔' : 'Plan saved ✔';
      document.getElementById('planQty').value = '';
      loadPlans();
    });
}

function loadPlans(){
  api({action:'getPlans', pin:PIN, date: document.getElementById('planDate').value},
    function(r){ if(r.ok) renderPlans(r); });
}

function renderPlans(r){
  document.getElementById('listDate').textContent = r.date;
  var tb = document.querySelector('#planTable tbody');
  if(!r.plans.length){
    tb.innerHTML = '<tr><td colspan="5" class="hint">No plan entered for this date</td></tr>';
    return;
  }
  tb.innerHTML = r.plans.map(function(p){
    return '<tr><td>'+p.hall+'</td><td><b>'+p.model+'</b></td>' +
      '<td>'+p.planned+' <button class="btn ghost sm" onclick="editPlan(\''+p.hall+'\',\''+p.model+'\','+p.planned+')">✏️</button></td>' +
      '<td><b>'+p.achieved+'</b></td>' +
      '<td style="min-width:140px"><div class="progress" style="margin-top:0">' +
      '<div class="progress-fill" style="width:'+Math.min(100,p.pct)+'%"></div></div>' +
      '<span class="hint">'+p.pct+'%</span></td></tr>';
  }).join('');
}

document.getElementById('planDate').addEventListener('change', function(){
  if(PIN) loadPlans();
});


function editPlan(hall, model, qty){
  document.getElementById('planHall').value = hall;
  fillModels();
  document.getElementById('planModel').value = model;
  var v = prompt('New planned qty for ' + model + ':', qty);
  if(v === null || !(Number(v) > 0)) return;
  document.getElementById('planQty').value = v;
  savePlan('set');
}
function addModel(){
  var name = document.getElementById('nmName').value.trim();
  if(!name) return;
  api({action:'addModel',
       name:name, hall:document.getElementById('planHall').value,
       details:document.getElementById('nmDetails').value.trim()},
    function(r){
      if(!r.ok){ alert(r.error); return; }
      document.getElementById('nmName').value='';
      document.getElementById('nmDetails').value='';
      api({action:'getConfig'}, function(c){ if(c.ok){ CONFIG=c; fillModels(); } });
    });
}
