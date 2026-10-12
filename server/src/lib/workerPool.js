/**
 * Worker thread pool for CPU-intensive computations.
 * 
 * Offloads heavy calculations (e.g., analytics, report generation) to worker threads
 * to prevent blocking the main event loop.
 */
import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MAX_WORKERS = Math.max(2, Math.floor(cpus().length / 2));
const WORKER_TIMEOUT = 30000; // 30 seconds

// Pool of available workers
const workerPool = [];
const pendingTasks = [];

/**
 * Execute a computation in a worker thread.
 * 
 * @param {string} workerFile - Path to worker script (relative to workers directory)
 * @param {any} data - Data to send to worker
 * @param {number} [timeout=30000] - Timeout in milliseconds
 * @returns {Promise<any>}
 */
export function executeInWorker(workerFile, data, timeout = WORKER_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, '../workers', workerFile);
    let timeoutId;
    
    const worker = new Worker(workerPath, {
      workerData: data,
    });

    timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Worker timeout after ${timeout}ms`));
    }, timeout);

    worker.on('message', (result) => {
      clearTimeout(timeoutId);
      worker.terminate();
      resolve(result);
    });

    worker.on('error', (err) => {
      clearTimeout(timeoutId);
      worker.terminate();
      reject(err);
    });

    worker.on('exit', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

/**
 * Compute analytics in a worker thread.
 * 
 * @param {object} data - Analytics computation data
 * @returns {Promise<any>}
 */
export function computeAnalyticsInWorker(data) {
  return executeInWorker('analyticsWorker.js', data);
}

/**
 * Generate report in a worker thread.
 * 
 * @param {object} data - Report generation data
 * @returns {Promise<any>}
 */
export function generateReportInWorker(data) {
  return executeInWorker('reportWorker.js', data);
}

/**
 * Check if worker threads are supported.
 * 
 * @returns {boolean}
 */
export function isWorkerSupported() {
  try {
    return Worker !== undefined;
  } catch {
    return false;
  }
}

/**
 * Execute function with worker if available, otherwise run directly.
 * 
 * @param {string} workerFile - Worker file name
 * @param {any} data - Worker data
 * @param {() => Promise<any>} fallback - Fallback function
 * @returns {Promise<any>}
 */
export async function executeWithWorkerFallback(workerFile, data, fallback) {
  if (isWorkerSupported()) {
    try {
      return await executeInWorker(workerFile, data);
    } catch (err) {
      console.warn('Worker execution failed, using fallback:', err.message);
    }
  }
  return fallback();
}
