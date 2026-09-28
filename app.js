"use strict";
/* ---------- utilidades ---------- */
const $=(s,el=document)=>el.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const brl=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const brlC=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",notation:"compact",maximumFractionDigits:1});
const money=c=>brl.format(c/100);
const pad=n=>String(n).padStart(2,"0");
const iso=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse=s=>{const p=s.split("-").map(Number);return new Date(p[0],p[1]-1,p[2])};
const todayISO=()=>iso(new Date());
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
function addMonths(s,n,baseDay){const d=parse(s);const day=baseDay||d.getDate();const t=new Date(d.getFullYear(),d.getMonth()+n,1);const last=new Date(t.getFullYear(),t.getMonth()+1,0).getDate();t.setDate(Math.min(day,last));return iso(t)}
const MES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const MESC=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const DIA=["dom","seg","ter","qua","qui","sex","sáb"];
const fmtDay=s=>{const d=parse(s);return DIA[d.getDay()]+", "+d.getDate()+" "+MESC[d.getMonth()]};
const fmtShort=s=>{const p=s.split("-");return p[2]+"/"+p[1]};
const uid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
const clone=o=>JSON.parse(JSON.stringify(o));
const signed=t=>t.tipo==="r"?t.valor:-t.valor;
/*
 * Em pt-BR o ponto é separador de milhar, mas quem digita rápido também usa
 * ponto como decimal. Desambigua pela forma: um único ponto seguido de 1 ou 2
 * dígitos é decimal ("1.23"); qualquer outra combinação é milhar ("1.234",
 * "1.234.567"). Sem essa regra, "1.234" de aluguel virava R$ 1,23.
 */
function parseMoney(s){
  s=String(s).trim().replace(/[R$\s]/g,"");if(!s)return NaN;
  if(s.indexOf(",")>=0)s=s.replace(/\./g,"").replace(",",".");
  else if(!/^-?\d*\.\d{1,2}$/.test(s))s=s.replace(/\./g,"");
  const n=parseFloat(s);return isNaN(n)?NaN:Math.round(n*100);
}
/* Cor vai para dentro de um atributo `style`, então só hexadecimal passa: os
   dados podem voltar do `db` ou de um CSV com outra coisa dentro. */
const cor=c=>/^#[0-9a-f]{3,8}$/i.test(String(c))?c:"#6b6350";
const inMoney=c=>(c/100).toFixed(2).replace(".",",");

/* ---------- dados padrão ---------- */
/*
 * Cor de categoria entra só como PREENCHIMENTO sobre a ficha creme (filete da
 * linha, ponto, barra), nunca como texto — é a regra da cor da base §4.
 *
 * Todas são escuras de propósito: medem de 3,54 a 6,31 sobre o creme, então
 * passam o mínimo de 3,0 de elemento não-textual e ainda serviriam como tinta
 * se alguém usar uma delas como cor de texto por descuido. As cores claras que
 * estavam aqui antes (#D98E3A, #8DAA3A, #7CB342) davam ~1,7 como tinta — o erro
 * §12.1 da base esperando para acontecer. Com este conjunto ele não cabe.
 */
const CATS=[
 {id:"mor",nome:"Moradia",tipo:"d",cor:"#2A5C8A"},{id:"mer",nome:"Mercado",tipo:"d",cor:"#3F7D4E"},
 {id:"res",nome:"Restaurantes",tipo:"d",cor:"#B8651F"},{id:"tra",nome:"Transporte",tipo:"d",cor:"#5C4E96"},
 {id:"sau",nome:"Saúde",tipo:"d",cor:"#A8354F"},{id:"laz",nome:"Lazer",tipo:"d",cor:"#1F7A78"},
 {id:"ass",nome:"Assinaturas",tipo:"d",cor:"#8A3F7A"},{id:"edu",nome:"Educação",tipo:"d",cor:"#6B7D1F"},
 {id:"car",nome:"Cartão de crédito",tipo:"d",cor:"#4A5560"},{id:"out",nome:"Outras despesas",tipo:"d",cor:"#7A7469"},
 {id:"sal",nome:"Salário",tipo:"r",cor:"#1F6B43"},{id:"fre",nome:"Freelance",tipo:"r",cor:"#2A6F9E"},
 {id:"ren",nome:"Rendimentos",tipo:"r",cor:"#5C7A1F"},{id:"orc",nome:"Outras receitas",tipo:"r",cor:"#8A6B1F"}
];
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function seed(){
  const T=todayISO(),now=new Date(),rnd=mulberry(7),tx=[];
  const add=(data,desc,valor,tipo,cat,conta,extra)=>tx.push(Object.assign({id:uid(),data,desc,valor,tipo,cat,conta,ok:data<=T},extra||{}));
  const pick=(a,b)=>a+Math.floor(rnd()*(b-a+1));
  for(let k=-3;k<=3;k++){
    const base=new Date(now.getFullYear(),now.getMonth()+k,1);
    const ym=base.getFullYear()+"-"+pad(base.getMonth()+1);
    const last=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
    const D=d=>ym+"-"+pad(Math.min(d,last));
    add(D(5),"Salário",685000,"r","sal","cc",{grupo:"g-sal",rep:"m"});
    add(D(1),"Rendimento da poupança",pick(9000,12500),"r","ren","poup");
    add(D(10),"Aluguel",185000,"d","mor","cc",{grupo:"g-alu",rep:"m"});
    add(D(10),"Condomínio",62000,"d","mor","cc");
    add(D(12),"Energia elétrica",k<=0?pick(16500,24500):20500,"d","mor","cc");
    add(D(15),"Internet",11990,"d","mor","cc",{grupo:"g-net",rep:"m"});
    add(D(8),"Academia",9990,"d","sau","cc",{grupo:"g-aca",rep:"m"});
    add(D(20),"Streaming e música",5980,"d","ass","cc");
    add(D(18),"Fatura do cartão",k<0?pick(210000,310000):(k===0?276000:280000),"d","car","cc");
    if(k<=0){
      const days=new Set();while(days.size<5)days.add(pick(1,last));
      Array.from(days).sort((a,b)=>a-b).forEach(d=>{if(D(d)<=T)add(D(d),["Supermercado","Feira","Padaria e hortifruti","Supermercado"][d%4],pick(9500,38000),"d","mer","cc")});
      const d2=new Set();while(d2.size<4)d2.add(pick(1,last));
      Array.from(d2).sort((a,b)=>a-b).forEach(d=>{if(D(d)<=T)add(D(d),["Almoço com time","Pizzaria","iFood","Café"][d%4],pick(2500,9800),"d","res","cart")});
      const d3=new Set();while(d3.size<4)d3.add(pick(1,last));
      Array.from(d3).sort((a,b)=>a-b).forEach(d=>{if(D(d)<=T)add(D(d),["Uber","Combustível","Estacionamento","Uber"][d%4],pick(1800,17000),"d","tra","cc")});
      if(k!==-1&&D(22)<=T)add(D(22),"Cinema e jantar",pick(9000,16000),"d","laz","cart");
      if(k===-2)add(D(17),"Projeto de site (freela)",240000,"r","fre","cc");
      if(k===0)add(D(20),"Consultoria (freela)",180000,"r","fre","cc");
      if(k===-1)add(D(9),"Farmácia",pick(4500,9000),"d","sau","cart");
    }else if(k===1){
      add(D(25),"Consultoria (freela)",150000,"r","fre","cc");
    }
  }
  const start=addMonths(iso(new Date(now.getFullYear(),now.getMonth(),15)),-3);
  const g="g-nb";
  for(let i=0;i<10;i++)add(addMonths(start,i,15),"Notebook",48990,"d","out","cc",{grupo:g,rep:"p",parcela:i+1,total:10});
  add(addDays(T,-2),"Seguro do carro",34500,"d","tra","cc",{ok:false});
  add(addDays(T,3),"Dentista",28000,"d","sau","cc",{ok:false});
  return {v:1,rev:1,sample:true,
    accounts:[{id:"cc",nome:"Conta corrente",saldoInicial:320000,cor:"#1F7A78"},{id:"cart",nome:"Carteira",saldoInicial:15000,cor:"#8A6B1F"},{id:"poup",nome:"Poupança",saldoInicial:1250000,cor:"#2A5C8A"}],
    categories:clone(CATS),tx};
}
function blank(){return {v:1,rev:1,sample:false,accounts:[{id:"cc",nome:"Conta corrente",saldoInicial:0,cor:"#1F7A78"}],categories:clone(CATS),tx:[]}}

