'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const URL = 'https://htrjenmikgelxpxvbqoi.supabase.co';
  const PUBLIC_KEY = 'sb_publishable_b8ENqHES92hlVM7WYl-cEg_IvOxM3Jy';
  let state={posts:[],tips:[]}, filter='all', authenticated=false;
  let session=null, epoch=0, refreshing=null, loading=false, loaded=false;
  function notify(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').hidden=true,6500);}
  async function request(path,{method='GET',body,token,representation=false}={}){
    const headers={apikey:PUBLIC_KEY};
    if(token)headers.Authorization='Bearer '+token;
    if(body!==undefined)headers['Content-Type']='application/json';
    if(representation)headers.Prefer='return=representation';
    const response=await fetch(URL+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok){const err=new Error(response.status===401?'Please log in again.':response.status===403?'Your account does not have editor access.':'Could not connect. Please try again.');err.status=response.status;throw err;}
    const text=await response.text();return text?JSON.parse(text):null;
  }
  async function token(){
    if(!session)throw Error('Please log in again.');
    if(session.expires_at>Date.now()+60000)return session.access_token;
    if(!refreshing){const version=epoch;refreshing=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(data=>{if(version!==epoch)throw Error('Please log in again.');session={...data,expires_at:Date.now()+data.expires_in*1000};return session.access_token;}).finally(()=>refreshing=null);}
    return refreshing;
  }
  async function adminRequest(path,options={}){return request('/rest/v1/'+path,{...options,token:await token()});}
  async function loadFeed(){
    if(loading)return;loading=true;
    try{const posts=await request('/rest/v1/posts?select=*&published=eq.true&order=date.desc');state.posts=posts;loaded=true;render();$('#feed-status').textContent='';$('#retry-feed').hidden=true;
      const reader=$('#story-dialog');if(reader.open){const updated=posts.find(p=>p.id===reader.dataset.postId);if(!updated)reader.close();}
    }catch{$('#feed-status').textContent=loaded?'Updates are unavailable. These stories may be out of date.':'Stories are unavailable right now. Please try again shortly.';$('#retry-feed').hidden=false;}
    finally{loading=false;}
  }
  $('#retry-feed').addEventListener('click',loadFeed);
  function element(tag, cls, text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
  const date = value => new Date(value).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase();
  function metadata(post){const meta=element('div','post-meta');meta.append(element('span','category',post.category.toUpperCase()),element('span','',date(post.date)));return meta;}
  function render(){const list=$('#post-list');list.replaceChildren();const posts=state.posts.filter(p=>p.published&&(filter==='all'||(filter==='featured'?p.featured:p.category===filter)));$('#filter-label').textContent=filter==='style'?'GOOD TASTE. BAD INTENTIONS.':filter==='featured'?'THE STORIES EVERYONE IS TALKING ABOUT.':'THE CITY TALKS. WE LISTEN.';$('#post-count').textContent=String(posts.length).padStart(2,'0')+' STORIES';$('#feed-title').textContent=filter==='style'?'the style edit':filter==='featured'?'à la une':'latest spotted';document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));posts.forEach((post,i)=>{const card=element('article','post');card.append(metadata(post),element('h3','',post.title),element('p','',post.preview));const button=element('button','read',"Lire l’histoire →");button.addEventListener('click',()=>openStory(post));card.append(button);list.append(card);});if(!posts.length)list.append(element('p','post','The city is keeping quiet. Check back soon.'));}
  function openStory(post){$('#story-dialog').dataset.postId=post.id;const body=$('#story-body');body.replaceChildren(metadata(post));const title=element('h2','',post.title);title.id='story-title';body.append(title,element('div','story-content',post.content));$('#story-dialog').showModal();}
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;render();$('#posts').scrollIntoView({behavior:'smooth'});}));
  document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.action==='tips'){$('#tip-status').textContent='';$('#tip-dialog').showModal();}else{filter='all';render();window.scrollTo({top:0,behavior:'smooth'});}}));
  document.querySelectorAll('dialog').forEach(dialog=>{dialog.querySelector('.close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});});
  $('#tip-form').addEventListener('submit',async event=>{
    event.preventDefault();const content=$('#tip-text').value.trim(),button=event.submitter;
    if(!content){$('#tip-status').textContent='A secret needs a few words.';return;}
    button.disabled=true;$('#tip-status').textContent='Sending…';
    try{await request('/rest/v1/tips',{method:'POST',body:{content}});$('#tip-form').reset();$('#tip-status').textContent='Received. Your tip is in the editor’s private inbox.';if(authenticated)await refreshAdmin();}
    catch{$('#tip-status').textContent='We couldn’t confirm delivery. Your message is still here; please try again.';}finally{button.disabled=false;}
  });
  function showAdmin(){if(!$('#admin-dialog').open){$('#login-status').textContent='';$('#admin-dialog').showModal();}}
  function route(){if(location.hash==='#admin')showAdmin();}window.addEventListener('hashchange',route);
  function lock(){const old=session;epoch++;session=null;authenticated=false;$('#login-form').reset();$('#login-form').hidden=false;$('#admin-panel').hidden=true;$('#admin-posts').replaceChildren();$('#admin-tips').replaceChildren();state.tips=[];
    if(old)request('/auth/v1/logout?scope=local',{method:'POST',token:old.access_token}).catch(()=>{});
  }
  $('#admin-dialog').addEventListener('close',()=>{lock();if(location.hash==='#admin')history.replaceState(null,'',location.pathname+location.search);});
  $('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('#login-button'),version=epoch;button.disabled=true;$('#login-status').textContent='Signing in…';
    try{const data=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:$('#email').value.trim(),password:$('#password').value}});
      if(version!==epoch)return;
      session={...data,expires_at:Date.now()+data.expires_in*1000};
      const membership=await adminRequest('editors?select=user_id&user_id=eq.'+encodeURIComponent(data.user.id));
      if(version!==epoch)return;
      if(!membership.length)throw Error('This account has not been given editor access.');
      authenticated=true;$('#login-form').hidden=true;$('#admin-panel').hidden=false;$('#password').value='';await refreshAdmin();
    }catch(error){if(version===epoch){lock();$('#login-status').textContent=error.status===400?'Email or password not recognised.':error.message;}}finally{button.disabled=false;}
  });
  $('#logout').addEventListener('click',()=>$('#admin-dialog').close());
  $('#post-form').addEventListener('submit',async event=>{
    event.preventDefault();if(!authenticated)return;const title=$('#title').value.trim(),content=$('#content').value.trim(),button=event.submitter;
    if(!title||!content){$('#admin-status').textContent='Add a title and story first.';return;}
    button.disabled=true;
    try{await adminRequest('posts',{method:'POST',body:{category:$('#category').value,title,content,preview:content.slice(0,170)+(content.length>170?'…':''),featured:$('#featured').checked,published:false},representation:true});$('#post-form').reset();$('#admin-status').textContent='Draft saved online. Publish it below when ready.';await refreshAdmin();}
    catch(error){$('#admin-status').textContent=error.message;}finally{button.disabled=false;}
  });
  async function refreshAdmin(){if(!authenticated)return;const version=epoch;try{const [posts,tips]=await Promise.all([adminRequest('posts?select=*&order=date.desc'),adminRequest('tips?select=*&order=date.desc')]);if(version!==epoch||!authenticated)return;state.tips=tips;renderAdmin(posts,tips);}catch(error){if(version===epoch)notify(error.message);}}
  function action(label,run){const button=element('button','',label);button.type='button';button.addEventListener('click',async()=>{if(!authenticated)return;button.disabled=true;try{await run();}catch(error){notify(error.message);}finally{button.disabled=false;}});return button;}
  async function mutate(table,id,method,body){const result=await adminRequest(table+'?id=eq.'+encodeURIComponent(id),{method,body,representation:true});if(!result?.length)throw Error('That item was already removed or your access changed.');await Promise.all([loadFeed(),refreshAdmin()]);}
  function renderAdmin(posts,tips){
    const postList=$('#admin-posts'),tipList=$('#admin-tips');postList.replaceChildren();tipList.replaceChildren();
    posts.forEach(post=>{const row=element('div','admin-row');row.append(element('strong','',post.title),element('small','',post.category+' · '+(post.published?'Published':'Draft')),action(post.published?'Unpublish':'Publish',()=>mutate('posts',post.id,'PATCH',{published:!post.published})),action('Delete',async()=>{if(confirm('Delete this story for everyone?'))await mutate('posts',post.id,'DELETE');}));postList.append(row);});
    tips.forEach(tip=>{const row=element('div','admin-row');row.append(element('small','',date(tip.date)),element('p','',tip.content),action('Delete tip',async()=>{if(confirm('Delete this tip permanently?'))await mutate('tips',tip.id,'DELETE');}));tipList.append(row);});
    if(!tips.length)tipList.append(element('p','fine','No tips yet. New submissions will appear here.'));
    if(!posts.length)postList.append(element('p','fine','No stories yet. Write your first draft above.'));
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadFeed();if(authenticated)refreshAdmin();}});
  setInterval(()=>{if(!document.hidden){loadFeed();if(authenticated)refreshAdmin();}},15000);
  loadFeed();route();
})();
