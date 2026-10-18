const {spawnSync}=require('node:child_process');
const path=require('node:path');
for(const name of ['farm','movement','weather','mobile']){
 const result=spawnSync(process.execPath,[path.join(__dirname,name+'.cjs')],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
