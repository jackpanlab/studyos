
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const defaults={startDate:"2026-08-01",examDate:"2027-02-04",weekdayCap:180,saturdayCap:360,sundayCap:0};
let state=JSON.parse(localStorage.getItem("studyos-state")||"null")||{settings:defaults,progress:{},notes:{},selectedDate:null};
state.settings={...defaults,...state.settings};
const save=()=>localStorage.setItem("studyos-state",JSON.stringify(state));
const pad=n=>String(n).padStart(2,"0");
const fmtSec=s=>{s=Math.max(0,Math.round(s));let h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?`${h} 小時 ${m} 分`:`${m} 分鐘`};
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dayCap=d=>{const k=dateKey(d);if(state.notes[k]?.capacity!==undefined)return +state.notes[k].capacity;return d.getDay()==0?+state.settings.sundayCap:d.getDay()==6?+state.settings.saturdayCap:+state.settings.weekdayCap};
const subjectUnlock=subj=>{
 if(subj==="工程數學")return subjectRate("微積分")>=1;
 if(subj==="靜力學")return subjectRate("材料力學")>=.7;
 if(subj==="結構學")return subjectRate("材料力學")>=1 && subjectRate("靜力學")>=.5;
 return true;
};
const lessonDone=id=>{let p=state.progress[id]||{};return ["video","notes","examples","exercises"].every(k=>p[k])};
const subjectCourses=s=>COURSES.filter(c=>c.subject===s);
const subjectRate=s=>{let a=subjectCourses(s);return a.length?a.filter(c=>lessonDone(c.id)).length/a.length:0};
function schedule(){
 const result={}; const start=new Date(state.settings.startDate+"T00:00:00"), end=new Date(state.settings.examDate+"T00:00:00");
 const pools={};
 [...new Set(COURSES.map(c=>c.subject))].forEach(s=>pools[s]=subjectCourses(s).filter(c=>!lessonDone(c.id)));
 let day=new Date(start), guard=0;
 while(day<=end && guard++<500){
   const cap=dayCap(day)*60; const k=dateKey(day); result[k]=[]; let remaining=cap;
   if(cap<=0){day.setDate(day.getDate()+1);continue}
   let candidates=["材料力學","微積分","工程數學","靜力學","結構學"].filter(subjectUnlock);
   let cursor=0, safety=0;
   while(remaining>900 && safety++<20){
     let subj=candidates[cursor%candidates.length]; cursor++;
     let item=pools[subj]?.[0]; if(!item){if(candidates.every(s=>!pools[s]?.length))break;continue}
     let alloc=Math.min(item.seconds,remaining);
     if(item.seconds>remaining && remaining<2700)continue;
     result[k].push({...item,allocated:alloc});
     remaining-=alloc; pools[subj].shift();
   }
   day.setDate(day.getDate()+1);
 }
 return result;
}
let plan=schedule();
function renderToday(){
 const now=new Date(); const today=dateKey(now); const tasks=plan[today]||[];
 $("#todayLabel").textContent=now.toLocaleDateString("zh-TW",{year:"numeric",month:"long",day:"numeric",weekday:"long"});
 let exam=new Date(state.settings.examDate+"T00:00:00"); $("#daysLeft").textContent=Math.max(0,Math.ceil((exam-now)/86400000));
 $("#todayTasks").innerHTML=tasks.length?tasks.map(taskCard).join(""):`<article class="task" style="--accent:#888"><div class="pill">Today</div><h3>今天沒有排課</h3><p class="duration">休息，或提早完成明天的進度。</p></article>`;
 let remain=tasks.filter(t=>!lessonDone(t.id)).reduce((a,b)=>a+b.allocated,0); $("#todayRemaining").textContent=fmtSec(remain);
 $("#streak").textContent=calcStreak()+" 天";
 bindChecks();
}
function taskCard(c){
 const p=state.progress[c.id]||{};
 return `<article class="task" style="--accent:${c.color}">
 <div class="task-top"><span class="pill">${c.subject}</span><span>${c.duration}</span></div>
 <h3>${c.name}</h3><div class="duration">精準片長 ${c.duration}</div>
 <div class="checks">${["video:影片","notes:教材","examples:例題","exercises:習題"].map(x=>{let [k,n]=x.split(":");return `<label class="check ${p[k]?"done":""}"><span>${n}</span><input type="checkbox" data-id="${c.id}" data-key="${k}" ${p[k]?"checked":""}><b>${p[k]?"✓":"○"}</b></label>`}).join("")}</div>
 </article>`;
}
function bindChecks(){
 $$(".check input").forEach(i=>i.onchange=()=>{
  state.progress[i.dataset.id]={...(state.progress[i.dataset.id]||{}),[i.dataset.key]:i.checked,updated:new Date().toISOString()};
  save(); plan=schedule(); renderAll(); toast("進度已更新，排程已自動重算");
 });
}
function calcStreak(){
 let d=new Date(),n=0;
 for(let i=0;i<365;i++){let k=dateKey(d),items=plan[k]||[];if(d.getDay()==0){d.setDate(d.getDate()-1);continue}
   if(items.length && items.every(x=>lessonDone(x.id)))n++; else if(i>0)break; d.setDate(d.getDate()-1);}
 return n;
}
function renderDashboard(){
 const subs=["材料力學","微積分","工程數學","靜力學","結構學"];
 $("#subjectProgress").innerHTML=subs.map(s=>{let r=subjectRate(s);return `<div class="progress-row" style="--accent:${COURSES.find(c=>c.subject===s).color}"><b>${s}</b><div class="bar"><i style="width:${r*100}%"></i></div><span>${Math.round(r*100)}%</span></div>`}).join("");
 const now=new Date(), monday=new Date(now); monday.setDate(now.getDate()-((now.getDay()+6)%7));
 let planned=0,done=0,deltaBy={};
 for(let i=0;i<6;i++){let d=new Date(monday);d.setDate(monday.getDate()+i);for(const c of plan[dateKey(d)]||[]){planned+=c.allocated;if(lessonDone(c.id))done+=c.allocated;else deltaBy[c.subject]=(deltaBy[c.subject]||0)+c.allocated}}
 let rate=planned?done/planned:0; $("#weekRate").textContent=Math.round(rate*100)+"%";$("#weekBar").style.width=(rate*100)+"%";
 let delta=planned-done; $("#deltaText").textContent=delta>0?"落後 "+fmtSec(delta):"準時"; $("#deltaSubjects").textContent=Object.entries(deltaBy).map(([s,v])=>`${s} ${fmtSec(v)}`).join(" · ")||"本週進度正常";
 let tm=new Date(now);tm.setDate(now.getDate()+1);let ts=plan[dateKey(tm)]||[];$("#tomorrowTitle").textContent=ts[0]?`${ts[0].subject} ${ts[0].name}`:"休息";$("#tomorrowDetail").textContent=ts.map(x=>`${x.subject} ${x.duration}`).join(" · ");
}
let calDate=new Date();
function renderCalendar(){
 $("#monthLabel").textContent=calDate.toLocaleDateString("zh-TW",{year:"numeric",month:"long"});
 let first=new Date(calDate.getFullYear(),calDate.getMonth(),1), start=new Date(first);start.setDate(1-first.getDay());
 let html="";
 for(let i=0;i<42;i++){let d=new Date(start);d.setDate(start.getDate()+i);let k=dateKey(d),note=state.notes[k];html+=`<div class="day ${d.getMonth()!=calDate.getMonth()?"dim":""} ${state.selectedDate==k?"selected":""}" data-date="${k}"><b>${d.getDate()}</b><div>${(plan[k]||[]).length?`${(plan[k]||[]).length} 項課程`:""}</div>${note?.text?'<span class="dot"></span>':""}</div>`}
 $("#calendarGrid").innerHTML=html;
 $$(".day").forEach(el=>el.onclick=()=>{state.selectedDate=el.dataset.date;let n=state.notes[state.selectedDate]||{};$("#noteDate").textContent=state.selectedDate;$("#noteInput").value=n.text||"";$("#capacityInput").value=n.capacity??dayCap(new Date(state.selectedDate+"T00:00:00"))/60;renderCalendar()});
}
function renderSubjects(){
 const subs=["材料力學","微積分","工程數學","靜力學","結構學"];
 $("#subjectAccordion").innerHTML=subs.map(s=>`<div class="subject-card"><div class="subject-head"><div><b>${s}</b><div>${Math.round(subjectRate(s)*100)}% 完成</div></div><span>${subjectUnlock(s)?"⌄":"🔒"}</span></div><div class="subject-lessons">${subjectCourses(s).map(c=>`<div class="lesson ${lessonDone(c.id)?"done":""}"><b>${c.name}</b><span>${c.duration}</span><span>${lessonDone(c.id)?"已完成":"未完成"}</span></div>`).join("")}</div></div>`).join("");
 $$(".subject-card").forEach(card=>card.querySelector(".subject-head").onclick=()=>card.classList.toggle("open"));
}
function renderSettings(){
 $("#startDate").value=state.settings.startDate;$("#examDate").value=state.settings.examDate;$("#weekdayCap").value=state.settings.weekdayCap;$("#saturdayCap").value=state.settings.saturdayCap;$("#sundayMode").value=state.settings.sundayCap;
}
function renderAll(){renderToday();renderDashboard();renderCalendar();renderSubjects();renderSettings()}
function toast(t){let e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),1800)}
$("#prevMonth").onclick=()=>{calDate.setMonth(calDate.getMonth()-1);renderCalendar()};$("#nextMonth").onclick=()=>{calDate.setMonth(calDate.getMonth()+1);renderCalendar()};
$("#saveNote").onclick=()=>{if(!state.selectedDate)return toast("請先選擇日期");state.notes[state.selectedDate]={text:$("#noteInput").value,capacity:+$("#capacityInput").value};save();plan=schedule();renderAll();toast("行事曆已儲存並重新排程")};
$("#saveSettings").onclick=()=>{state.settings={...state.settings,startDate:$("#startDate").value,examDate:$("#examDate").value,weekdayCap:+$("#weekdayCap").value,saturdayCap:+$("#saturdayCap").value,sundayCap:+$("#sundayMode").value};save();plan=schedule();renderAll();toast("設定已更新")};
$("#resetAll").onclick=()=>{if(confirm("確定重設所有進度與備註？")){localStorage.removeItem("studyos-state");location.reload()}};
$$("[data-go]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.go).scrollIntoView({behavior:"smooth"}));
const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add("visible")),{threshold:.12});$$(".reveal").forEach(e=>io.observe(e));
renderAll();
