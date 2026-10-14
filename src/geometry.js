(function (root) {
  'use strict';
  const G = {
    rad: d => d * Math.PI / 180,
    deg: r => r * 180 / Math.PI,
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    clone: o => JSON.parse(JSON.stringify(o)),
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    nearest(points, target) {
      return points.reduce((a, b) => !a || G.distance(b, target) < G.distance(a, target) ? b : a, null);
    },
    // 1-2-5 spacing keeps the screen readable; model units are always mm.
    gridStep(scale) {
      const target = Math.max(1, 20 / scale), power = 10 ** Math.floor(Math.log10(target));
      return Math.max(1, [1, 2, 5, 10].find(n => n * power >= target - 1e-10) * power);
    },
    snapNode(nodes, positions, point, scale, radius = 14) {
      let best = null, distance = radius / scale;
      for (const node of nodes) {
        const d = G.distance(positions?.[node.id] || node, point);
        if (d <= distance) { best = node.id; distance = d; }
      }
      return best;
    },
    projectSegment(point, a, b) {
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      const t=length>1e-12?G.clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/(length*length),0,1):0;
      const foot={x:a.x+t*dx,y:a.y+t*dy};
      return {t,foot,distance:G.distance(point,foot)};
    },
    circles(a, ra, b, rb) {
      const d = G.distance(a, b), eps = 1e-8 * Math.max(1, ra, rb);
      if (d < eps || d > ra + rb + eps || d < Math.abs(ra - rb) - eps) return [];
      const u = { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
      const t = (ra * ra - rb * rb + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, ra * ra - t * t));
      const p = { x: a.x + t * u.x, y: a.y + t * u.y };
      return [{ x: p.x - h * u.y, y: p.y + h * u.x }, { x: p.x + h * u.y, y: p.y - h * u.x }];
    },
    circleLine(c, r, origin, angle) {
      const a = G.rad(angle), u = { x: Math.cos(a), y: Math.sin(a) };
      const t = (c.x - origin.x) * u.x + (c.y - origin.y) * u.y;
      const p = { x: origin.x + t * u.x, y: origin.y + t * u.y };
      const h2 = r * r - G.distance(p, c) ** 2;
      if (h2 < -1e-7 * Math.max(1, r * r)) return [];
      const h = Math.sqrt(Math.max(0, h2));
      return [{ x: p.x + h * u.x, y: p.y + h * u.y }, { x: p.x - h * u.x, y: p.y - h * u.y }];
    },
    // Partial-pivot Gaussian elimination for the small damped normal systems.
    linear(A, b) {
      const n = b.length, m = A.map((row, i) => [...row, b[i]]);
      for (let k = 0; k < n; k++) {
        let p = k;
        for (let i = k + 1; i < n; i++) if (Math.abs(m[i][k]) > Math.abs(m[p][k])) p = i;
        if (Math.abs(m[p][k]) < 1e-14) return null;
        [m[k], m[p]] = [m[p], m[k]];
        for (let i = k + 1; i < n; i++) {
          const f = m[i][k] / m[k][k];
          for (let j = k; j <= n; j++) m[i][j] -= f * m[k][j];
        }
      }
      const x = new Array(n).fill(0);
      for (let i = n - 1; i >= 0; i--) {
        let s = m[i][n];
        for (let j = i + 1; j < n; j++) s -= m[i][j] * x[j];
        x[i] = s / m[i][i];
      }
      return x;
    },
    rank(A, tolerance = 1e-8) {
      if (!A.length) return 0;
      const m = A.map(row => [...row]), cols = m[0].length;
      let rank = 0;
      for (let c = 0; c < cols && rank < m.length; c++) {
        let p = rank;
        for (let i = rank + 1; i < m.length; i++) if (Math.abs(m[i][c]) > Math.abs(m[p][c])) p = i;
        if (Math.abs(m[p][c]) < tolerance) continue;
        [m[rank], m[p]] = [m[p], m[rank]];
        const f = m[rank][c];
        for (let j = c; j < cols; j++) m[rank][j] /= f;
        for (let i = rank + 1; i < m.length; i++) {
          const v = m[i][c];
          for (let j = c; j < cols; j++) m[i][j] -= v * m[rank][j];
        }
        rank++;
      }
      return rank;
    }
  };
  root.JiGou = root.JiGou || {};
  root.JiGou.geometry = G;
  if (typeof module !== 'undefined') module.exports = G;
})(globalThis);
