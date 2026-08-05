
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const defaults={startDate:"2026-08-01",examDate:"2027-02-04",weekdayCap:180,saturdayCap:360,sundayCap:0};
let state=JSON.parse(localStorage.getItem("studyos-state")||"null")||{settings:defaults,progress:{},notes:{},selectedDate:null,courseEdits:{},hiddenCourses:{}};
state.settings={...defaults,...state.settings};
state.courseEdits=state.courseEdits||{};
state.hiddenCourses=state.hiddenCourses||{};
state.lessonMeta=state.lessonMeta||{};
state.previewQueue=Array.isArray(state.previewQueue)?state.previewQueue:[];
state.segmentChecks=state.segmentChecks||{};
state.studyProgress=state.studyProgress||{};
state.dailyConsumed=state.dailyConsumed||{};
state.dayHistory=state.dayHistory||{};
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
const legacyAllPartsDone=id=>{
 const p=state.progress[id]||{};
 return ["video","notes","examples","exercises"].every(k=>p[k]);
};
function completedSourceSeconds(c){
 const meta=state.lessonMeta[c.id]||{};
 const manual=durationToSeconds(meta.watchPosition||"00:00:00");
 const tracked=+state.studyProgress[c.id]||0;
 const legacy=legacyAllPartsDone(c.id)?c.seconds:0;
 return Math.min(c.seconds,Math.max(manual,tracked,legacy));
}
const lessonDone=id=>{
 const c=COURSES.find(x=>x.id===id);
 return !!c && completedSourceSeconds(c)>=c.seconds-1;
};
function remainingSourceSeconds(c){
 return Math.max(0,c.seconds-completedSourceSeconds(c));
}

function wallToSourceSeconds(wallSeconds,c){
 return Math.max(0,wallSeconds)*playbackRateFor(c);
}
function sourceToWallSeconds(sourceSeconds,c){
 return Math.max(0,sourceSeconds)/playbackRateFor(c);
}
function isFinalScheduledSegment(task){
 const sourceEnd=Number(task.sourceEnd)||0;
 const total=Number(task.seconds)||0;
 return sourceEnd>=total-1;
}
function playbackRateFor(c){
 return Math.max(1,+state.lessonMeta[c.id]?.playbackRate||1.5);
}
function remainingWallSeconds(c){
 return remainingSourceSeconds(c)/playbackRateFor(c);
}
function nextUnfinishedCourse(subject){
 return subjectCourses(subject)
   .sort((a,b)=>(a.order||0)-(b.order||0))
   .find(c=>!lessonDone(c.id))||null;
}
function isSequentiallyAvailable(c){
 return nextUnfinishedCourse(c.subject)?.id===c.id;
}
function remainingTodayCapacitySeconds(date=new Date()){
 const key=dateKey(date);
 const total=Math.max(0,dayCap(date))*60;
 return Math.max(0,total-(+state.dailyConsumed[key]||0));
}
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
 return remainingWallSeconds(c);
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
   const c=getCourse(id);
   state.lessonMeta[id]={...(state.lessonMeta[id]||{}),pinned:true};
   save();plan=schedule();renderAll();
   toast(c&&isSequentiallyAvailable(c)
     ?"已設為今日必看，會優先排入今天"
     :"已保留今日必看標記，但前序課程尚未完成；請用預習選取提前觀看");
 });
}

