// <phntm-core> — THE CLIMB as an equity line chart.
// X axis = time (trade dates), Y axis = account equity ($). Line draws in left→right, area fill
// beneath, glowing endpoint with a live equity readout. GOAL / FAIL levels marked on prop
// challenges (Live shows neither). Auto-scales as trades are added or removed.
(function () {
  class PhntmCore extends HTMLElement {
    connectedCallback() {
      if (this._i) { if (this._ro) this._ro.observe(this); if (this._mo) this._mo.observe(this, { attributes: true, attributeFilter: ['start', 'goal', 'fail', 'eq', 'goallabel', 'faillabel'] }); if (this._replay) this._replay(); return; }
      this._i = 1; this.style.display = 'block'; this.style.width = '100%'; this.style.height = '100%'; this._start();
    }
    _start() {
      const cv = document.createElement('canvas');
      cv.style.cssText = 'width:100%;height:100%;display:block';
      this.appendChild(cv);
      const ctx = cv.getContext('2d');
      const DPR = Math.min(devicePixelRatio, 2);
      let W = 0, H = 0;
      const fit = () => { W = this.clientWidth || 600; H = this.clientHeight || 400; cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); this._dirty = true; if (this._run) this._run(); };
      this._ro = new ResizeObserver(fit); this._ro.observe(this); fit();

      const mono = (px) => px + "px 'JetBrains Mono', monospace";
      const money = (v) => (v < 0 ? '-$' : '$') + Math.abs(Math.round(v)).toLocaleString();
      const kLabel = (v) => { const a = Math.abs(v), sg = v < 0 ? '-$' : '$'; if (a >= 1000) { const k = a / 1000; const s = k.toFixed(1).replace(/\.0$/, ''); return sg + s + 'K'; } return sg + Math.round(a).toLocaleString(); };
      const niceStep = (raw) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw)))); const f = raw / p; let nf; if (f < 1.5) nf = 1; else if (f < 3) nf = 2; else if (f < 7) nf = 5; else nf = 10; return nf * p; };
      const dLabel = (ts) => { const d = new Date(ts); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getDate(); };
      const tLabel = (ts) => { const d = new Date(ts); let h = d.getHours(); const ap = h < 12 ? 'AM' : 'PM'; h = h % 12; if (h === 0) h = 12; return h + ap; };
      const TZ = (function () { const o = -new Date().getTimezoneOffset() / 60; let z = ''; try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {} return (z ? z + ' · ' : '') + 'GMT' + (o >= 0 ? '+' : '') + o; })();

      let START = 0, GOAL = 0, FAIL = NaN, isLive = true, PTS = [], HAS_TRADES = false;
      const parse = () => {
        const s = +this.getAttribute('start'); START = isFinite(s) ? s : 0;
        const g = +this.getAttribute('goal'); GOAL = isFinite(g) ? g : START;
        const fa = this.getAttribute('fail'); const f = +fa; FAIL = (fa != null && fa !== '' && isFinite(f)) ? f : NaN;
        isLive = !isFinite(FAIL);
        let arr = null; try { arr = JSON.parse(this.getAttribute('eq')); } catch (e) {}
        const pts = Array.isArray(arr) ? arr : [];
        HAS_TRADES = pts.length > 0;   // the anchor below always adds one point, so count trades here
        // prepend the starting balance as the first anchor point
        PTS = [{ eq: START, ts: pts.length ? (pts[0].ts - Math.max(60000, (pts[pts.length - 1].ts - pts[0].ts) / Math.max(1, pts.length))) : Date.now() }].concat(pts.map((d) => ({ eq: d.eq, ts: d.ts })));
      };
      parse();
      this._key = ''; this._p = 0; this._pStart = 0;

      const draw = () => {
        // gutters scale with the canvas — at half width fixed 60px ate a third of the plot
        const narrow = W < 520;
        const padL = narrow ? 46 : 60, padT = narrow ? 20 : 26, padB = narrow ? 32 : 40, padR = narrow ? 14 : 20;
        const plotW = W - padL - padR, plotH = H - padT - padB;
        const x0 = padL, topY = padT, botY = padT + plotH;
        const n = PTS.length;
        const eqs = PTS.map((d) => d.eq);

        let yMax, yMin;
        // Prop accounts anchor on FAIL..GOAL, but a funded account in profit can sit
        // ABOVE goal (and a breach below fail) — widen to the data or the line draws
        // off the top of the plot.
        if (!isLive) {
          const hi = Math.max.apply(null, eqs), lo = Math.min.apply(null, eqs);
          const pad = Math.max((hi - lo) * 0.12, Math.abs(START) * 0.01, 1);
          yMax = Math.max(GOAL, hi + pad); yMin = Math.min(FAIL, lo - pad);
        }
        else { const hi = Math.max.apply(null, eqs), lo = Math.min.apply(null, eqs); const pad = Math.max((hi - lo) * 0.18, Math.abs(START) * 0.04, 1); yMax = hi + pad; yMin = lo - pad; }
        if (!(yMax > yMin)) { yMax = START + Math.max(1, Math.abs(START) * 0.1); yMin = START - Math.max(1, Math.abs(START) * 0.1); }
        // A zero baseline is the reference a trader reads against — but anchoring to it
        // unconditionally crushes a funded curve into a flat band at the top (a $5,000
        // account moving $230 gets 8% of the plot). So only extend to zero when the data
        // still keeps a readable share of the height; otherwise the padded data range wins.
        if (isLive) {
          const MIN_BAND = 0.34;                       // data must keep >= 34% of the plot
          if (yMin > 0) { const t = yMax - 0; if ((yMax - yMin) / t >= MIN_BAND) yMin = 0; }
          if (yMax < 0) { const t = 0 - yMin; if ((yMax - yMin) / t >= MIN_BAND) yMax = 0; }
        }
        const y = (v) => botY - ((v - yMin) / (yMax - yMin)) * plotH;
        const span = n > 1 ? (PTS[n - 1].ts - PTS[0].ts) : 0;
        const useTime = n > 1 && span > 0 && span < 129600000;
        const t0 = n ? PTS[0].ts : 0, t1 = n > 1 ? PTS[n - 1].ts : t0 + 1;
        const x = (i) => n <= 1 ? x0 + plotW / 2 : x0 + (i / (n - 1)) * plotW;

        ctx.clearRect(0, 0, W, H);
        ctx.textBaseline = 'middle';

        // Y gridlines + $ labels (nice steps)
        ctx.textAlign = 'right'; ctx.font = mono(9);
        const EMPTY = !HAS_TRADES;   // the anchor point alone is not data
        let step;
        if (EMPTY) {
          // no data yet — centre the band ON the balance in whole steps, so the starting
          // figure is always a labelled gridline and the baseline gap lands on it
          const span = Math.max(Math.abs(START) * 0.1, 100);
          step = niceStep(span / 2);
          yMin = START - step * 2; yMax = START + step * 2;
        } else {
          step = niceStep((yMax - yMin) / 4);
          // snap the bounds to the step so labels read 4k / 4.5k / 5k, never 390 / 410
          yMin = Math.floor(yMin / step) * step;
          yMax = Math.ceil(yMax / step) * step;
        }
        if (yMax === yMin) yMax = yMin + step;
        const gStart = yMin;
        for (let v = gStart; v <= yMax + step * 0.001; v += step) {
          const yy = y(v);
          if (EMPTY && Math.abs(v - START) < step * 0.001) {
            // draw the baseline in two segments, leaving a gap for the panel's message
            const cx = x0 + plotW / 2, gap = Math.min(230, plotW * 0.72) / 2;
            ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(cx - gap, yy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + gap, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
            ctx.fillStyle = '#a0a0a0'; ctx.fillText(kLabel(v), padL - 10, yy);   // the balance must be labelled like any other line
            continue;
          }
          ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(W - padR, yy); ctx.stroke();
          ctx.fillStyle = '#a0a0a0'; ctx.fillText(kLabel(v), padL - 10, yy);
        }
        // GOAL / FAIL levels (prop only)
        const level = (v, col, line, label) => { if (v > yMax || v < yMin) return; const yy = y(v); ctx.strokeStyle = line; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(W - padR, yy); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col; ctx.font = '600 ' + mono(9); ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(label, W - padR, yy - 5); ctx.textBaseline = 'middle'; };
        const metGoal = !isLive && eqs.length && eqs[eqs.length - 1] >= GOAL;
        if (!isLive) { level(GOAL, 'rgba(95,191,131,.95)', 'rgba(95,191,131,.3)', (this.getAttribute('goallabel') || 'TARGET') + (metGoal ? '  ✓ MET' : '')); level(FAIL, 'rgba(224,160,90,.95)', 'rgba(224,160,90,.3)', (this.getAttribute('faillabel') || 'LIMIT')); }

        // axis titles
        ctx.fillStyle = '#a0a0a0'; ctx.font = mono(8.5); ctx.textAlign = 'left';
        ctx.textAlign = 'right'; ctx.fillText(TZ, W - padR, botY + 32);

        const p = this._p;
        if (n > 1) {
          // area + line, revealed left→right by p
          ctx.save();
          ctx.beginPath(); ctx.rect(x0 - 2, topY - 20, (plotW + 4) * p, plotH + 60); ctx.clip();
          const grad = ctx.createLinearGradient(0, topY, 0, botY);
          grad.addColorStop(0, 'rgba(255,255,255,.24)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.beginPath(); ctx.moveTo(x(0), botY);
          for (let i = 0; i < n; i++) ctx.lineTo(x(i), y(PTS[i].eq));
          ctx.lineTo(x(n - 1), botY); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
          ctx.beginPath(); ctx.moveTo(x(0), y(PTS[0].eq));
          for (let i = 1; i < n; i++) ctx.lineTo(x(i), y(PTS[i].eq));
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
          ctx.restore();

          // X axis — ordinal: evenly spaced per trade; labels roll on day change (Tradezella/Edgewonk style)
          ctx.font = mono(9); ctx.textBaseline = 'alphabetic';
          const dayKey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
          if (dayKey(PTS[0].ts) === dayKey(PTS[n - 1].ts)) {
            ctx.fillStyle = '#a0a0a0'; ctx.textAlign = 'left'; ctx.fillText(tLabel(PTS[0].ts), x0, botY + 18);
            ctx.textAlign = 'right'; ctx.fillText(tLabel(PTS[n - 1].ts), x0 + plotW, botY + 18);
            ctx.fillStyle = '#a0a0a0'; ctx.textAlign = 'center'; ctx.fillText(dLabel(PTS[0].ts), x0 + plotW / 2, botY + 18);
          } else {
            let prev = null;
            for (let i = 0; i < n; i++) { const k = dayKey(PTS[i].ts); if (k === prev) continue; prev = k; const xx = x(i); ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xx, topY); ctx.lineTo(xx, botY); ctx.stroke(); ctx.fillStyle = '#a0a0a0'; ctx.textAlign = i === 0 ? 'left' : (i === n - 1 ? 'right' : 'center'); ctx.fillText(dLabel(PTS[i].ts), xx, botY + 18); }
          }
          ctx.textBaseline = 'middle';

          // endpoint dot + readout (fades in at end of draw)
          const ex = x(n - 1), ey = y(PTS[n - 1].eq), a = Math.max(0, (p - 0.85) / 0.15);
          ctx.globalAlpha = a;
          ctx.shadowColor = '#fff'; ctx.shadowBlur = 14; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 4.4, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
          const lv = PTS[n - 1].eq, txt = money(lv);
          ctx.font = '600 ' + mono(12); const tw = ctx.measureText(txt).width;
          let bx = ex - tw / 2, by = ey - 24;
          if (bx + tw + 12 > W) bx = W - tw - 14; if (bx < x0) bx = x0; if (by < topY) by = ey + 16;
          ctx.fillStyle = 'rgba(10,10,11,.92)'; const bw2 = tw + 16, bh2 = 22, rx = bx - 8, ry = by - bh2 / 2, rr = 7;
          ctx.beginPath(); ctx.moveTo(rx + rr, ry); ctx.arcTo(rx + bw2, ry, rx + bw2, ry + bh2, rr); ctx.arcTo(rx + bw2, ry + bh2, rx, ry + bh2, rr); ctx.arcTo(rx, ry + bh2, rx, ry, rr); ctx.arcTo(rx, ry, rx + bw2, ry, rr); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '600 ' + mono(12); ctx.fillText(txt, bx, by);
          ctx.globalAlpha = 1;
        } else {
          /* empty state is rendered by the panel, not the canvas */
        }
      };

      // The reveal animation runs for ~950ms and then STOPS. Previously this kept a
      // requestAnimationFrame loop alive for the life of the page — burning a frame
      // every 16ms on a static chart, even on other tabs and after disconnect.
      const tick = (now) => {
        const key = [this.getAttribute('start'), this.getAttribute('goal'), this.getAttribute('fail'), this.getAttribute('eq'), W, H].join('|');
        if (key !== this._key || this._dirty) { this._key = key; this._dirty = false; parse(); this._p = 0; this._pStart = now || performance.now(); }
        if (this._p < 1) {
          const el = ((now || performance.now()) - this._pStart) / 950;
          this._p = el >= 1 ? 1 : (1 - Math.pow(1 - el, 3));
          draw();
          this._raf = requestAnimationFrame(tick);
        } else { this._raf = null; clearTimeout(this._drawSafety); this._drawSafety = null; }
      };
      // The reveal is only ever entered through requestAnimationFrame, and browsers
      // suspend rAF while a tab is hidden — so a chart that loads in a background tab
      // never receives a single paint. The animation must not be the only path to a
      // drawn canvas: skip it when hidden, and back it with a wall clock either way.
      const paintFinal = () => {
        clearTimeout(this._drawSafety); this._drawSafety = null;
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
        const key = [this.getAttribute('start'), this.getAttribute('goal'), this.getAttribute('fail'), this.getAttribute('eq'), W, H].join('|');
        if (key !== this._key || this._dirty) { this._key = key; this._dirty = false; parse(); }
        this._p = 1;
        draw();
      };
      this._paintFinal = paintFinal;
      this._run = () => {
        if (typeof document !== 'undefined' && document.hidden) { paintFinal(); return; }
        clearTimeout(this._drawSafety);
        this._drawSafety = setTimeout(paintFinal, 1600);   // rAF throttled or never delivered
        if (!this._raf) this._raf = requestAnimationFrame(tick);
      };
      this._replay = () => { this._p = 0; this._pStart = performance.now(); this._run(); };
      // returning to the tab must repair a canvas that never got to paint
      this._onVis = () => { if (!document.hidden && this._p !== 1) this._replay(); };
      document.addEventListener('visibilitychange', this._onVis);
      // restart the reveal whenever the data or the box changes
      this._mo = new MutationObserver(() => this._replay());
      this._mo.observe(this, { attributes: true, attributeFilter: ['start', 'goal', 'fail', 'eq', 'goallabel', 'faillabel'] });
      this._run();
    }
    disconnectedCallback() {
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
      clearTimeout(this._drawSafety); this._drawSafety = null;
      if (this._onVis) { document.removeEventListener('visibilitychange', this._onVis); this._onVis = null; }
      if (this._ro) this._ro.disconnect();
      if (this._mo) this._mo.disconnect();
    }
  }
  if (!customElements.get('phntm-core')) customElements.define('phntm-core', PhntmCore);
})();