/* ---------- estado e gravação ---------- */
const LS="saldo-diario-v1";
/* Fica null se config.js não tiver URL/chave — nesse caso o app roda só com
   localStorage, exatamente como antes de existir sincronização. */
const supa=(window.SUPABASE_URL&&window.SUPABASE_ANON_KEY&&window.supabase)
  ?window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_ANON_KEY):null;
let S=null,ref=null,unsub=null,downloads=null,saving=false,dirty=false,saveTimer=0,authUser=null;
let view="geral",armed=null,armTimer=0,toastTimer=0;
const now0=new Date();
let cur={y:now0.getFullYear(),m:now0.getMonth()};
let filtro={conta:"all",status:"all",tipo:"all",cat:"all",q:""};

function loadLocal(){try{const r=localStorage.getItem(LS);return r?JSON.parse(r):null}catch(e){return null}}
function setSync(s){const el=$("#sync");if(!el)return;el.dataset.s=s;el.lastElementChild.textContent={ok:"Salvo na sua conta",busy:"Salvando…",err:"Erro ao salvar",local:"Salvo só neste navegador"}[s]||""}
function localFallback(){if(!S)S=loadLocal()||seed();setSync("local")}
function persist(){
  S.rev=(S.rev||0)+1;
  try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}
  if(ref){dirty=true;setSync("busy");clearTimeout(saveTimer);saveTimer=setTimeout(flush,350)}
}
async function flush(){
  if(saving||!dirty||!ref)return;
  saving=true;dirty=false;
  try{await ref.set(clone(S));if(!dirty)setSync("ok")}catch(e){setSync("err")}
  saving=false;if(dirty)flush();
}
/*
 * Um "ref" é qualquer objeto com .set(dado) e .onSnapshot(cb, errCb) — o
 * mesmo contrato que a capacidade `db` do claude.ai já usava. attachRef faz a
 * reconciliação por `rev` uma única vez, para as duas fontes: se o documento
 * remoto não existir ainda, sobe os dados deste dispositivo; se existir, ele
 * manda (mesmo padrão de antes de existir o Supabase).
 */
function attachRef(r,fallback){
  ref=r;
  return new Promise(res=>{
    let first=true;
    const to=setTimeout(()=>{if(first){first=false;ref=null;fallback();res()}},8000);
    unsub=ref.onSnapshot(snap=>{
      const d=snap.exists?snap.data():null;
      if(first){
        first=false;clearTimeout(to);
        if(d){S=clone(d);setSync("ok")}else{S=loadLocal()||seed();S.rev=(S.rev||0)+1;dirty=true;flush()}
        res();
      }else if(d&&S&&(d.rev||0)>(S.rev||0)&&!saving&&!dirty){S=clone(d);render()}
    },()=>{ref=null;if(first){first=false;clearTimeout(to);fallback();res()}else setSync("local")});
  });
}
/* Guarda o app inteiro (S, com seu próprio `rev`) numa linha por usuário, com
   Row Level Security restringindo cada um à própria linha — ver SUPABASE.md. */
function supaRef(uid){
  let channel=null,stopped=false;
  return {
    async set(data){
      const {error}=await supa.from("app_state").upsert({user_id:uid,data,updated_at:new Date().toISOString()});
      if(error)throw error;
    },
    onSnapshot(cb,errCb){
      supa.from("app_state").select("data").eq("user_id",uid).maybeSingle().then(({data,error})=>{
        if(stopped)return;
        if(error){errCb&&errCb(error);return}
        cb({exists:!!data,data:()=>data&&data.data});
      });
      channel=supa.channel("app_state_"+uid).on("postgres_changes",
        {event:"*",schema:"public",table:"app_state",filter:"user_id=eq."+uid},
        payload=>{if(!stopped)cb({exists:!!payload.new,data:()=>payload.new&&payload.new.data})}
      ).subscribe();
      return ()=>{stopped=true;if(channel)supa.removeChannel(channel)};
    }
  };
}
/* Resolve com a sessão inicial (ou null) uma única vez; depois disso, entrar
   ou sair da conta em qualquer aba reconecta ou solta o `ref` sozinho. */
function setupAuth(){
  if(!supa)return Promise.resolve(null);
  return new Promise(res=>{
    let first=true;
    supa.auth.onAuthStateChange((event,session)=>{
      if(first){first=false;res(session);return}
      if(event==="SIGNED_IN"&&session&&(!authUser||authUser.id!==session.user.id)){
        authUser=session.user;
        attachRef(supaRef(session.user.id),localFallback).then(render);
      }else if(event==="SIGNED_OUT"){
        authUser=null;if(unsub){unsub();unsub=null}ref=null;setSync("local");render();
      }
    });
  });
}
async function initStore(){
  try{
    const c=window.claude;
    if(c&&c.use){
      const r=await Promise.all([c.use("db"),c.use("user"),c.use("downloads")]);
      downloads=r[2];
      if(r[0]&&r[1]){
        const id=await r[1].id();
        if(id){await attachRef(r[0].doc("data/users/"+id+"/app"),localFallback);return}
      }
    }
  }catch(e){}
  try{
    const session=await setupAuth();
    if(session){authUser=session.user;await attachRef(supaRef(session.user.id),localFallback);return}
  }catch(e){}
  localFallback();
}

