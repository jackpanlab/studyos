
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const defaults={startDate:"2026-08-01",examDate:"2027-02-04",weekdayCap:180,saturdayCap:360,sundayCap:0};
let state=JSON.parse(localStorage.getItem("studyos-state")||"null")||{settings:defaults,progress:{},notes:{},selectedDate:null,courseEdits:{},hiddenCourses:{}};
state.settings={...defaults,...state.settings};
state.courseEdits=state.courseEdits||{};
state.hiddenCourses=state.hiddenCourses||{};
state.lessonMeta=state.lessonMeta||{};
const ORIGINAL_COURSES=COURSES.map(c=>({...c}));
COURSES.forEach(course=>{const edit=state.courseEdits[course.id];if(edit){if(edit.name)course.name=edit.name;if(edit.duration){course.duration=edit.duration;course.seconds=durationToSeconds(edit.duration)}}});
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
const subjectCourses=s=>COURSES.filter(c=>c.subject===s && !state.hiddenCourses[c.id]);
const subjectRate=s=>{let a=subjectCourses(s);return a.length?a.filter(c=>lessonDone(c.id)).length/a.length:0};
const subjectPriority={"材料力學":24,"微積分":22,"工程數學":20,"靜力學":18,"結構學":16};
const subjectDependencyReason={
 "材料力學":"後續靜力學與結構學的重要基礎",
 "微積分":"工程數學的前置基礎",
 "工程數學":"研究所考試的重要計算科目",
 "靜力學":"結構學的直接前置科目",
 "結構學":"結構組核心專業科目"
};
function courseRemainingSeconds(c){
 const meta=state.lessonMeta[c.id]||{};
 const watched=durationToSeconds(meta.watchPosition||"00:00:00");
 const rate=Math.max(1,+meta.playbackRate||1.5);
 return Math.max(0,(c.seconds-watched)/rate);
}
function dueForReview(c){
 const updated=state.progress[c.id]?.updated;
 if(!lessonDone(c.id)||!updated)return false;
 const days=(Date.now()-new Date(updated).getTime())/86400000;
 return days>=5;
}
function buildAdvice(){
 const todayKey=dateKey(new Date());
 const formalIds=new Set((plan[todayKey]||[]).map(x=>x.id));
 const candidates=COURSES.filter(c=>!state.hiddenCourses[c.id] && (!lessonDone(c.id)||dueForReview(c)));
 const scored=candidates.map(c=>{
   const meta=state.lessonMeta[c.id]||{};
   const rate=subjectRate(c.subject);
   let score=(1-rate)*70+(subjectPriority[c.subject]||10);
   const reasons=[];
   if(meta.pinned){score+=100;reasons.push("你已標記為今日必看")}
   if(meta.favorite){score+=20;reasons.push("你已加入重點")}
   if(formalIds.has(c.id)){score+=35;reasons.push("本來就在今日正式排程")}
   if(dueForReview(c)){score+=48;reasons.push("距離上次完成已超過 5 天，適合短複習")}
   if(!lessonDone(c.id)){
     reasons.push(`${c.subject}目前完成 ${Math.round(rate*100)}%`);
     reasons.push(subjectDependencyReason[c.subject]||"目前值得優先完成");
   }
   const remain=courseRemainingSeconds(c);
   if(remain<=5400){score+=12;reasons.push(`以目前倍速約需 ${fmtSec(remain)}`)}
   return {course:c,score,reasons,remain,review:dueForReview(c)};
 }).sort((a,b)=>b.score-a.score);
 const picked=[];const used=new Set();
 for(const item of scored){
   if(picked.length>=3)break;
   if(used.has(item.course.subject) && picked.length<2)continue;
   picked.push(item);used.add(item.course.subject);
 }
 return picked;
}
function renderAdvice(){
 const items=buildAdvice();
 $("#aiSuggestions").innerHTML=items.length?items.map((x,i)=>`
   <article class="advisor-card" style="--accent:${x.course.color}">
     <div class="advisor-rank">0${i+1}</div>
     <div class="advisor-card-top"><span>${escapeHtml(x.course.subject)}</span><b>${x.review?"複習建議":"優先建議"}</b></div>
     <h4>${escapeHtml(x.course.name)}</h4>
     <p>${x.reasons.slice(0,3).map(escapeHtml).join("；")}。</p>
     <div class="advisor-card-foot">
       <span>${x.review?"建議複習 20–30 分鐘":`剩餘約 ${fmtSec(x.remain)}`}</span>
       <button type="button" data-apply-advice="${x.course.id}">${state.lessonMeta[x.course.id]?.pinned?"已設為今日必看":"設為今日必看"}</button>
     </div>
   </article>`).join(""):`<p class="empty-copy">目前沒有額外建議，照既定排程完成即可。</p>`;
 $$("[data-apply-advice]").forEach(btn=>btn.onclick=()=>{
   const id=btn.dataset.applyAdvice;
   state.lessonMeta[id]={...(state.lessonMeta[id]||{}),pinned:true};
   save();renderAdvice();renderSubjects();toast("已設為今日必看");
 });
}

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
 for(let i=0;i<42;i++){
   let d=new Date(start);d.setDate(start.getDate()+i);
   let k=dateKey(d),note=state.notes[k],items=plan[k]||[];
   const previews=items.slice(0,3).map(c=>`<div class="calendar-course-preview" style="--accent:${c.color}"><span>${escapeHtml(c.subject)}</span><b>${escapeHtml(c.name)}</b></div>`).join("");
   const more=items.length>3?`<div class="calendar-more">＋${items.length-3} 項</div>`:"";
   html+=`<div class="day ${d.getMonth()!=calDate.getMonth()?"dim":""} ${state.selectedDate==k?"selected":""}" data-date="${k}">
     <div class="day-number"><b>${d.getDate()}</b>${note?.text?'<span class="dot" title="有備註"></span>':""}</div>
     <div class="calendar-previews">${previews}${more}</div>
   </div>`;
 }
 $("#calendarGrid").innerHTML=html;
 $$(".day").forEach(el=>el.onclick=()=>{
   state.selectedDate=el.dataset.date;
   let n=state.notes[state.selectedDate]||{};
   $("#noteDate").textContent=state.selectedDate;
   $("#noteInput").value=n.text||"";
   $("#capacityInput").value=n.capacity??dayCap(new Date(state.selectedDate+"T00:00:00"))/60;
   renderCalendar();
   renderCalendarDetail();
 });
 if(state.selectedDate)renderCalendarDetail();
}
function renderCalendarDetail(){
 const key=state.selectedDate;
 if(!key){
   $("#calendarDetailDate").textContent="請選擇日期";
   $("#calendarDetailTotal").textContent="0 分鐘";
   $("#calendarCourseList").innerHTML='<p class="empty-copy">點選上方日期，即可查看完整課表。</p>';
   return;
 }
 const d=new Date(key+"T00:00:00"),items=plan[key]||[],note=state.notes[key]?.text;
 $("#calendarDetailDate").textContent=d.toLocaleDateString("zh-TW",{year:"numeric",month:"long",day:"numeric",weekday:"long"});
 $("#calendarDetailTotal").textContent=fmtSec(items.reduce((a,c)=>a+c.allocated,0));
 $("#calendarCourseList").innerHTML=`
   ${note?`<div class="calendar-note-banner">備註：${escapeHtml(note)}</div>`:""}
   ${items.length?items.map((c,i)=>`<button class="calendar-course-row" type="button" data-calendar-edit="${c.id}">
      <span class="calendar-course-index">${pad(i+1)}</span>
      <span class="calendar-course-main"><b>${escapeHtml(c.subject)}</b><strong>${escapeHtml(c.name)}</strong></span>
      <span class="calendar-course-duration">${c.duration}</span>
      <span class="calendar-course-state">${lessonDone(c.id)?"已完成":"未完成"}</span>
   </button>`).join(""):'<p class="empty-copy">這一天沒有安排課程。</p>'}`;
 $$("[data-calendar-edit]").forEach(btn=>btn.onclick=()=>openLessonSheet(btn.dataset.calendarEdit));
}
function renderSubjects(){
 const subs=["材料力學","微積分","工程數學","靜力學","結構學"];
 $("#subjectAccordion").innerHTML=subs.map(s=>`<div class="subject-card"><div class="subject-head"><div><b>${s}</b><div>${Math.round(subjectRate(s)*100)}% 完成</div></div><span>${subjectUnlock(s)?"⌄":"🔒"}</span></div><div class="subject-lessons">${subjectCourses(s).map(c=>{
   const meta=state.lessonMeta[c.id]||{};
   const badges=[meta.favorite?"⭐":"",meta.pinned?"📌":"",meta.watchPosition&&meta.watchPosition!=="00:00:00"?`看到 ${meta.watchPosition}`:""].filter(Boolean);
   return `<div class="lesson ${lessonDone(c.id)?"done":""}" data-course-id="${c.id}">
     <b>${escapeHtml(c.name)}${meta.note?`<small class="lesson-note-preview">${escapeHtml(meta.note.slice(0,36))}${meta.note.length>36?"…":""}</small>`:""}</b>
     <span>${c.duration}</span>
     <span class="lesson-meta">${lessonDone(c.id)?"已完成":"未完成"}${badges.map(x=>`<i class="lesson-badge">${escapeHtml(x)}</i>`).join("")}</span>
     <button class="lesson-more" type="button" data-edit-course="${c.id}" aria-label="編輯 ${escapeHtml(c.name)}">⋯</button>
   </div>`;
 }).join("")}</div></div>`).join("");
 $$(".subject-card").forEach(card=>card.querySelector(".subject-head").onclick=()=>card.classList.toggle("open"));
 $$('[data-edit-course]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();openLessonSheet(btn.dataset.editCourse)});
}

function renderSettings(){
 $("#startDate").value=state.settings.startDate;$("#examDate").value=state.settings.examDate;$("#weekdayCap").value=state.settings.weekdayCap;$("#saturdayCap").value=state.settings.saturdayCap;$("#sundayMode").value=state.settings.sundayCap;
}

let activeCourseId=null;
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]))}
function durationToSeconds(v){const p=String(v||"").trim().split(":").map(Number);if(p.length!==3||p.some(n=>!Number.isFinite(n)||n<0)||p[1]>59||p[2]>59)return 0;return p[0]*3600+p[1]*60+p[2]}
function getCourse(id){return COURSES.find(c=>c.id===id)}
function snapshotCourseState(id){return{edit:state.courseEdits[id]?{...state.courseEdits[id]}:null,progress:state.progress[id]?{...state.progress[id]}:null,hidden:!!state.hiddenCourses[id]}}
function restoreCourseState(id,s){if(s.edit)state.courseEdits[id]={...s.edit};else delete state.courseEdits[id];if(s.progress)state.progress[id]={...s.progress};else delete state.progress[id];if(s.hidden)state.hiddenCourses[id]=true;else delete state.hiddenCourses[id];const c=getCourse(id),o=ORIGINAL_COURSES.find(x=>x.id===id);if(c&&o){c.name=s.edit?.name||o.name;c.duration=s.edit?.duration||o.duration;c.seconds=durationToSeconds(c.duration)}save();plan=schedule();renderAll()}
function openLessonSheet(id){
 const c=getCourse(id);if(!c)return;
 const meta=state.lessonMeta[id]||{};
 activeCourseId=id;
 $("#sheetSubject").textContent=c.subject;
 $("#sheetTitle").textContent=c.name;
 $("#editLessonName").value=c.name;
 $("#editLessonDuration").value=c.duration;
 $("#editWatchPosition").value=meta.watchPosition||"00:00:00";
 $("#editPlaybackRate").value=String(meta.playbackRate||1.5);
 $("#editLessonNote").value=meta.note||"";
 $("#editFavorite").checked=!!meta.favorite;
 $("#editPinned").checked=!!meta.pinned;
 $("#toggleLessonStatus").textContent=lessonDone(id)?"改回未完成":"標記完成";
 $("#lessonSheet").classList.add("open");
 $("#lessonSheet").setAttribute("aria-hidden","false");
}
function closeLessonSheet(){$("#lessonSheet").classList.remove("open");$("#lessonSheet").setAttribute("aria-hidden","true");activeCourseId=null}
function completeAllParts(id,done){state.progress[id]={...(state.progress[id]||{}),video:done,notes:done,examples:done,exercises:done,updated:new Date().toISOString()};save();plan=schedule();renderAll()}
$$('[data-close-sheet]').forEach(el=>el.onclick=closeLessonSheet);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLessonSheet()});
$("#saveLessonEdit").onclick=()=>{
 if(!activeCourseId)return;
 const c=getCourse(activeCourseId),id=activeCourseId;
 const name=$("#editLessonName").value.trim();
 const duration=$("#editLessonDuration").value.trim();
 const watchPosition=$("#editWatchPosition").value.trim()||"00:00:00";
 const seconds=durationToSeconds(duration),watched=durationToSeconds(watchPosition);
 if(!name)return toast("課程名稱不能空白");
 if(!seconds)return toast("片長格式錯誤，請輸入 HH:MM:SS");
 if(watched>seconds)return toast("目前觀看位置不能超過片長");
 const snap=snapshotCourseState(id);
 const oldMeta=state.lessonMeta[id]?{...state.lessonMeta[id]}:null;
 state.courseEdits[id]={name,duration};
 state.lessonMeta[id]={
   ...(state.lessonMeta[id]||{}),
   watchPosition,
   playbackRate:+$("#editPlaybackRate").value,
   note:$("#editLessonNote").value.trim(),
   favorite:$("#editFavorite").checked,
   pinned:$("#editPinned").checked
 };
 c.name=name;c.duration=duration;c.seconds=seconds;
 save();plan=schedule();closeLessonSheet();renderAll();
 toast(`已儲存 ${name}`,()=>{
   restoreCourseState(id,snap);
   if(oldMeta)state.lessonMeta[id]=oldMeta;else delete state.lessonMeta[id];
   save();renderAll();
 });
};
$("#toggleLessonStatus").onclick=()=>{if(!activeCourseId)return;const id=activeCourseId,c=getCourse(id),was=lessonDone(id),snap=snapshotCourseState(id);completeAllParts(id,!was);closeLessonSheet();toast(was?`已將 ${c.name} 改回未完成`:`已完成 ${c.name}`,()=>restoreCourseState(id,snap))};
$("#hideLesson").onclick=()=>{if(!activeCourseId)return;const id=activeCourseId,c=getCourse(id),snap=snapshotCourseState(id);if(!confirm(`確定隱藏「${c.name}」？可在 8 秒內復原。`))return;state.hiddenCourses[id]=true;save();plan=schedule();closeLessonSheet();renderAll();toast(`已隱藏 ${c.name}`,()=>restoreCourseState(id,snap))};


