'use strict';
// Replace the photo URLs below as your album grows. No backend or API key is required.
const PHOTO_BASE = './images/';
const records = [
  {name:'Manado',country:'INDONESIA',lon:124.84,lat:1.49,story:'바다의 낯선 색을 처음 함께 기억한 곳.',photos:[]},
  {name:'Sapa',country:'VIETNAM',lon:103.84,lat:22.34,story:'산등성이를 따라 이어지는 길과 느리게 흘러간 시간.',photos:[]},
  {name:'Tokyo',country:'JAPAN',lon:139.69,lat:35.68,story:'도시의 밤과 불빛 속에 남긴 한 장.',photos:['main-5.webp']},
  {name:'Seoul',country:'KOREA',lon:126.98,lat:37.57,story:'가장 익숙한 도시에서 가장 특별한 모습으로.',photos:['main-1.webp','main-2.webp','main-3.webp']},
  {name:'Bohol',country:'PHILIPPINES',lon:123.85,lat:9.65,story:'햇빛과 바다가 나란히 놓였던 날들.',photos:[]},
  {name:'Karuizawa',country:'JAPAN',lon:138.59,lat:36.35,story:'숲이 가까운 작은 도시에서.',photos:[]},
  {name:'Kusatsu',country:'JAPAN',lon:138.60,lat:36.63,story:'따뜻한 물과 차가운 공기 사이에서.',photos:[]},
  {name:'Nha Trang',country:'VIETNAM',lon:109.20,lat:12.24,story:'여름의 바다를 함께 건너온 기록.',photos:[]},
  {name:'Pattaya',country:'THAILAND',lon:100.88,lat:12.93,story:'같이 걷고 같은 방향을 바라본 풍경.',photos:[]},
  {name:'Everland',country:'KOREA',lon:127.20,lat:37.29,story:'조금은 들뜬 마음도 함께 모아둔 곳.',photos:[]},
  {name:'Gangneung',country:'KOREA',lon:128.88,lat:37.75,story:'동쪽으로 향하는 길에 남긴 하루.',photos:[]},
  {name:'Sokcho',country:'KOREA',lon:128.59,lat:38.20,story:'산과 바다가 이어지는 곳.',photos:[]},
  {name:'Yeongju',country:'KOREA',lon:128.63,lat:36.81,story:'아직 더 많은 사진을 기다리는 도시.',photos:[]},
  {name:'Inwangsan',country:'KOREA',lon:126.96,lat:37.59,story:'멀리 떠나지 않아도 좋았던 순간.',photos:[]}
];
const $ = (id)=>document.getElementById(id);
let chosen=0, imageNo=0;
function svgPos(place){return {x:((place.lon-94)/54)*1000,y:((44-place.lat)/56)*900};}
function updateRoute(){const a=svgPos(records[3]),b=svgPos(records[chosen]);const p=$('mapRoute');if(chosen===3){p.setAttribute('d','');return;}const midx=(a.x+b.x)/2,midy=(a.y+b.y)/2 - Math.min(75,Math.abs(a.x-b.x)*.15+25);p.setAttribute('d',`M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${midx.toFixed(1)} ${midy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`)}
function renderImage(){const p=records[chosen],holder=$('memory-photo');holder.replaceChildren();const count=p.photos.length;
if(!count){const placeholder=document.createElement('div');placeholder.className='no-image';const circle=document.createElement('span');circle.className='outline';circle.textContent=p.name.slice(0,1)+'.';const note=document.createElement('p');note.textContent='YOUR PHOTOGRAPHS WILL LIVE HERE';placeholder.append(circle,note);holder.append(placeholder);}
else{const img=document.createElement('img');img.src=PHOTO_BASE+p.photos[imageNo];img.alt=`${p.name}에서 촬영한 사진 ${imageNo+1}`;img.loading='lazy';img.addEventListener('click',()=>{ $('lightbox-image').src=img.src;$('lightbox-image').alt=img.alt;$('photo-lightbox').classList.add('active');document.body.style.overflow='hidden'; });holder.append(img);}
$('memory-count').textContent=`PHOTO ARCHIVE / ${String(imageNo+1).padStart(2,'0')} OF ${String(count).padStart(2,'0')}`.replace('01 OF 00','00 OF 00');$('prev-photo').disabled=count<=1;$('next-photo').disabled=count<=1;}
function pick(i,move=false){chosen=i;imageNo=0;const p=records[i];$('place-number').textContent='/ '+String(i+1).padStart(2,'0');$('place-country').textContent=p.country;$('place-title').textContent=p.name+'.';$('memory-story').textContent=p.story;renderImage();updateRoute();document.querySelectorAll('[data-place]').forEach(b=>{const isSelected=Number(b.dataset.place)===i;b.classList.toggle('is-selected',isSelected);b.classList.toggle('selected',isSelected);b.setAttribute('aria-pressed',String(isSelected))});if(move&&window.matchMedia('(max-width:700px)').matches)document.querySelector('.memory-card').scrollIntoView({behavior:'smooth',block:'start'});}
function build(){const dots=$('map-dots'),index=$('index-view');records.forEach((p,i)=>{const dot=document.createElement('button');dot.type='button';dot.className='map-pin'+(p.photos.length?' featured':'');dot.style.left=((p.lon-94)/54*100)+'%';dot.style.top=((44-p.lat)/56*100)+'%';dot.dataset.place=i;dot.setAttribute('aria-label',`${p.name}, ${p.country}`);dot.title=p.name;const tip=document.createElement('span');tip.className='tooltip';tip.textContent=p.name;dot.append(tip);dot.addEventListener('click',()=>pick(i,true));dots.append(dot);
const row=document.createElement('button');row.type='button';row.className='index-btn';row.dataset.place=i;const number=document.createElement('span');number.className='num';number.textContent=String(i+1).padStart(2,'0');const title=document.createElement('span');title.className='place-name';title.textContent=p.name;const country=document.createElement('span');country.className='place-country';country.textContent=p.country;title.append(country);const arr=document.createElement('span');arr.textContent='↗';row.append(number,title,arr);row.addEventListener('click',()=>pick(i,true));index.append(row);});pick(2);}
function setTab(next){const isMap=next==='map';$('map-view').classList.toggle('hidden',!isMap);$('index-view').classList.toggle('hidden',isMap);$('tab-map').classList.toggle('active',isMap);$('tab-index').classList.toggle('active',!isMap);$('tab-map').setAttribute('aria-selected',String(isMap));$('tab-index').setAttribute('aria-selected',String(!isMap));}
$('tab-map').addEventListener('click',()=>setTab('map'));$('tab-index').addEventListener('click',()=>setTab('index'));
$('prev-photo').addEventListener('click',()=>{const n=records[chosen].photos.length;if(n){imageNo=(imageNo-1+n)%n;renderImage()}});
$('next-photo').addEventListener('click',()=>{const n=records[chosen].photos.length;if(n){imageNo=(imageNo+1)%n;renderImage()}});
function closeLightbox(){$('photo-lightbox').classList.remove('active');document.body.style.overflow='';}
$('close-lightbox').addEventListener('click',closeLightbox);$('photo-lightbox').addEventListener('click',e=>{if(e.target.id==='photo-lightbox')closeLightbox()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLightbox()});
build();
