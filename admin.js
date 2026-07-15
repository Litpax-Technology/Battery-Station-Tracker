/* Admin Dashboard — production overview. PIN (Settings → AdminPin) se unlock. */

var CONFIG = { halls:[] };
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

api({action:'getConfig'}, function(r){ if(r.ok) CONFIG = r; });

/* ---------- Gate ---------- */
function unlock(){
  var pin = document.getElementById('gatePin').value;
  api({action:'planHistory', pin:pin, days:7}, function(r){
    if(!r.ok){ document.getElementById('gateMsg').textContent = r.error; return; }
    PIN = pin;
    document.getElementById('adminNav').style.display='flex';
    document.getElementById('tab-gate').classList.remove('active');
    document.getElementById('tab-live').classList.add('active');
    loadLive();
  });
}
document.getElementById('gatePin').addEventListener('keydown', function(e){
  if(e.key==='Enter') unlock();
});

/* ---------- Tabs ---------- */
function showTab(id, btn){
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active')});
  document.querySelectorAll('.nav button').forEach(function(b){b.classList.remove('active')});
  document.getElementById('tab-'+id).classList.add('active');
  btn.classList.add('active');
  if(id==='live') loadLive();
  if(id==='wip') loadWip();
  if(id==='emp') loadEmp();
  if(id==='hist') loadHist();
}

function stat(n,l){ return '<div class="stat"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'; }
var CHARTS = {};
function drawChart(id, cfg){
  var el = document.getElementById(id);
  if(!el || typeof Chart === 'undefined') return;
  if(CHARTS[id]) CHARTS[id].destroy();
  CHARTS[id] = new Chart(el, cfg);
}
var C_ACCENT = '#635bff', C_INDIGO = '#1e1b4b', C_SOFT = 'rgba(99,91,255,.18)';
function bar(pct){
  return '<div class="progress" style="margin-top:0"><div class="progress-fill" style="width:'+Math.min(100,pct)+'%"></div></div>' +
         '<span class="hint">'+pct+'%</span>';
}

/* ---------- Live ---------- */
function loadLive(){
  // Har hall ka aaj ka target
  var box = document.getElementById('liveTargets');
  box.innerHTML = '';
  (CONFIG.halls||[]).forEach(function(h){
    api({action:'target', hall:h}, function(t){
      if(!t.ok) return;
      var div = document.createElement('div');
      div.className = 'card';
      div.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px">' +
        '<h2 style="margin:0">'+t.hall+' — today</h2>' +
        '<span style="font-weight:700;color:var(--indigo)">' +
        (t.planned>0 ? t.achieved+' / '+t.planned+' · '+t.pct+'%'
                     : t.achieved+' completed · no plan set') + '</span></div>' +
        (t.planned>0 ? '<div class="progress"><div class="progress-fill" style="width:'+t.pct+'%"></div></div>' : '');
      box.appendChild(div);
    });
  });

  api({action:'dashboard'}, function(r){
    if(!r.ok) return;
    document.getElementById('liveStats').innerHTML =
      stat(r.totalBatteries,'Total batteries') +
      stat(r.todayScans,"Today's scans") +
      stat(r.workersToday.length,'Employees active today');
    var tb = document.querySelector('#liveWorkers tbody');
    tb.innerHTML = r.workersToday.length ? r.workersToday.map(function(w){
      var by = Object.keys(w.byStage).map(function(s){ return s+': <b>'+w.byStage[s]+'</b>'; }).join(' · ');
      return '<tr><td>'+w.name+'</td><td>'+by+'</td><td><b>'+w.total+'</b></td></tr>';
    }).join('') : '<tr><td colspan="3" class="hint">No entries yet today</td></tr>';
  });
}

