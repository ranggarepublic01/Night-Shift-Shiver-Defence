const S=require('./sim.js');
const bot=require('fs').readFileSync('bot.js','utf8');
const MIX = ['rattle', 'rattle', 'wisp', 'vesper', 'U', 'rattle', 'vesper', 'U', 'U', 'rattle', 'wisp', 'U', 'U', 'vesper', 'U', 'U', 'U', 'rattle', 'U', 'U', 'U', 'U', 'U', 'U', 'U'];
const tally={};
for(let seed=1;seed<=20;seed++){const sim=S.create({seed}),st=sim.state;sim.startWave();let k=0,tick=0;const p=sim.path;
 const cov=(i,r)=>{const[x,z]=sim.map.slots[i];let n=0;for(let s=0;s<p.L;s+=.5){const q=p.at(s);if(Math.hypot(q.x-x,q.z-z)<=r)n++}return n};
 while(st.phase==='running'){ if(tick++%15===0){ if(k<MIX.length){const a=MIX[k];if(a==='U'){let b=null;st.towers.forEach((t,i)=>{const c=sim.upgradeCost(i);if(c!=null&&(b==null||c<sim.upgradeCost(b)))b=i});if(b==null)k++;else if(sim.upgrade(b))k++;}else{const fr=st.towers.map((t,i)=>t?-1:i).filter(i=>i>=0).sort((x,y)=>cov(y,3.5)-cov(x,3.5));if(sim.build(fr[0],a))k++;}} else {for(let i=0;i<15;i++) if(st.towers[i]&&sim.upgrade(i)) break; const fr=st.towers.map((t,i)=>t?-1:i).filter(i=>i>=0); if(fr.length) sim.build(fr[0],'rattle');}}
 sim.step(); for(const e of sim.drain()) if(e.type==='leak'){const key='w'+st.wave+' '+e.kind; tally[key]=(tally[key]||0)+e.lives;} }}
console.log(tally);
