"use strict";
const fs=require("fs"),path=require("path");
const data=JSON.parse(fs.readFileSync(path.join(__dirname,"knowledge.json"),"utf8"));
const workflows=data.entities.filter(x=>["task","troubleshooting"].includes(x.entity_type));
const errors=[],warnings=[];let steps=0,checks=0,issues=0,rollbacks=0,inferred=0;
const ph=t=>[...String(t||"").matchAll(/<([A-Z][A-Z0-9_]*)>/g)].map(x=>x[1]);
for(const w of workflows){
  if(!Array.isArray(w.steps)||!w.steps.length){errors.push(`${w.id}: no steps`);continue;}
  const ids=new Set(),used=new Set(),declared=new Set((w.variables||[]).map(x=>x.name));
  for(const [i,s] of w.steps.entries()){steps++;if(!s.id)errors.push(`${w.id}: step ${i+1} no id`);if(ids.has(s.id))errors.push(`${w.id}: duplicate ${s.id}`);ids.add(s.id);if(!String(s.command||"").trim())errors.push(`${w.id}/${s.id}: empty command`);ph(s.command).forEach(x=>used.add(x));}
  for(const v of w.verification||[]){checks++;ph(v.command).forEach(x=>used.add(x));}
  for(const e of w.common_errors||[]){issues++;for(const c of e.checks||[])ph(c.command).forEach(x=>used.add(x));}
  for(const r of w.rollback_ar||[]){rollbacks++;ph(r).forEach(x=>used.add(x));}
  for(const x of used)if(!declared.has(x))inferred++;
  if(!w.goal_ar)warnings.push(`${w.id}: no goal`);
}
const report=[
"GUIDED WORKFLOW PHASE 5 TEST REPORT","===================================",
`Workflows: ${workflows.length}`,`Steps: ${steps}`,`Verification checks: ${checks}`,
`Common error groups: ${issues}`,`Rollback items: ${rollbacks}`,
`Variables inferred automatically: ${inferred}`,`Errors: ${errors.length}`,
`Warnings: ${warnings.length}`,"",
errors.length?errors.join("\n"):"All workflow structures are valid."
].join("\n");
fs.writeFileSync(path.join(__dirname,"WORKFLOW_TEST_REPORT.txt"),report,"utf8");
console.log(report);if(errors.length)process.exit(1);
