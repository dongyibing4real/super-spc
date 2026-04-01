import { registerProvider, MIN_POINTS, EMPTY_PREDICTION } from "./provider.js";
import { computeDriftScore, estimateOOC } from "./drift-score.js";

function sampleStdDev(values) {
  if (!values || values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function median(values) {
  if (!values.length) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function multiplyMatrix(a, b) {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const result = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (let k = 0; k < inner; k++) {
        result[r][c] += a[r][k] * b[k][c];
      }
    }
  }
  return result;
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
}

function transpose(matrix) {
  return matrix[0].map((_, c) => matrix.map((row) => row[c]));
}

function predictState(state, covariance, transition, processNoise) {
  const nextState = multiplyMatrixVector(transition, state);
  const predictedCovariance = multiplyMatrix(multiplyMatrix(transition, covariance), transpose(transition));
  for (let r = 0; r < predictedCovariance.length; r++) {
    for (let c = 0; c < predictedCovariance[r].length; c++) {
      predictedCovariance[r][c] += processNoise[r][c];
    }
  }
  return { state: nextState, covariance: predictedCovariance };
}

function updateState(state, covariance, measurement, measurementVariance) {
  const observation = [1, 0, 0];
  const innovation = measurement - state[0];
  const innovationVariance = covariance[0][0] + measurementVariance;
  if (innovationVariance <= 0) {
    return { state, covariance };
  }

  const kalmanGain = covariance.map((row) => row[0] / innovationVariance);
  const nextState = state.map((value, index) => value + kalmanGain[index] * innovation);
  const nextCovariance = covariance.map((row, r) =>
    row.map((value, c) => value - kalmanGain[r] * observation[c] * covariance[0][c]),
  );

  for (let r = 0; r < nextCovariance.length; r++) {
    for (let c = r + 1; c < nextCovariance.length; c++) {
      const symmetric = (nextCovariance[r][c] + nextCovariance[c][r]) / 2;
      nextCovariance[r][c] = symmetric;
      nextCovariance[c][r] = symmetric;
    }
  }

  return { state: nextState, covariance: nextCovariance };
}

const KalmanStateSpaceProvider = {
  predict(points, config) {
    const { horizon = 10, limits } = config;
    const valid = points.filter((point) => !point.excluded && point.y != null);
    if (valid.length < MIN_POINTS) return EMPTY_PREDICTION;

    const ys = valid.map((point) => point.y);
    const spacings = [];
    for (let i = 1; i < valid.length; i++) {
      spacings.push(valid[i].x - valid[i - 1].x);
    }
    const step = median(spacings) || 1;

    const processSigma = limits?.ucl != null && limits?.center != null
      ? Math.abs((limits.ucl - limits.center) / 3)
      : sampleStdDev(ys);
    const measurementVariance = Math.max(1e-6, processSigma ** 2);

    const deltas = [];
    for (let i = 1; i < ys.length; i++) {
      deltas.push((ys[i] - ys[i - 1]) / step);
    }
    const accelerations = [];
    for (let i = 1; i < deltas.length; i++) {
      accelerations.push((deltas[i] - deltas[i - 1]) / step);
    }

    const trendSigma = Math.max(sampleStdDev(deltas), processSigma / Math.max(valid.length, 4), 1e-4);
    const accelerationSigma = Math.max(sampleStdDev(accelerations), trendSigma / Math.max(valid.length, 4), 1e-4);
    const jerkVariance = accelerationSigma ** 2;

    const dt = step;
    const transition = [
      [1, dt, 0.5 * dt * dt],
      [0, 1, dt],
      [0, 0, 1],
    ];
    const processNoise = [
      [(dt ** 5) / 20 * jerkVariance, (dt ** 4) / 8 * jerkVariance, (dt ** 3) / 6 * jerkVariance],
      [(dt ** 4) / 8 * jerkVariance, (dt ** 3) / 3 * jerkVariance, (dt ** 2) / 2 * jerkVariance],
      [(dt ** 3) / 6 * jerkVariance, (dt ** 2) / 2 * jerkVariance, dt * jerkVariance],
    ];

    const initialLevel = limits?.center ?? ys[0];
    const initialTrend = deltas.length
      ? deltas.slice(0, Math.min(5, deltas.length)).reduce((sum, value) => sum + value, 0) / Math.min(5, deltas.length)
      : 0;
    const initialAcceleration = accelerations.length
      ? accelerations.slice(0, Math.min(5, accelerations.length)).reduce((sum, value) => sum + value, 0) / Math.min(5, accelerations.length)
      : 0;

    let state = [initialLevel, initialTrend, initialAcceleration];
    let covariance = [
      [measurementVariance, 0, 0],
      [0, trendSigma ** 2, 0],
      [0, 0, accelerationSigma ** 2],
    ];

    for (const point of valid) {
      const predicted = predictState(state, covariance, transition, processNoise);
      const updated = updateState(predicted.state, predicted.covariance, point.y, measurementVariance);
      state = updated.state;
      covariance = updated.covariance;
    }

    const lastX = valid[valid.length - 1].x;
    const projected = [];
    const confidence = [];
    let forecastState = state;
    let forecastCovariance = covariance;
    const zScore = 1.96;

    for (let h = 1; h <= horizon; h++) {
      const predicted = predictState(forecastState, forecastCovariance, transition, processNoise);
      forecastState = predicted.state;
      forecastCovariance = predicted.covariance;
      const x = lastX + h * step;
      const y = forecastState[0];
      const intervalVariance = Math.max(0, forecastCovariance[0][0] + measurementVariance);
      const intervalWidth = zScore * Math.sqrt(intervalVariance);
      projected.push({ x, y });
      confidence.push({ x, upper: y + intervalWidth, lower: y - intervalWidth });
    }

    const driftSignal = state[1] * step + 0.5 * state[2] * step * step;
    const driftScore = computeDriftScore(driftSignal, processSigma, valid.length);
    const oocEstimate = estimateOOC(projected, limits);

    return { projected, confidence, driftScore, oocEstimate };
  },
};

registerProvider("kalman-state-space", KalmanStateSpaceProvider);
export default KalmanStateSpaceProvider;