/* ---------- cálculos ---------- */
const catOf=id=>S.categories.find(c=>c.id===id)||{nome:"Sem categoria",cor:"#7A7469"};
const accOf=id=>S.accounts.find(a=>a.id===id)||{nome:"—",cor:"#7A7469"};
const txs=c=>S.tx.filter(t=>c==="all"||t.conta===c);
const opening=c=>S.accounts.filter(a=>c==="all"||a.id===c).reduce((s,a)=>s+a.saldoInicial,0);
function balanceBefore(d,c,onlyOk){let b=opening(c);for(const t of txs(c))if(t.data<d&&(!onlyOk||t.ok))b+=signed(t);return b}
const realNow=c=>{let b=opening(c);for(const t of txs(c))if(t.ok)b+=signed(t);return b};
function monthSeries(y,m,c){
  const ym=y+"-"+pad(m+1),start=ym+"-01",n=new Date(y,m+1,0).getDate();
  const list=txs(c).filter(t=>t.data.slice(0,7)===ym),by={};
  list.forEach(t=>(by[t.data]=by[t.data]||[]).push(t));
  const openP=balanceBefore(start,c,false);let proj=openP,real=balanceBefore(start,c,true);
  const days=[];
  for(let d=1;d<=n;d++){
    const key=ym+"-"+pad(d);let ein=0,eout=0,rd=0;
    for(const t of by[key]||[]){if(t.tipo==="r")ein+=t.valor;else eout+=t.valor;if(t.ok)rd+=signed(t)}
    proj+=ein-eout;real+=rd;
    days.push({key,d,ein,eout,proj,real,n:(by[key]||[]).length});
  }
  return {ym,start,n,days,list,open:openP};
}
const curSeries=()=>monthSeries(cur.y,cur.m,filtro.conta);

/* ---------- ícones e estrutura ---------- */
const IC={
 geral:'<path d="M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
 lanc:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 fluxo:'<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
 contas:'<path d="M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2"/>',
 cats:'<path d="M3 12V4h8l10 10-8 8L3 12zM7.5 8h.01"/>',
 prev:'<path d="M15 6l-6 6 6 6"/>',next:'<path d="M9 6l6 6-6 6"/>',
 check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>'
};
const svg=k=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+IC[k]+'</svg>';
const NAV=[["geral","Visão geral","Geral"],["lanc","Lançamentos","Extrato"],["fluxo","Fluxo diário","Fluxo"],["contas","Contas","Contas"],["cats","Categorias","Categorias"]];
const TITLES={geral:"Visão geral",lanc:"Lançamentos",fluxo:"Fluxo diário",contas:"Contas",cats:"Categorias"};

function renderNav(){
  $("#nav").innerHTML=NAV.map(n=>'<button data-act="nav" data-v="'+n[0]+'"'+(view===n[0]?' aria-current="page"':"")+'>'+svg(n[0])+'<span class="lg">'+n[1]+'</span><span class="sh">'+n[2]+'</span></button>').join("");
}
function renderTop(){
  const showM=["geral","lanc","fluxo"].includes(view);
  let h='<h1>'+TITLES[view]+'</h1><span class="grow"></span>';
  if(showM){
    h+='<div class="controls"><div class="monthsw"><button data-act="prev" aria-label="Mês anterior">'+svg("prev")+'</button><span>'+MES[cur.m]+" de "+cur.y+'</span><button data-act="next" aria-label="Próximo mês">'+svg("next")+'</button></div>'
     +'<button class="btn" data-act="hoje">Hoje</button>'
     +'<select class="field" id="fConta" data-f="conta" aria-label="Conta"><option value="all">Todas as contas</option>'+S.accounts.map(a=>'<option value="'+a.id+'"'+(filtro.conta===a.id?" selected":"")+'>'+esc(a.nome)+'</option>').join("")+'</select></div>';
  }
  h+='<button class="btn primary desk" data-act="new">Novo lançamento</button>';
  $("#top").innerHTML=h;
}
function renderBanner(){
  $("#banner").innerHTML=S.sample?'<div class="banner"><span>Você está vendo lançamentos de exemplo. Explore à vontade e comece do zero quando quiser.</span><button class="btn sm danger'+(armed==="clear"?" armed":"")+'" data-act="clear">'+(armed==="clear"?"Confirmar: apagar exemplos":"Começar do zero")+'</button></div>':"";
}