$("#restoreHidden").onclick=()=>{
 const hidden=ORIGINAL_COURSES.filter(c=>state.hiddenCourses[c.id]);
 if(!hidden.length)return toast("目前沒有已隱藏課程");
 const list=hidden.map((c,i)=>`${i+1}. ${c.subject}｜${c.name}`).join("\n");
 const n=prompt(`輸入要恢復的編號；輸入 ALL 恢復全部：\n\n${list}`);
 if(!n)return;
 if(n.trim().toUpperCase()==="ALL"){
   state.hiddenCourses={};
 }else{
   const idx=Number(n)-1;
   if(!Number.isInteger(idx)||!hidden[idx])return toast("編號無效");
   delete state.hiddenCourses[hidden[idx].id];
 }
 save();plan=schedule();closeLessonSheet();renderAll();toast("已恢復隱藏課程");
};

$("#exportData").onclick=()=>{
 const payload={version:"3.0",exportedAt:new Date().toISOString(),state};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
 const a=document.createElement("a");
 a.href=URL.createObjectURL(blob);
 a.download=`StudyOS_backup_${dateKey(new Date())}.json`;
 a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 toast("備份已匯出");
};

$("#importData").onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
   const payload=JSON.parse(await file.text());
   const incoming=payload.state||payload;
   if(!incoming.settings||!incoming.progress)throw new Error("格式錯誤");
   if(!confirm("匯入後會覆蓋目前資料，確定繼續？"))return;
   localStorage.setItem("studyos-state",JSON.stringify(incoming));
   location.reload();
 }catch(err){toast("備份檔格式錯誤")}
 e.target.value="";
};