function schedule(){
 const result={};
 const configuredStart=new Date(state.settings.startDate+"T00:00:00");
 const today=new Date();today.setHours(0,0,0,0);
 const start=configuredStart>today?configuredStart:today;
 const end=new Date(state.settings.examDate+"T00:00:00");
 const subjects=["材料力學","微積分","工程數學","靜力學","結構學"];
 const subjectColors=Object.fromEntries(subjects.map(subject=>[
   subject,COURSES.find(c=>c.subject===subject)?.color||"#777"
 ]));

 const queues={};
 subjects.forEach(subject=>{
   queues[subject]=subjectCourses(subject)
     .sort((a,b)=>(a.order||0)-(b.order||0))
     .filter(c=>!lessonDone(c.id))
     .map(c=>{
       const startSource=completedSourceSeconds(c);
       const rate=playbackRateFor(c);
       return {
         course:c,
         sourceCursor:startSource,
         sourceRemaining:Math.max(0,c.seconds-startSource),
         rate
       };
     });
 });

 const virtualDone=new Set(COURSES.filter(c=>lessonDone(c.id)).map(c=>c.id));
 const virtualRate=subject=>{
   const all=COURSES.filter(c=>c.subject===subject&&!state.hiddenCourses[c.id]);
   return all.length?all.filter(c=>virtualDone.has(c.id)).length/all.length:0;
 };
 const projectedUnlock=subject=>{
   if(subject==="工程數學")return virtualRate("微積分")>=1;
   if(subject==="靜力學")return virtualRate("材料力學")>=.7;
   if(subject==="結構學")return virtualRate("材料力學")>=1&&virtualRate("靜力學")>=.5;
   return true;
 };
 const hasLectures=()=>subjects.some(subject=>queues[subject].length);

 let day=new Date(start),guard=0,subjectCursor=0,reviewCursor=0,reviewRound=1;
 while(day<=end&&guard++<600){
   const key=dateKey(day);
   const isToday=key===dateKey(today);
   const cap=isToday?remainingTodayCapacitySeconds(day):Math.max(0,dayCap(day))*60;
   result[key]=[];
   let remaining=cap;

   if(cap<=0){day.setDate(day.getDate()+1);continue}

   let safety=0;
   while(remaining>=60&&hasLectures()&&safety++<200){
     let unlocked=subjects.filter(subject=>projectedUnlock(subject)&&queues[subject].length);
     if(!unlocked.length)break;

     let subject=unlocked[subjectCursor%unlocked.length];
     subjectCursor++;
     let entry=queues[subject][0];
     if(!entry)continue;

     const wallRemaining=entry.sourceRemaining/entry.rate;
     if(wallRemaining<=0){
       virtualDone.add(entry.course.id);
       queues[subject].shift();
       continue;
     }

     // 至少排 1 分鐘；嚴格只處理該科最前面的未完成課程。
     const allocated=Math.min(wallRemaining,remaining);
     const sourceAllocated=Math.min(entry.sourceRemaining,allocated*entry.rate);
     const startSource=entry.sourceCursor;
     const endSource=startSource+sourceAllocated;
     const partial=endSource<entry.course.seconds-1;

     result[key].push({
       ...entry.course,
       allocated,
       scheduledSeconds:allocated,
       sourceStart:startSource,
       sourceEnd:endSource,
       sourceAllocated,
       playbackRate:entry.rate,
       isPartial:partial,
       scheduleLabel:partial?`${entry.course.name}（分段）`:entry.course.name
     });

     entry.sourceCursor=endSource;
     entry.sourceRemaining=Math.max(0,entry.sourceRemaining-sourceAllocated);
     remaining-=allocated;

     if(entry.sourceRemaining<=1){
       virtualDone.add(entry.course.id);
       queues[subject].shift();
     }
   }

   while(remaining>=1800&&!hasLectures()){
     const subject=subjects[reviewCursor%subjects.length];
     reviewCursor++;
     const alloc=Math.min(3600,remaining);
     result[key].push({
       id:`review-${key}-${reviewCursor}`,
       subject,
       name:`第 ${reviewRound} 輪總複習`,
       duration:secondsToClock(alloc),
       seconds:alloc,
       allocated:alloc,
       scheduledSeconds:alloc,
       color:subjectColors[subject],
       order:10000+reviewCursor,
       isReview:true
     });
     remaining-=alloc;
     if(reviewCursor%subjects.length===0)reviewRound++;
   }

   day.setDate(day.getDate()+1);
 }
 return result;
}
let plan=schedule();

