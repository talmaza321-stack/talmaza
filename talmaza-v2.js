/* Talmaza 2.0 add-on. Load as type=module after app.js. */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const db = createClient('https://zacekktcxyvcpwsaxmfp.supabase.co','sb_publishable_1rM-kgZfUYBldq6LVlpmkA__JRtHKhA',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=s=>document.querySelector(s);
const cairoDate=d=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const part=t=>parts.find(x=>x.type===t).value;return `${part('year')}-${part('month')}-${part('day')}`};
const dayBefore=s=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)};
function getStreak(dates){const set=new Set(dates);const current=cairoDate(new Date());let cursor=set.has(current)?current:dayBefore(current);if(!set.has(cursor))return 0;let count=0;while(set.has(cursor)){count++;cursor=dayBefore(cursor)}return count}
let currentUser='',busy=false,lastHome='',observer;
async function renderStreak(){
  if(busy||!$('#studentQR')||!$('#view')||$('#talmazaStreak'))return;
  busy=true;
  try{
    const {data:{user}}=await db.auth.getUser();if(!user)return;
    const {data:profile,error:pe}=await db.from('profiles').select('role').eq('id',user.id).single();if(pe||profile?.role!=='student')return;
    const {data,error}=await db.from('submissions').select('submitted_on').eq('student_id',user.id).order('submitted_on',{ascending:false}).limit(1000);if(error)throw error;
    const streak=getStreak((data||[]).map(x=>x.submitted_on));
    // A broken streak is hidden; yesterday is accepted until the student completes today.
    if(!streak||!$('#studentQR')||$('#talmazaStreak'))return;
    const panel=document.createElement('section');panel.id='talmazaStreak';panel.className='card streak-panel';
    const milestone=streak%7===0?`<p class="streak-note">🎉 برافو! كملت ${streak} يوم متابعة!</p>`:'';
    panel.innerHTML=`<h3>🔥 سلسلة المتابعة</h3><div class="streak-count">${streak} يوم متواصل</div><div class="streak-days">${Array.from({length:7},(_,i)=>`<div class="streak-day ${i<Math.min(streak%7||7,7)?'done':''}">يوم ${i+1}</div>`).join('')}</div>${milestone}`;
    const view=$('#view'),title=[...view.querySelectorAll('h3')].find(e=>e.textContent.includes('آخر نشاط'));
    if(title)view.insertBefore(panel,title);else view.prepend(panel);
    currentUser=user.id;
  }catch(e){console.warn('Streak:',e)}finally{busy=false}
}
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;renderStreak()},150)}
observer=new MutationObserver(mutations=>{if(mutations.some(m=>[...m.addedNodes].some(n=>n.nodeType===1&&(n.id==='studentQR'||n.querySelector?.('#studentQR')))))schedule()});
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('pageshow',schedule);schedule();

