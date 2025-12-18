// k6 Load Test Script for OpenTelemetry Demo
// Calls browser-simulator which creates proper traces with all instrumentation
//
// Modes:
//   Slow mode (2-3 req/s): k6 run load-test.js
//   Load test mode:        k6 run -e MODE=load load-test.js
//
// Install k6: brew install k6

import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { Trend, Counter, Rate } from 'k6/metrics';

// Custom metrics
const triggerDuration = new Trend('trigger_duration');
const errorRate = new Rate('errors');
const totalRequests = new Counter('total_requests');

// Mode selection: 'slow' (default) or 'load'
const MODE = __ENV.MODE || 'slow';

// Configuration based on mode
const scenarios = MODE === 'load' ? {
    load_test: {
        executor: 'shared-iterations',
        vus: 1000,
        iterations: 100000,
        maxDuration: '30m',
    },
} : {
    slow_test: {
        executor: 'constant-arrival-rate',
        rate: 3,              // 3 requests per second
        timeUnit: '1s',
        duration: '10m',      // Run for 10 minutes
        preAllocatedVUs: 2,   // Pre-allocate 2 VUs
        maxVUs: 5,            // Max 5 VUs if needed
    },
};

export const options = {
    scenarios,
    thresholds: {
        http_req_failed: ['rate<0.05'],     // Error rate < 5%
        http_req_duration: ['p(95)<15000'], // 95% requests under 15s
    },
};

// Browser-simulator URL (this creates proper traces with browser-frontend)
const BROWSER_SIM_URL = __ENV.BROWSER_SIM_URL || 'http://localhost:8090';

export default function () {
    // Call browser-simulator's /trigger endpoint
    // This triggers one full simulation with proper trace context:
    //   browser-frontend → frontend → product-catalog, cart, recommendation, checkout
    const res = http.get(`${BROWSER_SIM_URL}/trigger`, {
        tags: { name: 'BrowserSimulation' },
        timeout: '30s',
    });

    check(res, {
        'trigger status 200': (r) => r.status === 200,
        'has success': (r) => r.json('success') === true,
    });

    triggerDuration.add(res.timings.duration);
    totalRequests.add(1);
    errorRate.add(res.status !== 200);

    // Small random sleep between iterations
    sleep(randomIntBetween(0.05, 0.2));
}

export function setup() {
    console.log('========================================');
    console.log('OpenTelemetry Demo Load Test');
    console.log('========================================');
    console.log(`Mode: ${MODE === 'load' ? 'LOAD TEST (high volume)' : 'SLOW (3 req/s)'}`);
    console.log(`Target: ${BROWSER_SIM_URL}/trigger`);
    console.log('');
    console.log('Each trigger creates a full trace:');
    console.log('  browser-frontend (JS)');
    console.log('    → frontend (JS)');
    console.log('        → product-catalog (Go)');
    console.log('        → cart (Go) → Redis');
    console.log('        → recommendation (Python)');
    console.log('        → checkout (Go) → all services');
    console.log('========================================');
    if (MODE === 'slow') {
        console.log('Tip: Use -e MODE=load for high-volume load testing');
    }

    // Verify browser-simulator is reachable
    const healthRes = http.get(`${BROWSER_SIM_URL}/health`);
    if (healthRes.status !== 200) {
        console.error(`Browser-simulator not reachable! Status: ${healthRes.status}`);
        console.error('Make sure services are running: COUNT=0 docker-compose up');
    } else {
        console.log('Browser-simulator is healthy ✓');
    }
}

export function teardown(data) {
    console.log('');
    console.log('========================================');
    console.log('Load Test Complete!');
    console.log('========================================');
}
