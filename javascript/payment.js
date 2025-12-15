/**
 * Payment Service - Transaction processing
 */
const http = require('http');
const url = require('url');
const { randomUUID } = require('crypto');
const { initTelemetry, shutdown, emitLog, trace, propagation, context, SpanKind, SpanStatusCode } = require('./common/telemetry');

const PORT = process.env.PORT || 8081;
const { tracer, meter, logger } = initTelemetry('payment');

const transactionsCounter = meter.createCounter('app.payment.transactions', { unit: '{transactions}' });
const paymentLatency = meter.createHistogram('app.payment.latency', { unit: 'ms' });

const CARD_PREFIXES = { '4': 'visa', '5': 'mastercard', '3': 'amex', '6': 'discover' };
const LOYALTY_LEVELS = ['bronze', 'silver', 'gold', 'platinum'];

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const ctx = propagation.extract(context.active(), req.headers);

    if (parsedUrl.pathname === '/charge' && req.method === 'POST') {
        handleCharge(req, res, ctx);
    } else {
        res.writeHead(404);
        res.end('{"error":"Not found"}');
    }
});

function handleCharge(req, res, parentCtx) {
    const start = Date.now();

    const span = tracer.startSpan('charge', {
        kind: SpanKind.SERVER,
        attributes: { 'rpc.system': 'grpc', 'rpc.service': 'oteldemo.PaymentService', 'rpc.method': 'Charge' },
    }, parentCtx);

    context.with(trace.setSpan(parentCtx, span), () => {
        try {
            const baggage = propagation.getBaggage(trace.setSpan(parentCtx, span));
            if (baggage) {
                const syntheticEntry = baggage.getEntry('synthetic_request');
                span.setAttribute('app.payment.charged', !(syntheticEntry && syntheticEntry.value === 'true'));
            } else {
                span.setAttribute('app.payment.charged', true);
            }

            const cardNumber = `4${Math.floor(Math.random() * 1e15).toString().padStart(15, '0')}`;
            const cardType = CARD_PREFIXES[cardNumber.charAt(0)] || 'unknown';
            const lastFour = cardNumber.slice(-4);
            const loyaltyLevel = LOYALTY_LEVELS[Math.floor(Math.random() * LOYALTY_LEVELS.length)];
            const amount = (Math.random() * 500 + 10).toFixed(2);
            const currency = ['USD', 'EUR', 'GBP', 'JPY'][Math.floor(Math.random() * 4)];
            const transactionId = randomUUID();

            span.setAttributes({
                'app.payment.card_type': cardType,
                'app.payment.card_valid': true,
                'app.payment.last_four': lastFour,
                'app.loyalty.level': loyaltyLevel,
                'app.payment.amount': parseFloat(amount),
                'app.payment.currency': currency,
                'app.payment.transaction.id': transactionId,
            });

            if (Math.random() < 0.05) {
                const error = new Error('Payment failed: insufficient funds');
                span.recordException(error);
                span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
                span.addEvent('payment_failed', { 'app.payment.failure_reason': 'insufficient_funds' });
                transactionsCounter.add(1, { currency, status: 'failed', card_type: cardType });
                res.writeHead(402);
                res.end(JSON.stringify({ error: error.message }));
            } else {
                span.addEvent('payment_successful', { 'app.payment.transaction.id': transactionId });
                transactionsCounter.add(1, { currency, status: 'success', card_type: cardType });
                emitLog(logger, `Payment successful: ${transactionId}`, { 'transaction.id': transactionId, 'amount': amount, 'currency': currency });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ transaction_id: transactionId, amount, currency, card_type: cardType }));
            }

            paymentLatency.record(Date.now() - start, { card_type: cardType });
            span.end();
        } catch (err) {
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            span.end();
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
    });
}

server.listen(PORT, () => console.log(`Payment Service listening on port ${PORT}`));
process.on('SIGINT', () => { shutdown(); process.exit(0); });
