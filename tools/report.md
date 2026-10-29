# Sobol sweep report

61440 model runs (N=4096, d=13), analytic model, log outputs. 87% of samples had cruise speed clamped by the camera limit.

## time

| input | S1 | ST | ST ± | interaction (ST-S1) |
|---|---|---|---|---|
| area | 0.497 | 0.512 | 0.022 | +0.015 |
| gsd | 0.336 | 0.357 | 0.015 | +0.021 |
| n | 0.063 | 0.077 | 0.004 | +0.014 |
| fwd | 0.024 | 0.031 | 0.002 | +0.007 |
| side | 0.017 | 0.027 | 0.002 | +0.011 |
| packWh | 0.013 | 0.009 | 0.001 | -0.004 |
| speed | 0.002 | 0.009 | 0.001 | +0.007 |
| hover | -0.003 | 0.005 | 0.000 | +0.008 |
| swapMin | 0.002 | 0.003 | 0.000 | +0.001 |
| aspect | 0.003 | 0.002 | 0.000 | -0.001 |
| packPrice | 0.000 | 0.000 | 0.000 | +0.000 |
| dronePrice | 0.000 | 0.000 | 0.000 | +0.000 |
| crew | 0.000 | 0.000 | 0.000 | +0.000 |

sum S1 = 0.95 (1.0 means purely additive in log space)

## wh

| input | S1 | ST | ST ± | interaction (ST-S1) |
|---|---|---|---|---|
| area | 0.494 | 0.501 | 0.022 | +0.008 |
| gsd | 0.378 | 0.383 | 0.017 | +0.005 |
| hover | 0.053 | 0.053 | 0.003 | -0.000 |
| fwd | 0.030 | 0.032 | 0.001 | +0.002 |
| side | 0.029 | 0.028 | 0.001 | -0.001 |
| speed | 0.003 | 0.012 | 0.001 | +0.009 |
| n | 0.001 | 0.004 | 0.000 | +0.004 |
| aspect | 0.002 | 0.001 | 0.000 | -0.001 |
| packWh | 0.000 | 0.000 | 0.000 | +0.000 |
| dronePrice | 0.000 | 0.000 | 0.000 | +0.000 |
| packPrice | 0.000 | 0.000 | 0.000 | +0.000 |
| crew | 0.000 | 0.000 | 0.000 | +0.000 |
| swapMin | 0.000 | 0.000 | 0.000 | +0.000 |

sum S1 = 0.99 (1.0 means purely additive in log space)

## cost

| input | S1 | ST | ST ± | interaction (ST-S1) |
|---|---|---|---|---|
| area | 0.495 | 0.508 | 0.021 | +0.013 |
| gsd | 0.339 | 0.355 | 0.015 | +0.015 |
| crew | 0.067 | 0.067 | 0.003 | +0.001 |
| fwd | 0.024 | 0.030 | 0.002 | +0.006 |
| side | 0.021 | 0.027 | 0.001 | +0.006 |
| n | 0.003 | 0.013 | 0.001 | +0.010 |
| packWh | 0.009 | 0.009 | 0.001 | +0.000 |
| speed | 0.003 | 0.009 | 0.001 | +0.006 |
| hover | 0.002 | 0.005 | 0.000 | +0.003 |
| swapMin | 0.001 | 0.002 | 0.000 | +0.001 |
| dronePrice | 0.001 | 0.002 | 0.000 | +0.001 |
| aspect | 0.001 | 0.002 | 0.000 | +0.001 |
| packPrice | -0.000 | 0.000 | 0.000 | +0.001 |

sum S1 = 0.96 (1.0 means purely additive in log space)

## costPerKm2

| input | S1 | ST | ST ± | interaction (ST-S1) |
|---|---|---|---|---|
| gsd | 0.675 | 0.707 | 0.028 | +0.031 |
| crew | 0.133 | 0.134 | 0.006 | +0.001 |
| fwd | 0.048 | 0.060 | 0.003 | +0.012 |
| side | 0.037 | 0.054 | 0.003 | +0.017 |
| n | 0.003 | 0.026 | 0.002 | +0.022 |
| area | -0.008 | 0.022 | 0.002 | +0.029 |
| packWh | 0.024 | 0.018 | 0.001 | -0.006 |
| speed | 0.005 | 0.018 | 0.002 | +0.013 |
| hover | 0.001 | 0.010 | 0.001 | +0.009 |
| swapMin | 0.003 | 0.005 | 0.000 | +0.002 |
| dronePrice | 0.003 | 0.004 | 0.000 | +0.001 |
| aspect | 0.005 | 0.003 | 0.000 | -0.002 |
| packPrice | -0.001 | 0.001 | 0.000 | +0.002 |

sum S1 = 0.93 (1.0 means purely additive in log space)

## Scaling exponents (d ln output / d ln input)

Power-law fit; R² says how much of the output it explains. fwd and side enter as ln(1 - overlap), the fraction of each frame that is new ground.

| input | time | wh | cost | costPerKm2 |
|---|---|---|---|---|
| area | +0.94 | +0.91 | +0.94 | -0.06 |
| aspect | +0.00 | -0.00 | +0.00 | +0.00 |
| n | -0.85 | +0.14 | +0.03 | +0.03 |
| speed | -0.11 | -0.13 | -0.11 | -0.11 |
| gsd | -1.77 | -1.81 | -1.77 | -1.77 |
| fwd | -0.73 | -0.74 | -0.73 | -0.73 |
| side | -0.81 | -0.84 | -0.82 | -0.82 |
| hover | +0.20 | +0.99 | +0.21 | +0.21 |
| packWh | -0.19 | +0.00 | -0.20 | -0.20 |
| dronePrice | +0.00 | +0.00 | +0.09 | +0.09 |
| packPrice | -0.01 | -0.00 | +0.03 | +0.03 |
| crew | +0.00 | +0.00 | +0.86 | +0.86 |
| swapMin | +0.11 | +0.00 | +0.10 | +0.10 |
| **R²** | 0.97 | 0.98 | 0.97 | 0.94 |

## Free levers (no effect on cost, real effect on time or energy)

- n: elasticity of time -0.85, of Wh +0.14, of cost ~0

## Gauge directions (input combinations that leave every output unchanged)

Scaled combinations ∏ input^c with max |elasticity| across all four outputs below 0.05, using only inputs that matter somewhere:

- speed^+1 · fwd^+1 · side^-1  (max |elasticity| 0.034)
- speed^+1 · gsd^-1 · side^+2  (max |elasticity| 0.037)
- packWh^+1 · swapMin^+2  (max |elasticity| 0.038)

Single-output invariants (output elasticities across inputs) are in the exponent table; pairs whose exponents are equal and opposite, for one output, are interchangeable for that output.
