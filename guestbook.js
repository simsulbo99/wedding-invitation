'use strict';
/* Public guestbook: form POST for saving, JSONP for reading/polling (Apps Script web app). */
(() => {
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxA-3GbJJUwdm29d6geRqgsDdguOpM77I2BppnPdCeOTFoRdq8tROKOO2GwQEvwzHs2NQ/exec';
  const form = document.getElementById('guestbook-form');
  const list = document.getElementById('guestbook-list');
  if (!form || !list) return;
  const input = document.getElementById('guestbook-photo');
  const submit = document.getElementById('guestbook-submit');
  const status = document.getElementById('guestbook-status');
  const more = document.getElementById('guestbook-more');
  const empty = document.getElementById('guestbook-empty');
  const galleryStatus = document.getElementById('guestbook-gallery-status');
  const photoError = document.getElementById('guestbook-photo-error');
  const honeypot = document.getElementById('guestbook-website');
  const PAGE_SIZE = 12;
  let offset = 0, busy = false, listing = false;

  const randomHex = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2,'0')).join('');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function notice(text, error=false) {
    status.textContent=text; status.classList.toggle('is-error', error);
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  function jsonp(action, args={}) {
    return new Promise((resolve, reject) => {
      const cb = 'guestbookCallback_' + randomHex(8);
      const script = document.createElement('script');
      let finished=false;
      const timer=setTimeout(()=>finish(new Error('응답 시간 초과')), 9000);
      function finish(err,data) {
        if(finished)return;finished=true;clearTimeout(timer);delete window[cb];script.remove();
        err?reject(err):resolve(data);
      }
      window[cb]=d=>finish(null,d);
      script.onerror=()=>finish(new Error('방명록 서버에 연결할 수 없습니다.'));
      const u=new URL(ENDPOINT);
      u.searchParams.set('action', action);
      u.searchParams.set('callback', cb);
      Object.entries(args).forEach(([k,v])=>u.searchParams.set(k, String(v)));
      u.searchParams.set('_', String(Date.now()));
      script.src=u.href;document.head.appendChild(script);
    });
  }
  function postHidden(data) {
    const frame=document.createElement('iframe');
    frame.name='guestbook-target-'+randomHex(8);frame.hidden=true;frame.setAttribute('aria-hidden','true');
    document.body.appendChild(frame);
    const f=document.createElement('form');f.method='POST';f.action=ENDPOINT;f.target=frame.name;f.hidden=true;
    Object.entries(data).forEach(([k,v])=>{
      const el=document.createElement('input');el.type='hidden';el.name=k;el.value=String(v);f.appendChild(el);
    });
    document.body.appendChild(f);f.submit();
    setTimeout(()=>{f.remove();frame.remove();},45000);
  }
  async function imageAsJpeg(file) {
    if (!file) return '';
    if (file.size > 10*1024*1024) throw new Error('10MB 이하의 사진만 첨부할 수 있습니다.');
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) throw new Error('사진 파일을 선택해주세요.');
    let bitmap;
    try {bitmap=await createImageBitmap(file);} catch(_){ throw new Error('이 사진 형식을 브라우저에서 처리할 수 없습니다. JPG 또는 PNG로 다시 선택해주세요.'); }
    const scale=Math.min(1,1440/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    bitmap.close?.();
    let quality=.78;
    let jpeg=canvas.toDataURL('image/jpeg',quality);
    while(jpeg.length > 1200000 && quality > .42) { quality-=.1; jpeg=canvas.toDataURL('image/jpeg',quality); }
    if(jpeg.length > 1200000) throw new Error('사진을 충분히 압축하지 못했습니다. 더 작은 사진을 선택해주세요.');
    return jpeg.substring(jpeg.indexOf(',')+1);
  }
  function tile(item) {
    const article=document.createElement('article');article.className='guestbook-entry';
    if(item.photoId && /^[a-zA-Z0-9_-]{10,}$/.test(item.photoId)) {
      const a=document.createElement('a');a.className='guestbook-entry-photo';
      a.href='https://drive.google.com/file/d/'+encodeURIComponent(item.photoId)+'/view';
      a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',item.name+'님이 올린 사진 보기');
      const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.alt='방명록에 첨부된 사진';
      img.src='https://drive.google.com/thumbnail?id='+encodeURIComponent(item.photoId)+'&sz=w960';
      img.onerror=()=>{a.remove();};a.appendChild(img);article.appendChild(a);
    }
    const body=document.createElement('div');body.className='guestbook-entry-body';
    const p=document.createElement('p');p.className='guestbook-entry-message';p.textContent=item.message || '';
    const foot=document.createElement('div');foot.className='guestbook-entry-foot';
    const name=document.createElement('span');name.textContent='FROM / '+(item.name || '하객');
    const date=document.createElement('time');date.textContent=item.date || '';
    foot.append(name,date);body.append(p,foot);article.append(body);return article;
  }
  async function load(reset=false) {
    if(listing)return;listing=true;more.disabled=true;galleryStatus.textContent='메시지를 불러오는 중입니다…';
    try {
      const start=reset?0:offset;
      const data=await jsonp('guestbook_list',{offset:start,limit:PAGE_SIZE});
      if(!data || !data.ok || !Array.isArray(data.items))throw new Error('목록 데이터가 올바르지 않습니다.');
      if(reset){list.replaceChildren();offset=0;}
      data.items.forEach(item=>list.appendChild(tile(item)));
      offset+=data.items.length;
      more.hidden=!data.hasMore;
      empty.hidden=offset!==0;
      galleryStatus.textContent='';
    }catch(err){galleryStatus.textContent='방명록을 불러오지 못했어요. 다시 시도해주세요.';more.hidden=false;}
    finally{listing=false;more.disabled=false;}
  }
  more.addEventListener('click',()=>load(false));
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!form.reportValidity())return;
    if(honeypot.value)return;
    const name=form.elements.name.value.trim();
    const message=form.elements.message.value.trim();
    if(!name||name.length>40||!message||message.length>500){notice('이름과 메시지를 확인해주세요.',true);return;}
    const requestId=randomHex(16), postId=randomHex(16);
    busy=true;submit.disabled=true;notice('사진을 준비하고 있어요…');
    try {
      if(!form.elements.publicConsent.checked)throw new Error('공개 동의가 필요합니다.');
      const imageBase64=await imageAsJpeg(input.files?.[0]);
      notice('방명록을 저장하고 있어요…');
      postHidden({action:'guestbook_save',requestId,postId,name,message,imageBase64,consent:'yes',website:''});
      let stored=false;
      for(let n=0;n<12;n++) {
        await sleep(n===0?1500:1100);
        try {const result=await jsonp('guestbook_status',{requestId,postId});if(result?.saved===true){stored=true;break;}}catch(_){}
      }
      if(!stored)throw new Error('저장 여부를 확인하지 못했습니다. 새로 제출하기 전에 잠시 후 목록을 확인해주세요.');
      notice('축하 메시지가 등록되었습니다. 감사합니다!');
      form.reset();input.dispatchEvent(new Event('change'));
      await load(true);
    }catch(err){notice(err.message || '저장에 실패했습니다. 다시 시도해주세요.',true);}
    finally{busy=false;submit.disabled=false;}
  });
  load(true);
})();