/* Download an Arabic PDF directly, without the print dialog. */
const scriptCache=new Map();
function loadScript(url,global){if(window[global])return Promise.resolve();if(scriptCache.has(url))return scriptCache.get(url);const p=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=()=>window[global]?resolve():reject(Error('Library not loaded'));s.onerror=()=>reject(Error('Library download failed'));document.head.append(s)});scriptCache.set(url,p);return p}
async function pdfFromReport(){
  const table=$('#reportResult table');if(!table)throw Error('اعرض التقرير أولاً');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js','html2canvas');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','jspdf');
  await document.fonts.ready;
  const from=$('#fromDate')?.value||'',to=$('#toDate')?.value||'';
  const title=$('#reportResult .row b')?.textContent?.trim()||'تقرير المتابعة الروحية';
  const shell=document.createElement('div');shell.dir='rtl';Object.assign(shell.style,{position:'absolute',left:'0',top:'0',width:'794px',padding:'34px',boxSizing:'border-box',background:'#fff8ed',color:'#062c53',fontFamily:'Cairo,Tahoma,Arial,sans-serif',zIndex:'-1',pointerEvents:'none'});
  shell.innerHTML=`<div style="background:#062c53;color:white;padding:22px;border-radius:18px;margin-bottom:18px;text-align:right"><div style="font-size:30px;font-weight:900;color:#ffca35">Talmaza • تلمذة</div><div style="font-size:20px">تقرير المتابعة الروحية</div></div><div style="margin-bottom:14px;font-weight:700"></div>`;
  shell.lastElementChild.textContent=`${title} | من ${from} إلى ${to}`;
  const original=table.cloneNode(true);Object.assign(original.style,{width:'100%',minWidth:'0',borderCollapse:'collapse',fontSize:'15px'});
  original.querySelectorAll('td,th').forEach(cell=>Object.assign(cell.style,{padding:'11px 7px',borderBottom:'1px solid #d9e3ee',textAlign:'right',color:'#062c53'}));
  original.querySelectorAll('th').forEach(cell=>{cell.style.background='#ffe4a0'});
  shell.append(original);document.body.append(shell);
  try{
    // Render each row separately to avoid slicing a row across PDF pages.
    const {jsPDF}=window.jspdf,pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const pageW=210,pageH=297,margin=10,scale=(pageW-2*margin)/794;
    const head=shell.firstElementChild,meta=head.nextElementSibling;
    let y=10;
    async function draw(el){const c=await window.html2canvas(el,{scale:1.7,backgroundColor:'#fff8ed',useCORS:true,logging:false});const h=c.height/c.width*(pageW-2*margin);if(y+h>pageH-10){pdf.addPage();y=10}pdf.addImage(c.toDataURL('image/png'),'PNG',margin,y,pageW-2*margin,h);y+=h+2}
    await draw(head);await draw(meta);
    const thead=original.querySelector('thead');if(thead)await draw(thead);
    const rows=[...original.querySelectorAll('tbody tr')];for(const row of rows)await draw(row);
    pdf.save(`Talmaza-Report-${from}-to-${to}.pdf`);
  }finally{shell.remove()}
}
document.addEventListener('click',async e=>{
  const btn=e.target.closest?.('#printReport');if(!btn)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(btn.disabled)return;btn.disabled=true;const previous=btn.textContent;btn.textContent='جاري تجهيز PDF...';
  try{await pdfFromReport()}catch(err){console.error(err);alert('تعذر إنشاء PDF: '+err.message)}finally{if(btn.isConnected){btn.disabled=false;btn.textContent=previous}}
},true);

// Use the corrected report function when available. Existing app.js stays unchanged.
document.addEventListener('click',async e=>{
 const btn=e.target.closest?.('#loadReport');if(!btn)return;
 e.preventDefault();e.stopImmediatePropagation();
 if(btn.disabled)return;
 const from=$('#fromDate')?.value,to=$('#toDate')?.value;
 if(!from||!to||from>to){alert('راجع التواريخ');return}
 btn.disabled=true;
 try{
   const {data:{user}}=await db.auth.getUser();if(!user)throw Error('يرجى تسجيل الدخول');
   const {data:profile,error:profileError}=await db.from('profiles').select('role,class_key').eq('id',user.id).single();if(profileError)throw profileError;
   const cls=profile.role==='main'?$('#reportClass')?.value:profile.class_key;
   const {data,error}=await db.rpc('class_report_v2',{p_class:cls,p_from:from,p_to:to});if(error)throw error;
   const names={first:'أولى تلمذة',second:'تانية تلمذة',third:'تالتة تلمذة'};
   const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const result=$('#reportResult');if(!result)return;
   result.innerHTML=`<section class="card"><div class="row no-print"><b>تقرير ${escape(names[cls]||'كل الفصول')}</b><button class="secondary" id="printReport" type="button">تنزيل PDF</button></div><div class="table-wrap"><table dir="rtl"><thead><tr><th>الاسم</th><th>الفصل</th><th>أيام المتابعة</th><th>مجموع النقط</th></tr></thead><tbody>${(data||[]).map(r=>`<tr><td>${escape(r.full_name)}</td><td>${escape(names[r.class_key]||'')}</td><td>${Number(r.days_count)||0}</td><td>${Number(r.total_points)||0}</td></tr>`).join('')||'<tr><td colspan="4">مفيش بيانات</td></tr>'}</tbody></table></div></section>`;
 }catch(err){console.error('Report:',err);alert('تعذر تحميل التقرير: '+err.message)}finally{if(btn.isConnected)btn.disabled=false}
},true);