/* ---------- WIP ---------- */
function loadWip(){
  api({action:'wip'}, function(r){
    var tb = document.querySelector('#wipTable tbody');
    if(!r.ok){ tb.innerHTML = '<tr><td colspan="4" class="hint">'+r.error+'</td></tr>'; return; }
    if(!r.rows.length){
      tb.innerHTML = '<tr><td colspan="4" class="hint">No batteries in the system yet</td></tr>';
      return;
    }
    drawChart('wipChart', {
      type:'bar',
      data:{ labels: r.rows.map(function(x){ return x.hall+' · '+x.stage; }),
        datasets:[{ label:'Batteries', data:r.rows.map(function(x){ return x.count; }),
          backgroundColor: r.rows.map(function(x){ return x.isFinal ? '#16a34a' : C_ACCENT; }),
          borderRadius:6 }] },
      options:{ plugins:{legend:{display:false}},
        scales:{ y:{beginAtZero:true, ticks:{precision:0}} } }
    });
    tb.innerHTML = r.rows.map(function(x){
      var age = x.isFinal ? '<span class="badge on">Completed</span>'
        : (x.oldestDays >= 2
            ? '<span class="badge off">'+x.oldestDays+' days</span>'
            : '<span class="hint">'+(x.oldestDays===0?'today':x.oldestDays+' day')+'</span>');
      return '<tr><td>'+x.hall+'</td><td><b>'+x.stage+'</b></td><td><b>'+x.count+'</b></td><td>'+age+'</td></tr>';
    }).join('');
  });
}

/* ---------- Employees ---------- */
var EMP_DATA = [];
function loadEmp(){
  var days = document.getElementById('empPeriod').value;
  document.getElementById('empDetail').style.display='none';
  api({action:'employeeStats', days:days}, function(r){
    var tb = document.querySelector('#empTable tbody');
    if(!r.ok){ tb.innerHTML = '<tr><td colspan="6" class="hint">'+r.error+'</td></tr>'; return; }
    EMP_DATA = r.employees;
    filterEmp();
  });
}
function filterEmp(){
  var q = (document.getElementById('empSearch').value||'').trim().toUpperCase();
  var tb = document.querySelector('#empTable tbody');
  var list = EMP_DATA.filter(function(e){
    return !q || e.name.toUpperCase().indexOf(q)!==-1 || e.id.toUpperCase().indexOf(q)!==-1;
  });
  if(!list.length){
    tb.innerHTML = '<tr><td colspan="6" class="hint">'+(EMP_DATA.length?'No employee matches this search':'No activity in this period')+'</td></tr>';
    return;
  }
  tb.innerHTML = list.map(function(e){
    var by = Object.keys(e.byStage).map(function(s){ return s+': <b>'+e.byStage[s]+'</b>'; }).join(' · ');
    var sp = Object.keys(e.speed).length
      ? Object.keys(e.speed).map(function(s){ return s+': <b>'+e.speed[s]+'</b> min'; }).join(' · ')
      : '<span class="hint">Not enough data</span>';
    return '<tr style="cursor:pointer" onclick="openEmp(\''+e.id+'\')">' +
      '<td><b>'+e.name+'</b><br><span class="hint">'+e.id+'</span></td>' +
      '<td><b>'+e.total+'</b></td><td>'+e.daysWorked+'</td><td>'+e.avgPerDay+'</td>' +
      '<td>'+by+'</td><td>'+sp+'</td></tr>';
  }).join('');
}
function openEmp(id){
  var days = document.getElementById('empPeriod').value;
  api({action:'employeeStats', days:days, workerId:id}, function(r){
    if(!r.ok || !r.employees.length) return;
    var e = r.employees[0];
    var box = document.getElementById('empDetail');
    box.style.display='block';
    var by = Object.keys(e.byStage).map(function(s){ return s+': <b>'+e.byStage[s]+'</b>'; }).join(' · ');
    var sp = Object.keys(e.speed).length
      ? Object.keys(e.speed).map(function(s){ return s+': <b>'+e.speed[s]+'</b> min/battery'; }).join(' · ')
      : 'Not enough data yet';
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
      '<h2 style="margin:0">'+e.name+' <span class="hint">('+e.id+')</span></h2>' +
      '<button class="btn ghost sm" onclick="document.getElementById(\'empDetail\').style.display=\'none\'">✕ Close</button></div>' +
      '<p class="hint" style="margin:8px 0 4px">Total: <b>'+e.total+'</b> · Days: <b>'+e.daysWorked+'</b> · Avg/day: <b>'+e.avgPerDay+'</b><br>' +
      'Stages — '+by+'<br>Pace — '+sp+'</p>' +
      '<canvas id="empChart" height="110"></canvas>';
    box.scrollIntoView({behavior:'smooth'});
    drawChart('empChart', {
      type:'line',
      data:{ labels: (e.daily||[]).map(function(d){ return d.date; }),
        datasets:[{ label:'Daily output', data:(e.daily||[]).map(function(d){ return d.count; }),
          borderColor:C_ACCENT, backgroundColor:C_SOFT, fill:true, tension:.3, pointRadius:3 }] },
      options:{ plugins:{legend:{display:false}},
        scales:{ y:{beginAtZero:true, ticks:{precision:0}} } }
    });
  });
}

