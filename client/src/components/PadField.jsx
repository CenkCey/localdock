import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const GAP = 24;

const PadField = forwardRef(function PadField({ drag }, ref) {
  const canvasRef = useRef(null);
  const s = useRef({
    w: 0,
    h: 0,
    dpr: 1,
    points: new Map(),
    ripples: [],
    scroll: 0,
    vel: 0,
    scale: 1,
    drag: false,
    raf: 0,
    last: 0
  });

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = s.current;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx.clearRect(0, 0, st.w, st.h);
    const rgb = st.drag ? '255,190,82' : '168,236,210';
    const cx = st.w / 2;
    const cy = st.h / 2;
    const offset = ((st.scroll % GAP) + GAP) % GAP;
    const stretch = 1 + Math.min(Math.abs(st.vel) / 5, 1.8);
    const pts = Array.from(st.points.values());
    const ripples = st.ripples;
    const calm = pts.length === 0 && ripples.length === 0;
    ctx.fillStyle = `rgba(${rgb},0.16)`;
    ctx.beginPath();
    const lit = [];
    for (let gx = GAP / 2; gx < st.w + GAP; gx += GAP) {
      for (let gy = -GAP + offset; gy < st.h + GAP; gy += GAP) {
        let x = cx + (gx - cx) * st.scale;
        let y = cy + (gy - cy) * st.scale;
        let touched = false;
        if (!calm) {
          for (let i = 0; i < pts.length; i += 1) {
            const dx = pts[i].x - x;
            const dy = pts[i].y - y;
            if (dx * dx + dy * dy < 14400) {
              touched = true;
              break;
            }
          }
          if (!touched) {
            for (let i = 0; i < ripples.length; i += 1) {
              const dx = x - ripples[i].x;
              const dy = y - ripples[i].y;
              const diff = Math.sqrt(dx * dx + dy * dy) - ripples[i].t * 260;
              if (diff > -60 && diff < 60) {
                touched = true;
                break;
              }
            }
          }
        }
        if (touched) {
          lit.push(x, y);
        } else {
          ctx.moveTo(x + 1.3, y);
          ctx.ellipse(x, y, 1.3, 1.3 * stretch, 0, 0, Math.PI * 2);
        }
      }
    }
    ctx.fill();
    for (let n = 0; n < lit.length; n += 2) {
      let x = lit[n];
      let y = lit[n + 1];
      let alpha = 0.16;
      let size = 1.3;
      for (let i = 0; i < pts.length; i += 1) {
        const dx = pts[i].x - x;
        const dy = pts[i].y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 120) {
          const k = 1 - d / 120;
          alpha += 0.62 * k * k;
          size += 1.8 * k;
          x += dx * k * 0.08;
          y += dy * k * 0.08;
        }
      }
      for (let i = 0; i < ripples.length; i += 1) {
        const r = ripples[i];
        const dx = x - r.x;
        const dy = y - r.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = d - r.t * 260;
        const k = Math.exp(-(diff * diff) / 700) * (1 - r.t);
        if (k > 0.01) {
          x += (dx / d) * k * 12;
          y += (dy / d) * k * 12;
          alpha += 0.7 * k;
          size += 1.6 * k;
        }
      }
      ctx.fillStyle = `rgba(${rgb},${Math.min(alpha, 0.95).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, size, size * stretch, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame(now) {
    const st = s.current;
    const dt = Math.min(48, now - (st.last || now));
    st.last = now;
    st.ripples.forEach((r) => {
      r.t += dt / 620;
    });
    st.ripples = st.ripples.filter((r) => r.t < 1);
    st.scroll += st.vel;
    st.vel *= 0.9;
    if (Math.abs(st.vel) < 0.04) st.vel = 0;
    st.scale += (1 - st.scale) * 0.1;
    if (Math.abs(st.scale - 1) < 0.002) st.scale = 1;
    draw();
    const busy = st.ripples.length > 0 || st.vel !== 0 || st.scale !== 1 || st.points.size > 0;
    st.raf = busy ? requestAnimationFrame(frame) : 0;
    if (!busy) st.last = 0;
  }

  function wake() {
    const st = s.current;
    if (!st.raf) st.raf = requestAnimationFrame(frame);
  }

  useImperativeHandle(ref, () => ({
    point(id, x, y) {
      s.current.points.set(id, { x, y });
      wake();
    },
    release(id) {
      s.current.points.delete(id);
      wake();
    },
    ripple(x, y) {
      s.current.ripples.push({ x, y, t: 0 });
      wake();
    },
    scrollBy(dy) {
      const st = s.current;
      st.scroll += dy;
      st.vel = Math.max(-14, Math.min(14, st.vel + dy * 0.25));
      wake();
    },
    zoomBy(factor) {
      const st = s.current;
      st.scale = Math.max(0.8, Math.min(1.4, st.scale * factor));
      wake();
    }
  }));

  useEffect(() => {
    s.current.drag = Boolean(drag);
    draw();
  }, [drag]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const st = s.current;
    function fit() {
      const rect = canvas.getBoundingClientRect();
      st.dpr = Math.min(1.5, window.devicePixelRatio || 1);
      st.w = rect.width;
      st.h = rect.height;
      canvas.width = Math.round(rect.width * st.dpr);
      canvas.height = Math.round(rect.height * st.dpr);
      draw();
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(st.raf);
    };
  }, []);

  return <canvas ref={canvasRef} className="pad-field" aria-hidden="true" />;
});

export default PadField;
