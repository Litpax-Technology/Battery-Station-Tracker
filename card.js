/* Battery Card page — traveler card ka online version.
 * Serial load karo → card khulta hai → har stage pe worker select + ✓ tick →
 * tick seedha existing scan action se Google Sheets me save hota hai. */

var CONFIG = { stages:[], workers:[], settings:{} };
var CURRENT = null; // {serial, hall, model, created, history}

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
    } else if(i === nextIdx){
      var opts = stageWorkers(r.hall, st).map(function(w){
        return '<option value="'+w.id+'">'+w.name+'</option>';
      }).join('');
      html += '<td><select id="wsel_'+i+'">'+opts+'</select></td>' +
        '<td><button class="btn sm" onclick="tick(\''+st.replace(/'/g,"\\'")+'\', '+i+')">✓ Done</button>' +
        '<span class="bc-tickbox"></span></td>';
    } else {
      html += '<td class="bc-pending">—</td>' +
        '<td><span class="bc-pending">pending</span><span class="bc-tickbox"></span></td>';
    }
    html += '</tr>';
  });

  html += '</tbody></table>' +
    '<div class="bc-foot">Har stage complete hone par worker select karke ✓ Done dabayein — entry turant sheet me save hoti hai. Print par khali tick boxes aate hain (paper card ke liye).</div>';

  el.innerHTML = html;
  try{ new QRCode(document.getElementById('bcQr'),
    {text:r.serial, width:64, height:64, correctLevel:QRCode.CorrectLevel.M}); }catch(e){}
  document.getElementById('cardWrap').style.display='block';
}

/* ---------- Tick = save ---------- */
function tick(stage, idx){
  var sel = document.getElementById('wsel_'+idx);
  var workerId = sel ? sel.value : '';
  if(!workerId){ alert('Select a worker first'); return; }
  api({action:'scan', serial:CURRENT.serial, stage:stage, workerId:workerId,
       hall:CURRENT.hall, mode:'manual'}, function(r){
    if(!r.ok){ alert(r.error); return; }
    loadCard(CURRENT.serial); // refreshed card — tick green ho jayega
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
