// ============================================================
// hero.js — 首页背景层动效
// 用途：1) 微尘粒子（Canvas 2D，对象池复用，不产生 GC 抖动）
//      2) 跟随指针的暖光（只用 transform，不触发重排）
// 依赖：无。与 site.css 的 .bg__dust / .bg__cursor 对应。
// 修改方式：粒子数量看 DUST_BY_WIDTH，颜色看 COLORS；
//          性能不够就把 DUST 上限往下调，其余不用动。
// ============================================================

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 1. 微尘粒子 ---------------- */

  const canvas = document.getElementById('dust');
  if (canvas && !reduceMotion) {
    const ctx = canvas.getContext('2d', { alpha: true });
    const COLORS = ['255, 217, 160', '255, 179, 71', '255, 240, 194'];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let width = 0;
    let height = 0;
    let particles = [];
    let bubbles = [];
    let rafId = 0;
    let running = true;
    let pointerX = -9999;
    let pointerY = -9999;

    /** 按视口宽度决定粒子预算：低端设备/窄屏自动降量 */
    const budget = () => {
      const w = window.innerWidth;
      if (w < 560) return 34;
      if (w < 900) return 58;
      return 92;
    };

    /** 糖泡：比微尘大、比微尘慢，从地面往上浮，是“糖泡当武器”的那点世界观 */
    const bubbleBudget = () => (window.innerWidth < 720 ? 6 : 12);

    const spawnBubble = (b, initial) => {
      b.depth = 0.5 + Math.random() * 0.5;
      b.x = Math.random() * width;
      b.y = initial ? Math.random() * height : height + 40;
      b.r = (8 + Math.random() * 16) * b.depth;
      b.vy = -(0.12 + Math.random() * 0.22) * b.depth;
      b.wobble = 0.5 + Math.random() * 1.4;
      b.phase = Math.random() * Math.PI * 2;
      b.a = 0.22 + Math.random() * 0.26;
      return b;
    };

    /** 对象池：复用同一个粒子对象，避免每帧 new */
    const spawn = (p, initial) => {
      // 景深：0.4 远 / 0.7 中 / 1 近。越近越大、越快、越亮
      p.depth = [0.4, 0.7, 1][(Math.random() * 3) | 0];
      p.x = Math.random() * width;
      p.y = initial ? Math.random() * height : height + 12;
      p.r = (0.45 + Math.random() * 1.6) * p.depth;
      p.vy = -(0.05 + Math.random() * 0.26) * p.depth;
      p.vx = (Math.random() - 0.5) * 0.1 * p.depth;
      p.a = (0.08 + Math.random() * 0.3) * (0.45 + 0.55 * p.depth);
      p.phase = Math.random() * Math.PI * 2;
      p.color = COLORS[(Math.random() * COLORS.length) | 0];
      return p;
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = budget();
      if (particles.length > target) {
        particles.length = target;
      } else {
        while (particles.length < target) particles.push(spawn({}, true));
      }

      const bubbleTarget = bubbleBudget();
      if (bubbles.length > bubbleTarget) {
        bubbles.length = bubbleTarget;
      } else {
        while (bubbles.length < bubbleTarget) bubbles.push(spawnBubble({}, true));
      }
    };

    const frame = (now) => {
      rafId = 0;
      if (!running) return;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.y += p.vy;
        p.x += p.vx;
        p.phase += 0.008 * (0.5 + p.depth);

        // 指针推开微尘：近处粒子被推得更远，制造“有人经过”的扰动
        const dx = p.x - pointerX;
        const dy = p.y - pointerY;
        if (dx * dx + dy * dy < 16900) {
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const push = (1 - d / 130) * 0.9 * p.depth;
          p.x += (dx / d) * push;
          p.y += (dy / d) * push;
        }

        if (p.y < -14 || p.x < -14 || p.x > width + 14) spawn(p, false);

        // 呼吸透明度：让颗粒自己闪，而不是统一闪烁
        const alpha = p.a * (0.62 + 0.38 * Math.sin(p.phase));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + p.color + ',' + Math.max(alpha, 0).toFixed(3) + ')';
        ctx.fill();
      }

      // 糖泡：先画泡再画微尘，泡在尘后面，像“雾里的光点”
      for (let i = 0; i < bubbles.length; i += 1) {
        const b = bubbles[i];
        b.y += b.vy;
        b.phase += 0.006 * b.wobble;
        const bx = b.x + Math.sin(b.phase) * 14 * b.depth;

        if (b.y < -60) spawnBubble(b, false);

        const breathe = 0.55 + 0.45 * Math.sin(b.phase * 1.3);
        const alpha = b.a * breathe;
        // 外发光：只在 12 个泡上开销可接受，让泡像“糖壳里的灯”
        ctx.shadowColor = 'rgba(255, 179, 71, ' + (alpha * 0.9).toFixed(3) + ')';
        ctx.shadowBlur = b.r * 2.2;
        const g = ctx.createRadialGradient(bx, b.y, 0, bx, b.y, b.r);
        g.addColorStop(0, 'rgba(255, 240, 194, ' + (alpha * 1.5).toFixed(3) + ')');
        g.addColorStop(0.45, 'rgba(255, 179, 71, ' + alpha.toFixed(3) + ')');
        g.addColorStop(0.86, 'rgba(201, 112, 26, ' + (alpha * 0.75).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(201, 112, 26, 0)');
        ctx.beginPath();
        ctx.arc(bx, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        // 高光点：让泡有“糖壳”的反光
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(bx - b.r * 0.32, b.y - b.r * 0.34, b.r * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 246, 223, ' + (alpha * 2.2).toFixed(3) + ')';
        ctx.fill();
      }

      rafId = requestAnimationFrame(frame);
    };

    const start = () => {
      if (!rafId) rafId = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    resize();
    start();

    window.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    }, { passive: true });

    window.addEventListener('pointerleave', () => {
      pointerX = -9999;
      pointerY = -9999;
    }, { passive: true });

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 180);
    }, { passive: true });

    // 页面不可见时停帧，回来再续，省电也省 GPU
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) start();
      else stop();
    });
  }

  /* ---------------- 2. 指针暖光 ---------------- */

  const light = document.getElementById('cursorLight');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (light && finePointer && !reduceMotion) {
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let targetX = x;
    let targetY = y;
    let lerpId = 0;

    const render = () => {
      // 缓动跟随：比 1:1 跟手更有重量感
      x += (targetX - x) * 0.12;
      y += (targetY - y) * 0.12;
      light.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';

      if (Math.abs(targetX - x) > 0.4 || Math.abs(targetY - y) > 0.4) {
        lerpId = requestAnimationFrame(render);
      } else {
        lerpId = 0;
      }
    };

    const wake = () => {
      if (!lerpId) lerpId = requestAnimationFrame(render);
    };

    window.addEventListener('pointermove', (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!light.classList.contains('is-on')) light.classList.add('is-on');
      wake();
    }, { passive: true });

    window.addEventListener('pointerleave', () => light.classList.remove('is-on'), { passive: true });
  }

  /* ---------------- 3. 滚动视差 + 下半屏入场 ---------------- */

  const heroInner = document.querySelector('.hero__inner');
  if (heroInner && !reduceMotion) {
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      // 首屏文字上移得比滚动慢，滚动一段后淡出，形成“退场”而不是被切掉
      heroInner.style.transform = 'translate3d(0,' + (y * 0.12).toFixed(1) + 'px,0)';
      heroInner.style.opacity = (1 - Math.min(y / 620, 1) * 0.85).toFixed(3);
    };

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
  }

  const chapter = document.querySelector('.chapter__inner');
  if (chapter) {
    if ('IntersectionObserver' in window && !reduceMotion) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      }, { rootMargin: '0px 0px -12% 0px' });
      io.observe(chapter);
    } else {
      chapter.classList.add('is-visible');
    }
  }
})();