/* ---------- visões ---------- */
function rowHTML(t,showDate){
  const c=catOf(t.cat),a=accOf(t.conta),T=todayISO();
  const late=!t.ok&&t.data<T;
  let badges="";
  if(late)badges+='<span class="pill late">Atrasado</span>';
  else if(!t.ok)badges+='<span class="pill plan">Previsto</span>';
  if(t.rep==="p")badges+='<span class="pill">'+t.parcela+"/"+t.total+"</span>";
  else if(t.grupo)badges+='<span class="pill">Recorrente</span>';
  /* A cor da categoria é o filete lateral da linha (`--cor-cat`), não o texto.
     O ponto que existia aqui saiu: era a mesma informação duas vezes, e no
     celular o filete é o que sobra quando a largura aperta. */
  return '<div class="row'+(t.ok?"":" plan")+'" style="--cor-cat:'+cor(c.cor)+'" data-act="edit" data-id="'+t.id+'" tabindex="0" role="button">'
   +'<button class="chk'+(t.ok?" on":"")+'" data-act="toggle" data-id="'+t.id+'" aria-label="'+(t.ok?"Marcar como previsto":"Marcar como realizado")+'" title="'+(t.ok?"Realizado: toque para voltar a previsto":"Toque para marcar como realizado")+'">'+svg("check")+'</button>'
   +'<div><div class="rdesc">'+esc(t.desc)+'</div><div class="rmeta">'+(showDate?'<span>'+fmtShort(t.data)+'</span>':"")+'<span>'+esc(c.nome)+'</span><span>'+esc(a.nome)+'</span>'+badges+'</div></div>'
   +'<div class="rval '+t.tipo+'">'+(t.tipo==="r"?"+":"−")+money(t.valor)+'</div></div>';
}
function viewGeral(){
  const ser=curSeries(),T=todayISO(),c=filtro.conta;
  let rr=0,rp=0,dr=0,dp=0;
  ser.list.forEach(t=>{if(t.tipo==="r"){rp+=t.valor;if(t.ok)rr+=t.valor}else{dp+=t.valor;if(t.ok)dr+=t.valor}});
  const endBal=ser.days[ser.n-1].proj;
  const fromIdx=ser.ym===T.slice(0,7)?Math.max(0,parse(T).getDate()-1):0;
  let mn=ser.days[fromIdx];ser.days.slice(fromIdx).forEach(d=>{if(d.proj<mn.proj)mn=d});
  const pct=(a,b)=>b>0?Math.min(100,Math.round(a/b*100)):0;
  /*
   * O placar (base §2.2): o saldo é o número que dá nome ao app, então vive na
   * moldura escura em âmbar e em corpo de cartaz — não numa ficha, porque não é
   * um fato do mês, é o que todo o resto explica. Ao lado, em corpo menor e em
   * tinta normal, os dois saldos que o qualificam: hierarquia, não competição.
   */
  const placar='<section class="placar">'
   +'<div class="placar-b"><span class="placar-v">'+money(realNow(c))+'</span><span class="placar-l">Saldo hoje</span></div>'
   +'<div class="placar-b sec"><span class="placar-v'+(endBal<0?" baixo":"")+'">'+money(endBal)+'</span><span class="placar-l">Fim de '+MESC[cur.m]+'</span></div>'
   +'<div class="placar-b sec"><span class="placar-v'+(mn.proj<0?" baixo":"")+'">'+money(mn.proj)+'</span><span class="placar-l">Menor saldo · '+fmtShort(mn.key)+'</span></div></section>';
  const kpis='<section class="kpis">'
   +'<div class="kpi"><span class="l">Receitas do mês</span><span class="v pos">'+money(rr)+'</span><span class="s">de '+money(rp)+' previstos</span><div class="bar"><b style="width:'+pct(rr,rp)+'%;background:var(--entra-tinta)"></b></div></div>'
   +'<div class="kpi"><span class="l">Despesas do mês</span><span class="v neg">'+money(dr)+'</span><span class="s">de '+money(dp)+' previstas</span><div class="bar"><b style="width:'+pct(dr,dp)+'%;background:var(--sai-tinta)"></b></div></div>'
   +'<div class="kpi"><span class="l">Sobra prevista</span><span class="v '+(rp-dp<0?"neg":"pos")+'">'+(rp-dp>=0?"+":"−")+money(Math.abs(rp-dp))+'</span><span class="s">Receitas menos despesas de '+MES[cur.m]+'</span></div></section>';
  const chart='<section class="panel"><div class="panelhead"><div><h2>Saldo dia a dia</h2><p class="sub" style="margin-bottom:0">Realizado até hoje, previsto até o fim do mês</p></div>'
   +'<div class="legend"><span><i></i>Realizado</span><span><i class="d"></i>Previsto</span><span><i class="dot"></i>Dia no negativo</span></div></div><div id="chart"></div></section>';
  // próximos
  const up=txs(c).filter(t=>!t.ok&&t.data<=addDays(T,14)).sort((a,b)=>a.data<b.data?-1:a.data>b.data?1:0).slice(0,8);
  const upH=up.length?'<div class="rows">'+up.map(t=>rowHTML(t,true)).join("")+'</div>':'<p class="sub" style="margin:0">Nada pendente para os próximos 14 dias.</p>';
  // categorias
  const bycat={};let tot=0;
  ser.list.filter(t=>t.tipo==="d").forEach(t=>{bycat[t.cat]=(bycat[t.cat]||0)+t.valor;tot+=t.valor});
  const cats=Object.keys(bycat).map(k=>({k,v:bycat[k]})).sort((a,b)=>b.v-a.v).slice(0,7);
  const mx=cats.length?cats[0].v:1;
  const catH=cats.length?cats.map(x=>{const ct=catOf(x.k);return '<div class="catrow"><div class="n"><i class="dot" style="background:'+cor(ct.cor)+'"></i><span>'+esc(ct.nome)+'</span></div><div class="num"><b>'+money(x.v)+'</b> <span class="pct">'+Math.round(x.v/tot*100)+'%</span></div><div class="bar"><b style="width:'+Math.round(x.v/mx*100)+'%;background:'+cor(ct.cor)+'"></b></div></div>'}).join(""):'<p class="sub" style="margin:0">Sem despesas neste mês.</p>';
  return placar+kpis+chart+'<div class="two"><section class="panel"><h2>Pendentes e próximos</h2><p class="sub">Previstos atrasados e dos próximos 14 dias</p>'+upH+'</section><section class="panel"><h2>Despesas por categoria</h2><p class="sub">Realizadas e previstas em '+MES[cur.m]+'</p>'+catH+'</section></div>';
}
function filteredList(){
  const ser=curSeries(),q=filtro.q.trim().toLowerCase();
  return ser.list.filter(t=>(filtro.status==="all"||(filtro.status==="ok")===t.ok)&&(filtro.tipo==="all"||t.tipo===filtro.tipo)&&(filtro.cat==="all"||t.cat===filtro.cat)&&(!q||t.desc.toLowerCase().indexOf(q)>=0||catOf(t.cat).nome.toLowerCase().indexOf(q)>=0));
}
function listHTML(){
  const ser=curSeries(),list=filteredList(),T=todayISO();
  if(!list.length)return '<div class="empty"><p>Nenhum lançamento encontrado em '+MES[cur.m]+'.</p><button class="btn primary" data-act="new">Adicionar lançamento</button></div>';
  const by={};list.forEach(t=>(by[t.data]=by[t.data]||[]).push(t));
  return Object.keys(by).sort().map(k=>{
    const day=ser.days[parseInt(k.slice(8),10)-1];
    const items=by[k].sort((a,b)=>(b.tipo==="r")-(a.tipo==="r")||a.desc.localeCompare(b.desc));
    /* O dia é UMA ficha (base §2.1): cabeçalho com a data e o saldo, filete, e
       os lançamentos no mesmo papel. Eram dois blocos soltos, e o dia é o objeto
       que dá nome à tese do app — precisa se ler como objeto. */
    return '<section class="dia"><div class="diahead"><span class="dia-l">'+fmtDay(k)+(k===T?'<span class="today">Hoje</span>':"")+'</span>'
     +'<span class="bal">Saldo previsto do dia: <b class="'+(day.proj<0?"neg":"")+'">'+money(day.proj)+'</b></span></div>'
     +'<div class="rows">'+items.map(t=>rowHTML(t)).join("")+'</div></section>';
  }).join("");
}
function viewLanc(){
  const seg=(k,v,l)=>'<button data-act="f'+k+'" data-v="'+v+'" aria-pressed="'+(filtro[k]===v)+'">'+l+'</button>';
  return '<div class="filters"><div class="seg" role="group" aria-label="Status">'+seg("status","all","Todos")+seg("status","ok","Realizados")+seg("status","plan","Previstos")+'</div>'
   +'<div class="seg" role="group" aria-label="Tipo">'+seg("tipo","all","Todos")+seg("tipo","r","Receitas")+seg("tipo","d","Despesas")+'</div>'
   +'<select class="field" data-f="cat" aria-label="Categoria"><option value="all">Todas as categorias</option>'+S.categories.map(c=>'<option value="'+c.id+'"'+(filtro.cat===c.id?" selected":"")+'>'+esc(c.nome)+'</option>').join("")+'</select>'
   +'<input class="field" id="fq" data-f="q" type="search" placeholder="Buscar lançamento" value="'+esc(filtro.q)+'" aria-label="Buscar"></div><div id="lista">'+listHTML()+'</div>';
}
function viewFluxo(){
  const ser=curSeries(),T=todayISO();let ti=0,to=0;
  const rows=ser.days.map(d=>{
    ti+=d.ein;to+=d.eout;
    const cls=(d.key===T?"today":d.n?"":"idle");
    return '<tr class="'+cls+'"><td>'+fmtDay(d.key)+'</td><td class="pos">'+(d.ein?money(d.ein):"–")+'</td><td class="neg">'+(d.eout?money(d.eout):"–")+'</td><td class="'+(d.proj<0?"negbal":d.key>T?"fut":"")+'">'+money(d.proj)+'</td><td class="'+(d.key>T?"fut":"")+'">'+(d.key<=T?money(d.real):"–")+'</td></tr>';
  }).join("");
  /* Esta nota fica na moldura escura, nao na ficha: usa a tinta apagada do
     escuro, nao a do papel. */
  return '<p class="nota">Saldo previsto inclui tudo que está lançado; saldo realizado só o que já foi confirmado.</p><div class="tablewrap"><table class="num"><thead><tr><th>Dia</th><th>Entradas</th><th>Saídas</th><th>Saldo previsto</th><th>Saldo realizado</th></tr></thead><tbody>'
   +'<tr class="open"><td>Saldo inicial do mês</td><td></td><td></td><td>'+money(ser.open)+'</td><td></td></tr>'+rows+'</tbody><tfoot><tr><td>Total do mês</td><td class="pos">'+money(ti)+'</td><td class="neg">'+money(to)+'</td><td>'+money(ser.days[ser.n-1].proj)+'</td><td></td></tr></tfoot></table></div>';
}
/* Só aparece se config.js tiver credenciais do Supabase — sem isso o app
   segue só com localStorage, sem pedir conta a ninguém. */