function renderAll(){renderToday();renderDashboard();renderAdvice();renderCalendar();renderSubjects();renderSettings()}
let undoTimer=null;
function toast(t,undoFn=null){let e=$("#toast");e.innerHTML=`<span>${escapeHtml(t)}</span>${undoFn?'<button class="undo-btn" type="button">復原</button>':''}`;e.classList.add("show");clearTimeout(undoTimer);if(undoFn)e.querySelector(".undo-btn").onclick=()=>{undoFn();e.classList.remove("show");toast("已復原")};undoTimer=setTimeout(()=>e.classList.remove("show"),undoFn?8000:2200)}
$("#refreshAdvice").onclick=()=>{renderAdvice();toast("智慧建議已重新分析")};
$("#prevMonth").onclick=()=>{calDate.setMonth(calDate.getMonth()-1);renderCalendar()};$("#nextMonth").onclick=()=>{calDate.setMonth(calDate.getMonth()+1);renderCalendar()};
$("#saveNote").onclick=()=>{if(!state.selectedDate)return toast("請先選擇日期");state.notes[state.selectedDate]={text:$("#noteInput").value,capacity:+$("#capacityInput").value};save();plan=schedule();renderAll();toast("行事曆已儲存並重新排程")};
$("#saveSettings").onclick=()=>{state.settings={...state.settings,startDate:$("#startDate").value,examDate:$("#examDate").value,weekdayCap:+$("#weekdayCap").value,saturdayCap:+$("#saturdayCap").value,sundayCap:+$("#sundayMode").value};save();plan=schedule();renderAll();toast("設定已更新")};
$("#resetAll").onclick=()=>{if(confirm("確定重設所有進度與備註？")){localStorage.removeItem("studyos-state");location.reload()}};
$$("[data-go]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.go).scrollIntoView({behavior:"smooth"}));
const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add("visible")),{threshold:.12});$$(".reveal").forEach(e=>io.observe(e));
renderAll();

// v2 scroll motion: lightweight, no external library.
const heroTitle = document.querySelector(".hero-title");
const heroSection = document.querySelector(".hero");
let ticking = false;
function updateScrollMotion(){
  const y = window.scrollY;
  const h = Math.max(1, heroSection.offsetHeight);
  const p = Math.min(1, y / h);
  if(heroTitle){
    heroTitle.style.transform = `translate3d(0,${p*70}px,0) scale(${1-p*.08})`;
    heroTitle.style.opacity = String(1-p*.62);
  }
  ticking = false;
}
window.addEventListener("scroll",()=>{
  if(!ticking){requestAnimationFrame(updateScrollMotion);ticking=true}
},{passive:true});
updateScrollMotion();
