'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCasino } from '../CasinoContext';

type TeamType = 'T' | 'CT';

interface Bot {
  id: string;
  team: TeamType;
  x: number;
  y: number;
  health: number;
  isAlive: boolean;
  targetX: number;
  targetY: number;
  hasBomb: boolean;
  plantProgress: number;
  defuseProgress: number;
  lastShot: number;
  angle: number;
}

const MAP_W = 800, MAP_H = 600;

const WALLS = [
  {x:0,y:0,w:MAP_W,h:15},{x:0,y:MAP_H-15,w:MAP_W,h:15},{x:0,y:0,w:15,h:MAP_H},{x:MAP_W-15,y:0,w:15,h:MAP_H},
  {x:150,y:400,w:15,h:180},{x:250,y:450,w:15,h:130},{x:150,y:350,w:120,h:15},{x:250,y:300,w:15,h:60},
  {x:320,y:130,w:50,h:35},{x:380,y:90,w:35,h:25},{x:270,y:70,w:25,h:45},
  {x:300,y:230,w:15,h:70},{x:370,y:200,w:15,h:100},{x:250,y:300,w:90,h:15},{x:400,y:260,w:15,h:50},
  {x:450,y:320,w:90,h:15},{x:450,y:380,w:15,h:70},{x:500,y:430,w:15,h:90},{x:570,y:380,w:15,h:70},
  {x:550,y:130,w:50,h:45},{x:630,y:90,w:35,h:35},{x:500,y:70,w:25,h:45},
  {x:450,y:70,w:15,h:90},{x:450,y:180,w:90,h:15},{x:400,y:15,w:15,h:70},{x:500,y:15,w:15,h:50},
];

const SITE_A = {x:350,y:110,r:45};
const SITE_B = {x:580,y:110,r:45};
const T_SPAWN = [{x:70,y:480},{x:100,y:510},{x:70,y:540},{x:120,y:470},{x:50,y:470}];
const CT_SPAWN = [{x:460,y:55},{x:500,y:45},{x:440,y:65},{x:480,y:75},{x:520,y:65}];

const inWall = (x:number,y:number,pad=8) => WALLS.some(w=>x>=w.x-pad&&x<=w.x+w.w+pad&&y>=w.y-pad&&y<=w.y+w.h+pad);
const lineOfSight = (x1:number,y1:number,x2:number,y2:number) => {
  const steps = Math.ceil(Math.hypot(x2-x1,y2-y1)/10);
  for(let i=0;i<=steps;i++){const t=i/steps;if(inWall(x1+(x2-x1)*t,y1+(y2-y1)*t,0))return false;}
  return true;
};

