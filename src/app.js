import { PRESETS } from './data.js';
import { COLLECTION_LIMITS, EXERCISE_PHASES, MAX_CLOSEOUT_LESSONS, activeInjects, addObservation, advanceExercise, closeExercise, closeoutLessons, closeoutReadiness, compactMetrics, createExercise, createInject, decideCommunication, decideProposal, enterCloseoutReview, exerciseScore, exportAfterAction, fnv1a, forecastExercise, forecastStatus, formatClock, isValidExerciseShape, metricTone, openRisks, parseLessons, resolveInject, resumeResponse, stageCommunication, stageProposal, updateObjective } from './engine.js';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, pageItems, pageMessage, segmentText } from './paging.js';
import { StatePersistenceError, commitState } from './state.js';
import { createWebMCPRegistry } from './webmcp.js';

const STORAGE_KEY = 'drillboard.exercise.v2';
// Theme is a device preference, not exercise state, so it survives Reset and scenario switches.
const THEME_KEY = 'drillboard.theme';
const THEMES = ['dark', 'light'];
const MAX_HISTORY = 36;
// Each undo entry is a full board snapshot; keep the in-memory stack deep but persist only the newest few to protect the storage quota.
const PERSISTED_HISTORY = 12;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const elements = {
  preset: $('#preset-select'), role: $('#role-select'), reset: $('#reset-exercise'), advance15: $('#advance-15'), advance30: $('#advance-30'), undo: $('#undo-change'),
  clock: $('#exercise-clock'), scenarioTitle: $('#scenario-title'), scenarioSubtitle: $('#scenario-subtitle'), status: $('#exercise-status'), score: $('#exercise-score'),
  impact: $('#metric-impact'), uncertainty: $('#metric-uncertainty'), fatigue: $('#metric-fatigue'), trust: $('#metric-trust'), service: $('#metric-service'),
  objectives: $('#objective-list'), injects: $('#inject-list'), resources: $('#resource-list'), proposals: $('#proposal-list'), communications: $('#communication-list'),
  forecast: $('#forecast-panel'), riskList: $('#risk-list'), activity: $('#activity-list'), webmcpStatus: $('#webmcp-status'), webmcpError: $('#webmcp-error'), toolButton: $('#tool-lab-button'),
  toolDialog: $('#tool-dialog'), toolSelect: $('#tool-select'), toolInput: $('#tool-input'), toolRun: $('#tool-run'), toolOutput: $('#tool-output'), toolClose: $('#close-tool-dialog'),
  forecastButton: $('#run-forecast'), exportButton: $('#export-aar'), closeoutRationale: $('#closeout-rationale'), closeoutLessons: $('#closeout-lessons'),
  closeoutCheck: $('#closeout-check'), closeoutReviewButton: $('#closeout-review-button'), resumeResponseButton: $('#resume-response-button'), closeoutButton: $('#closeout-button'), closeoutStatus: $('#closeout-status'), theme: $('#theme-toggle'), roleCopy: $('#role-copy'),
  liveStatus: $('#live-status'), resetConfirm: $('#reset-confirm'), resetConfirmText: $('#reset-confirm-text'), resetExport: $('#reset-export'), resetDiscard: $('#reset-discard'), resetCancel: $('#reset-cancel'),
};

