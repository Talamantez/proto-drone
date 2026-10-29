#!/usr/bin/env python3
"""Sobol sensitivity + scaling-law / invariant hunt over the analytic mission model (tools/model.js).

  python3 tools/sweep.py [log2_N=11] [seed=1]     -> prints and writes tools/report.md

1. Saltelli sampling from a scrambled Sobol sequence (N*(d+2) model runs).
2. First-order S1 (Saltelli 2010) and total-order ST (Jansen) indices, with bootstrap CIs, on log outputs.
3. Log-log regression gives each input's elasticity (d ln out / d ln in). Input combinations whose
   elasticity is ~0 for every output are "gauge directions": you can move along them for free.
"""
import itertools, json, subprocess, sys
from pathlib import Path
import numpy as np
from scipy.stats import qmc

HERE = Path(__file__).parent
# name: (lo, hi, scale)  scale 'log' samples log-uniformly
SPACE = {
    'area':      (1e4, 1e6, 'log'),   # m^2
    'aspect':    (1, 4, 'log'),
    'n':         (1, 8, 'lin'),       # rounded in the model
    'speed':     (2, 20, 'log'),      # m/s, clamped to the camera limit
    'gsd':       (2, 15, 'log'),      # mm/px
    'fwd':       (60, 90, 'lin'),
    'side':      (50, 85, 'lin'),
    'hover':     (100, 400, 'log'),   # W
    'packWh':    (50, 400, 'log'),
    'dronePrice': (500, 8000, 'log'),
    'packPrice': (80, 800, 'log'),
    'crew':      (20, 150, 'lin'),    # $/h per crew member
    'swapMin':   (3, 20, 'lin'),
}
OUTS = ['time', 'wh', 'cost', 'costPerKm2']
names = list(SPACE); d = len(names)

def to_params(U):
    cols = {}
    for j, k in enumerate(names):
        lo, hi, sc = SPACE[k]
        cols[k] = lo * (hi / lo) ** U[:, j] if sc == 'log' else lo + (hi - lo) * U[:, j]
    return cols

def run_model(U):
    cols = to_params(U)
    rows = [{k: float(cols[k][i]) for k in names} for i in range(len(U))]
    out = subprocess.run(['node', str(HERE / 'model.js')], input=json.dumps(rows), capture_output=True, text=True, check=True).stdout
    res = json.loads(out)
    Y = {o: np.array([r[o] for r in res]) for o in OUTS + ['clamped', 'sorties']}
    return cols, Y

def saltelli(logN, seed):
    N = 2 ** logN
    S = qmc.Sobol(2 * d, scramble=True, seed=seed).random_base2(logN)
    A, B = S[:, :d], S[:, d:]
    ABs = []
    for i in range(d):
        M = A.copy(); M[:, i] = B[:, i]; ABs.append(M)
    return N, A, B, ABs

def indices(fA, fB, fAB, idx):
    fA, fB, fAB = fA[idx], fB[idx], fAB[:, idx]
    var = np.var(np.concatenate([fA, fB]))
    S1 = np.mean(fB * (fAB - fA), axis=1) / var
    ST = 0.5 * np.mean((fA - fAB) ** 2, axis=1) / var
    return S1, ST

