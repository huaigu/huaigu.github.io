(() => {
  'use strict';
  const canvas = document.getElementById('orbit-canvas');
  const host = document.getElementById('orbital');
  const control = document.getElementById('motion-toggle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const context = canvas?.getContext('2d');
  if (canvas && host && context && control) {
    host.classList.add('canvas-ready');
    let width = 1, height = 1, frame = null, phase = 0.55;
    let pointerX = 0, pointerY = 0, smoothX = 0, smoothY = 0;
    let paused = reduced.matches, inView = true, previous = 0;
    const points = [];
    // Fibonacci sphere: evenly distributed points without random dependencies.
    for (let i = 0; i < 860; i++) {
      const y = 1 - (i / 859) * 2;
      const r = Math.sqrt(1 - y * y);
      const t = i * Math.PI * (3 - Math.sqrt(5));
      points.push({x: Math.cos(t) * r, y, z: Math.sin(t) * r});
    }
    function rotate(p, angle, tilt) {
      const x = p.x * Math.cos(angle) + p.z * Math.sin(angle);
      const z = -p.x * Math.sin(angle) + p.z * Math.cos(angle);
      return {x, y: p.y * Math.cos(tilt) - z * Math.sin(tilt), z: p.y * Math.sin(tilt) + z * Math.cos(tilt)};
    }
    function draw() {
      const c = context, cx = width * .51, cy = height * .475, radius = Math.min(width * .315, height * .342);
      c.clearRect(0, 0, width, height);
      c.strokeStyle = '#72886126'; c.lineWidth = .6;
      c.beginPath(); c.moveTo(cx, 50); c.lineTo(cx, height - 75); c.moveTo(25, cy); c.lineTo(width - 25, cy); c.stroke();
      const glow = c.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.25);
      glow.addColorStop(0, '#7fa85413'); glow.addColorStop(1, '#7fa85400'); c.fillStyle = glow;
      c.beginPath(); c.arc(cx, cy, radius * 1.25, 0, Math.PI * 2); c.fill();
      const angle = phase + smoothX, tilt = -.18 + smoothY;
      const projected = points.map(p => rotate(p, angle, tilt)).sort((a,b) => a.z - b.z);
      for (const p of projected) {
        const depth = (p.z + 1) * .5;
        const scale = 1 + p.z * .065;
        c.fillStyle = `rgba(49,97,63,${.09 + depth * .72})`;
        c.beginPath(); c.arc(cx + p.x * radius * scale, cy + p.y * radius * scale, .55 + depth * .85, 0, Math.PI * 2); c.fill();
      }
      // Orbit lines add depth while remaining purely decorative.
      const rings = [{tilt: .88, rot: -.5, size:1.38}, {tilt: .35, rot:1.02, size:1.22}];
      rings.forEach((ring, index) => {
        c.beginPath();
        for(let i=0;i<=160;i++) {
          const t=i/160*Math.PI*2;
          const x=Math.cos(t)*radius*ring.size, y=Math.sin(t)*radius*ring.tilt;
          const px=cx+x*Math.cos(ring.rot)-y*Math.sin(ring.rot), py=cy+x*Math.sin(ring.rot)+y*Math.cos(ring.rot);
          if(i===0)c.moveTo(px,py);else c.lineTo(px,py);
        }
        c.strokeStyle=index===0?'#63855188':'#63855144';c.lineWidth=.65;c.stroke();
        const t = phase * (.75 + index * .3) + index * 3;
        const x = Math.cos(t)*radius*ring.size, y = Math.sin(t)*radius*ring.tilt;
        const px=cx+x*Math.cos(ring.rot)-y*Math.sin(ring.rot), py=cy+x*Math.sin(ring.rot)+y*Math.cos(ring.rot);
        c.beginPath(); c.arc(px,py,4,0,Math.PI*2);c.fillStyle='#3b7048';c.fill();
        c.beginPath();c.arc(px,py,8,0,Math.PI*2);c.strokeStyle='#628b5140';c.stroke();
      });
      c.fillStyle='#67805b'; c.font='8px monospace';c.fillText('+',cx-2,cy+3);
    }
    function animate(time) {
      frame = null;
      if(paused || document.hidden || !inView)return;
      const dt = Math.min(time - previous || 16, 50);previous=time;
      phase += dt * .000085;
      smoothX += (pointerX - smoothX) * .025; smoothY += (pointerY - smoothY) * .025;
      draw();frame=requestAnimationFrame(animate);
    }
    function sync() {
      if(frame!==null){cancelAnimationFrame(frame);frame=null;}
      previous=0;
      control.setAttribute('aria-label',paused?'Play animation':'Pause animation');
      control.setAttribute('aria-pressed',String(paused));
      control.firstElementChild.textContent=paused?'▶':'Ⅱ';
      draw();
      if(!paused && !document.hidden && inView)frame=requestAnimationFrame(animate);
    }
    function resize() {
      const rect=host.getBoundingClientRect();width=rect.width;height=rect.height;
      const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      context.setTransform(dpr,0,0,dpr,0,0);draw();
    }
    control.addEventListener('click',()=>{paused=!paused;sync();});
    host.addEventListener('pointermove',event=>{if(reduced.matches||paused)return;const rect=host.getBoundingClientRect();pointerX=((event.clientX-rect.left)/width-.5)*.5;pointerY=((event.clientY-rect.top)/height-.5)*.3;});
    host.addEventListener('pointerleave',()=>{pointerX=0;pointerY=0;});
    reduced.addEventListener('change',event=>{paused=event.matches;sync();});
    document.addEventListener('visibilitychange',sync);
    new ResizeObserver(resize).observe(host);
    new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;sync();},{threshold:.01}).observe(host);
    resize();sync();
  }
  document.addEventListener('keydown',event=>{
    if(event.key==='/'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'')&&!document.activeElement?.isContentEditable){
      const search=document.getElementById('repo-search');if(search){event.preventDefault();search.scrollIntoView({block:'center',behavior:reduced.matches?'instant':'smooth'});search.focus({preventScroll:true});}
    }
  });
})();