function syncPanel(){
  if(!supa)return"";
  if(authUser)return '<section class="panel"><h2>Sincronizar entre dispositivos</h2>'
   +'<p class="sub">Conectado como '+esc(authUser.email)+'. Os lançamentos acompanham essa conta em qualquer aparelho.</p>'
   +'<div class="actions"><button class="btn" data-act="signout">Sair desta conta</button></div></section>';
  return '<section class="panel"><h2>Sincronizar entre dispositivos</h2>'
   +'<p class="sub">Entre com seu e-mail para ver os mesmos lançamentos no celular e no computador. Sem senha: você recebe um link de acesso.</p>'
   +'<form class="fgrid" id="authform"><input class="field full" id="f-email" type="email" required autocomplete="email" placeholder="seu@email.com" aria-label="E-mail">'
   +'<div class="full actions"><button class="btn primary" type="submit">Enviar link de acesso</button></div></form>'
   +'<p class="sub" id="authmsg" style="margin:8px 0 0"></p></section>';
}
async function sendMagicLink(e){
  e.preventDefault();
  const email=$("#f-email").value.trim(),msg=$("#authmsg");
  if(!email)return;
  msg.textContent="Enviando…";
  const {error}=await supa.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
  msg.textContent=error?"Não foi possível enviar o link. Tente de novo.":"Link enviado para "+email+". Abra-o neste mesmo navegador.";
}
function viewContas(){
  const T=todayISO(),endM=iso(new Date(cur.y,cur.m+1,0));
  const cards=S.accounts.map(a=>{
    const used=S.tx.some(t=>t.conta===a.id);
    let proj=a.saldoInicial;S.tx.forEach(t=>{if(t.conta===a.id&&t.data<=endM)proj+=signed(t)});
    return '<div class="acc"><div class="editrow"><input type="color" data-acc="'+a.id+'" data-k="cor" value="'+a.cor+'" aria-label="Cor"><input class="field" data-acc="'+a.id+'" data-k="nome" value="'+esc(a.nome)+'" aria-label="Nome da conta"><button class="btn sm danger" data-act="delacc" data-id="'+a.id+'"'+(used||S.accounts.length<2?" disabled":"")+' title="'+(used?"Conta com lançamentos não pode ser excluída":S.accounts.length<2?"É preciso ter ao menos uma conta":"Excluir conta")+'">Excluir</button></div>'
     +'<div><span class="lbl">Saldo atual</span><div class="big num '+(realNow(a.id)<0?"neg":"")+'">'+money(realNow(a.id))+'</div><div class="mini">Previsto em '+fmtShort(endM)+': <b class="num">'+money(proj)+'</b></div></div>'
     /* O rótulo é chapéu (caixa alta, tracking aberto) e chapéu de seis palavras
        não se lê — a explicação desceu para a linha de apoio, em caixa normal. */
     +'<div><label class="lbl" for="si-'+a.id+'">Saldo inicial</label><input class="field num" id="si-'+a.id+'" data-acc="'+a.id+'" data-k="saldo" inputmode="decimal" value="'+inMoney(a.saldoInicial)+'" style="width:100%"><div class="mini">Quanto havia na conta antes do primeiro lançamento</div></div></div>';
  }).join("");
  const exp=downloads?'<button class="btn" data-act="export">Exportar lançamentos (CSV)</button>':"";
  return '<div class="cards">'+cards+'</div><div class="actions" style="margin-bottom:22px"><button class="btn primary" data-act="addacc">Nova conta</button></div>'
   +syncPanel()
   +'<section class="panel"><h2>Seus dados</h2><p class="sub">Cartão de crédito funciona como uma conta: lance as compras nela e a fatura como despesa prevista no vencimento.</p><div class="actions">'+exp
   +'<button class="btn danger'+(armed==="wipe"?" armed":"")+'" data-act="wipe">'+(armed==="wipe"?"Confirmar: apagar todos os lançamentos":"Apagar todos os lançamentos")+'</button></div></section>';
}
function viewCats(){
  const block=(tipo,titulo)=>{
    const list=S.categories.filter(c=>c.tipo===tipo);
    return '<section class="panel"><h2>'+titulo+'</h2><p class="sub">'+list.length+' categorias</p><div class="catlist">'+list.map(c=>{
      const used=S.tx.some(t=>t.cat===c.id);
      return '<div class="editrow"><input type="color" data-cat="'+c.id+'" data-k="cor" value="'+c.cor+'" aria-label="Cor"><input class="field" data-cat="'+c.id+'" data-k="nome" value="'+esc(c.nome)+'" aria-label="Nome da categoria"><button class="btn sm danger" data-act="delcat" data-id="'+c.id+'"'+(used?" disabled":"")+' title="'+(used?"Categoria em uso":"Excluir categoria")+'">Excluir</button></div>';
    }).join("")+'</div><div class="actions"><button class="btn" data-act="addcat" data-tipo="'+tipo+'">Nova categoria</button></div></section>';
  };
  return '<div class="two">'+block("d","Despesas")+block("r","Receitas")+'</div>';
}
const VIEWS={geral:viewGeral,lanc:viewLanc,fluxo:viewFluxo,contas:viewContas,cats:viewCats};

