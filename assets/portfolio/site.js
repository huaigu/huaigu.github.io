(() => {
  'use strict';
  const root = document.documentElement;
  const text = (english, chinese) => window.portfolioI18n?.pick(english, chinese) ?? english;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const control = document.getElementById('motion-toggle');
  let userPaused = false, paused = reduced.matches || document.hidden;
  function syncMotion() {
    paused = userPaused || reduced.matches || document.hidden;
    root.classList.toggle('motion-paused', paused);
    updateMotionLabel();
    document.dispatchEvent(new CustomEvent('portfolio:motion', {detail: {paused}}));
  }
  function updateMotionLabel() {
    if (!control) return;
    control.disabled = reduced.matches;
    control.setAttribute('aria-pressed', String(paused));
    control.setAttribute('aria-label', reduced.matches ? text('Reduced motion enabled', '已遵循减少动态效果的设置') : paused ? text('Play all animations', '播放所有动画') : text('Pause all animations', '暂停所有动画'));
    control.title = control.getAttribute('aria-label');
    control.firstElementChild.textContent = paused ? '▶' : 'Ⅱ';
  }
  control?.addEventListener('click', () => { userPaused = !userPaused; syncMotion(); });
  reduced.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  syncMotion();

  const canvas = document.getElementById('orbit-canvas');
  const host = document.getElementById('orbital');
  const context = canvas?.getContext('2d');
  const modes = {
    ai: {color: [55, 111, 73], title: 'Classify. Check. Route.', stack: 'Python · FastAPI · AI workflows', link: '#applied-ai', label: 'Explore the Laya examples', index: '01 / APPLIED AI'},
    privacy: {color: [114, 83, 157], title: 'Keep the choice encrypted.', stack: 'Solidity · Zama FHEVM · zkTLS', link: '#work', label: 'Explore privacy projects', index: '02 / PRIVATE COMPUTE'},
    play: {color: [184, 100, 52], title: 'Shared worlds. Live state.', stack: 'TypeScript · React · Multisynq', link: '#project-neon-snake', label: 'Explore multiplayer work', index: '03 / REAL-TIME SYSTEMS'}
  };
  const modeTextZh = {
    ai: {title: '识别意图，判断置信度，再分流。', stack: 'Python · FastAPI · AI 工作流', label: '查看 Laya 实战示例', index: '01 / AI 应用'},
    privacy: {title: '让选择留在密文里。', stack: 'Solidity · Zama FHEVM · zkTLS', label: '查看隐私计算项目', index: '02 / 隐私计算'},
    play: {title: '共享世界，实时同步。', stack: 'TypeScript · React · Multisynq', label: '查看多人游戏项目', index: '03 / 实时系统'}
  };
  const modeButtons = [...document.querySelectorAll('[data-skill-mode]')];
  let mode = 'ai';
  const count = 288, shapes = {ai: [], privacy: [], play: []}, graphCenters = [];
  // Conceptual diagrams of project themes, not live activity or skill ratings.
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 6; row++) graphCenters.push({x: -.85 + column * .565, y: -.68 + row * .272, z: 0});
  }
  for (let i = 0; i < count; i++) {
    const y = 1 - i / (count - 1) * 2, r = Math.sqrt(1 - y * y), t = i * Math.PI * (3 - Math.sqrt(5));
    shapes.play.push({x: Math.cos(t) * r, y, z: Math.sin(t) * r});
    const u = (i % 48) / 48 * Math.PI * 2, v = Math.floor(i / 48) / 6 * Math.PI * 2;
    shapes.privacy.push({x: (.76 + .24 * Math.cos(v)) * Math.cos(u), y: (.76 + .24 * Math.cos(v)) * Math.sin(u), z: .24 * Math.sin(v)});
    const center = graphCenters[Math.floor(i / 12)], a = (i % 12) / 12 * Math.PI * 2;
    shapes.ai.push({x: center.x + Math.cos(a) * .055, y: center.y + Math.sin(a) * .055, z: Math.sin(a * 2) * .025});
  }
  let points = shapes.ai.map(p => ({...p})), color = [...modes.ai.color];
  let width = 1, height = 1, frame = null, phase = .65, previous = 0, inView = true;
  let pointerX = 0, pointerY = 0, smoothX = 0, smoothY = 0, graphAlpha = 1;
  function snapShape() {
    points = shapes[mode].map(p => ({...p})); color = [...modes[mode].color]; graphAlpha = mode === 'ai' ? 1 : 0;
  }
  function project(p) {
    const rotation = mode === 'ai' ? Math.sin(phase * .6) * .08 : phase * .45;
    const angle = rotation + smoothX, tilt = (mode === 'privacy' ? .60 : -.12) + smoothY;
    const x = p.x * Math.cos(angle) + p.z * Math.sin(angle), z = -p.x * Math.sin(angle) + p.z * Math.cos(angle);
    const py = p.y * Math.cos(tilt) - z * Math.sin(tilt), pz = p.y * Math.sin(tilt) + z * Math.cos(tilt);
    const radius = Math.min(width * .31, height * .37);
    return {x: width / 2 + x * radius * (1 + pz * .08), y: height / 2 + py * radius * (1 + pz * .08), z: pz};
  }
  function draw() {
    if (!context) return;
    const c = context, rgb = color.map(Math.round).join(',');
    const centerX = width / 2, centerY = height / 2, radius = Math.min(width * .31, height * .37);
    c.clearRect(0, 0, width, height);
    c.strokeStyle = `rgba(${rgb},.10)`; c.lineWidth = .6;
    for (let j = -2; j <= 2; j++) {
      const offset = j * radius * .55;
      c.beginPath(); c.moveTo(centerX + offset, centerY - radius * 1.25); c.lineTo(centerX + offset, centerY + radius * 1.25); c.stroke();
      c.beginPath(); c.moveTo(centerX - radius * 1.25, centerY + offset); c.lineTo(centerX + radius * 1.25, centerY + offset); c.stroke();
    }
    c.strokeStyle = `rgba(${rgb},.18)`;
    c.beginPath(); c.ellipse(centerX, centerY, radius * 1.29, radius * .87, -.36, 0, Math.PI * 2); c.stroke();
    if (graphAlpha > .01) {
      for (let column = 0; column < 3; column++) {
        for (let row = 0; row < 6; row++) {
          const a = project(graphCenters[column * 6 + row]);
          for (let delta = 0; delta <= 1; delta++) {
            const b = project(graphCenters[(column + 1) * 6 + (row + delta) % 6]);
            c.strokeStyle = `rgba(${rgb},${graphAlpha * .22})`; c.lineWidth = .75;
            c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
            if (delta === 0) {
              const progress = (phase * .34 + row * .13 - column * .24 + 10) % 1;
              c.fillStyle = `rgba(${rgb},${graphAlpha * .82})`;
              c.beginPath(); c.arc(a.x + (b.x-a.x) * progress, a.y + (b.y-a.y) * progress, 2.2, 0, Math.PI * 2); c.fill();
            }
          }
        }
      }
    }
    points.map(project).sort((a, b) => a.z-b.z).forEach(p => {
      const depth = (p.z + 1) / 2;
      c.fillStyle = `rgba(${rgb},${.24 + depth * .63})`;
      c.beginPath(); c.arc(p.x, p.y, 1.1 + depth * 1.05, 0, Math.PI * 2); c.fill();
    });
    const orbitTime = phase * .55, ox = Math.cos(orbitTime) * radius * 1.29, oy = Math.sin(orbitTime) * radius * .87;
    const px = centerX + ox * Math.cos(-.36) - oy * Math.sin(-.36), py = centerY + ox * Math.sin(-.36) + oy * Math.cos(-.36);
    c.strokeStyle = `rgba(${rgb},.35)`; c.fillStyle = `rgb(${rgb})`;
    c.beginPath(); c.arc(px, py, 7, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(px, py, 2.5, 0, Math.PI * 2); c.fill();
  }
  function animate(time) {
    frame = null;
    if (paused || !inView) return;
    const dt = Math.min(time - previous || 16, 48); previous = time;
    const blend = 1 - Math.exp(-dt / 160);
    phase += dt * .0006;
    smoothX += (pointerX - smoothX) * blend * .35; smoothY += (pointerY - smoothY) * blend * .35;
    points.forEach((p, i) => { const target = shapes[mode][i]; p.x += (target.x-p.x)*blend; p.y += (target.y-p.y)*blend; p.z += (target.z-p.z)*blend; });
    color.forEach((v, i) => { color[i] += (modes[mode].color[i]-v)*blend; });
    graphAlpha += ((mode === 'ai' ? 1 : 0)-graphAlpha)*blend;
    draw(); frame = requestAnimationFrame(animate);
  }
  function requestDraw() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null; previous = 0; draw();
    if (context && !paused && inView) frame = requestAnimationFrame(animate);
  }
  function selectMode(next) {
    if (!modes[next]) return;
    mode = next;
    const data = modes[next];
    host.dataset.mode = next; host.style.setProperty('--lab-accent', `rgb(${data.color.join(',')})`);
    modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.skillMode === next)));
    renderModeText();
    if (paused) snapShape();
    requestDraw();
  }
  function renderModeText() {
    const data = modes[mode], chinese = modeTextZh[mode];
    document.getElementById('orbit-caption').textContent = text(data.title, chinese.title);
    document.getElementById('skill-stack').textContent = text(data.stack, chinese.stack);
    document.getElementById('skill-index').textContent = text(data.index, chinese.index);
    const link = document.getElementById('skill-project-link');
    link.href = data.link;
    link.textContent = text(data.label, chinese.label);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0); draw();
  }
  if (host) {
    modeButtons.forEach(button => button.addEventListener('click', () => selectMode(button.dataset.skillMode)));
    selectMode('ai');
  }
  if (canvas && host && context) {
    host.classList.add('canvas-ready');
    host.addEventListener('pointermove', event => {
      if (paused || event.pointerType === 'touch') return;
      const rect = canvas.getBoundingClientRect();
      pointerX = Math.max(-.22, Math.min(.22, ((event.clientX-rect.left)/width-.5)*.44));
      pointerY = Math.max(-.16, Math.min(.16, ((event.clientY-rect.top)/height-.5)*.32));
    });
    host.addEventListener('pointerleave', () => { pointerX = 0; pointerY = 0; });
    document.addEventListener('portfolio:motion', () => { if (paused) snapShape(); requestDraw(); });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize, {passive: true});
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => { inView = entries[0].isIntersecting; requestDraw(); }, {threshold: .01}).observe(host);
    resize(); requestDraw();
  }
  const progress = document.querySelector('.reading-progress');
  let scrollFrame = null;
  function updateProgress() {
    scrollFrame = null;
    const max = root.scrollHeight - innerHeight;
    if (progress) progress.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, scrollY/max)) : 0})`;
  }
  window.addEventListener('scroll', () => { if (scrollFrame === null) scrollFrame = requestAnimationFrame(updateProgress); }, {passive: true});
  window.addEventListener('resize', updateProgress, {passive: true});
  updateProgress();
  document.addEventListener('portfolio:language', () => {
    updateMotionLabel();
    if (host) renderModeText();
    updateProgress();
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable) {
      const search = document.getElementById('repo-search');
      if (search) { event.preventDefault(); search.scrollIntoView({block:'center', behavior:paused?'instant':'smooth'}); search.focus({preventScroll:true}); }
    }
  });
})();