/* ---------- History ---------- */
function loadHist(){
  var days = document.getElementById('histPeriod').value;
  api({action:'planHistory', pin:PIN, days:days}, function(r){
    var tb = document.querySelector('#histTable tbody');
    if(!r.ok){ tb.innerHTML = '<tr><td colspan="6" class="hint">'+r.error+'</td></tr>'; return; }
    document.getElementById('histTotals').innerHTML = r.totals.map(function(t){
      return stat(t.pct+'%', t.hall+' · '+t.achieved+'/'+t.planned);
    }).join('') || stat('—','No plans in this period');
    if(!r.rows.length){
      tb.innerHTML = '<tr><td colspan="6" class="hint">No plans or output in this period</td></tr>';
      drawChart('histChart', {type:'bar', data:{labels:[],datasets:[]}, options:{}});
      return;
    }
    // date-wise totals for chart (oldest → newest)
    var byDate = {};
    r.rows.forEach(function(x){
      if(!byDate[x.date]) byDate[x.date] = {p:0,a:0};
      byDate[x.date].p += x.planned; byDate[x.date].a += x.achieved;
    });
    var dates = Object.keys(byDate).sort();
    drawChart('histChart', {
      type:'bar',
      data:{ labels: dates,
        datasets:[
          { label:'Planned', data:dates.map(function(d){ return byDate[d].p; }),
            backgroundColor:'rgba(30,27,75,.25)', borderRadius:5 },
          { label:'Achieved', data:dates.map(function(d){ return byDate[d].a; }),
            backgroundColor:C_ACCENT, borderRadius:5 }
        ] },
      options:{ scales:{ y:{beginAtZero:true, ticks:{precision:0}} } }
    });
    tb.innerHTML = r.rows.map(function(x){
      return '<tr><td>'+x.date+'</td><td>'+x.hall+'</td><td><b>'+(x.model||'—')+'</b></td>' +
        '<td>'+x.planned+'</td><td><b>'+x.achieved+'</b></td>' +
        '<td style="min-width:140px">'+bar(x.pct)+'</td></tr>';
    }).join('');
  });
}

/* ---------- Search ---------- */
function searchBattery(){
  var serial = document.getElementById('searchSerial').value.trim();
  if(!serial) return;
  api({action:'timeline', serial:serial}, function(r){
    var box = document.getElementById('searchResult');
    box.style.display='block';
    if(!r.ok){ box.innerHTML = '<p class="hint" style="color:var(--err)">'+r.error+'</p>'; return; }
    var html = '<h2>'+r.serial+' <span class="badge stage">'+r.hall+'</span> ' +
      '<span class="badge stage">Current stage: '+r.currentStage+'</span></h2><div class="tl">';
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