function render(){
  if(!S)return;
  if(filtro.conta!=="all"&&!S.accounts.some(a=>a.id===filtro.conta))filtro.conta="all";
  renderNav();renderTop();renderBanner();
  $("#view").innerHTML=VIEWS[view]();
  if(view==="geral")drawChart();
  const s=$("#sync");if(s&&s.dataset.s==="local"&&ref)setSync("ok");
}

/* ---------- gráfico ---------- */
function niceStep(raw){const p=Math.pow(10,Math.floor(Math.log10(raw)));const f=raw/p;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p}
function drawChart(){
  const host=$("#chart");if(!host)return;
  const ser=curSeries(),T=todayISO();
  const W=Math.max(280,host.clientWidth),H=Math.round(Math.min(290,Math.max(210,W*.34)));
  const m={l:62,r:14,t:14,b:26};
  const past=ser.days.filter(d=>d.key<=T);
  const vals=[ser.open].concat(ser.days.map(d=>d.proj),past.map(d=>d.real));
  let lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals);
  if(hi-lo<20000){hi+=10000;lo-=10000}
  const step=niceStep((hi-lo)/4);lo=Math.floor(lo/step)*step;hi=Math.ceil(hi/step)*step;
  const n=ser.n,iw=W-m.l-m.r,ih=H-m.t-m.b;
  const x=i=>m.l+i*iw/(n-1),y=v=>m.t+(hi-v)*ih/(hi-lo);
  let g="";
  for(let v=lo;v<=hi+step/2;v+=step){
    const yy=y(v).toFixed(1);
    g+='<line class="'+(Math.abs(v)<1?"c-zero":"c-grid")+'" x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+yy+'" y2="'+yy+'"/><text class="c-tick" x="'+(m.l-8)+'" y="'+(+yy+4)+'" text-anchor="end">'+brlC.format(v/100)+'</text>';
  }
  [1,5,10,15,20,25,n].forEach((d,k,arr)=>{if(k===arr.length-2&&n-25<3)return;g+='<text class="c-tick" x="'+x(d-1).toFixed(1)+'" y="'+(H-7)+'" text-anchor="middle">'+d+'</text>'});
  const pl=ser.days.map((d,i)=>(i?"L":"M")+x(i).toFixed(1)+","+y(d.proj).toFixed(1)).join("");
  g+='<path class="c-area" d="'+pl+"L"+x(n-1).toFixed(1)+","+y(lo).toFixed(1)+"L"+x(0).toFixed(1)+","+y(lo).toFixed(1)+'Z"/>';
  g+='<path class="c-proj" d="'+pl+'"/>';
  if(past.length)g+='<path class="c-real" d="'+past.map((d,i)=>(i?"L":"M")+x(i).toFixed(1)+","+y(d.real).toFixed(1)).join("")+'"/>';
  const ti=ser.days.findIndex(d=>d.key===T);
  if(ti>=0)g+='<line class="c-today" x1="'+x(ti).toFixed(1)+'" x2="'+x(ti).toFixed(1)+'" y1="'+m.t+'" y2="'+(H-m.b)+'"/><text class="c-todaylbl" x="'+(x(ti)+(ti>n*.8?-6:6)).toFixed(1)+'" y="'+(m.t+11)+'" text-anchor="'+(ti>n*.8?"end":"start")+'">hoje</text>';
  ser.days.forEach((d,i)=>{if(d.proj<0)g+='<circle class="c-neg" cx="'+x(i).toFixed(1)+'" cy="'+y(d.proj).toFixed(1)+'" r="4"/>'});
  host.innerHTML='<svg id="csvg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+" "+H+'" role="img" aria-label="Gráfico do saldo diário de '+MES[cur.m]+'">'+g
   +'<line class="c-cross" id="cx" y1="'+m.t+'" y2="'+(H-m.b)+'" style="display:none"/><circle class="c-dot" id="cd" r="5" style="display:none"/><rect x="'+m.l+'" y="0" width="'+iw+'" height="'+H+'" fill="transparent" id="chit"/></svg><div class="tip" id="tip" hidden></div>';
  const hit=$("#chit"),cx=$("#cx"),cd=$("#cd"),tip=$("#tip");
  const show=e=>{
    const r=$("#csvg").getBoundingClientRect();
    const i=Math.max(0,Math.min(n-1,Math.round((e.clientX-r.left-m.l)/iw*(n-1))));
    const d=ser.days[i],px=x(i);
    cx.setAttribute("x1",px);cx.setAttribute("x2",px);cx.style.display="";
    cd.setAttribute("cx",px);cd.setAttribute("cy",y(d.proj));cd.style.display="";
    tip.hidden=false;
    tip.innerHTML='<b>'+fmtDay(d.key)+'</b><br>Previsto: '+money(d.proj)+(d.key<=T?'<br>Realizado: '+money(d.real):"")+(d.ein||d.eout?'<br>Dia: +'+money(d.ein)+" / −"+money(d.eout):"");
    const tw=tip.offsetWidth;tip.style.left=Math.max(0,Math.min(W-tw,px+12>W-tw?px-tw-12:px+12))+"px";
  };
  hit.addEventListener("pointermove",show);hit.addEventListener("pointerdown",show);
  hit.addEventListener("pointerleave",()=>{cx.style.display="none";cd.style.display="none";tip.hidden=true});
}
let rz=0;window.addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{if(view==="geral")drawChart()},120)});