def main():
    logN = int(sys.argv[1]) if len(sys.argv) > 1 else 11
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    N, A, B, ABs = saltelli(logN, seed)
    allU = np.vstack([A, B] + ABs)
    cols, Y = run_model(allU)
    L = {o: np.log(Y[o]) for o in OUTS}
    sl = lambda k: slice(k * N, (k + 1) * N)
    rng = np.random.default_rng(seed)
    lines = [f'# Sobol sweep report', '', f'{len(allU)} model runs (N={N}, d={d}), analytic model, log outputs. '
             f'{100 * Y["clamped"][:N].mean():.0f}% of samples had cruise speed clamped by the camera limit.', '']

    # --- Sobol indices
    boots = [rng.integers(0, N, N) for _ in range(100)]
    for o in OUTS:
        f = L[o]; fA, fB = f[sl(0)], f[sl(1)]
        fAB = np.stack([f[sl(2 + i)] for i in range(d)])
        S1, ST = indices(fA, fB, fAB, np.arange(N))
        bs = np.array([indices(fA, fB, fAB, b)[1] for b in boots])
        ci = 1.96 * bs.std(axis=0)
        lines += [f'## {o}', '', '| input | S1 | ST | ST ± | interaction (ST-S1) |', '|---|---|---|---|---|']
        for i in np.argsort(-ST):
            lines.append(f'| {names[i]} | {S1[i]:.3f} | {ST[i]:.3f} | {ci[i]:.3f} | {ST[i] - S1[i]:+.3f} |')
        lines += ['', f'sum S1 = {S1.sum():.2f} (1.0 means purely additive in log space)', '']

    # --- elasticities on the A block
    pa = to_params(A)
    reg = lambda k: 1 - pa[k] / 100 if k in ('fwd', 'side') else pa[k]   # overlaps act through the non-overlapped fraction
    X = np.log(np.column_stack([reg(k) for k in names]))
    Xc = np.column_stack([np.ones(N), X])
    Bm = np.zeros((len(OUTS), d)); r2 = {}
    for r, o in enumerate(OUTS):
        coef, *_ = np.linalg.lstsq(Xc, L[o][sl(0)], rcond=None)
        pred = Xc @ coef; r2[o] = 1 - np.sum((L[o][sl(0)] - pred) ** 2) / np.sum((L[o][sl(0)] - L[o][sl(0)].mean()) ** 2)
        Bm[r] = coef[1:]
    lines += ['## Scaling exponents (d ln output / d ln input)', '', 'Power-law fit; R² says how much of the output it explains. fwd and side enter as ln(1 - overlap), the fraction of each frame that is new ground.', '',
              '| input | ' + ' | '.join(OUTS) + ' |', '|---|' + '---|' * len(OUTS)]
    for i, k in enumerate(names):
        lines.append(f'| {k} | ' + ' | '.join(f'{Bm[r, i]:+.2f}' for r in range(len(OUTS))) + ' |')
    lines += ['| **R²** | ' + ' | '.join(f'{r2[o]:.2f}' for o in OUTS) + ' |', '']

    # --- gauge directions: small-integer combos of inputs that leave every output (nearly) unchanged
    found = []
    live = [i for i in range(d) if np.abs(Bm[:, i]).max() >= 0.1]   # skip inputs that do nothing: their combos are trivially 'invariant'
    free = [(names[i], Bm[OUTS.index('time'), i], Bm[OUTS.index('wh'), i]) for i in range(d)
            if abs(Bm[OUTS.index('cost'), i]) < 0.05 and max(abs(Bm[OUTS.index('time'), i]), abs(Bm[OUTS.index('wh'), i])) > 0.3]
    for k in (2, 3):
        for idx in itertools.combinations(live, k):
            for c in itertools.product([-2, -1, 1, 2], repeat=k):
                if c[0] < 0 or np.gcd.reduce(np.abs(c)) != 1: continue
                eff = Bm[:, idx] @ np.array(c)
                found.append((np.abs(eff).max(), idx, c))
    found.sort(key=lambda t: t[0])
    lines += ['## Free levers (no effect on cost, real effect on time or energy)', '']
    lines += [f'- {n}: elasticity of time {t:+.2f}, of Wh {w:+.2f}, of cost ~0' for n, t, w in free] or ['- none']
    lines += ['', '## Gauge directions (input combinations that leave every output unchanged)', '',
              'Scaled combinations ∏ input^c with max |elasticity| across all four outputs below 0.05, using only inputs that matter somewhere:', '']
    shown = 0
    for e, idx, c in found:
        if e > 0.05 or shown >= 12: break
        lines.append(f'- {" · ".join(f"{names[i]}^{ci:+d}" for i, ci in zip(idx, c))}  (max |elasticity| {e:.3f})'); shown += 1
    if not shown: lines.append('- none under the 0.05 threshold with <=3 inputs and integer weights')
    lines += ['', 'Single-output invariants (output elasticities across inputs) are in the exponent table; pairs whose exponents are equal and opposite, for one output, are interchangeable for that output.', '']

    rep = '\n'.join(lines); (HERE / 'report.md').write_text(rep); print(rep)

if __name__ == '__main__':
    main()
