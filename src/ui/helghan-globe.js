// The Helghan planetary survey: a turning amber hologram of the planet for
// the start screen, ported from the owner's design page (the layer toggles
// stay there; here the capital, ice caps and contours show). Picture only:
// nothing here touches a battle. The land and ice maps are greyscale height
// fields in assets/helghan/. It draws only between start() and stop().

/* eslint-disable */
export function createHelghanGlobe(c, base = 'assets/helghan/') {
const g=c.getContext('2d');
const K=2,SW=360,SH=390,cx=180,cy=214,R=122,PI=Math.PI,YL='#ffe23d',AM='255,150,50',CR='255,238,200',IC='205,228,255';
const FX='"JetBrains Mono",ui-monospace,Menlo,monospace';
const PW=SW*K,PH=SH*K,PCX=cx*K,PCY=cy*K,PR=R*K;
function hs(i,j,k){let h=Math.imul(i,374761393)^Math.imul(j,668265263)^Math.imul(k,1442695041);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;}
function nz(x,y,z){const X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z);let fx=x-X,fy=y-Y,fz=z-Z;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);fz=fz*fz*(3-2*fz);const l=(a,b,t)=>a+(b-a)*t;
return l(l(l(hs(X,Y,Z),hs(X+1,Y,Z),fx),l(hs(X,Y+1,Z),hs(X+1,Y+1,Z),fx),fy),l(l(hs(X,Y,Z+1),hs(X+1,Y,Z+1),fx),l(hs(X,Y+1,Z+1),hs(X+1,Y+1,Z+1),fx),fy),fz);}
function fbm(x,y,z,o){let s=0,a=0.5,f=1,n=0;for(let i=0;i<o;i++){s+=a*nz(x*f,y*f,z*f);n+=a;a*=0.5;f*=2.03;}return s/n;}
// Procedural layers: storms (cl) and inland contours (hc)
const W=384,H=192,T=W*H,cl=new Float32Array(T),hc=new Float32Array(T);
for(let j=0;j<H;j++){const lat=(0.5-(j+0.5)/H)*PI;for(let i=0;i<W;i++){const lon=((i+0.5)/W-0.5)*2*PI,k=j*W+i;
const px=Math.cos(lat)*Math.sin(lon),py=Math.sin(lat),pz=Math.cos(lat)*Math.cos(lon);
hc[k]=fbm(px*2.6+5,py*2.6,pz*2.6,3);cl[k]=fbm(px*2.2,py*5+3,pz*2.2+11,4);}}
function norm(a){let mn=9,mx=-9;for(const v of a){if(v<mn)mn=v;if(v>mx)mx=v;}for(let k=0;k<a.length;k++)a[k]=(a[k]-mn)/(mx-mn);}
norm(hc);norm(cl);
const storms=[],cand=[];
for(let j=Math.floor(H*0.22);j<H*0.78;j+=3)for(let i=0;i<W;i+=3)cand.push([cl[j*W+i],i,j]);
cand.sort((a,b)=>b[0]-a[0]);
for(const q of cand){if(storms.length>=5)break;const u=q[1]/W,lat=(0.5-q[2]/H)*PI;
if(storms.every(s=>{const du=Math.min(Math.abs(s.u-u),1-Math.abs(s.u-u))*2*PI;return Math.hypot(du*Math.cos(lat),s.lat-lat)>0.9;}))storms.push({u,lat,sp:q[1]%2?1:-1});}
function bil(a,w,h,fu,fv){let i0=Math.floor(fu);if(fv<0)fv=0;let j0=Math.floor(fv);const tx=fu-i0,ty=fv-j0;i0=((i0%w)+w)%w;const i1=(i0+1)%w;let j1=j0+1;if(j1>h-1)j1=h-1;if(j0>h-1)j0=h-1;
const a00=a[j0*w+i0],a10=a[j0*w+i1],a01=a[j1*w+i0],a11=a[j1*w+i1];return a00+(a10-a00)*tx+(a01-a00)*ty+(a00-a10-a01+a11)*tx*ty;}
// Screen setup (full-resolution pixel buffer)
const tilt=0.4,ct=Math.cos(tilt),sn=Math.sin(tilt),L=[-0.55,0.35,0.76];
const idx=[],U=[],VV=[],D=[],YY=[],inD=new Uint8Array(PW*PH);
for(let y=0;y<PH;y++)for(let x=0;x<PW;x++){const dx=(x+0.5-PCX)/PR,dy=(y+0.5-PCY)/PR,r2=dx*dx+dy*dy;if(r2>=1)continue;const z=Math.sqrt(1-r2),px=dx,py=-dy;
const qx=px*ct+py*sn,qy=-px*sn+py*ct;idx.push(y*PW+x);inD[y*PW+x]=1;YY.push(y);U.push(Math.atan2(qx,z)/(2*PI)+0.5);VV.push(0.5-Math.asin(qy)/PI);
D.push(Math.max(0,px*L[0]+py*L[1]+z*L[2]));}
const N=idx.length,FC=new Float32Array(PW*PH),FI=new Float32Array(PW*PH),FH=new Float32Array(PW*PH),FV=new Float32Array(PW*PH);
const img=g.createImageData(PW,PH),dt=img.data,bg=new Uint8ClampedArray(PW*PH*4);
for(let i=0;i<PW*PH;i++){bg[i*4]=12;bg[i*4+1]=9;bg[i*4+2]=7;bg[i*4+3]=255;}
const grid=[];for(let la=-75;la<=75;la+=15)for(let lo=0;lo<360;lo+=15)grid.push([lo/360,la*PI/180]);
const ships=[{r:1.2,inc:1.15,rot:0.35,sp:0.00022,th:0,lab:'orbital station',st:1},{r:1.3,inc:1.25,rot:-0.5,sp:0.00034,th:2,lab:'cruiser'},{r:1.27,inc:1.05,rot:1.25,sp:0.0003,th:4,lab:'cruiser'},{r:1.36,inc:1.32,rot:2.5,sp:0.00026,th:1,lab:'transport'}];
// Pyrrhus, on the Corinth River in the northern interior
const cLat=0.4878,cLon=-0.2178;
let LAND,ICE,LW,LH,IW,IH;
// Fixed layers for the start screen (the layer toggles stay in the original page).
const S={capital:true,ice:true,contours:true,fronts:false,cores:false,vessels:false,orbits:false,trails:false,lock:false,grid:false};
let off=0.03,coff=0,run=true,last=performance.now(),t0=performance.now(),tt=0,visS=0,crWas=false,crStart=-1e9;
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const c01=x=>Math.max(0,Math.min(1,x));
function ss(a,b,x){const t=c01((x-a)/(b-a));return t*t*(3-2*t);}
function pop(age){return age<0?0:age<150?age/150:age<1850?1:age<2000?(2000-age)/150:0;}
function spos(s,a){const r=s.r*R,x=r*Math.cos(a),y0=r*Math.sin(a)*Math.cos(s.inc),z=r*Math.sin(a)*Math.sin(s.inc);
const X=x*Math.cos(s.rot)-y0*Math.sin(s.rot),Y=x*Math.sin(s.rot)+y0*Math.cos(s.rot);return[cx+X,cy+Y,z,Math.hypot(X,Y)];}
function hid(q){return q[2]<0&&q[3]<R+2;}
function proj(u,lat,o){const lv=((u+o)%1-0.5)*2*PI,qx=Math.cos(lat)*Math.sin(lv),qy=Math.sin(lat),qz=Math.cos(lat)*Math.cos(lv);
const px=qx*ct-qy*sn,py=qx*sn+qy*ct;return[cx+px*R,cy-py*R,qz,px,py];}
function txt(s,x,y,col,sz,al){g.font=(sz||11)+'px '+FX;g.fillStyle=col||'rgba('+AM+',0.85)';g.textAlign=al||'left';g.fillText(s,x,y);g.textAlign='left';}
function tw(s,bt,st){return s.slice(0,Math.max(0,Math.floor((bt-st)*32)));}
function bracket(x,y,s,lw){g.lineWidth=lw;g.beginPath();[[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([a,b])=>{g.moveTo(x+a*s,y+b*s+(-b)*s*0.45);g.lineTo(x+a*s,y+b*s);g.lineTo(x+a*s+(-a)*s*0.45,y+b*s);});g.stroke();}
function cyc(x,y,rr,an,lw){g.lineWidth=lw;for(let m=0;m<2;m++){g.beginPath();g.arc(x,y,rr,an+m*PI,an+m*PI+2.1);g.stroke();g.beginPath();g.arc(x,y,rr*0.45,an+m*PI+1,an+m*PI+2.6);g.stroke();}}
function grad(F,i){const r=inD[i+1]?i+1:i-1,d=inD[i+PW]?i+PW:i-PW;const a=F[i]-F[r],b=F[i]-F[d];return Math.sqrt(a*a+b*b)+1e-6;}
function draw(t){const bt=(t-t0)/1000,p1=c01(bt/0.9),rev=c01((bt-0.5)/1.3),yRev=(cy-R+rev*2*R)*K,a3=c01((bt-1.8)/0.6);
for(let n=0;n<N;n++){const i=idx[n],uu=((U[n]-off)%1+1)%1,cu=((U[n]-coff)%1+1)%1,v=VV[n];
FC[i]=bil(LAND,LW,LH,uu*LW-0.5,v*LH-0.5);FI[i]=(S.ice&&(v<0.3||v>0.7))?bil(ICE,IW,IH,uu*IW-0.5,v*IH-0.5):-128/24;
if(S.contours)FH[i]=bil(hc,W,H,uu*W-0.5,v*H-0.5)*9;if(S.fronts)FV[i]=bil(cl,W,H,cu*W-0.5,v*H-0.5);}
dt.set(bg);
for(let n=0;n<N;n++){const y=YY[n];if(y>yRev)continue;const i=idx[n],p=i*4,d=D[n];
const f=FC[i],gc=grad(FC,i),sL=ss(-gc,gc,f),coast=c01(1-Math.abs(f)/(gc*0.9));
let iL=0,iEdge=0;if(S.ice&&FI[i]>-5.3){const fi=FI[i],gi=grad(FI,i);iL=ss(-gi,gi,fi);iEdge=c01(1-Math.abs(fi)/(gi*0.9));}
const hv=S.contours?FH[i]:4.5,cline=S.contours?c01(1-Math.abs(hv-Math.round(hv))/(grad(FH,i)*0.8)):0;
const lit=0.35+0.65*d;
let I=(0.035+sL*(0.17+0.07*hv/9)+sL*cline*0.12*(1-iL))*lit+coast*0.85*(0.55+0.45*d)*(1-iL*0.6);
let iA=(iL*0.24+iEdge*0.7)*(0.45+0.55*d);
let cA=0;if(S.fronts){const cv=FV[i],gv=grad(FV,i);cA=(ss(0.62,0.8,cv)*0.28+c01(1-Math.abs(cv-0.64)/(gv*0.9))*0.5)*(0.45+0.55*d)*a3;}
if(((y/K)|0)%3===0){I*=0.72;cA*=0.8;iA*=0.8;}
let yb=0;if(rev<1&&Math.abs(y-yRev)<2*K){I=0;cA=0;iA=0;yb=1;}
dt[p]=Math.min(255,12+255*I+255*cA+205*iA+255*yb);dt[p+1]=Math.min(255,9+140*I+238*cA+228*iA+226*yb);dt[p+2]=Math.min(255,7+45*I+200*cA+255*iA+61*yb);}
g.setTransform(1,0,0,1,0,0);g.putImageData(img,0,0);g.setTransform(K,0,0,K,0,0);
if(S.grid)for(const q0 of grid){const q=proj(q0[0],q0[1],off);if(q[2]<0.08||q[1]*K>yRev)continue;const d=Math.max(0,q[3]*L[0]+q[4]*L[1]+q[2]*L[2]);
g.fillStyle='rgba('+AM+','+(0.22+0.38*d)+')';g.beginPath();g.arc(q[0],q[1],0.75+0.3*q[2],0,2*PI);g.fill();}
if(rev>0){g.strokeStyle='rgba('+AM+','+(0.5*rev)+')';g.lineWidth=1;g.beginPath();g.arc(cx,cy,R+0.5,0,2*PI);g.stroke();}
g.strokeStyle='rgba('+AM+',0.55)';g.lineWidth=1;g.beginPath();g.arc(cx,cy,R+7,-PI/2,-PI/2+2*PI*p1);g.stroke();
for(let a=0;a<72*p1;a++){const an=-PI/2+a/72*2*PI,l=a%6?3:8;g.beginPath();g.moveTo(cx+Math.cos(an)*(R+7),cy+Math.sin(an)*(R+7));g.lineTo(cx+Math.cos(an)*(R+7+l),cy+Math.sin(an)*(R+7+l));g.stroke();}
visS=0;
if(a3>0){g.globalAlpha=a3;g.strokeStyle=YL;g.fillStyle=YL;
for(const s of storms){const q=proj(s.u,s.lat,coff);if(q[2]<0.3)continue;visS++;if(S.cores)cyc(q[0],q[1],5+6*q[2],tt*0.003*s.sp,1.2);}
const cr=proj(cLon/(2*PI)+0.5,cLat,off),crV=cr[2]>0.2;
if(crV&&!crWas&&a3>=1)crStart=tt;if(a3>=1)crWas=crV;
if(crV&&S.capital){g.strokeStyle=YL;g.fillStyle=YL;g.lineWidth=1.3;g.beginPath();g.arc(cr[0],cr[1],7,0,2*PI);g.stroke();g.beginPath();g.arc(cr[0],cr[1],1.6,0,2*PI);g.fill();
const pa=pop(tt-crStart);if(pa>0){g.globalAlpha=a3*pa;g.beginPath();g.moveTo(cr[0]+5,cr[1]-5);g.lineTo(cr[0]+18,cr[1]-18);g.lineTo(cr[0]+28,cr[1]-18);g.stroke();
const l1='Pyrrhus',l2='Capital';g.font='11px '+FX;const w=Math.max(g.measureText(l1).width,g.measureText('Capital').width);let bx=Math.min(cr[0]+28,SW-16-w);
g.fillStyle='rgba(12,9,7,0.88)';g.fillRect(bx,cr[1]-38,w+10,28);g.strokeRect(bx,cr[1]-38,w+10,28);txt(l1,bx+5,cr[1]-25,YL);txt(l2,bx+5,cr[1]-14,'rgba('+AM+',0.9)',10);g.globalAlpha=a3;}}
for(const s of ships){if(S.orbits){g.setLineDash([2,5]);g.strokeStyle='rgba(255,226,61,0.16)';g.lineWidth=1;g.beginPath();let pen=false;
for(let a=0;a<=96;a++){const q=spos(s,a/96*2*PI);if(hid(q)){pen=false;continue;}if(!pen){g.moveTo(q[0],q[1]);pen=true;}else g.lineTo(q[0],q[1]);}g.stroke();g.setLineDash([]);}
if(S.trails)for(let m=0;m<14;m++){const qa=spos(s,s.th-0.3+m*0.02),qb=spos(s,s.th-0.28+m*0.02);if(hid(qa)||hid(qb))continue;g.strokeStyle='rgba(255,226,61,'+(m/14*0.7)+')';g.lineWidth=1.5;g.beginPath();g.moveTo(qa[0],qa[1]);g.lineTo(qb[0],qb[1]);g.stroke();}
if(!S.vessels)continue;const q=spos(s,s.th);if(hid(q))continue;const q2=spos(s,s.th+0.02),ang=Math.atan2(q2[1]-q[1],q2[0]-q[0]),sc=0.8+0.25*(q[2]/(s.r*R));
g.save();g.translate(q[0],q[1]);g.rotate(ang);g.scale(sc,sc);g.fillStyle=YL;g.strokeStyle=YL;
if(s.st){g.lineWidth=1.5;g.strokeRect(-4,-4,8,8);g.beginPath();g.moveTo(-9,0);g.lineTo(9,0);g.moveTo(0,-9);g.lineTo(0,9);g.stroke();}
else{g.beginPath();g.moveTo(9,0);g.lineTo(-6,-4.5);g.lineTo(-3,0);g.lineTo(-6,4.5);g.closePath();g.fill();}g.restore();}
const ti=Math.floor(tt/6000)%ships.length,lms=tt%6000,ts=ships[ti],tq=spos(ts,ts.th);
if(S.lock&&S.vessels&&!hid(tq)){const bs=lms<700?28-16*(lms/700):12+Math.sin(tt*0.008)*1.2;g.strokeStyle=YL;bracket(tq[0],tq[1],bs,1.5);
const pa=pop(lms-700);if(pa>0){g.globalAlpha=a3*pa;const l1='Tracking: '+ts.lab,l2='Alt '+Math.floor((ts.r-1)*6400)+' km';g.font='11px '+FX;const w=Math.max(g.measureText(l1).width,g.measureText(l2).width);
let bx=tq[0]+18,by=tq[1]-46;if(bx+w+10>SW-12)bx=tq[0]-18-w-10;if(by<52)by=tq[1]+18;
g.lineWidth=1;g.beginPath();g.moveTo(tq[0]+(bx>tq[0]?12:-12),tq[1]+(by<tq[1]?-12:12));g.lineTo(bx+(bx>tq[0]?0:w+10),by+(by<tq[1]?30:0));g.stroke();
g.fillStyle='rgba(12,9,7,0.88)';g.fillRect(bx,by,w+10,30);g.strokeRect(bx,by,w+10,30);txt(l1,bx+5,by+13,YL);txt(l2,bx+5,by+25,'rgba('+AM+',0.9)');}}
g.globalAlpha=1;}
g.strokeStyle='rgba('+AM+',0.6)';g.lineWidth=1.5;const k2=10,a2=18;
[[k2,k2,1,1],[SW-k2,k2,-1,1],[SW-k2,SH-k2,-1,-1],[k2,SH-k2,1,-1]].forEach(([x,y,a,b])=>{g.beginPath();g.moveTo(x,y+b*a2);g.lineTo(x,y);g.lineTo(x+a*a2,y);g.stroke();});
txt(tw('Planetary survey: Helghan',bt,0.2),22,32,YL,12);txt(tw('Alpha Centauri system',bt,0.5),22,47);
txt(tw('Rot '+String(Math.floor((off*360)%360)).padStart(3,'0')+'°',bt,0.4),SW-22,32,null,11,'right');txt(tw('Scan active',bt,0.7),SW-22,47,null,11,'right');
if(!reduce&&Math.random()<0.012){g.fillStyle='rgba(12,9,7,0.15)';g.fillRect(0,0,SW,SH);}}
let lastDraw=0,active=false,loaded=false,looping=false;function frame(t){if(!active||!loaded){looping=false;return;}if(t-lastDraw<31){requestAnimationFrame(frame);return;}lastDraw=t;const dl=Math.min(80,t-last);last=t;if(run){tt+=dl;off=(off+dl*0.000035)%1;coff=(coff+dl*0.00005)%1;ships.forEach(s=>s.th+=dl*s.sp);}else t0+=dl;draw(t);requestAnimationFrame(frame);}
function loadField(src){return new Promise(res=>{const im=new Image();im.onload=()=>{const cv=document.createElement('canvas');cv.width=im.width;cv.height=im.height;const x=cv.getContext('2d');x.drawImage(im,0,0);
const d=x.getImageData(0,0,im.width,im.height).data,a=new Float32Array(im.width*im.height);for(let i=0;i<a.length;i++)a[i]=(d[i*4]-128)/24;res({a,w:im.width,h:im.height});};im.src=src;});}
if(reduce){run=false;t0-=4000;}
const ready=Promise.all([loadField(base+'land.png'),loadField(base+'ice.png')]).then(([l,i])=>{LAND=l.a;LW=l.w;LH=l.h;ICE=i.a;IW=i.w;IH=i.h;loaded=true;kick();});
function kick(){if(active&&loaded&&!looping){looping=true;last=performance.now();requestAnimationFrame(frame);}}
return{
  // Show: replay the intro scan from the start, then keep turning.
  start(){if(active)return;active=true;t0=performance.now();if(reduce)t0-=4000;crWas=false;kick();},
  // Hide: stop drawing so the battle gets the whole processor.
  stop(){active=false;},
  ready,
};
}
