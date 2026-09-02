import test from'node:test';import assert from'node:assert/strict';import{EMBEDDED_FRAME_REASON,createWebMCPRegistry,validateSchema}from'../src/webmcp.js';import{MAX_TOOL_OUTPUT_CHARS}from'../src/paging.js';const schema={type:'object',properties:{title:{type:'string',minLength:3,maxLength:20},severity:{type:'integer',minimum:1,maximum:5},effects:{type:'object',properties:{impact:{type:'number',minimum:-20,maximum:20}},additionalProperties:false}},required:['title','severity','effects'],additionalProperties:false};test('schema validator accepts a valid inject payload',()=>assert.deepEqual(validateSchema(schema,{title:'New inject',severity:4,effects:{impact:8}}),[]));test('schema validator rejects missing and unknown fields',()=>{const errors=validateSchema(schema,{title:'x',extra:true});assert.ok(errors.some((error)=>error.includes('required')));assert.ok(errors.some((error)=>error.includes('not allowed')));});test('schema validator enforces nested numeric bounds',()=>{const errors=validateSchema(schema,{title:'Valid title',severity:8,effects:{impact:30}});assert.equal(errors.length,2);});

const definition=(overrides={})=>({name:'test_tool',title:'Test tool',description:'Validate a narrow payload.',inputSchema:{type:'object',properties:{count:{type:'integer',minimum:1,maximum:5}},required:['count'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async(input)=>({message:'Validated count.',count:input.count}),...overrides});

test('registry retries when native WebMCP appears after preview mode',async()=>{let context=null;const registrations=[];const registry=createWebMCPRegistry({contextProvider:()=>context,bridgeTarget:{}});await registry.sync([definition()]);assert.equal(registry.status().mode,'preview');context={registerTool:async(tool,options)=>registrations.push({tool,options})};await registry.sync([definition()]);assert.equal(registry.status().mode,'native');assert.equal(registrations.length,1);assert.equal(registry.status().registeredToolCount,1);});

test('registry retries the same metadata after a registration failure',async()=>{let shouldFail=true;let calls=0;const context={registerTool:async()=>{calls+=1;if(shouldFail)throw new Error('temporary failure');}};const registry=createWebMCPRegistry({contextProvider:()=>context,bridgeTarget:{}});await registry.sync([definition()]);assert.equal(registry.status().mode,'preview');assert.match(registry.status().lastError,/temporary failure/);shouldFail=false;await registry.sync([definition()]);assert.equal(registry.status().mode,'native');assert.equal(calls,2);});

test('metadata changes abort old registrations and re-register dynamic schemas',async()=>{const registrations=[];const context={registerTool:async(tool,{signal})=>registrations.push({tool,signal})};const registry=createWebMCPRegistry({contextProvider:()=>context,bridgeTarget:{}});await registry.sync([definition()]);await registry.sync([definition()]);assert.equal(registrations.length,1);await registry.sync([definition({inputSchema:{type:'object',properties:{id:{type:'string',enum:['new-id']}},required:['id'],additionalProperties:false}})]);assert.equal(registrations.length,2);assert.equal(registrations[0].signal.aborted,true);assert.equal(registrations[1].signal.aborted,false);});

test('an embedded frame never registers native tools and reports the reason',async()=>{
  let calls=0;
  const context={registerTool:async()=>{calls+=1;}};
  const registry=createWebMCPRegistry({contextProvider:()=>context,embedded:()=>true,bridgeTarget:{}});
  await registry.sync([definition()]);
  assert.equal(calls,0);
  const status=registry.status();
  assert.equal(status.mode,'preview');
  assert.equal(status.embedded,true);
  assert.equal(status.reason,EMBEDDED_FRAME_REASON);
  assert.equal(status.lastError,null);
  assert.equal(registry.listTools().length,1,'Tool Lab preview still lists definitions');
  const topLevel=createWebMCPRegistry({contextProvider:()=>context,embedded:()=>false,bridgeTarget:{}});
  await topLevel.sync([definition()]);
  assert.equal(calls,1);
  assert.equal(topLevel.status().reason,null);
});

test('unchanged tools keep their registration; only changed, removed, or added tools are diffed',async()=>{
  const registrations=[];
  const context={registerTool:async(tool,{signal})=>registrations.push({name:tool.name,signal})};
  const registry=createWebMCPRegistry({contextProvider:()=>context,bridgeTarget:{}});
  const stable=definition({name:'stable_tool'});
  const changing=definition({name:'changing_tool'});
  const removed=definition({name:'removed_tool'});
  await registry.sync([stable,changing,removed]);
  assert.deepEqual(registrations.map((entry)=>entry.name),['stable_tool','changing_tool','removed_tool']);
  const changed=definition({name:'changing_tool',inputSchema:{type:'object',properties:{id:{type:'string',enum:['fresh-id']}},required:['id'],additionalProperties:false}});
  const added=definition({name:'added_tool'});
  await registry.sync([stable,changed,added]);
  assert.deepEqual(registrations.map((entry)=>entry.name),['stable_tool','changing_tool','removed_tool','changing_tool','added_tool']);
  assert.equal(registrations[0].signal.aborted,false,'unchanged tool must not be aborted');
  assert.equal(registrations[1].signal.aborted,true,'changed tool must be aborted');
  assert.equal(registrations[2].signal.aborted,true,'removed tool must be aborted');
  assert.equal(registrations[3].signal.aborted,false);
  assert.equal(registrations[4].signal.aborted,false);
  assert.equal(registry.status().registeredToolCount,3);
  await registry.sync([stable,changed,added]);
  assert.equal(registrations.length,5,'identical sync must not re-register anything');
});

test('a sync requested while a native execute is in flight is deferred until the call settles',async()=>{
  const registered=new Map();
  const context={registerTool:async(tool,{signal})=>{registered.set(tool.name,{tool,signal});}};
  const registry=createWebMCPRegistry({contextProvider:()=>context,bridgeTarget:{}});
  const first=definition({name:'first_tool'});
  const second=definition({name:'second_tool'});
  await registry.sync([first,second]);
  const firstSignal=registered.get('first_tool').signal;
  const secondSignal=registered.get('second_tool').signal;
  let statusDuringExecute;
  const busy=definition({name:'first_tool',execute:async(input)=>{
    // Simulate mutate() -> render() -> syncTools() happening inside a tool call that changes another tool's schema.
    await registry.sync([first,definition({name:'second_tool',inputSchema:{type:'object',properties:{id:{type:'string',enum:['changed']}},required:['id'],additionalProperties:false}})]);
    statusDuringExecute=registry.status();
    assert.equal(secondSignal.aborted,false,'no registration may be aborted while an execute is in flight');
    assert.equal(firstSignal.aborted,false);
    return {message:'done',count:input.count};
  }});
  await registry.sync([busy,second]);
  assert.equal(firstSignal.aborted,false,'changing only execute keeps public metadata identical, so no re-registration');
  const result=await registered.get('first_tool').tool.execute({count:1},{signal:new AbortController().signal});
  assert.deepEqual(result,{message:'done',count:1});
  assert.equal(statusDuringExecute.pendingSync,true);
  assert.equal(statusDuringExecute.inFlight,1);
  await registry.idle();
  assert.equal(secondSignal.aborted,true,'deferred sync applies the diff after the call settles');
  assert.equal(registered.get('second_tool').signal.aborted,false);
  assert.equal(registry.status().pendingSync,false);
  assert.equal(registry.status().inFlight,0);
  assert.equal(registry.status().registeredToolCount,2);
});

test('native execute wrapper validates schema, honors cancellation, and returns one plain object',async()=>{let registered;const context={registerTool:async(tool)=>{registered=tool;}};const registry=createWebMCPRegistry({contextProvider:()=>context,bridgeTarget:{}});await registry.sync([definition()]);await assert.rejects(()=>registered.execute({count:8},{signal:new AbortController().signal}),/at most 5/);await assert.rejects(()=>registered.execute({count:2,extra:true},{signal:new AbortController().signal}),/not allowed/);const controller=new AbortController();controller.abort();await assert.rejects(()=>registered.execute({count:2},{signal:controller.signal}),{name:'AbortError'});const result=await registered.execute({count:2},{signal:new AbortController().signal});assert.deepEqual(result,{message:'Validated count.',count:2});assert.equal('content'in result,false);assert.equal('structuredContent'in result,false);});

test('native and Tool Lab execution reject wrapped or over-budget results',async()=>{const registry=createWebMCPRegistry({contextProvider:()=>null,bridgeTarget:{}});await registry.sync([definition({execute:async()=>({content:[],structuredContent:{count:2}})})]);await assert.rejects(()=>registry.executeTool('test_tool',{count:2}),/plain object/);await registry.sync([definition({execute:async()=>({message:'x'.repeat(MAX_TOOL_OUTPUT_CHARS+1)})})]);await assert.rejects(()=>registry.executeTool('test_tool',{count:2}),new RegExp(`${MAX_TOOL_OUTPUT_CHARS}-character budget`));});