function buildTodayTasks(){
 const today=new Date();
 let remaining=remainingTodayCapacitySeconds(today);
 if(remaining<60)return [];

 const result=[];
 const usedIds=new Set();
 const subjects=["材料力學","微積分","工程數學","靜力學","結構學"];

 const pushCourse=(c,pinned=false)=>{
   if(!c||usedIds.has(c.id)||lessonDone(c.id)||remaining<60)return false;
   const rate=playbackRateFor(c);
   const sourceStart=completedSourceSeconds(c);
   const sourceRemaining=remainingSourceSeconds(c);
   if(sourceRemaining<=1)return false;

   const wallNeeded=sourceRemaining/rate;
   const allocated=Math.min(wallNeeded,remaining);
   if(allocated<60)return false;

   const sourceAllocated=Math.min(sourceRemaining,allocated*rate);
   const sourceEnd=Math.min(c.seconds,sourceStart+sourceAllocated);
   const finalSegment=sourceEnd>=c.seconds-1;

   result.push({
     ...c,
     allocated,
     scheduledSeconds:allocated,
     sourceStart,
     sourceEnd,
     sourceAllocated,
     playbackRate:rate,
     isPartial:!finalSegment,
     isPinnedToday:pinned,
     scheduleLabel:pinned
       ?(finalSegment?`${c.name}（今日必看）`:`${c.name}（今日必看・分段）`)
       :(finalSegment?c.name:`${c.name}（分段）`)
   });
   usedIds.add(c.id);
   remaining-=allocated;
   return true;
 };

 // 先排各科目前最前面的「今日必看」課程。
 const pinnedFronts=subjects
   .map(subject=>nextUnfinishedCourse(subject))
   .filter(Boolean)
   .filter(c=>state.lessonMeta[c.id]?.pinned)
   .sort((a,b)=>(a.order||0)-(b.order||0));

 pinnedFronts.forEach(c=>pushCourse(c,true));

 // 再依科目輪替，直接從最新進度抓下一堂。
 // 不使用舊 plan[today]，因此完成一堂後剩 15 分鐘也會立即補下一段。
 let guard=0;
 while(remaining>=60 && guard++<50){
   let added=false;

   for(const subject of subjects){
     if(remaining<60)break;
     const c=nextUnfinishedCourse(subject);
     if(!c||usedIds.has(c.id))continue;

     // 保留原解鎖規則；已解鎖科目才進正式 Today。
     if(!isUnlocked(subject))continue;

     if(pushCourse(c,false))added=true;
   }

   // 若每科目前第一堂都已用過，允許同一堂繼續吃完當日剩餘容量。
   // 但這只會建立另一個分段，不會跳過前序課程。
   if(!added && remaining>=60){
     const candidates=subjects
       .filter(subject=>isUnlocked(subject))
       .map(subject=>nextUnfinishedCourse(subject))
       .filter(Boolean)
       .filter(c=>!lessonDone(c.id));

     const c=candidates[0];
     if(!c)break;

     const existing=result.filter(x=>x.id===c.id);
     const alreadySource=existing.reduce((sum,x)=>sum+(x.sourceAllocated||0),0);
     const baseStart=completedSourceSeconds(c)+alreadySource;
     const sourceRemaining=Math.max(0,c.seconds-baseStart);
     if(sourceRemaining<=1)break;

     const rate=playbackRateFor(c);
     const wallNeeded=sourceRemaining/rate;
     const allocated=Math.min(wallNeeded,remaining);
     if(allocated<60)break;

     const sourceAllocated=Math.min(sourceRemaining,allocated*rate);
     const sourceEnd=Math.min(c.seconds,baseStart+sourceAllocated);

     result.push({
       ...c,
       allocated,
       scheduledSeconds:allocated,
       sourceStart:baseStart,
       sourceEnd,
       sourceAllocated,
       playbackRate:rate,
       isPartial:sourceEnd<c.seconds-1,
       scheduleLabel:sourceEnd<c.seconds-1?`${c.name}（續看）`:c.name
     });
     remaining-=allocated;
     added=true;
   }

   if(!added)break;
 }

 return result;
}
function renderToday(){
 const now=new Date();
 const today=dateKey(now);
 const tasks=buildTodayTasks();
 $("#todayLabel").textContent=now.toLocaleDateString("zh-TW",{year:"numeric",month:"long",day:"numeric",weekday:"long"});
 let exam=new Date(state.settings.examDate+"T00:00:00");
 $("#daysLeft").textContent=Math.max(0,Math.ceil((exam-now)/86400000));

 currentTodayTasks={};
 $("#todayTasks").innerHTML=tasks.length
   ?tasks.map((task,index)=>taskCard(task,index,today)).join("")
   :`<article class="task" style="--accent:#888"><div class="pill">Today</div><h3>今天沒有排課</h3><p class="duration">休息，或從下方選擇未來課程先預習。</p></article>`;

 const planned=tasks.reduce((sum,t)=>sum+(t.allocated||0),0);
 const unfinished=tasks.filter(t=>!lessonDone(t.id)).reduce((sum,t)=>sum+(t.allocated||0),0);
 $("#todayRemaining").textContent=fmtSec(unfinished);
 $("#streak").textContent=calcStreak()+" 天";

 const heroMeta=$("#todayRemaining")?.closest(".hero-meta");
 if(heroMeta)heroMeta.dataset.planned=String(planned);

 bindChecks();
 renderPreview();
}

