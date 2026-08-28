function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
export function validateSchema(schema, input, path = 'input') {
  const errors = [];
  if (!schema) return errors;
  if (schema.type === 'object') {
    if (!isObject(input)) return [`${path} must be an object`];
    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) if (!(required in input)) errors.push(`${path}.${required} is required`);
    if (schema.additionalProperties === false) for (const key of Object.keys(input)) if (!(key in properties)) errors.push(`${path}.${key} is not allowed`);
    for (const [key, value] of Object.entries(input)) if (properties[key]) errors.push(...validateSchema(properties[key], value, `${path}.${key}`));
  } else if (schema.type === 'array') {
    if (!Array.isArray(input)) return [`${path} must be an array`];
    if (schema.minItems != null && input.length < schema.minItems) errors.push(`${path} must have at least ${schema.minItems} items`);
    if (schema.maxItems != null && input.length > schema.maxItems) errors.push(`${path} must have at most ${schema.maxItems} items`);
    input.forEach((item, index) => errors.push(...validateSchema(schema.items, item, `${path}[${index}]`)));
  } else if (schema.type === 'string') {
    if (typeof input !== 'string') return [`${path} must be a string`];
    if (schema.minLength != null && input.length < schema.minLength) errors.push(`${path} must have at least ${schema.minLength} characters`);
    if (schema.maxLength != null && input.length > schema.maxLength) errors.push(`${path} must have at most ${schema.maxLength} characters`);
    if (schema.enum && !schema.enum.includes(input)) errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof input !== 'number' || !Number.isFinite(input)) return [`${path} must be a number`];
    if (schema.type === 'integer' && !Number.isInteger(input)) errors.push(`${path} must be an integer`);
    if (schema.minimum != null && input < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`);
    if (schema.maximum != null && input > schema.maximum) errors.push(`${path} must be at most ${schema.maximum}`);
  } else if (schema.type === 'boolean' && typeof input !== 'boolean') errors.push(`${path} must be a boolean`);
  return errors;
}
export function toolResult(data, summary='Done') { return { content:[{type:'text',text:`${summary}\n${JSON.stringify(data,null,2)}`}], structuredContent:data }; }
export function createWebMCPRegistry({ bridgeName='__webMCP', onStatus=()=>{} }={}) {
  let definitions=[]; let controllers=[]; let signature=''; let mode='preview'; let lastError=null;
  const getContext=()=>document.modelContext ?? navigator.modelContext ?? null;
  async function sync(next) {
    definitions=next;
    const nextSignature=next.map((tool)=>tool.name).join('|');
    if (nextSignature===signature) return;
    signature=nextSignature; controllers.forEach((controller)=>controller.abort()); controllers=[];
    const context=getContext();
    if (!context?.registerTool) { mode='preview'; onStatus(status()); return; }
    mode='native'; lastError=null;
    for (const definition of definitions) {
      const controller=new AbortController(); controllers.push(controller);
      try { await context.registerTool(definition,{signal:controller.signal}); }
      catch(error) { mode='preview'; lastError=error instanceof Error?error.message:String(error); }
    }
    onStatus(status());
  }
  function listTools(){ return definitions.map(({name,description,inputSchema,annotations})=>({name,description,inputSchema,annotations})); }
  async function executeTool(name,input={}){ const tool=definitions.find((candidate)=>candidate.name===name); if(!tool) throw new Error(`Unknown tool: ${name}`); const errors=validateSchema(tool.inputSchema,input); if(errors.length) throw new Error(errors.join('; ')); return tool.execute(input); }
  function status(){ return {mode,toolCount:definitions.length,lastError,api:getContext()?(document.modelContext?'document.modelContext':'navigator.modelContext'):null}; }
  const bridge={listTools,executeTool,status}; Object.defineProperty(window,bridgeName,{value:bridge,configurable:true}); return {sync,listTools,executeTool,status};
}
