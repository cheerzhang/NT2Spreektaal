const STORAGE_KEY = 'hexie-progress-v1';
const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"sentences":{},"days":{}}');
let mode = 'review', queue = [], current = null, answered = false, sessionDone = 0, sessionCorrect = 0;
let answerMode = state.settings?.answerMode || 'typing', wordTokens = [], selectedTokenIds = [];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const today = () => new Date().toISOString().slice(0, 10);
const dayMs = 86400000;

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function showDataMessage(message,isError=false){const el=$('#dataMessage');el.textContent=message;el.classList.toggle('error',isError)}
function exportProgress(){
  const backup={app:'荷写',version:1,exportedAt:new Date().toISOString(),progress:state};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`hexie-progress-${today()}.json`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  showDataMessage('进度已导出。请把这个 JSON 文件保存在安全的位置。');
}
async function importProgress(file){
  try{
    const parsed=JSON.parse(await file.text()),incoming=parsed.progress||parsed;
    if(!incoming||typeof incoming!=='object'||typeof incoming.sentences!=='object'||typeof incoming.days!=='object')throw new Error('invalid');
    state.sentences=incoming.sentences;state.days=incoming.days;state.settings=incoming.settings||state.settings||{};save();
    answerMode=state.settings.answerMode||answerMode;setAnswerMode(answerMode);updateCounts();buildQueue();renderReport();
    showDataMessage(`导入成功：恢复了 ${Object.keys(state.sentences).length} 条句子的学习记录。`);
  }catch(error){showDataMessage('无法导入：请选择由荷写导出的有效 JSON 文件。',true)}
}
function normalize(s) { return s.toLowerCase().trim().replace(/[.,!?;:'’]/g, '').replace(/\s+/g, ' '); }
function topicColor(topic){let hash=0;for(const char of topic)hash=(hash+char.charCodeAt(0))%6;return `topic-${hash}`}
function distance(a, b) {
  const m = Array.from({length:a.length+1},(_,i)=>[i]);
  for(let j=1;j<=b.length;j++)m[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return m[a.length][b.length];
}
function sentenceProgress(id) { return state.sentences[id] || {attempts:0, correct:0, mastery:0, due:today()}; }
function isDue(s) { const p=sentenceProgress(s.id); return p.attempts>0 && p.due<=today() && p.mastery<100; }
function dueList() { return SENTENCES.filter(isDue); }
function shuffle(a) { return [...a].sort(()=>Math.random()-.5); }
function prepareWords() {
  selectedTokenIds=[];
  wordTokens=current ? shuffle(current.nl.trim().split(/\s+/).map((word,id)=>({id,word}))) : [];
  renderWords();
}
function renderWords() {
  if (!current) return;
  const byId=id=>wordTokens.find(token=>token.id===id);
  $('#orderedWords').innerHTML=selectedTokenIds.length?selectedTokenIds.map(id=>`<button class="word-chip" data-selected-id="${id}" type="button">${byId(id).word}</button>`).join(''):'<span class="order-placeholder">答案会出现在这里</span>';
  $('#wordBank').innerHTML=wordTokens.map(token=>`<button class="word-chip ${selectedTokenIds.includes(token.id)?'used':''}" data-token-id="${token.id}" type="button">${token.word}</button>`).join('');
  $$('[data-token-id]').forEach(button=>button.onclick=()=>{if(answered)return;selectedTokenIds.push(Number(button.dataset.tokenId));renderWords()});
  $$('[data-selected-id]').forEach(button=>button.onclick=()=>{if(answered)return;selectedTokenIds=selectedTokenIds.filter(id=>id!==Number(button.dataset.selectedId));renderWords()});
  if(answerMode==='ordering'&&!answered)$('#submitBtn').disabled=selectedTokenIds.length!==wordTokens.length;
}
function orderedAnswer(){return selectedTokenIds.map(id=>wordTokens.find(token=>token.id===id).word).join(' ')}
function setAnswerMode(nextMode) {
  answerMode=nextMode; state.settings={...(state.settings||{}),answerMode}; save();
  $$('.answer-mode button').forEach(button=>button.classList.toggle('active',button.dataset.answerMode===answerMode));
  $('#typingAnswer').hidden=answerMode!=='typing'; $('#orderingAnswer').hidden=answerMode!=='ordering';
  $('#submitBtn').disabled=answerMode==='ordering'&&selectedTokenIds.length!==wordTokens.length;
  if(current&&!answered){prepareWords();if(answerMode==='typing')$('#answerInput').focus()}
}

function buildQueue() {
  const source = mode === 'review' ? dueList() : SENTENCES.filter(s=>s.level===mode);
  queue = shuffle(source).slice(0,10);
  sessionDone=0; sessionCorrect=0; loadNext();
}
function loadNext() {
  if (!queue.length) {
    current=null; answered=false;
    $('#chinesePrompt').textContent=mode==='review'?'今天暂时没有需要复习的句子。':'这个等级还没有手动加入句子。';
    $('#questionNo').textContent='等待新句子'; $('#questionTags').innerHTML='';
    $('#answerInput').value=''; $('#answerInput').disabled=true; $('#feedback').hidden=true;
    $('#submitBtn').hidden=true; $('#nextBtn').hidden=true; $('#skipBtn').hidden=true; updateSession(); return;
  }
  answered=false; current=queue[sessionDone % queue.length];
  $('#chinesePrompt').textContent=current.zh;
  $('#questionNo').textContent=`第 ${sessionDone+1} 题`;
  $('#questionTags').innerHTML=`<span class="tag level-tag level-${current.level.toLowerCase()}">${current.level}</span><span class="tag topic-tag ${topicColor(current.topic)}">${current.topic}</span>`;
  $('#answerInput').value=''; $('#answerInput').disabled=false; $('#feedback').hidden=true;
  $('#orderingAnswer').classList.remove('locked'); prepareWords();
  $('#submitBtn').hidden=false; $('#submitBtn').disabled=answerMode==='ordering'; $('#nextBtn').hidden=true; $('#skipBtn').hidden=false;
  if(answerMode==='typing')$('#answerInput').focus(); updateSession();
}
function submit() {
  const rawAnswer=answerMode==='typing'?$('#answerInput').value:orderedAnswer();
  if(answered || !rawAnswer.trim() || (answerMode==='ordering'&&selectedTokenIds.length!==wordTokens.length)) return;
  const given=normalize(rawAnswer), expected=normalize(current.nl);
  const similarity=1-distance(given,expected)/Math.max(given.length,expected.length);
  // 两种模式都严格核对拼写与词序；normalize 仅忽略大小写、标点和多余空格。
  const correct=given===expected; answered=true;
  const p=sentenceProgress(current.id); p.attempts++; if(correct)p.correct++;
  p.mastery=Math.max(0,Math.min(100,p.mastery+(correct?20:-12)));
  const intervals=[1,2,4,7,14,30]; const interval=correct?intervals[Math.min(Math.floor(p.mastery/20),5)]:1;
  p.due=new Date(Date.now()+interval*dayMs).toISOString().slice(0,10); p.last=today(); state.sentences[current.id]=p;
  state.days[today()]=state.days[today()]||{answers:0,correct:0}; state.days[today()].answers++; if(correct)state.days[today()].correct++;
  if(correct)sessionCorrect++;
  $('#xpCount').textContent=sessionCorrect*10+(sessionDone+1-sessionCorrect)*3;
  $('#encouragement').textContent=correct?['Mooi! 这句已经更稳了。','Goed bezig! 保持这个节奏。','太棒了，记忆正在连接。'][sessionCorrect%3]:'出错是记住它的开始。';
  const box=$('#feedback'); box.className='feedback '+(correct?'':'wrong'); box.hidden=false;
  box.innerHTML=correct?`✓ 很好，完全正确！<strong>${current.nl}</strong>`:`${similarity>.7?'很接近，再留意一下词序和拼写。':'这句需要再复习。'}<strong>${current.nl}</strong>`;
  $('#answerInput').disabled=true; $('#orderingAnswer').classList.add('locked'); $('#submitBtn').hidden=true; $('#nextBtn').hidden=false; save(); updateCounts();
}
function next() { sessionDone++; if(sessionDone>=10){sessionDone=0; sessionCorrect=0; queue=shuffle(queue);} loadNext(); }
function updateSession(){ $('#sessionScore').textContent=`${sessionDone} / 10 · 对 ${sessionCorrect}`; $('#sessionBar').value=sessionDone; }

function updateCounts(){
  const done=state.days[today()]?.answers||0, goal=Math.min(done,10);
  $('#reviewCount').textContent=dueList().length; $('#streakCount').textContent=streak();
  $('#todayAnswers').textContent=goal; $('#goalRing').style.setProperty('--goal',goal*10);
  $('#goalMessage').textContent=done>=10?'今日目标完成，太棒了！':`再练 ${10-done} 句完成今日目标`;
}
function streak(){let n=0,d=new Date();while(true){const k=d.toISOString().slice(0,10);if(state.days[k]?.answers){n++;d=new Date(d-dayMs)}else break}return n}

function renderLibrary(){
  const level=$('#levelFilter').value,topic=$('#topicFilter').value,q=$('#searchInput').value.toLowerCase();
  const list=SENTENCES.filter(s=>(level==='all'||s.level===level)&&(topic==='all'||s.topic===topic)&&(!q||s.zh.includes(q)||s.nl.toLowerCase().includes(q)));
  $('#libraryStats').textContent=`显示 ${list.length} / ${SENTENCES.length} 句`;
  $('#libraryTotal').textContent=SENTENCES.length;
  $('#sentenceList').innerHTML=list.length?list.map(s=>`<article class="sentence-item"><div class="level">${s.level}</div><div><p>${s.zh}</p><small>${s.nl}</small></div><div class="tags"><span class="tag topic-tag ${topicColor(s.topic)}">${s.topic}</span><span class="tag source-tag">${s.source}</span></div></article>`).join(''):'<article class="sentence-item"><div></div><div><p>还没有符合条件的句子</p><small>请在 my-sentences.js 中加入内容。</small></div></article>';
}
function renderReport(){
  const ps=SENTENCES.map(s=>state.sentences[s.id]).filter(Boolean),answers=ps.reduce((a,p)=>a+p.attempts,0),correct=ps.reduce((a,p)=>a+p.correct,0);
  $('#studiedMetric').textContent=SENTENCES.filter(s=>state.sentences[s.id]).length; $('#totalMetric').textContent=`/ ${SENTENCES.length}`; $('#answerMetric').textContent=answers; $('#accuracyMetric').textContent=answers?Math.round(correct/answers*100)+'%':'—'; $('#dueMetric').textContent=dueList().length;
  $('#reportSummary').textContent=answers?`你已经练习了 ${ps.length} 个句型。稳定的小步积累，比一次学很多更有效。`:'完成一次练习后，这里会出现你的学习趋势。';
  $('#masteryBars').innerHTML=['A2','B1','B2'].map(l=>{const ss=SENTENCES.filter(s=>s.level===l),v=ss.length?Math.round(ss.reduce((a,s)=>a+sentenceProgress(s.id).mastery,0)/ss.length):0;return `<div class="mastery-row"><b>${l}</b><div class="bar"><i style="width:${v}%"></i></div><span>${v}%</span></div>`}).join('');
  const dates=Array.from({length:7},(_,i)=>new Date(Date.now()-(6-i)*dayMs)); const max=Math.max(10,...dates.map(d=>state.days[d.toISOString().slice(0,10)]?.answers||0));
  $('#weekChart').innerHTML=dates.map(d=>{const k=d.toISOString().slice(0,10),n=state.days[k]?.answers||0;return `<div class="day"><i style="height:${n/max*100}%"></i><span>${['日','一','二','三','四','五','六'][d.getDay()]}</span></div>`}).join('');
  const topics=[...new Set(SENTENCES.map(s=>s.topic))]; $('#topicReport').innerHTML=topics.map(t=>{const ss=SENTENCES.filter(s=>s.topic===t),v=Math.round(ss.reduce((a,s)=>a+sentenceProgress(s.id).mastery,0)/ss.length);return `<div class="topic-row"><span>${t}</span><div class="bar"><i style="width:${v}%"></i></div><b>${v}%</b></div>`}).join('');
}

$$('.nav-link').forEach(b=>b.onclick=()=>{$$('.nav-link,.page').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.page).classList.add('active');if(b.dataset.page==='report')renderReport();if(b.dataset.page==='library')renderLibrary();location.hash=b.dataset.page});
$$('.level-tabs button').forEach(b=>b.onclick=()=>{$$('.level-tabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.level;buildQueue()});
$('#submitBtn').onclick=submit; $('#nextBtn').onclick=next; $('#skipBtn').onclick=next;
$('#clearOrderBtn').onclick=()=>{if(!answered){selectedTokenIds=[];renderWords()}};
$('#exportProgressBtn').onclick=exportProgress;
$('#importProgressBtn').onclick=()=>$('#progressFileInput').click();
$('#progressFileInput').onchange=event=>{const file=event.target.files[0];if(file)importProgress(file);event.target.value=''};
$$('.answer-mode button').forEach(button=>button.onclick=()=>setAnswerMode(button.dataset.answerMode));
$('#answerInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();answered?next():submit()}});
['levelFilter','topicFilter','searchInput'].forEach(id=>$('#'+id).addEventListener('input',renderLibrary));
const topics=[...new Set(SENTENCES.map(s=>s.topic))].sort(); $('#topicFilter').innerHTML+=[...topics].map(t=>`<option>${t}</option>`).join('');
$('#libraryTotal').textContent=SENTENCES.length;
$('#a2Count').textContent=SENTENCES.filter(s=>s.level==='A2').length;
$('#b1Count').textContent=SENTENCES.filter(s=>s.level==='B1').length;
$('#b2Count').textContent=SENTENCES.filter(s=>s.level==='B2').length;
setAnswerMode(answerMode); updateCounts(); buildQueue();
const hash=location.hash.slice(1); if(['library','report'].includes(hash)) document.querySelector(`[data-page="${hash}"]`).click();