let currentTodayTasks={};

function segmentKeyFor(task,todayKey){
 return `${todayKey}|${task.id}|${Math.round(task.sourceStart||0)}|${Math.round(task.sourceEnd||0)}`;
}

function taskCard(c,index,todayKey){
 const key=segmentKeyFor(c,todayKey);
 currentTodayTasks[key]=c;
 const checks=state.segmentChecks[key]||{};
 const allocated=c.allocated||0;
 const finalSegment=isFinalScheduledSegment(c);
 const segmentText=finalSegment
   ?`今日安排 ${fmtSec(allocated)}｜完成今日內容後，本堂課即完成`
   :`今日安排 ${fmtSec(allocated)}｜整堂 ${c.duration}`;

 return `<article class="task" style="--accent:${c.color}" data-task-segment="${escapeHtml(key)}">
   <div class="task-top">
     <span class="pill">${escapeHtml(c.subject)}</span>
     <span>${secondsToClock(allocated)}</span>
   </div>
   <h3>${escapeHtml(c.scheduleLabel||c.name)}</h3>
   <div class="duration">${segmentText}</div>
   ${!finalSegment?`<div class="task-segment-note">完成今日四項後，只記錄今天安排的這一段；下次會從影片 ${secondsToClock(c.sourceEnd)} 繼續。</div>`:`<div class="task-segment-note final-segment-note">完成今日四項後，本堂課將標記完成。</div>`}
   <div class="checks">
     ${["video:影片","notes:教材","examples:例題","exercises:習題"].map(x=>{
       const [k,n]=x.split(":");
       return `<label class="check ${checks[k]?"done":""}">
         <span>${n}</span>
         <input type="checkbox" data-segment-key="${escapeHtml(key)}" data-key="${k}" ${checks[k]?"checked":""}>
         <b>${checks[k]?"✓":"○"}</b>
       </label>`;
     }).join("")}
   </div>
   <div class="task-actions">
     <span>完成狀態：${finalSegment?"本堂最後一段":"今日分段"}</span>
     <button class="finish-all-button" type="button" data-finish-all="${escapeHtml(key)}">整堂已看完</button>
   </div>
 </article>`;
}

function commitScheduledSegment(key){
 const task=currentTodayTasks[key];
 if(!task)return;
 const todayKey=dateKey(new Date());

 state.studyProgress[task.id]=Math.max(
   +state.studyProgress[task.id]||0,
   task.sourceEnd||0
 );
 state.lessonMeta[task.id]={
   ...(state.lessonMeta[task.id]||{}),
   watchPosition:secondsToClock(state.studyProgress[task.id])
 };
 state.dailyConsumed[todayKey]=(+state.dailyConsumed[todayKey]||0)+(task.allocated||0);
 state.dayHistory[todayKey]=[
   ...(state.dayHistory[todayKey]||[]),
   {
     id:task.id,
     subject:task.subject,
     name:task.name,
     wallSeconds:task.allocated||0,
     sourceStart:task.sourceStart||0,
     sourceEnd:task.sourceEnd||0,
     completedAt:new Date().toISOString(),
     mode:"segment"
   }
 ];
 delete state.segmentChecks[key];

 const reachedEnd=(Number(task.sourceEnd)||0)>=task.seconds-1;
 if(reachedEnd){
   state.studyProgress[task.id]=task.seconds;
   state.lessonMeta[task.id]={
     ...(state.lessonMeta[task.id]||{}),
     watchPosition:task.duration
   };
   state.progress[task.id]={
     ...(state.progress[task.id]||{}),
     video:true,notes:true,examples:true,exercises:true,
     updated:new Date().toISOString()
   };
 }

 save();
 plan=schedule();
 currentTodayTasks={};
 renderAll();
 requestAnimationFrame(()=>document.querySelector("#todayTasks")?.scrollIntoView({block:"nearest"}));
 toast(reachedEnd
   ?`已看完 ${task.name}`
   :`已完成 ${task.name} 的今日 ${fmtSec(task.allocated)}，下次會從 ${secondsToClock(task.sourceEnd)} 接著排`
 );
}