export default function CSBetting() {
  const router = useRouter();
  const {balance,setBalance,recordBet,checkAndReload} = useCasino();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [started,setStarted] = useState(false);
  const [bet,setBet] = useState(100);
  const [betOn,setBetOn] = useState<boolean|null>(null);
  const [phase,setPhase] = useState<'bet'|'play'|'end'>('bet');
  const [round,setRound] = useState(1);
  const [tScore,setTScore] = useState(0);
  const [ctScore,setCTScore] = useState(0);
  const [time,setTime] = useState(90);
  const [bombPlanted,setBombPlanted] = useState(false);
  const [bombTimer,setBombTimer] = useState(40);
  const [bombPos,setBombPos] = useState<{x:number,y:number}|null>(null);
  const [result,setResult] = useState('');
  const [betResult,setBetResult] = useState<{won:boolean,amt:number}|null>(null);
  const [matchOver,setMatchOver] = useState(false);
  const [winner,setWinner] = useState<TeamType|null>(null);
  const [bots,setBots] = useState<Bot[]>([]);
  const [kills,setKills] = useState<string[]>([]);
  
  const botsRef = useRef<Bot[]>([]);
  const bombRef = useRef(false);
  const bombPosRef = useRef<{x:number,y:number}|null>(null);
  const phaseRef = useRef<'bet'|'play'|'end'>('bet');
  const animRef = useRef(0);

  const createBots = useCallback(() => {
    const b:Bot[] = [];
    for(let i=0;i<5;i++) b.push({id:`t${i}`,team:'T',x:T_SPAWN[i].x,y:T_SPAWN[i].y,health:100,isAlive:true,targetX:0,targetY:0,hasBomb:i===0,plantProgress:0,defuseProgress:0,lastShot:0,angle:0});
    for(let i=0;i<5;i++) b.push({id:`ct${i}`,team:'CT',x:CT_SPAWN[i].x,y:CT_SPAWN[i].y,health:100,isAlive:true,targetX:0,targetY:0,hasBomb:false,plantProgress:0,defuseProgress:0,lastShot:0,angle:0});
    return b;
  },[]);

  const startRound = useCallback((onPlant:boolean|null,betAmt:number) => {
    if(onPlant!==null&&betAmt>0&&betAmt<=balance){setBetOn(onPlant);setBalance(balance-betAmt);recordBet(betAmt);}
    else{setBetOn(null);}
    const b=createBots();setBots(b);botsRef.current=b;
    setBombPlanted(false);bombRef.current=false;setBombPos(null);bombPosRef.current=null;
    setTime(90);setBombTimer(40);setKills([]);setResult('');setBetResult(null);
    setPhase('play');phaseRef.current='play';
  },[balance,setBalance,recordBet,createBots]);

  const endRound = useCallback((w:TeamType,planted:boolean) => {
    if(phaseRef.current==='end')return;
    phaseRef.current='end';setPhase('end');
    const res = w==='T'?(planted?'💣 T WIN - Bomb Exploded!':'🔫 T WIN - CTs Dead!'):(bombRef.current?'🛡️ CT WIN - Defused!':'🛡️ CT WIN - Ts Dead!');
    setResult(res);
    if(w==='T')setTScore(s=>s+1);else setCTScore(s=>s+1);
    if(betOn!==null&&bet>0){
      const won=betOn===planted;
      if(won)setBalance((b: number)=>b+bet*2);
      setBetResult({won,amt:bet});
    }
    const newT=w==='T'?tScore+1:tScore,newCT=w==='CT'?ctScore+1:ctScore;
    if(newT>=13||newCT>=13){setMatchOver(true);setWinner(newT>=13?'T':'CT');}
  },[betOn,bet,tScore,ctScore,setBalance]);

  useEffect(()=>{
    if(phase!=='play')return;
    let lastT=performance.now(),tAcc=0,bAcc=0;
    const loop=(now:number)=>{
      const dt=(now-lastT)/1000;lastT=now;
      if(phaseRef.current!=='play')return;
      tAcc+=dt;if(tAcc>=1){tAcc=0;setTime(t=>{if(t<=1&&!bombRef.current){endRound('CT',false);return 0;}return t-1;});}
      if(bombRef.current){bAcc+=dt;if(bAcc>=1){bAcc=0;setBombTimer(t=>{if(t<=1){endRound('T',true);return 0;}return t-1;});}}
      
      const cur=[...botsRef.current];
      const aliveT=cur.filter(b=>b.team==='T'&&b.isAlive);
      const aliveCT=cur.filter(b=>b.team==='CT'&&b.isAlive);
      if(aliveT.length===0&&!bombRef.current){endRound('CT',false);return;}
      if(aliveCT.length===0&&!bombRef.current){endRound('T',false);return;}
      
      for(const bot of cur){
        if(!bot.isAlive)continue;
        const enemies=bot.team==='T'?aliveCT:aliveT;
        let target:Bot|null=null,minD=Infinity;
        for(const e of enemies){const d=Math.hypot(e.x-bot.x,e.y-bot.y);if(d<280&&lineOfSight(bot.x,bot.y,e.x,e.y)&&d<minD){minD=d;target=e;}}
        
        if(target){
          bot.angle=Math.atan2(target.y-bot.y,target.x-bot.x);
          if(now-bot.lastShot>350){
            bot.lastShot=now;
            if(Math.random()<Math.max(0.35,1-minD/350)){
              target.health-=18+Math.random()*17;
              if(target.health<=0){target.health=0;target.isAlive=false;
                if(target.hasBomb){target.hasBomb=false;const nt=aliveT.find(t=>t.id!==target!.id&&t.isAlive);if(nt)nt.hasBomb=true;}
                setKills(k=>[...k.slice(-4),`${bot.id} → ${target!.id}`]);
              }
            }
          }
        }else{
          // Movement AI
          let goalX=bot.x,goalY=bot.y;
          if(bot.team==='T'){
            if(bot.hasBomb&&!bombRef.current){goalX=SITE_A.x;goalY=SITE_A.y;}
            else if(bombRef.current&&bombPosRef.current){goalX=bombPosRef.current.x;goalY=bombPosRef.current.y;}
            else{const bomber=cur.find(b=>b.hasBomb&&b.isAlive);if(bomber){goalX=bomber.x;goalY=bomber.y;}}
          }else{
            if(bombRef.current&&bombPosRef.current){goalX=bombPosRef.current.x;goalY=bombPosRef.current.y;}
            else{const i=parseInt(bot.id.slice(2));goalX=i<3?SITE_A.x:SITE_B.x;goalY=i<3?SITE_A.y:SITE_B.y;}
          }
          
          const dx=goalX-bot.x,dy=goalY-bot.y,dist=Math.hypot(dx,dy);
          
          // Planting/Defusing
          if(bot.team==='T'&&bot.hasBomb&&!bombRef.current&&dist<35){
            bot.plantProgress+=dt;
            if(bot.plantProgress>=3.2){bombRef.current=true;setBombPlanted(true);bombPosRef.current={x:bot.x,y:bot.y};setBombPos({x:bot.x,y:bot.y});bot.hasBomb=false;bot.plantProgress=0;}
          }else if(bot.team==='CT'&&bombRef.current&&bombPosRef.current&&Math.hypot(bombPosRef.current.x-bot.x,bombPosRef.current.y-bot.y)<25){
            bot.defuseProgress+=dt;
            if(bot.defuseProgress>=4.5){endRound('CT',true);return;}
          }else if(dist>20){
            const spd=75*dt;
            let nx=bot.x+(dx/dist)*spd,ny=bot.y+(dy/dist)*spd;
            if(!inWall(nx,ny)){bot.x=nx;bot.y=ny;bot.angle=Math.atan2(dy,dx);}
            else{
              // Try sliding
              if(!inWall(bot.x+(dx/dist)*spd,bot.y))bot.x+=(dx/dist)*spd;
              else if(!inWall(bot.x,bot.y+(dy/dist)*spd))bot.y+=(dy/dist)*spd;
            }
          }
        }
      }
      botsRef.current=cur;setBots([...cur]);
      animRef.current=requestAnimationFrame(loop);
    };
    animRef.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(animRef.current);
  },[phase,endRound]);

  // Render
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const render=()=>{
      ctx.fillStyle='#1a1a2e';ctx.fillRect(0,0,MAP_W,MAP_H);
      WALLS.forEach(w=>{ctx.fillStyle='#3d3d5c';ctx.fillRect(w.x,w.y,w.w,w.h);});
      ctx.globalAlpha=0.25;ctx.fillStyle='#ff4444';ctx.beginPath();ctx.arc(SITE_A.x,SITE_A.y,SITE_A.r,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(SITE_B.x,SITE_B.y,SITE_B.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      ctx.fillStyle='#fff';ctx.font='bold 20px Arial';ctx.fillText('A',SITE_A.x-7,SITE_A.y+7);ctx.fillText('B',SITE_B.x-7,SITE_B.y+7);
      if(bombPos){ctx.fillStyle=`rgba(255,100,0,${0.7+Math.sin(Date.now()/100)*0.3})`;ctx.beginPath();ctx.arc(bombPos.x,bombPos.y,12,0,Math.PI*2);ctx.fill();}
      bots.forEach(b=>{
        if(!b.isAlive)return;
        ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);
        ctx.fillStyle=b.team==='T'?'#d4a017':'#4169e1';ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(5,-3);ctx.lineTo(5,3);ctx.fill();
        ctx.restore();
        // Health bar
        const hp=b.health/100,bw=24;
        ctx.fillStyle='#222';ctx.fillRect(b.x-bw/2,b.y-18,bw,4);
        ctx.fillStyle=hp>0.6?'#4f4':hp>0.3?'#fa0':'#f44';ctx.fillRect(b.x-bw/2,b.y-18,bw*hp,4);
        if(b.hasBomb){ctx.fillStyle='#f44';ctx.font='10px Arial';ctx.fillText('💣',b.x-5,b.y-22);}
        if(b.plantProgress>0){ctx.fillStyle='#fa0';ctx.fillRect(b.x-15,b.y+14,30*(b.plantProgress/3.2),3);}
        if(b.defuseProgress>0){ctx.fillStyle='#0af';ctx.fillRect(b.x-15,b.y+14,30*(b.defuseProgress/4.5),3);}
      });
      requestAnimationFrame(render);
    };
    render();
  },[bots,bombPos]);

  if(!started)return(
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">CS:GO Betting</h1>
        <p className="text-gray-400 mb-8">Bet on bomb plant outcome!</p>
        <button onClick={()=>setStarted(true)} className="px-8 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold rounded-lg">Start</button>
        <button onClick={()=>router.push('/casino')} className="block mx-auto mt-4 text-gray-400 hover:text-white">← Back</button>
      </div>
    </div>
  );

  return(
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="bg-gray-800 p-3 flex justify-between items-center">
        <button onClick={()=>router.push('/casino')} className="text-gray-400 hover:text-white">← Back</button>
        <div className="flex gap-6 items-center">
          <span className="text-yellow-500 font-bold text-xl">T {tScore}</span>
          <span className="text-gray-500">:</span>
          <span className="text-blue-500 font-bold text-xl">{ctScore} CT</span>
          <span className="text-gray-400">Round {round}</span>
          <span className={`font-mono text-lg ${bombPlanted?'text-red-500 animate-pulse':'text-white'}`}>{bombPlanted?`💣${bombTimer}s`:`⏱️${time}s`}</span>
        </div>
        <span className="text-green-400 font-bold">${balance.toLocaleString()}</span>
      </div>
      <div className="flex-1 flex">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative">
            <canvas ref={canvasRef} width={MAP_W} height={MAP_H} className="border-2 border-gray-700 rounded-lg"/>
            <div className="absolute top-2 right-2">{kills.slice(-5).map((k,i)=><div key={i} className="text-xs text-white bg-black/60 px-2 py-1 rounded mb-1">{k}</div>)}</div>
          </div>
        </div>
        <div className="w-72 bg-gray-800 p-4">
          {phase==='bet'&&!matchOver&&(
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Place Bet</h2>
              <input type="number" value={bet} onChange={e=>setBet(Math.max(0,+e.target.value||0))} className="w-full bg-gray-700 text-white px-3 py-2 rounded" min={0} max={balance}/>
              <div className="flex gap-2">{[100,500,1000].map(a=><button key={a} onClick={()=>setBet(Math.min(a,balance))} className="flex-1 bg-gray-700 text-white py-1 rounded text-sm">${a}</button>)}</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=>startRound(true,bet)} disabled={bet<=0||bet>balance} className="bg-orange-600 text-white py-3 rounded font-bold disabled:opacity-50">💣 PLANTED</button>
                <button onClick={()=>startRound(false,bet)} disabled={bet<=0||bet>balance} className="bg-blue-600 text-white py-3 rounded font-bold disabled:opacity-50">🛡️ NOT</button>
              </div>
              <button onClick={()=>startRound(null,0)} className="w-full bg-gray-700 text-gray-300 py-2 rounded">Watch Only</button>
            </div>
          )}
          {phase==='play'&&(
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-white">Round Live</h2>
              {betOn!==null&&<div className="bg-gray-700 p-2 rounded text-white text-sm">${bet} on {betOn?'💣 Plant':'🛡️ No Plant'}</div>}
              <div className="bg-gray-700 p-2 rounded"><span className="text-yellow-500">T:</span> {bots.filter(b=>b.team==='T'&&b.isAlive).length}/5</div>
              <div className="bg-gray-700 p-2 rounded"><span className="text-blue-500">CT:</span> {bots.filter(b=>b.team==='CT'&&b.isAlive).length}/5</div>
              {bombPlanted&&<div className="bg-red-900/60 border border-red-500 p-2 rounded text-red-400 text-center animate-pulse">💣 BOMB PLANTED! {bombTimer}s</div>}
            </div>
          )}
          {phase==='end'&&!matchOver&&(
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-white">Round Over</h2>
              <div className="bg-gray-700 p-3 rounded text-center">{result}</div>
              {betResult&&<div className={`p-3 rounded text-center ${betResult.won?'bg-green-900/60 text-green-400':'bg-red-900/60 text-red-400'}`}>{betResult.won?`+$${betResult.amt}`:`-$${betResult.amt}`}</div>}
              <button onClick={()=>{setRound(r=>r+1);setPhase('bet');phaseRef.current='bet';setBetOn(null);setBetResult(null);}} className="w-full bg-green-600 text-white py-3 rounded font-bold">Next Round</button>
            </div>
          )}
          {matchOver&&(
            <div className="space-y-4 text-center">
              <h2 className="text-xl font-bold text-white">Match Over!</h2>
              <div className={`p-4 rounded ${winner==='T'?'bg-yellow-900/60 text-yellow-400':'bg-blue-900/60 text-blue-400'}`}>{winner==='T'?'TERRORISTS':'CT'} WIN!<br/>{tScore} - {ctScore}</div>
              <button onClick={()=>{setTScore(0);setCTScore(0);setRound(1);setMatchOver(false);setWinner(null);setPhase('bet');phaseRef.current='bet';checkAndReload();}} className="w-full bg-purple-600 text-white py-3 rounded font-bold">New Match</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