/* ---------- lançamento (formulário) ---------- */
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2400)}
function catOptions(tipo,sel){return S.categories.filter(c=>c.tipo===tipo).map(c=>'<option value="'+c.id+'"'+(c.id===sel?" selected":"")+'>'+esc(c.nome)+'</option>').join("")}
let editing=null;
function openTx(id,preset){
  const t=id?S.tx.find(x=>x.id===id):null;editing=t;
  const tipo=t?t.tipo:"d",data=t?t.data:(preset&&preset.data)||(cur.y+"-"+pad(cur.m+1)===todayISO().slice(0,7)?todayISO():cur.y+"-"+pad(cur.m+1)+"-01");
  const conta=t?t.conta:(filtro.conta!=="all"?filtro.conta:S.accounts[0].id);
  const rep=t?"":'<div class="full"><label class="lbl" for="f-rep">Repetir</label><div style="display:grid;grid-template-columns:1fr 90px;gap:8px"><select class="field" id="f-rep"><option value="none">Não repetir</option><option value="m">Todo mês (fixo)</option><option value="p">Parcelado (valor total dividido)</option><option value="s">Toda semana</option><option value="a">Todo ano</option></select><input class="field num" id="f-n" type="number" min="2" max="120" value="12" aria-label="Quantidade" hidden></div></div><div class="full hint" id="f-prev" hidden></div>';
  const prox=t&&t.grupo?'<div class="full"><label class="check"><input type="checkbox" id="f-prox"> Aplicar também aos próximos lançamentos desta série</label></div>':"";
  $("#modal").innerHTML='<form class="sheet" id="txform" novalidate><h3>'+(t?"Editar lançamento":"Novo lançamento")+'</h3><div class="fgrid">'
   +'<div class="full tipo" role="radiogroup" aria-label="Tipo"><label><input type="radio" name="f-tipo" value="d"'+(tipo==="d"?" checked":"")+'><span>Despesa</span></label><label><input type="radio" name="f-tipo" value="r"'+(tipo==="r"?" checked":"")+'><span>Receita</span></label></div>'
   +'<div class="full"><label class="lbl" for="f-valor">'+'Valor (R$)</label><input class="field big-in num" id="f-valor" inputmode="decimal" placeholder="0,00" autocomplete="off" value="'+(t?inMoney(t.valor):"")+'"></div>'
   +'<div class="full"><label class="lbl" for="f-desc">Descrição</label><input class="field" id="f-desc" maxlength="80" autocomplete="off" placeholder="Ex.: Supermercado" value="'+esc(t?t.desc:"")+'"></div>'
   +'<div><label class="lbl" for="f-data">Data</label><input class="field" id="f-data" type="date" value="'+data+'"></div>'
   +'<div><label class="lbl" for="f-cat">Categoria</label><select class="field" id="f-cat">'+catOptions(tipo,t?t.cat:"")+'</select></div>'
   +'<div><label class="lbl" for="f-conta">Conta</label><select class="field" id="f-conta">'+S.accounts.map(a=>'<option value="'+a.id+'"'+(a.id===conta?" selected":"")+'>'+esc(a.nome)+'</option>').join("")+'</select></div>'
   +'<div style="display:flex;align-items:end;padding-bottom:9px"><label class="check"><input type="checkbox" id="f-ok"'+(t?(t.ok?" checked":""):(data<=todayISO()?" checked":""))+'> Já realizado</label></div>'
   +rep+prox+'</div><div class="err" id="f-err" role="alert"></div>'
   +'<div class="sheetfoot"><div>'+(t?'<button type="button" class="btn danger" data-act="askdel">Excluir</button>':"")+'</div><div class="r"><button type="button" class="btn" data-act="close">Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></div></form>';
  $("#modal").hidden=false;
  setTimeout(()=>{const f=$("#f-valor");if(f)f.focus()},30);
}
function closeModal(){$("#modal").hidden=true;$("#modal").innerHTML="";editing=null}
function repPreview(){
  const r=$("#f-rep");if(!r)return;
  const v=r.value,n=$("#f-n"),pv=$("#f-prev");
  n.hidden=v==="none";
  if(v==="none"){pv.hidden=true;return}
  if(v==="p"&&+n.value>60)n.value=60;
  const cnt=Math.max(2,Math.min(120,parseInt(n.value,10)||2)),val=parseMoney($("#f-valor").value),d0=$("#f-data").value;
  if(!d0||isNaN(val)){pv.hidden=false;pv.textContent="Informe valor e data para ver o resumo.";return}
  const step=(k)=>v==="s"?addDays(d0,7*k):addMonths(d0,v==="a"?12*k:k,parse(d0).getDate());
  const per=v==="p"?Math.floor(val/cnt):val;
  pv.hidden=false;
  pv.textContent=cnt+" lançamentos de "+money(per)+" ("+(v==="p"?"total "+money(val)+", ":"")+"de "+fmtShort(d0)+" até "+step(cnt-1).split("-").reverse().join("/")+"). Só o primeiro fica como realizado, se marcado.";
}
function submitTx(e){
  e.preventDefault();
  const err=m=>{$("#f-err").textContent=m};
  const tipo=document.querySelector('input[name="f-tipo"]:checked').value,valor=parseMoney($("#f-valor").value),desc=$("#f-desc").value.trim(),data=$("#f-data").value;
  const cat=$("#f-cat").value,conta=$("#f-conta").value,ok=$("#f-ok").checked;
  if(isNaN(valor)||valor<=0)return err("Informe um valor maior que zero.");
  if(!desc)return err("Informe uma descrição.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data))return err("Informe uma data válida.");
  if(!cat)return err("Escolha uma categoria.");
  let jump=data;
  if(editing){
    const t=editing,p=$("#f-prox")&&$("#f-prox").checked;
    Object.assign(t,{tipo,valor,desc,data,cat,conta,ok});
    if(p)S.tx.forEach(o=>{if(o.grupo===t.grupo&&o.id!==t.id&&o.data>t.data)Object.assign(o,{tipo,valor,desc,cat,conta})});
    toast("Lançamento atualizado");
  }else{
    const rep=$("#f-rep").value;
    if(rep==="none")S.tx.push({id:uid(),data,desc,valor,tipo,cat,conta,ok});
    else{
      const cnt=Math.max(2,Math.min(120,parseInt($("#f-n").value,10)||2)),g="g-"+uid(),day=parse(data).getDate();
      const base=rep==="p"?Math.floor(valor/cnt):valor,rem=rep==="p"?valor-base*cnt:0;
      for(let i=0;i<cnt;i++){
        const d=rep==="s"?addDays(data,7*i):addMonths(data,rep==="a"?12*i:i,day);
        const o={id:uid(),data:d,desc,valor:base+(i===0?rem:0),tipo,cat,conta,ok:ok&&i===0,grupo:g,rep:rep==="p"?"p":"m"};
        if(rep==="p"){o.parcela=i+1;o.total=cnt}
        S.tx.push(o);
      }
    }
    toast(rep==="none"?"Lançamento adicionado":"Série de lançamentos criada");
  }
  const p=jump.split("-");cur={y:+p[0],m:+p[1]-1};
  persist();closeModal();render();
}
function askDelete(){
  const t=editing;if(!t)return;
  const foot=$(".sheetfoot");
  foot.innerHTML='<div class="r" style="width:100%;justify-content:flex-end;align-items:center"><span style="font-weight:600;margin-right:auto">Excluir este lançamento?</span><button type="button" class="btn" data-act="close">Cancelar</button>'
   +(t.grupo?'<button type="button" class="btn danger" data-act="delone">Só este</button><button type="button" class="btn danger armed" data-act="delnext">Este e os próximos</button>':'<button type="button" class="btn danger armed" data-act="delone">Excluir</button>')+'</div>';
}
function delTx(mode){
  const t=editing;if(!t)return;
  S.tx=S.tx.filter(o=>mode==="next"?!(o.grupo===t.grupo&&o.data>=t.data):o.id!==t.id);
  persist();closeModal();render();toast("Lançamento excluído");
}

/* ---------- eventos ---------- */
function arm(k){armed=k;clearTimeout(armTimer);armTimer=setTimeout(()=>{armed=null;render()},4000);render()}
const H={
  nav(el){view=el.dataset.v;render();window.scrollTo(0,0)},
  prev(){cur.m--;if(cur.m<0){cur.m=11;cur.y--}render()},
  next(){cur.m++;if(cur.m>11){cur.m=0;cur.y++}render()},
  hoje(){const d=new Date();cur={y:d.getFullYear(),m:d.getMonth()};render()},
  new(){openTx(null)},
  edit(el){openTx(el.dataset.id)},
  toggle(el,e){e.stopPropagation();const t=S.tx.find(x=>x.id===el.dataset.id);if(!t)return;t.ok=!t.ok;persist();render();toast(t.ok?"Marcado como realizado":"Voltou para previsto")},
  fstatus(el){filtro.status=el.dataset.v;render()},
  ftipo(el){filtro.tipo=el.dataset.v;render()},
  close(){closeModal()},
  askdel(){askDelete()},
  delone(){delTx("one")},
  delnext(){delTx("next")},
  clear(){if(armed!=="clear")return arm("clear");armed=null;S=blank();persist();render();toast("Tudo limpo. Adicione seu primeiro lançamento.")},
  wipe(){if(armed!=="wipe")return arm("wipe");armed=null;S.tx=[];S.sample=false;persist();render();toast("Lançamentos apagados")},
  addacc(){S.accounts.push({id:"a"+uid(),nome:"Nova conta",saldoInicial:0,cor:"#2A5C8A"});persist();render()},
  delacc(el){S.accounts=S.accounts.filter(a=>a.id!==el.dataset.id);persist();render()},
  addcat(el){S.categories.push({id:"c"+uid(),nome:"Nova categoria",tipo:el.dataset.tipo,cor:"#4A5560"});persist();render()},
  delcat(el){S.categories=S.categories.filter(c=>c.id!==el.dataset.id);persist();render()},
  signout(){supa.auth.signOut()},
  async export(){
    const rows=[["Data","Descrição","Tipo","Valor","Categoria","Conta","Status","Parcela"]];
    S.tx.slice().sort((a,b)=>a.data<b.data?-1:a.data>b.data?1:0).forEach(t=>rows.push([t.data,t.desc,t.tipo==="r"?"Receita":"Despesa",inMoney(signed(t)),catOf(t.cat).nome,accOf(t.conta).nome,t.ok?"Realizado":"Previsto",t.rep==="p"?t.parcela+"/"+t.total:""]));
    const data="﻿"+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(";")).join("\r\n");
    try{await downloads.save({filename:"aje-"+todayISO()+".csv",data});toast("Arquivo salvo")}catch(e){if(e&&e.code!=="declined")toast("Não foi possível exportar")}
  }
};
function bind(){
  document.addEventListener("click",e=>{
    if(e.target.id==="modal"){closeModal();return}
    const el=e.target.closest("[data-act]");if(!el||!H[el.dataset.act])return;
    H[el.dataset.act](el,e);
  });
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&!$("#modal").hidden)closeModal();
    if((e.key==="Enter"||e.key===" ")&&e.target.classList&&e.target.classList.contains("row")){e.preventDefault();openTx(e.target.dataset.id)}
  });
  document.addEventListener("change",e=>{
    const el=e.target;
    if(el.dataset.f&&el.dataset.f!=="q"){filtro[el.dataset.f]=el.value;render();return}
    if(el.dataset.acc){const a=S.accounts.find(x=>x.id===el.dataset.acc);if(!a)return;const k=el.dataset.k;
      if(k==="nome"){a.nome=el.value.trim()||a.nome}else if(k==="cor"){a.cor=el.value}else{const v=parseMoney(el.value);if(!isNaN(v))a.saldoInicial=v}
      persist();render();return}
    if(el.dataset.cat){const c=S.categories.find(x=>x.id===el.dataset.cat);if(!c)return;if(el.dataset.k==="nome")c.nome=el.value.trim()||c.nome;else c.cor=el.value;persist();render();return}
    if(el.name==="f-tipo"){const s=$("#f-cat");s.innerHTML=catOptions(el.value,"")}
    if(el.id==="f-rep"){const r=el.value;$("#f-n").value=r==="p"?6:r==="s"?8:r==="a"?3:12;repPreview()}
    if(el.id==="f-data"||el.id==="f-n"){repPreview()}
  });
  document.addEventListener("input",e=>{
    const el=e.target;
    if(el.id==="fq"){filtro.q=el.value;$("#lista").innerHTML=listHTML()}
    if(el.id==="f-valor"||el.id==="f-n")repPreview();
  });
  document.addEventListener("submit",e=>{
    if(e.target.id==="txform")submitTx(e);
    if(e.target.id==="authform")sendMagicLink(e);
  });
}

(async function boot(){
  bind();
  await initStore();
  render();
})();