function finishWholeCourse(key){
 const task=currentTodayTasks[key];
 if(!task)return;
 if(!confirm(`確定「${task.name}」整堂已看完？\n\n這會直接完成整堂並更新後續排程。`))return;

 const todayKey=dateKey(new Date());
 const remainingWall=remainingWallSeconds(task);

 state.studyProgress[task.id]=task.seconds;
 state.lessonMeta[task.id]={
   ...(state.lessonMeta[task.id]||{}),
   watchPosition:task.duration
 };
 state.progress[task.id]={
   ...(state.progress[task.id]||{}),
   video:true,notes:true,examples:true,exercises:true,
   updated:new Date().toISOString()
 };
 state.dailyConsumed[todayKey]=(+state.dailyConsumed[todayKey]||0)+Math.max(task.allocated||0,remainingWall);
 state.dayHistory[todayKey]=[
   ...(state.dayHistory[todayKey]||[]),
   {
     id:task.id,
     subject:task.subject,
     name:task.name,
     wallSeconds:Math.max(task.allocated||0,remainingWall),
     sourceStart:task.sourceStart||0,
     sourceEnd:task.seconds,
     completedAt:new Date().toISOString(),
     mode:"full"
   }
 ];
 delete state.segmentChecks[key];

 save();
 plan=schedule();
 currentTodayTasks={};
 renderAll();
 requestAnimationFrame(()=>document.querySelector("#todayTasks")?.scrollIntoView({block:"nearest"}));
 toast(`${task.name} 已標記為整堂已看完`);
}

function bindChecks(){
 $$("[data-segment-key]").forEach(input=>input.onchange=()=>{
   const key=input.dataset.segmentKey;
   state.segmentChecks[key]={
     ...(state.segmentChecks[key]||{}),
     [input.dataset.key]:input.checked
   };
   save();

   const all=["video","notes","examples","exercises"].every(k=>state.segmentChecks[key]?.[k]);
   if(all){
     commitScheduledSegment(key);
   }else{
     renderToday();
   }
 });

 $$("[data-finish-all]").forEach(button=>button.onclick=()=>{
   finishWholeCourse(button.dataset.finishAll);
 });
}
function todayFormalDone(){
 return remainingTodayCapacitySeconds(new Date())<=0 || buildTodayTasks().length===0;
}
function scheduledDateForCourse(id){
 const keys=Object.keys(plan).sort();
 for(const key of keys){
   if((plan[key]||[]).some(item=>item.id===id))return key;
 }
 return null;
}

function futurePreviewCandidates(limit=30){
 const queued=new Set(state.previewQueue);
 const todayIds=new Set(buildTodayTasks().map(item=>item.id));

 const all=COURSES
   .filter(c=>!state.hiddenCourses[c.id])
   .filter(c=>!lessonDone(c.id))
   .filter(c=>!queued.has(c.id))
   .filter(c=>!todayIds.has(c.id))
   .sort((a,b)=>{
     const subjectOrder=["材料力學","微積分","工程數學","靜力學","結構學"];
     const sa=subjectOrder.indexOf(a.subject);
     const sb=subjectOrder.indexOf(b.subject);
     if(sa!==sb)return sa-sb;
     return (a.order||0)-(b.order||0);
   })
   .map(c=>{
     const sourceDone=completedSourceSeconds(c);
     const remainingSource=Math.max(0,c.seconds-sourceDone);
     return {
       ...c,
       scheduledDate:scheduledDateForCourse(c.id),
       remainingSource,
       isPartiallyWatched:sourceDone>0&&remainingSource>0
     };
   });

 return all.slice(0,limit);
}
function previewCourseMinutes(c){
 const meta=state.lessonMeta[c.id]||{};
 const watched=durationToSeconds(meta.watchPosition||"00:00:00");
 const rate=Math.max(1,+meta.playbackRate||1.5);
 const remaining=Math.max(0,(c.seconds-watched)/rate);
 return Math.max(15*60,Math.min(60*60,remaining||30*60));
}