function nowLabel() { return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date()); }
function initialState(preset='outage') { return { exercise:createExercise(preset), history:[], activity:[{time:nowLabel(),actor:'human',label:`Opened ${PRESETS[preset].name}`}], exportedFingerprint:null }; }
function loadState(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(parsed&&typeof parsed==='object'&&isValidExerciseShape(parsed.exercise)){
      const {theme:_legacyTheme,...rest}=parsed;
      const activity=Array.isArray(parsed.activity)?parsed.activity.filter((item)=>item&&typeof item.label==='string'):[];
      return {...rest,history:Array.isArray(parsed.history)?parsed.history:[],activity:activity.length?activity:initialState(parsed.exercise.presetKey).activity,exportedFingerprint:typeof parsed.exportedFingerprint==='string'?parsed.exportedFingerprint:null};
    }
  }catch{}
  return initialState();
}
function loadTheme(){
  try{
    const stored=localStorage.getItem(THEME_KEY);
    if(THEMES.includes(stored))return stored;
    const legacy=JSON.parse(localStorage.getItem(STORAGE_KEY))?.theme;
    if(THEMES.includes(legacy))return legacy;
  }catch{}
  return 'dark';
}
let state=loadState();
let theme=loadTheme();
const isResponseOpen=()=>state.exercise.status==='open'&&state.exercise.phase===EXERCISE_PHASES.RESPONSE;
function persist(nextState=state){ localStorage.setItem(STORAGE_KEY,JSON.stringify({...nextState,history:(nextState.history||[]).slice(-PERSISTED_HISTORY)})); }
function snapshot(source=state){ return JSON.stringify({exercise:source.exercise,activity:source.activity}); }
function mutate(label,actor,operation,{history=true}={}){
  if(state.exercise.status==='closed') throw new Error('The exercise is closed and read-only. Reset it to start another drill.');
  if(state.exercise.phase!==EXERCISE_PHASES.RESPONSE) throw new Error('The exercise is in closeout review. A person must resume response before any mutation.');
  try{
    state=commitState(state,(draft)=>{
      if(history) draft.history=[...draft.history.slice(-(MAX_HISTORY-1)),{snapshot:snapshot(state),actor,label}];
      operation(draft);
      draft.activity=[{time:nowLabel(),actor,label},...draft.activity].slice(0,60);
    },persist);
  }catch(error){render();if(error instanceof StatePersistenceError)elements.roleCopy.textContent=error.message;throw error;}
  render();
}
function undo(){if(!isResponseOpen())throw new Error('Changes cannot be undone during closeout review or after closure.');const entry=state.history.at(-1);if(!entry)return;const restored=JSON.parse(typeof entry==='string'?entry:entry.snapshot);state=commitState(state,(draft)=>{draft.history.pop();const history=draft.history;Object.assign(draft,restored,{history});draft.activity=[{time:nowLabel(),actor:'human',label:`User undid the previous ${entry.actor||'simulation'} change`},...draft.activity].slice(0,60);},persist);render();}
function resetExercise(key=state.exercise.presetKey){const next=initialState(key);try{persist(next);}catch(error){throw new Error(`Could not reset the exercise; the current board was preserved. ${error instanceof Error?error.message:String(error)}`);}state=next;pendingDecision=null;pendingReset=null;render();}
// "Unexported" means the board changed since it was opened and no AAR download has captured the current snapshot.
function hasUnexportedWork(){return state.activity.length>1&&state.exportedFingerprint!==fnv1a(snapshot(state));}
function exportCurrentAar(filename='drillboard-after-action.md'){
  downloadText(filename,exportAfterAction(state.exercise,state.activity));
  // The download already happened; a storage failure here only loses the "exported" marker.
  try{state=commitState(state,(draft)=>{draft.exportedFingerprint=fnv1a(snapshot(draft));},persist);}catch{}
}
let pendingReset=null;
function renderResetConfirm(){
  elements.resetConfirm.hidden=!pendingReset;
  if(!pendingReset)return;
  const target=PRESETS[pendingReset.key]?.name||pendingReset.key;
  elements.resetConfirmText.textContent=`${pendingReset.key===state.exercise.presetKey?'Resetting':`Switching to ${target}`} discards the current ${state.exercise.title} exercise, which has changes that were not exported.`;
}
function runReset(key){try{resetExercise(key);announce(`Opened a fresh ${PRESETS[key]?.name||key} exercise.`);}catch(error){pendingReset=null;renderResetConfirm();elements.roleCopy.textContent=error instanceof Error?error.message:String(error);announce(elements.roleCopy.textContent);}}
function requestReset(key=state.exercise.presetKey){
  if(!hasUnexportedWork()){runReset(key);return;}
  pendingReset={key};renderResetConfirm();elements.resetCancel.focus();
}
function cancelReset(){pendingReset=null;renderResetConfirm();elements.preset.value=state.exercise.presetKey;elements.reset.focus();}
function replaceExercise(next,label,actor){ mutate(label,actor,(draft)=>{draft.exercise=next;draft.exercise.closeout.staged=false;}); }
function escapeHtml(value){return String(value).replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]);}
function downloadText(filename,content){const blob=new Blob([content],{type:'text/markdown'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
function showInlineError(control,error){const container=control.closest('article,li')||control.parentElement;container.querySelector('.inline-error')?.remove();const message=document.createElement('p');message.className='inline-error';message.setAttribute('role','alert');message.textContent=error instanceof Error?error.message:String(error);container.append(message);}
const scrollBehavior=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
function focusView(view,block='start'){document.querySelector(`[data-view="${view}"]`)?.scrollIntoView({behavior:scrollBehavior(),block});}
// Lists are rebuilt with innerHTML, so the focused control is identified by id or its first data-* attribute and re-focused afterwards.
function focusSelector(element){
  if(!element||element===document.body)return null;
  if(element.id)return `#${CSS.escape(element.id)}`;
  const [key,value]=Object.entries(element.dataset)[0]||[];
  if(key===undefined)return null;
  const attribute=`data-${key.replace(/[A-Z]/g,(character)=>`-${character.toLowerCase()}`)}`;
  return `[${attribute}="${CSS.escape(value)}"]`;
}
function restoreFocus(selector){
  if(!selector)return;
  const target=document.querySelector(selector);
  if(target&&target!==document.activeElement&&!target.disabled)target.focus({preventScroll:true});
}
// A single short status region announces the newest activity entry; large regions are deliberately not live.
let announcedActivity=null;
function announce(text){elements.liveStatus.textContent='';requestAnimationFrame(()=>{elements.liveStatus.textContent=text;});}
function announceLatestActivity(){const latest=state.activity[0];const key=latest?`${latest.time}|${latest.actor}|${latest.label}`:null;if(key&&key!==announcedActivity){announcedActivity=key;announce(`${latest.actor}: ${latest.label}`);}}

// One inline decision form at a time (no browser dialogs); it survives re-renders because its draft value lives here.
let pendingDecision=null;
const DECISIONS={
  approve:{defaultValue:'Approved for the simulation.',label:(title)=>`Decision note for “${title}” (optional)`,confirm:'Confirm approval',maxLength:300,trigger:(id)=>`[data-approve-proposal="${id}"]`,apply:(id,value)=>{const result=decideProposal(state.exercise,id,'approved',value.trim());return {exercise:result.exercise,label:`User approved response: ${result.proposal.title}`};}},
  resolve:{defaultValue:'Contained through the approved response.',label:(title)=>`Simulated outcome for “${title}”`,confirm:'Confirm resolution',maxLength:500,trigger:(id)=>`[data-resolve-inject="${id}"]`,apply:(id,value)=>{const result=resolveInject(state.exercise,id,value);return {exercise:result.exercise,label:`Resolved inject: ${result.inject.title}`};}},
};
function openDecision(kind,id){pendingDecision={kind,id,value:DECISIONS[kind].defaultValue,focus:true};render();}
function cancelDecision(){const decision=pendingDecision;pendingDecision=null;render();if(decision)document.querySelector(DECISIONS[decision.kind].trigger(decision.id))?.focus();}
function decisionFormHtml(kind,id,title){
  const spec=DECISIONS[kind];const inputId=`decision-${kind}-${id}`;
  return `<form class="inline-decision" data-decision-form="${kind}" data-decision-id="${id}"><label for="${inputId}">${escapeHtml(spec.label(title))}</label><input id="${inputId}" name="value" type="text" maxlength="${spec.maxLength}" autocomplete="off" value="${escapeHtml(pendingDecision.value)}"><div class="button-row"><button type="button" class="button ghost" data-cancel-decision="${id}" aria-label="Cancel: ${escapeHtml(title)}">Cancel</button><button type="submit" class="button primary" data-confirm-decision="${id}" aria-label="${escapeHtml(spec.confirm)}: ${escapeHtml(title)}">${spec.confirm}</button></div></form>`;
}
function isPendingDecision(kind,id){return pendingDecision?.kind===kind&&pendingDecision.id===id;}
function wireDecisionForms(container){
  [...container.querySelectorAll('[data-decision-form]')].forEach((form)=>{
    const input=form.querySelector('input');const spec=DECISIONS[form.dataset.decisionForm];const id=form.dataset.decisionId;
    input.addEventListener('input',()=>{if(pendingDecision)pendingDecision.value=input.value;});
    form.addEventListener('keydown',(event)=>{if(event.key==='Escape'){event.preventDefault();cancelDecision();}});
    form.querySelector('[data-cancel-decision]').addEventListener('click',cancelDecision);
    form.addEventListener('submit',(event)=>{event.preventDefault();try{const outcome=spec.apply(id,input.value);pendingDecision=null;replaceExercise(outcome.exercise,outcome.label,'human');}catch(error){showInlineError(input,error);}});
    if(pendingDecision?.focus){pendingDecision.focus=false;input.focus();input.select();}
  });
}

function renderHeader(){
  const responseOpen=isResponseOpen();
  elements.preset.value=state.exercise.presetKey; elements.role.value=state.exercise.role; elements.clock.textContent=formatClock(state.exercise.clock);
  elements.scenarioTitle.textContent=state.exercise.title; elements.scenarioSubtitle.textContent=state.exercise.subtitle; elements.status.textContent=state.exercise.phase==='closeout-review'?'closeout review':state.exercise.status;
  elements.score.textContent=exerciseScore(state.exercise); elements.role.disabled=!responseOpen; elements.undo.disabled=!responseOpen||!state.history.length; elements.advance15.disabled=elements.advance30.disabled=!responseOpen;
  elements.forecastButton.disabled=!responseOpen;
  elements.roleCopy.textContent=state.exercise.role==='coach'
    ? `${responseOpen?'Coach mode':'Read-only lifecycle phase'}: ${responseOpen?'the WebMCP surface registers analysis and staging tools; facilitator-only mutation tools are absent.':'mutation tools are unregistered until the user resumes response.'}`
    : `${responseOpen?'Facilitator mode':'Read-only lifecycle phase'}: ${responseOpen?'the WebMCP surface includes inject, clock, and objective tools. Finalization remains in visible review controls.':'mutation tools are unregistered until the user resumes response.'}`;
}
function renderMetric(key,element){const value=Math.round(state.exercise.metrics[key]);element.querySelector('strong').textContent=value;element.querySelector('.meter-fill').style.width=`${value}%`;element.dataset.tone=metricTone(key,value);element.setAttribute('aria-valuenow',String(value));}
function renderMetrics(){for(const [key,element] of Object.entries({impact:elements.impact,uncertainty:elements.uncertainty,fatigue:elements.fatigue,trust:elements.trust,service:elements.service}))renderMetric(key,element);}
function renderObjectives(){elements.objectives.innerHTML=state.exercise.objectives.map((objective)=>`<li class="objective ${objective.status}"><div><span class="priority ${objective.priority}">${objective.priority}</span><strong>${escapeHtml(objective.title)}</strong><small>${escapeHtml(objective.owner)} · deadline T+${formatClock(objective.deadline)}</small></div><div class="progress-wrap"><span>${Math.round(objective.progress)}%</span><div class="progress"><i data-progress="${Math.round(objective.progress)}"></i></div></div>${objective.status!=='complete'&&isResponseOpen()?`<button class="mini-button" data-progress-objective="${objective.id}" aria-label="Advance objective 20%: ${escapeHtml(objective.title)}">+20%</button>`:''}</li>`).join('');
  // CSP forbids inline style attributes; widths are applied through CSSOM after render.
  $$('#objective-list [data-progress]').forEach((bar)=>bar.style.setProperty('width',`${bar.dataset.progress}%`));
  $$('[data-progress-objective]').forEach((button)=>button.addEventListener('click',()=>{const result=updateObjective(state.exercise,button.dataset.progressObjective,20,null,'Human exercise update');replaceExercise(result.exercise,`Advanced objective: ${result.objective.title}`,'human');}));}
function renderInjects(){const sorted=[...state.exercise.injects].sort((a,b)=>b.createdAt-a.createdAt);elements.injects.innerHTML=sorted.map((inject)=>`<li class="inject ${inject.status} ${inject.createdAt>state.exercise.clock?'future':''}"><div class="inject-time">T+${formatClock(inject.createdAt)}</div><div><span class="category">${escapeHtml(inject.category)}</span><strong>${escapeHtml(inject.title)}</strong><p>${escapeHtml(inject.description)}</p><small>Severity ${inject.severity} · deadline T+${formatClock(inject.deadline)} · ${inject.status}</small>${inject.outcome?`<em>${escapeHtml(inject.outcome)}</em>`:''}</div>${inject.status==='active'&&inject.createdAt<=state.exercise.clock&&isResponseOpen()?isPendingDecision('resolve',inject.id)?decisionFormHtml('resolve',inject.id,inject.title):`<button class="mini-button" data-resolve-inject="${inject.id}" aria-label="Resolve inject: ${escapeHtml(inject.title)}">Resolve</button>`:''}</li>`).join('');
  $$('[data-resolve-inject]').forEach((button)=>button.addEventListener('click',()=>openDecision('resolve',button.dataset.resolveInject)));
  wireDecisionForms(elements.injects);}
function renderResources(){elements.resources.innerHTML=state.exercise.resources.map((resource)=>{const available=resource.total-resource.allocated;return `<li><div><strong>${escapeHtml(resource.name)}</strong><small>${available} available · ${resource.allocated} allocated</small></div><div class="resource-dots" aria-label="${resource.allocated} of ${resource.total} allocated">${Array.from({length:resource.total},(_,index)=>`<i class="${index<resource.allocated?'used':''}"></i>`).join('')}</div></li>`;}).join('');}
function renderProposals(){
  const proposals=[...state.exercise.proposals].reverse();
  elements.proposals.innerHTML=proposals.length?proposals.map((proposal)=>{
    const metricPreview=Object.entries(proposal.effects).filter(([,value])=>value).map(([key,value])=>{const before=Math.round(state.exercise.metrics[key]);const after=Math.round(Math.max(0,Math.min(100,before+value)));return `<li><span>${escapeHtml(key)}</span><strong>${before} → ${after}</strong><small>${value>0?'+':''}${value}</small></li>`;});
    const objective=proposal.targetObjectiveId?state.exercise.objectives.find((item)=>item.id===proposal.targetObjectiveId):null;
    if(objective){const after=Math.min(100,objective.progress+30+proposal.resourceUnits*8);metricPreview.push(`<li><span>objective · ${escapeHtml(objective.title)}</span><strong>${Math.round(objective.progress)}% → ${Math.round(after)}%</strong><small>on approval</small></li>`);}
    const resource=proposal.resourceId?state.exercise.resources.find((item)=>item.id===proposal.resourceId):null;
    const resourceConflict=Boolean(proposal.status==='staged'&&resource&&resource.total-resource.allocated<proposal.resourceUnits);
    if(resource){const available=resource.total-resource.allocated;metricPreview.push(`<li class="${resourceConflict?'conflict':''}"><span>resource · ${escapeHtml(resource.name)}</span><strong>${available} → ${Math.max(0,available-proposal.resourceUnits)} available</strong><small>${resourceConflict?'insufficient now':`allocate ${proposal.resourceUnits}`}</small></li>`);}
    return `<article class="proposal ${proposal.status} ${resourceConflict?'resource-conflict':''}"><div class="proposal-heading"><span class="category">${escapeHtml(proposal.category)}</span><strong>${escapeHtml(proposal.title)}</strong><span class="proposal-status">${proposal.status}</span></div><p>${escapeHtml(proposal.rationale)}</p>${proposal.status==='staged'?`<div class="approval-preview"><strong>Approval would apply</strong><ul>${metricPreview.join('')||'<li><span>No direct simulated effects</span></li>'}</ul></div>`:`<div class="effect-row">${Object.entries(proposal.effects).filter(([,value])=>value).map(([key,value])=>`<span>${key} ${value>0?'+':''}${value}</span>`).join('')||'<span>No direct metric effect</span>'}</div>`}${resourceConflict?'<p class="inline-error" role="alert">Resource availability changed. Reject this proposal or review another response first.</p>':''}${proposal.status==='staged'&&isResponseOpen()?isPendingDecision('approve',proposal.id)&&!resourceConflict?decisionFormHtml('approve',proposal.id,proposal.title):`<div class="button-row"><button class="button ghost" data-reject-proposal="${proposal.id}" aria-label="Reject response: ${escapeHtml(proposal.title)}">Reject</button><button class="button primary" data-approve-proposal="${proposal.id}" aria-label="Approve response: ${escapeHtml(proposal.title)}" ${resourceConflict?'disabled':''}>${resourceConflict?'Insufficient resources':'Approve response'}</button></div>`:''}</article>`;
  }).join(''):'<p class="empty">WebMCP-staged responses will appear here for visible user review.</p>';
  $$('[data-approve-proposal]').forEach((button)=>button.addEventListener('click',()=>openDecision('approve',button.dataset.approveProposal)));
  $$('[data-reject-proposal]').forEach((button)=>button.addEventListener('click',()=>{const result=decideProposal(state.exercise,button.dataset.rejectProposal,'rejected','Rejected during human review.');replaceExercise(result.exercise,`Human rejected response: ${result.proposal.title}`,'human');}));
  wireDecisionForms(elements.proposals);}
function renderCommunications(){const items=[...state.exercise.communications].reverse();elements.communications.innerHTML=items.length?items.map((item)=>`<li class="communication ${item.status}"><div><span class="category">${escapeHtml(item.audience)}</span><strong>${escapeHtml(item.purpose)}</strong><p>${escapeHtml(item.message)}</p></div>${item.status==='staged'&&isResponseOpen()?`<div class="button-row"><button class="mini-button" data-reject-comms="${item.id}" aria-label="Reject communication to ${escapeHtml(item.audience)}: ${escapeHtml(item.purpose)}">Reject</button><button class="mini-button approve" data-approve-comms="${item.id}" aria-label="Approve communication to ${escapeHtml(item.audience)}: ${escapeHtml(item.purpose)}">Approve</button></div>`:`<span>${item.status}</span>`}</li>`).join(''):'<li class="empty">No communication drafts are staged.</li>';
  $$('[data-approve-comms]').forEach((button)=>button.addEventListener('click',()=>{const result=decideCommunication(state.exercise,button.dataset.approveComms,'approved');replaceExercise(result.exercise,`Human approved communication to ${result.communication.audience}`,'human');}));
  $$('[data-reject-comms]').forEach((button)=>button.addEventListener('click',()=>{const result=decideCommunication(state.exercise,button.dataset.rejectComms,'rejected');replaceExercise(result.exercise,`Human rejected communication to ${result.communication.audience}`,'human');}));}
function renderForecast(){const forecast=state.exercise.forecasts.at(-1);if(!forecast){elements.forecast.innerHTML='<p class="empty">Run a seeded forecast to stress-test the current response posture.</p>';return;}const status=forecastStatus(state.exercise,forecast);const labels={impact:'Impact',uncertainty:'Uncertainty',fatigue:'Fatigue',trust:'Trust',service:'Service',score:'Score'};elements.forecast.innerHTML=`<div class="forecast-freshness ${status.stale?'stale':'current'}" role="status"><strong>${status.stale?'Outdated forecast — board changed':'Current board forecast'}</strong><span>Generated T+${formatClock(status.generatedAtClock)} · state ${escapeHtml(status.generatedAtStateFingerprint)} · current ${escapeHtml(status.currentStateFingerprint)}</span></div><div class="forecast-score"><strong>${forecast.containmentProbability}%</strong><span>${status.stale?'historical simulated containment rate':'simulated containment rate'} in ${forecast.horizonMinutes} minutes</span></div><div class="forecast-table-wrap"><table class="forecast-table"><caption>Seed ${forecast.seed} · ${forecast.simulations} paths · generated at board T+${formatClock(status.generatedAtClock)}</caption><thead><tr><th>Metric</th><th>P10</th><th>Median</th><th>P90</th></tr></thead><tbody>${Object.entries(forecast.ranges).map(([key,range])=>`<tr><th>${labels[key]||escapeHtml(key)}</th><td>${range.p10}</td><td>${range.median}</td><td>${range.p90}</td></tr>`).join('')}</tbody></table></div><div><h3>Risk drivers at generation time</h3><ul>${forecast.riskDrivers.length?forecast.riskDrivers.map((driver)=>`<li>${escapeHtml(driver)}</li>`).join(''):'<li>No dominant driver identified.</li>'}</ul></div>${status.stale?'<p class="forecast-warning">Run a new forecast before treating this simulation as current.</p>':''}<p class="forecast-note">${escapeHtml(forecast.assumptions?.at(-1)||'Training signal only—not a prediction.')}</p>`;}
function renderRisks(){const risks=openRisks(state.exercise);const items=[...risks.activeInjects.map((risk)=>({label:risk.title,meta:`active inject · severity ${risk.severity}`,overdue:risk.overdue})),...risks.scheduledInjects.map((risk)=>({label:risk.title,meta:`scheduled inject · activates T+${formatClock(risk.activatesAt)}`,overdue:false})),...risks.openObjectives.map((risk)=>({label:risk.title,meta:`objective · ${Math.round(risk.progress)}%`,overdue:risk.overdue})),...risks.stagedResponses.map((risk)=>({label:risk.title,meta:'awaiting human response review',overdue:false})),...risks.stagedCommunications.map((risk)=>({label:`${risk.audience}: ${risk.purpose}`,meta:'awaiting communication review',overdue:false}))];elements.riskList.innerHTML=items.length?items.map((item)=>`<li class="${item.overdue?'overdue':''}"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.meta)}</small></li>`).join(''):'<li class="empty">No open risks.</li>';}
function renderActivity(){elements.activity.innerHTML=state.activity.map((item)=>`<li><span class="actor ${item.actor}">${item.actor}</span><span>${escapeHtml(item.label)}</span><time>${item.time}</time></li>`).join('');}
let renderedCloseoutPhase=null;
function closeoutLessonsText(closeout){
  const normalized=closeoutLessons(closeout);
  if(typeof closeout.lessonsText==='string'&&JSON.stringify(parseLessons(closeout.lessonsText))===JSON.stringify(normalized))return closeout.lessonsText;
  return normalized.join('\n');
}
// Never rewrite a textarea the person is typing in: doing so on every input event resets the caret and drops whitespace.
function syncTextarea(textarea,value){if(document.activeElement!==textarea&&textarea.value!==value)textarea.value=value;}
function renderCloseout(){
  const closed=state.exercise.status==='closed';const reviewing=state.exercise.phase===EXERCISE_PHASES.CLOSEOUT_REVIEW;const readiness=closeoutReadiness(state.exercise);
  syncTextarea(elements.closeoutRationale,state.exercise.closeout.rationale||'');syncTextarea(elements.closeoutLessons,closeoutLessonsText(state.exercise.closeout));
  if(renderedCloseoutPhase!==state.exercise.phase){elements.closeoutCheck.checked=false;renderedCloseoutPhase=state.exercise.phase;}
  elements.closeoutCheck.disabled=closed||!reviewing||!readiness.ready;elements.closeoutRationale.disabled=closed;elements.closeoutLessons.disabled=closed;
  elements.closeoutReviewButton.hidden=reviewing||closed;elements.closeoutReviewButton.disabled=!readiness.ready;
  elements.resumeResponseButton.hidden=!reviewing||closed;elements.closeoutButton.hidden=!reviewing||closed;elements.closeoutButton.disabled=closed||!readiness.ready;
  if(closed)elements.closeoutStatus.textContent=`Exercise closed ${new Date(state.exercise.closeout.closedAt).toLocaleString()}. All mutation tools are unregistered.`;
  else if(reviewing&&!readiness.ready)elements.closeoutStatus.textContent=`Closeout review blocked: ${readiness.blockers.join(' ')} Repair the draft here or resume response; closing remains disabled.`;
  else if(reviewing)elements.closeoutStatus.textContent=`Closeout review is active. WebMCP tools are read-only. ${readiness.unresolvedInjects.length} unresolved inject(s) and ${readiness.openObjectives.length} open objective(s) will be preserved in the AAR.`;
  else if(!readiness.ready)elements.closeoutStatus.textContent=`Closeout gate blocked: ${readiness.blockers.join(' ')}`;
  else elements.closeoutStatus.textContent='Closeout draft is ready for visible user review.';
  elements.closeoutStatus.className=`closeout-status ${closed?'closed':reviewing||state.exercise.closeout.staged?'staged':''}`;
}
function renderToolLab(){
  const tools=registry.listTools();const current=elements.toolSelect.value;const status=registry.status();
  elements.toolSelect.innerHTML=tools.map((tool)=>`<option value="${tool.name}">${tool.name}</option>`).join('');
  if(tools.some((tool)=>tool.name===current))elements.toolSelect.value=current;
  const label=status.lastError?'Native registration error · Tool Lab active':status.mode==='native'?'Native WebMCP':status.embedded?`Preview · ${status.reason}`:'Tool Lab fallback';
  elements.webmcpStatus.textContent=`${label} · ${tools.length} tools`;
  elements.webmcpStatus.dataset.mode=status.lastError?'error':status.mode;
  elements.webmcpStatus.title=status.lastError?`Native registration failed: ${status.lastError}`:status.embedded?`${status.reason}. Open Drillboard as the top-level page to register WebMCP tools.`:'';
  elements.webmcpError.hidden=!status.lastError;
  elements.webmcpError.textContent=status.lastError?`Native WebMCP registration failed: ${status.lastError} Tool Lab remains available for diagnosis.`:'';
}
function render(){
  const focused=focusSelector(document.activeElement);
  document.documentElement.dataset.theme=theme;elements.theme.textContent=theme==='dark'?'Light':'Dark';
  renderHeader();renderResetConfirm();renderMetrics();renderObjectives();renderInjects();renderResources();renderProposals();renderCommunications();renderForecast();renderRisks();renderActivity();renderCloseout();
  restoreFocus(focused);announceLatestActivity();syncTools();
}

const registry=createWebMCPRegistry({bridgeName:'__drillboardWebMCP',onStatus:renderToolLab});
const objectSchema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const stringSchema=(description,options={})=>({type:'string',description,...options});
const numberSchema=(description,minimum,maximum)=>({type:'number',description,minimum,maximum});
function schemaExample(schema={}){if(schema.type==='object')return Object.fromEntries((schema.required||[]).map((key)=>[key,schemaExample(schema.properties?.[key])]));if(schema.type==='array')return Array.from({length:schema.minItems||0},()=>schemaExample(schema.items));if(schema.type==='string')return schema.enum?.[0]??'Example'.padEnd(schema.minLength||0,' value');if(schema.type==='integer'||schema.type==='number')return schema.minimum??1;if(schema.type==='boolean')return true;return null;}
const EFFECT_SCALE='Magnitude guide on the 0-100 metric scale: ±5 minor, ±10 material, ±15 or more severe. Omitted keys mean no change.';
const effectSchema={type:'object',description:`Simulated metric deltas applied when this item takes effect. Negative impact/uncertainty/fatigue and positive trust/service are beneficial. ${EFFECT_SCALE}`,properties:{impact:numberSchema(`Impact delta. ${EFFECT_SCALE}`,-20,20),uncertainty:numberSchema('Uncertainty delta; same magnitude guide as impact.',-20,20),fatigue:numberSchema('Responder fatigue delta; same magnitude guide as impact.',-20,20),trust:numberSchema('Stakeholder trust delta; same magnitude guide as impact.',-20,20),service:numberSchema('Service-health delta; same magnitude guide as impact.',-20,20)},additionalProperties:false};
const readOnly={readOnlyHint:true,untrustedContentHint:true};
// Output is a fixed string built from the enum value, so it carries no untrusted content.
const readOnlyFixedOutput={readOnlyHint:true};
const mutation={readOnlyHint:false,untrustedContentHint:true};
const viewGuide={situation:'control strip with scenario, agent role, clock, undo, reset, and time-advance buttons',injects:'inject timeline panel',responses:'agent-staged response proposals awaiting user review',communications:'communication drafts awaiting user review',forecast:'seeded forecast panel',risks:'open risks panel',closeout:'closeout form and lifecycle controls'};
const roomSections=['summary','objectives','resources','injects','proposals','communications','review_queue','observations','decisions','activity','forecast','closeout'];
const pagedRoomSections=new Set(['objectives','resources','injects','proposals','communications','review_queue','observations','decisions','activity']);
const roomSectionGuide={
  summary:'compact overview: clock, phase, agent role, score, metrics, counts, latest forecast freshness, closeout readiness',
  objectives:'paged objectives with priority, owner, deadline, progress, status',
  resources:'paged resources with total, allocated, available units',
  injects:'paged injects (scheduled, active, resolved) with severity, timing, effects, outcome',
  proposals:'paged response proposals in every status with rationale, effects, allocation, review note',
  communications:'paged communication drafts in every status with audience, purpose, message',
  review_queue:'paged staged responses and communications still awaiting the user, each tagged with kind',
  observations:'paged training observations with tags and clock',
  decisions:'paged user-approved decisions with note and clock',
  activity:'paged activity trail, newest first, with actor and label',
  forecast:'latest forecast ranges, drivers, assumptions, and freshness against the current board',
  closeout:'closeout draft (rationale, lessons) plus readiness blockers',
};
const riskKinds=['all','injects','objectives','responses','communications'];
const riskKindGuide={all:'every open risk, each tagged with kind',injects:'active injects (with overdue flag) and scheduled injects (with activation clock)',objectives:'incomplete objectives with progress and overdue flag',responses:'staged response proposals awaiting user review',communications:'staged communication drafts awaiting user review'};
const aarSections=['summary','full','metrics','objectives','injects','decisions','communications','observations','forecast','closeout','activity'];
const aarSectionGuide={summary:'title, status, phase, clock, score, and the list of available sections',full:'the complete Markdown record',metrics:'final metric values',objectives:'objective checklist with progress and owner',injects:'every inject with status, timing, and outcome',decisions:'user-approved decisions with notes',communications:'approved communications',observations:'training observations',forecast:'latest forecast with freshness',closeout:'closeout rationale and lessons',activity:'the activity trail'};
const aarHeadings={metrics:'Final metrics',objectives:'Objectives',injects:'Injects',decisions:'Human-approved decisions',communications:'Approved communications',observations:'Training observations',forecast:'Latest deterministic forecast',closeout:'Closeout',activity:'Activity trail'};
const enumGuide=(guide)=>Object.entries(guide).map(([key,text])=>`${key}: ${text}`).join('. ');
function compactForecast(){
  const latestForecast=state.exercise.forecasts.at(-1);
  const latestForecastStatus=forecastStatus(state.exercise,latestForecast);
  return latestForecast?{runKey:latestForecast.runKey,containmentProbability:latestForecast.containmentProbability,horizonMinutes:latestForecast.horizonMinutes,generatedAtClock:latestForecastStatus.generatedAtClock,generatedAtStateFingerprint:latestForecastStatus.generatedAtStateFingerprint,currentStateFingerprint:latestForecastStatus.currentStateFingerprint,stale:latestForecastStatus.stale}:null;
}
const projectObjective=({id,title,priority,owner,deadline,progress,status,lastNote,updatedAt})=>({id,title,priority,owner,deadline,progress:Math.round(progress),status,...(lastNote?{lastNote}:{}),...(updatedAt!=null?{updatedAt}:{})});
const projectResource=({id,name,total,allocated})=>({id,name,total,allocated,available:total-allocated});
const projectInject=(inject)=>({id:inject.id,title:inject.title,category:inject.category,severity:inject.severity,status:inject.status,scheduled:inject.status==='active'&&inject.createdAt>state.exercise.clock,overdue:inject.status==='active'&&state.exercise.clock>inject.deadline,activatesAt:inject.createdAt,deadline:inject.deadline,effects:inject.effects,description:inject.description,...(inject.outcome?{outcome:inject.outcome,resolvedAt:inject.resolvedAt}:{})});
const projectProposal=({id,title,category,status,rationale,targetObjectiveId,resourceId,resourceUnits,effects,stagedAt,reviewNote,reviewedAt})=>({id,title,category,status,stagedAt,targetObjectiveId,resourceId,resourceUnits,effects,rationale,...(reviewedAt!=null?{reviewedAt,reviewNote:reviewNote||''}:{})});
const projectCommunication=({id,audience,purpose,status,message,stagedAt,reviewedAt})=>({id,audience,purpose,status,stagedAt,message,...(reviewedAt!=null?{reviewedAt}:{})});
const projectObservation=({id,text,tags,at})=>({id,at,tags,text});
const projectDecision=({id,proposalId,title,note,at})=>({id,at,proposalId,title,note});
const projectActivity=({time,actor,label})=>({time,actor,label});
function roomItems(section){
  const exercise=state.exercise;
  if(section==='objectives')return exercise.objectives.map(projectObjective);
  if(section==='resources')return exercise.resources.map(projectResource);
  if(section==='injects')return exercise.injects.map(projectInject);
  if(section==='proposals')return exercise.proposals.map(projectProposal);
  if(section==='communications')return exercise.communications.map(projectCommunication);
  if(section==='review_queue')return [...exercise.proposals.filter((item)=>item.status==='staged').map((item)=>({kind:'response',...projectProposal(item)})),...exercise.communications.filter((item)=>item.status==='staged').map((item)=>({kind:'communication',...projectCommunication(item)}))];
  if(section==='observations')return exercise.observations.map(projectObservation);
  if(section==='decisions')return exercise.decisions.map(projectDecision);
  return state.activity.map(projectActivity);
}
function roomObject(section){
  const exercise=state.exercise;const readiness=closeoutReadiness(exercise);
  if(section==='summary')return {scenario:{title:exercise.title,clock:exercise.clock,status:exercise.status,phase:exercise.phase,agentRole:exercise.role},score:exerciseScore(exercise),metrics:compactMetrics(exercise.metrics),counts:{objectives:exercise.objectives.length,injects:exercise.injects.length,activeInjects:activeInjects(exercise).length,stagedResponses:exercise.proposals.filter((item)=>item.status==='staged').length,stagedCommunications:exercise.communications.filter((item)=>item.status==='staged').length,observations:exercise.observations.length,decisions:exercise.decisions.length},latestForecast:compactForecast(),closeout:{staged:exercise.closeout.staged,ready:readiness.ready,blockers:readiness.blockers},availableSections:roomSections,userControlBoundary:'WebMCP stages work; approval and finalization require explicit visible user confirmation.'};
  if(section==='forecast'){const latest=exercise.forecasts.at(-1)||null;return {latest:latest?{runKey:latest.runKey,horizonMinutes:latest.horizonMinutes,simulations:latest.simulations,seed:latest.seed,generatedAtClock:latest.generatedAtClock,containmentProbability:latest.containmentProbability,ranges:latest.ranges,riskDrivers:latest.riskDrivers,assumptions:latest.assumptions}:null,freshness:forecastStatus(exercise,latest)};}
  const lessons=closeoutLessons(exercise.closeout);
  return {staged:exercise.closeout.staged,rationale:exercise.closeout.rationale,lessonCount:lessons.length,lessons,closedAt:exercise.closeout.closedAt,readiness:{ready:readiness.ready,blockers:readiness.blockers,unresolvedInjectCount:readiness.unresolvedInjects.length,openObjectiveCount:readiness.openObjectives.length},note:'Use the injects and objectives sections for the unresolved item lists.'};
}
function roomSummary(section='summary',offset=0,limit=DEFAULT_PAGE_LIMIT){
  if(!pagedRoomSections.has(section))return {message:`Drillboard ${section} section.`,section,data:roomObject(section)};
  const page=pageItems(roomItems(section),{offset,limit});
  return {message:pageMessage(`Drillboard ${section}`,page),section,...page};
}
function riskItems(kind){
  const risks=openRisks(state.exercise);
  const injects=[...risks.activeInjects.map((item)=>({kind:'active_inject',...item})),...risks.scheduledInjects.map((item)=>({kind:'scheduled_inject',...item}))];
  const objectives=risks.openObjectives.map((item)=>({kind:'objective',...item,progress:Math.round(item.progress)}));
  const responses=risks.stagedResponses.map((item)=>({kind:'response',...item}));
  const communications=risks.stagedCommunications.map((item)=>({kind:'communication',...item}));
  if(kind==='injects')return injects;if(kind==='objectives')return objectives;if(kind==='responses')return responses;if(kind==='communications')return communications;
  return [...injects,...objectives,...responses,...communications];
}
function riskPage(kind='all',offset=0,limit=DEFAULT_PAGE_LIMIT){const page=pageItems(riskItems(kind),{offset,limit});return {message:pageMessage(`Open ${kind==='all'?'risks':`${kind} risks`}`,page),kind,...page};}
function aarSectionMarkdown(section){const markdown=exportAfterAction(state.exercise,state.activity);if(section==='full')return markdown;const firstHeading=markdown.indexOf('\n## ');if(section==='summary')return `${markdown.slice(0,firstHeading)}\n\nAvailable sections: ${aarSections.join(', ')}`;const heading=`## ${aarHeadings[section]}`;const start=markdown.indexOf(heading);if(start<0)return `${heading}\n- Not available`;const next=markdown.indexOf('\n## ',start+heading.length);return markdown.slice(start,next<0?markdown.length:next).trimEnd();}
function aarPage(section='summary',cursor=0){const segment=segmentText(aarSectionMarkdown(section),cursor);return {message:segment.nextCursor===null?`AAR ${section} Markdown; this is the last segment.`:`AAR ${section} Markdown segment; pass cursor=${segment.nextCursor} for the next segment.`,section,format:'text/markdown',...segment};}
function setExerciseFromTool(next,label){mutate(label,'agent',(draft)=>{draft.exercise=next;draft.exercise.closeout.staged=false;});}
function requireFacilitatorTool(){if(state.exercise.role!=='facilitator'||!isResponseOpen())throw new Error('Ask the user to select Facilitator in the visible Agent role control during the response phase; this tool then becomes available.');}
function definitions(){
  const objectiveIds=state.exercise.objectives.map((item)=>item.id);
  const resourceIds=state.exercise.resources.map((item)=>item.id);
  const activeInjectIds=activeInjects(state.exercise).map((item)=>item.id);
  const responseOpen=isResponseOpen();
  const offsetSchema={type:'integer',description:'Zero-based item offset for paged sections. Pass the nextCursor from the previous page; nextCursor is null on the last page.',minimum:0,maximum:10000,default:0};
  const limitSchema={type:'integer',description:`Maximum items per page (1-${MAX_PAGE_LIMIT}). A page may hold fewer items so the result stays within the output budget; every page is a complete JSON array of whole items.`,minimum:1,maximum:MAX_PAGE_LIMIT,default:DEFAULT_PAGE_LIMIT};
  const cursorSchema={type:'integer',description:'Character cursor for Markdown segments. Pass the nextCursor from the previous segment; nextCursor is null on the last segment.',minimum:0,maximum:1000000,default:0};
  const tools=[
    {name:'drillboard_read_room',title:'Read exercise room',description:`Read the live exercise room the user sees. summary, forecast, and closeout return one object; every other section returns a page of whole items with offset, total, and nextCursor. Sections. ${enumGuide(roomSectionGuide)}.`,inputSchema:objectSchema({section:stringSchema(`Room section to read. ${enumGuide(roomSectionGuide)}.`,{enum:roomSections,default:'summary'}),offset:offsetSchema,limit:limitSchema}),annotations:readOnly,execute:async({section='summary',offset=0,limit=DEFAULT_PAGE_LIMIT})=>roomSummary(section,offset,limit)},
    {name:'drillboard_list_open_risks',title:'List open risks',description:`Read a page of open risks as whole items, each tagged with kind (active_inject, scheduled_inject, objective, response, communication). Kinds. ${enumGuide(riskKindGuide)}.`,inputSchema:objectSchema({kind:stringSchema(`Risk group to page. ${enumGuide(riskKindGuide)}.`,{enum:riskKinds,default:'all'}),offset:offsetSchema,limit:limitSchema}),annotations:readOnly,execute:async({kind='all',offset=0,limit=DEFAULT_PAGE_LIMIT})=>riskPage(kind,offset,limit)},
    {name:'drillboard_export_after_action',title:'Export after-action record',description:`Read the Markdown after-action record as bounded text segments; reading never changes phase or closes the exercise. Sections. ${enumGuide(aarSectionGuide)}.`,inputSchema:objectSchema({section:stringSchema(`AAR section to read. ${enumGuide(aarSectionGuide)}.`,{enum:aarSections,default:'summary'}),cursor:cursorSchema}),annotations:readOnly,execute:async({section='summary',cursor=0})=>aarPage(section,cursor)},
    {name:'drillboard_focus_view',title:'Focus board view',description:`Scroll one visible command-board section into the user's viewport so they can see what you are referring to. Exercise data is unchanged. Views. ${enumGuide(viewGuide)}.`,inputSchema:objectSchema({view:stringSchema(`Board section to scroll to. ${enumGuide(viewGuide)}.`,{enum:Object.keys(viewGuide)})},['view']),annotations:readOnlyFixedOutput,execute:async({view})=>{focusView(view);return {message:`Focused the ${view} board section.`,focused:view};}},
  ];
  if(!responseOpen)return tools;

  tools.push(
    {name:'drillboard_run_forecast',title:'Run seeded forecast',description:'Run a reproducible scenario stress test from the current board state and publish its containment rate plus P10, median, and P90 metric ranges to the visible forecast panel. Identical state and inputs always produce identical output.',inputSchema:objectSchema({horizon_minutes:{type:'integer',description:'Simulated minutes ahead to project.',minimum:15,maximum:240,default:60},simulations:{type:'integer',description:'Number of seeded paths to run.',minimum:100,maximum:3000,default:800},seed:{type:'integer',description:'Seed for reproducible output; reuse a seed to compare boards.',minimum:1,maximum:999999,default:42}}),annotations:mutation,execute:async({horizon_minutes=60,simulations=800,seed=42})=>{const forecast=forecastExercise(state.exercise,{horizonMinutes:horizon_minutes,simulations,seed});mutate(`Ran ${simulations}-path forecast`,'agent',(draft)=>{draft.exercise.forecasts=[...draft.exercise.forecasts.slice(-(COLLECTION_LIMITS.forecasts-1)),forecast];});return {message:`Published deterministic forecast ${forecast.runKey}.`,runKey:forecast.runKey,stateFingerprint:forecast.stateFingerprint,currentStateFingerprint:forecast.stateFingerprint,generatedAtClock:forecast.generatedAtClock,horizonMinutes:forecast.horizonMinutes,simulations:forecast.simulations,seed:forecast.seed,containmentProbability:forecast.containmentProbability,ranges:forecast.ranges,riskDrivers:forecast.riskDrivers,stale:false};}},
    {name:'drillboard_stage_response',title:'Stage response proposal',description:'Stage a response proposal that appears in the visible review queue with a before/after preview for the user\'s decision. Its effects and resource allocation apply when the user approves it on the board.',inputSchema:objectSchema({title:stringSchema('Short response title.',{minLength:3,maxLength:100}),category:stringSchema('Response category. containment: limit spread or blast radius. investigation: establish cause or scope. continuity: keep the service or event running. customer: protect affected people. safety: physical or personal safety. coordination: roles, escalation, or vendor management.',{enum:['containment','investigation','continuity','customer','safety','coordination']}),rationale:stringSchema('Evidence-based rationale grounded in current board state.',{minLength:12,maxLength:700}),objective_id:stringSchema('Optional current objective this response advances; approval adds 30% plus 8% per resource unit.',{enum:objectiveIds}),resource_id:stringSchema('Optional current resource to allocate; approval reserves resource_units from it.',{enum:resourceIds}),resource_units:{type:'integer',description:'Resource units requested; must not exceed current availability.',minimum:0,maximum:12,default:0},effects:effectSchema},['title','category','rationale','effects']),annotations:mutation,execute:async(input)=>{const result=stageProposal(state.exercise,input);setExerciseFromTool(result.exercise,`Staged response: ${result.proposal.title}`);focusView('responses');const {id,title,category,status,stagedAt,targetObjectiveId,resourceId,resourceUnits,effects}=result.proposal;return {message:'Response staged; no effects have been applied.',proposal:{id,title,category,status,stagedAt,targetObjectiveId,resourceId,resourceUnits,effects},userReviewRequired:true};}},
    {name:'drillboard_stage_communication',title:'Stage communication',description:'Draft a factual stakeholder update that appears in the visible communication review list; the user decides whether to approve it. Approval raises trust and lowers uncertainty.',inputSchema:objectSchema({audience:stringSchema('Intended audience for the update.',{enum:['customers','employees','executives','partners','public','responders']}),purpose:stringSchema('One-line purpose of the update.',{minLength:3,maxLength:100}),message:stringSchema('Factual draft based on board state, without invented claims or promises.',{minLength:12,maxLength:900})},['audience','purpose','message']),annotations:mutation,execute:async(input)=>{const result=stageCommunication(state.exercise,input);setExerciseFromTool(result.exercise,`Staged communication to ${result.communication.audience}`);const {id,audience,purpose,status,stagedAt}=result.communication;return {message:'Communication staged; it has not been published.',communication:{id,audience,purpose,status,stagedAt},userReviewRequired:true};}},
    {name:'drillboard_add_observation',title:'Add observation',description:'Add one factual training observation to the visible shared activity trail and the after-action record.',inputSchema:objectSchema({observation:stringSchema('Observation grounded in current board state.',{minLength:4,maxLength:500}),tags:{type:'array',description:'Optional short tags such as timing, comms, or resources.',items:stringSchema('Short tag.',{maxLength:30}),maxItems:8,default:[]}},['observation']),annotations:mutation,execute:async(input)=>{const result=addObservation(state.exercise,input);setExerciseFromTool(result.exercise,`Observation: ${result.observation.text}`);return {message:'Observation added to the shared trail.',observation:{id:result.observation.id,tagCount:result.observation.tags.length,at:result.observation.at}};}},
    {name:'drillboard_stage_closeout',title:'Stage closeout',description:'Stage a closeout rationale and lessons that pre-fill the visible closeout form. The user then enters closeout review and closes the exercise from the board; the exercise stays in the response phase after this call.',inputSchema:objectSchema({rationale:stringSchema('Readiness rationale that names any unresolved injects or objectives.',{minLength:20,maxLength:900}),lessons:{type:'array',description:'Candidate lessons learned for the after-action record.',items:stringSchema('One concise lesson.',{minLength:4,maxLength:240}),minItems:1,maxItems:MAX_CLOSEOUT_LESSONS}},['rationale','lessons']),annotations:mutation,execute:async({rationale,lessons})=>{mutate('Staged exercise closeout','agent',(draft)=>{draft.exercise.closeout={...draft.exercise.closeout,staged:true,rationale,lessons,lessonsText:lessons.join('\n')};});focusView('closeout');return {message:'Closeout staged; the exercise remains in response.',staged:true,readiness:closeoutReadiness(state.exercise),userActionRequired:'Review staged items, then use the visible Enter closeout review control.'};}},
  );
  if(state.exercise.role==='facilitator'){
    tools.push(
      {name:'drillboard_create_inject',title:'Create scenario inject',description:'Create a fictional scenario development (inject) on the visible timeline. It starts applying its effects once its delay elapses and keeps pressuring the board until resolved. Registered while the user has selected Facilitator mode.',inputSchema:objectSchema({title:stringSchema('Inject title.',{minLength:3,maxLength:100}),description:stringSchema('Observable fictional development as participants would notice it.',{minLength:12,maxLength:700}),category:stringSchema('Inject category. technical: systems or infrastructure. security: intrusion or data exposure. operations: process or logistics. safety: people at physical risk. reputation: public or media pressure. coordination: roles, escalation, or communication gaps. vendor: third-party dependency.',{enum:['technical','security','operations','safety','reputation','coordination','vendor']}),severity:{type:'integer',description:'Severity 1 (minor) to 5 (critical); scales how strongly effects apply per minute.',minimum:1,maximum:5},delay_minutes:{type:'integer',description:'Minutes from now until the inject activates; 0 activates immediately.',minimum:0,maximum:180,default:0},deadline_minutes:{type:'integer',description:'Response window in minutes after activation before the inject counts as overdue.',minimum:5,maximum:240,default:30},effects:effectSchema},['title','description','category','severity','effects']),annotations:mutation,execute:async(input)=>{requireFacilitatorTool();const result=createInject(state.exercise,input);setExerciseFromTool(result.exercise,`Facilitator created inject: ${result.inject.title}`);const {id,title,category,severity,createdAt,deadline,status,effects}=result.inject;return {message:`Inject ${id} created for the simulation.`,inject:{id,title,category,severity,createdAt,deadline,status,effects}};}},
      {name:'drillboard_advance_clock',title:'Advance exercise clock',description:'Advance simulated time on the visible clock. Active injects apply exposure-weighted pressure minute by minute, scheduled injects activate, and objective deadlines are checked. Registered while the user has selected Facilitator mode.',inputSchema:objectSchema({minutes:{type:'integer',description:'Minutes to advance the exercise clock.',minimum:5,maximum:120}},['minutes']),annotations:mutation,execute:async({minutes})=>{requireFacilitatorTool();const result=advanceExercise(state.exercise,minutes);setExerciseFromTool(result.exercise,`Facilitator advanced time by ${minutes} minutes`);return {message:`Advanced the exercise by ${minutes} minutes.`,clock:result.exercise.clock,activated:result.activated,overdueObjectives:[...new Set(result.overdue)],metrics:compactMetrics(result.exercise.metrics),score:exerciseScore(result.exercise)};}},
      {name:'drillboard_update_objective',title:'Update objective',description:'Record progress or a status change against a current objective on the visible board. Registered while the user has selected Facilitator mode.',inputSchema:objectSchema({objective_id:stringSchema('Current objective ID.',{enum:objectiveIds}),progress_delta:numberSchema('Progress change in percentage points; reaching 100 marks the objective complete.',-100,100),status:stringSchema('Optional new status. open: work continues. blocked: waiting on a dependency. complete: done (sets progress to 100). Reducing a completed objective requires open or blocked.',{enum:['open','blocked','complete']}),note:stringSchema('Short evidence note shown with the objective.',{maxLength:400,default:''})},['objective_id','progress_delta']),annotations:mutation,execute:async({objective_id,progress_delta,status,note=''})=>{requireFacilitatorTool();const result=updateObjective(state.exercise,objective_id,progress_delta,status,note);setExerciseFromTool(result.exercise,`Facilitator updated objective: ${result.objective.title}`);const {id,title,progress,status:objectiveStatus,updatedAt}=result.objective;return {message:`Objective ${objective_id} updated.`,objective:{id,title,progress:Math.round(progress),status:objectiveStatus,updatedAt}};}},
    );
    if(activeInjectIds.length)tools.push({name:'drillboard_resolve_inject',title:'Resolve active inject',description:'Record the observed fictional outcome of a currently active inject, marking it resolved on the visible timeline; resolution reduces impact and uncertainty. Registered while the user has selected Facilitator mode and at least one inject is active.',inputSchema:objectSchema({inject_id:stringSchema('Currently active inject ID (scheduled and resolved injects are excluded).',{enum:activeInjectIds}),outcome:stringSchema('Observed simulated outcome in one or two sentences.',{minLength:5,maxLength:500})},['inject_id','outcome']),annotations:mutation,execute:async({inject_id,outcome})=>{requireFacilitatorTool();const result=resolveInject(state.exercise,inject_id,outcome);setExerciseFromTool(result.exercise,`Facilitator resolved inject: ${result.inject.title}`);return {message:`Inject ${inject_id} resolved.`,inject:{id:result.inject.id,title:result.inject.title,status:result.inject.status,resolvedAt:result.inject.resolvedAt}};}});
  }
  return tools;
}
async function syncTools(){await registry.sync(definitions());renderToolLab();}

for(const [key,preset] of Object.entries(PRESETS)){const option=document.createElement('option');option.value=key;option.textContent=preset.name;elements.preset.append(option);}
elements.preset.addEventListener('change',()=>requestReset(elements.preset.value));
elements.role.addEventListener('change',()=>mutate(`Changed agent role to ${elements.role.value}`,'human',(draft)=>{draft.exercise.role=elements.role.value;}));
elements.reset.addEventListener('click',()=>requestReset());
elements.resetExport.addEventListener('click',()=>{if(!pendingReset)return;const {key}=pendingReset;exportCurrentAar();runReset(key);});
elements.resetDiscard.addEventListener('click',()=>{if(!pendingReset)return;runReset(pendingReset.key);});
elements.resetCancel.addEventListener('click',cancelReset);
elements.resetConfirm.addEventListener('keydown',(event)=>{if(event.key==='Escape'){event.preventDefault();cancelReset();}});
elements.undo.addEventListener('click',undo);
elements.advance15.addEventListener('click',()=>{const result=advanceExercise(state.exercise,15);replaceExercise(result.exercise,'Human advanced time by 15 minutes','human');});
elements.advance30.addEventListener('click',()=>{const result=advanceExercise(state.exercise,30);replaceExercise(result.exercise,'Human advanced time by 30 minutes','human');});
elements.forecastButton.addEventListener('click',()=>{const forecast=forecastExercise(state.exercise,{horizonMinutes:60,simulations:800,seed:42});mutate('Human ran 800-path forecast','human',(draft)=>{draft.exercise.forecasts=[...draft.exercise.forecasts.slice(-(COLLECTION_LIMITS.forecasts-1)),forecast];});});
elements.exportButton.addEventListener('click',()=>exportCurrentAar());
function syncCloseoutDraft(){
  const rationale=elements.closeoutRationale.value;const lessonsText=elements.closeoutLessons.value;
  if(state.exercise.closeout.rationale===rationale&&closeoutLessonsText(state.exercise.closeout)===lessonsText)return;
  state=commitState(state,(draft)=>{draft.exercise.closeout.rationale=rationale;draft.exercise.closeout.lessonsText=lessonsText;draft.exercise.closeout.lessons=parseLessons(lessonsText);},persist);
}
// Closeout status is not a live region (it changes on every keystroke); explicit click feedback is announced separately.
function closeoutFeedback(error){const text=error instanceof Error?error.message:String(error);elements.closeoutStatus.textContent=text;announce(text);}
function saveCloseoutInput(){try{syncCloseoutDraft();renderCloseout();}catch(error){renderCloseout();elements.closeoutStatus.textContent=error instanceof Error?error.message:String(error);}}
elements.closeoutRationale.addEventListener('input',saveCloseoutInput);
elements.closeoutLessons.addEventListener('input',saveCloseoutInput);
elements.closeoutReviewButton.addEventListener('click',()=>{try{syncCloseoutDraft();const result=enterCloseoutReview(state.exercise);state=commitState(state,(draft)=>{draft.exercise=result.exercise;draft.activity=[{time:nowLabel(),actor:'human',label:'Human entered closeout review; mutation tools removed'},...draft.activity].slice(0,60);},persist);render();}catch(error){closeoutFeedback(error);}});
elements.resumeResponseButton.addEventListener('click',()=>{try{const result=resumeResponse(state.exercise);state=commitState(state,(draft)=>{draft.exercise=result.exercise;draft.activity=[{time:nowLabel(),actor:'human',label:'Human resumed the response phase'},...draft.activity].slice(0,60);},persist);render();}catch(error){closeoutFeedback(error);}});
elements.closeoutButton.addEventListener('click',()=>{if(!elements.closeoutCheck.checked){closeoutFeedback('Check the human confirmation before closing the exercise.');return;}try{syncCloseoutDraft();const result=closeExercise(state.exercise,new Date().toISOString());state=commitState(state,(draft)=>{draft.exercise=result.exercise;draft.history=[];draft.activity=[{time:nowLabel(),actor:'human',label:'Human closed the tabletop exercise'},...draft.activity].slice(0,60);},persist);render();exportCurrentAar('drillboard-final-after-action.md');}catch(error){closeoutFeedback(error);}});
elements.theme.addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';try{localStorage.setItem(THEME_KEY,theme);}catch{}render();});
elements.toolButton.addEventListener('click',()=>{renderToolLab();elements.toolDialog.showModal();});
elements.toolClose.addEventListener('click',()=>elements.toolDialog.close());
elements.toolSelect.addEventListener('change',()=>{const tool=registry.listTools().find((candidate)=>candidate.name===elements.toolSelect.value);elements.toolInput.value=JSON.stringify(schemaExample(tool?.inputSchema),null,2);});
elements.toolRun.addEventListener('click',async()=>{try{const input=JSON.parse(elements.toolInput.value||'{}');const result=await registry.executeTool(elements.toolSelect.value,input);elements.toolOutput.textContent=JSON.stringify(result,null,2);}catch(error){elements.toolOutput.textContent=`Error: ${error instanceof Error?error.message:String(error)}`;}});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
// A stored exercise that passes the shape check can still fail to render (e.g. hand-edited storage); recover instead of a blank page.
function boot(){
  try{render();}
  catch(error){
    console.error('Stored exercise could not be rendered; starting fresh.',error);
    state=initialState();pendingDecision=null;pendingReset=null;
    try{persist(state);}catch{}
    render();
    const detail=error instanceof Error?error.message:String(error);
    elements.roleCopy.textContent=`The stored exercise was reset because it could not be displayed (${detail}). A fresh ${state.exercise.title} exercise is open.`;
    announce('Stored exercise was reset.');
  }
}
boot();