function renderPreview(){
 const queue=state.previewQueue.map(getCourse).filter(Boolean);
 state.previewQueue=queue.map(c=>c.id);

 const completed=todayFormalDone();
 $("#previewStatusTitle").textContent=completed?"今日正式進度已完成，可以開始預習":"先完成今日正式進度，再進行預習";
 $("#previewStatusText").textContent=completed
   ?"預習是額外進度，不會改動正式日曆；可直接選擇下方未來課程。"
   :"你仍可先建立預習清單，完成今日任務後再開始。";
 $("#previewStatusTitle").closest(".preview-status")?.classList.toggle("ready",completed);

 const candidates=futurePreviewCandidates();
 $("#futurePreviewList").innerHTML=candidates.length?candidates.map(c=>`
   <article class="preview-course" style="--accent:${c.color}">
     <div>
       <span>${escapeHtml(c.subject)}${c.scheduledDate?`｜預計 ${c.scheduledDate}`:"｜尚未排定"}</span>
       <h5>${escapeHtml(c.name)}${c.isPartiallyWatched?"（未完成）":""}</h5>
       <p>${c.isPartiallyWatched
         ?`目前看到 ${secondsToClock(completedSourceSeconds(c))}｜剩餘 ${fmtSec(sourceToWallSeconds(c.remainingSource,c))}`
         :`整堂約 ${fmtSec(sourceToWallSeconds(c.seconds,c))}`}</p>
     </div>
     <button type="button" data-add-preview="${c.id}">加入預習</button>
   </article>`).join(""):`<p class="empty-copy">目前沒有可選的未來課程。</p>`;

 $("#selectedPreviewList").innerHTML=queue.length?queue.map(c=>{
   const minutes=previewCourseMinutes(c);
   const meta=state.lessonMeta[c.id]||{};
   return `<article class="preview-course selected" style="--accent:${c.color}">
     <div>
       <span>${escapeHtml(c.subject)}${meta.favorite?" ⭐":""}</span>
       <h5>${escapeHtml(c.name)}</h5>
       <p>建議先預習 ${fmtSec(minutes)}</p>
     </div>
     <div class="preview-actions">
       <button type="button" data-open-preview="${c.id}">開啟</button>
       <button type="button" data-remove-preview="${c.id}">移除</button>
     </div>
   </article>`;
 }).join(""):`<p class="empty-copy">尚未選擇預習課程。</p>`;

 const total=queue.reduce((sum,c)=>sum+previewCourseMinutes(c),0);
 $("#previewTotal").textContent=fmtSec(total);

 $$("[data-add-preview]").forEach(btn=>btn.onclick=()=>{
   const id=btn.dataset.addPreview;
   if(!state.previewQueue.includes(id))state.previewQueue.push(id);
   save();renderPreview();toast("已加入今日預習清單");
 });

 $$("[data-remove-preview]").forEach(btn=>btn.onclick=()=>{
   state.previewQueue=state.previewQueue.filter(id=>id!==btn.dataset.removePreview);
   save();renderPreview();toast("已移除預習課程");
 });

 $$("[data-open-preview]").forEach(btn=>btn.onclick=()=>openLessonSheet(btn.dataset.openPreview));
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
   const previews=items.slice(0,3).map(c=>`<div class="calendar-course-preview" style="--accent:${c.color}"><span>${escapeHtml(c.subject)}</span><b>${escapeHtml(c.scheduleLabel||c.name)}</b></div>`).join("");
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
      <span class="calendar-course-main"><b>${escapeHtml(c.subject)}</b><strong>${escapeHtml(c.scheduleLabel||c.name)}</strong></span>
      <span class="calendar-course-duration">${secondsToClock(c.allocated||c.seconds)}</span>
      <span class="calendar-course-state">${lessonDone(c.id)?"已完成":"未完成"}</span>
   </button>`).join(""):'<p class="empty-copy">這一天沒有安排課程。</p>'}`;
 $$("[data-calendar-edit]").forEach(btn=>btn.onclick=()=>{if(!String(btn.dataset.calendarEdit).startsWith("review-"))openLessonSheet(btn.dataset.calendarEdit)});
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
function secondsToClock(v){v=Math.max(0,Math.round(v));return `${pad(Math.floor(v/3600))}:${pad(Math.floor((v%3600)/60))}:${pad(v%60)}`}
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
 document.body.classList.add("sheet-open");
}
function closeLessonSheet(){$("#lessonSheet").classList.remove("open");$("#lessonSheet").setAttribute("aria-hidden","true");document.body.classList.remove("sheet-open");activeCourseId=null}
function completeAllParts(id,done){
 const c=getCourse(id);
 state.progress[id]={...(state.progress[id]||{}),video:done,notes:done,examples:done,exercises:done,updated:new Date().toISOString()};
 if(c){
   state.studyProgress[id]=done?c.seconds:0;
   state.lessonMeta[id]={...(state.lessonMeta[id]||{}),watchPosition:done?c.duration:"00:00:00"};
 }
 save();plan=schedule();renderAll();
}
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
 const blockedPinned=state.lessonMeta[id]?.pinned&&!isSequentiallyAvailable(c);
 toast(blockedPinned
   ?`已儲存 ${name}；因前序課程尚未完成，不會跳進正式 Today，請從預習區選取`
   :`已儲存 ${name}`,()=>{
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
 const payload={version:"5.5",exportedAt:new Date().toISOString(),state};
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

function renderAll(){renderToday();renderDashboard();renderAdvice();renderCalendar();renderSubjects();renderSettings();renderPreview()}
let undoTimer=null;
function toast(t,undoFn=null){let e=$("#toast");e.innerHTML=`<span>${escapeHtml(t)}</span>${undoFn?'<button class="undo-btn" type="button">復原</button>':''}`;e.classList.add("show");clearTimeout(undoTimer);if(undoFn)e.querySelector(".undo-btn").onclick=()=>{undoFn();e.classList.remove("show");toast("已復原")};undoTimer=setTimeout(()=>e.classList.remove("show"),undoFn?8000:2200)}
$("#clearPreviewQueue").onclick=()=>{
 state.previewQueue=[];
 save();
 renderPreview();
 toast("已清空今日預習清單");
};
$("#refreshAdvice").onclick=()=>{renderAdvice();toast("智慧建議已重新分析")};
$("#prevMonth").onclick=()=>{calDate.setMonth(calDate.getMonth()-1);renderCalendar()};$("#nextMonth").onclick=()=>{calDate.setMonth(calDate.getMonth()+1);renderCalendar()};
$("#saveNote").onclick=()=>{if(!state.selectedDate)return toast("請先選擇日期");state.notes[state.selectedDate]={text:$("#noteInput").value,capacity:+$("#capacityInput").value};save();plan=schedule();renderAll();toast("行事曆已儲存並重新排程")};
$("#saveSettings").onclick=()=>{
 const next={...state.settings,startDate:$("#startDate").value,examDate:$("#examDate").value,weekdayCap:Math.max(0,+$("#weekdayCap").value||0),saturdayCap:Math.max(0,+$("#saturdayCap").value||0),sundayCap:Math.max(0,+$("#sundayMode").value||0)};
 if(!next.startDate||!next.examDate)return toast("請填寫開始日期與考試日期");
 if(new Date(next.startDate)>new Date(next.examDate))return toast("開始日期不能晚於考試日期");
 state.settings=next;
 Object.keys(state.notes).forEach(k=>{if(state.notes[k]&&Object.prototype.hasOwnProperty.call(state.notes[k],"capacity"))delete state.notes[k].capacity});
 save();plan=schedule();calDate=new Date(next.startDate+"T00:00:00");state.selectedDate=next.startDate;renderAll();renderCalendarDetail();
 document.getElementById("calendar").scrollIntoView({behavior:"smooth"});
 toast(`已重排：平日 ${next.weekdayCap} 分鐘、星期六 ${next.saturdayCap} 分鐘`);
};
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
