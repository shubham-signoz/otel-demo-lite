const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { trace, metrics, propagation, context, SpanKind, SpanStatusCode } = require('@opentelemetry/api');
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
const { W3CTraceContextPropagator, CompositePropagator, W3CBaggagePropagator } = require('@opentelemetry/core');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader, MeterProvider } = require('@opentelemetry/sdk-metrics');
const { LoggerProvider, SimpleLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { HostMetrics } = require('@opentelemetry/host-metrics');

let sdk = null;
let loggerProvider = null;
let hostMetrics = null;

function initTelemetry(defaultServiceName) {
    const serviceName = process.env.OTEL_SERVICE_NAME || defaultServiceName;
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT_HTTP ||
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(':4317', ':4318') ||
        'http://localhost:4318';

    const resource = new Resource({
        'service.name': serviceName,
        'service.version': '1.0.0',
        'telemetry.sdk.language': 'javascript',
    });

    const traceExporter = new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` });
    const metricReader = new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${otlpEndpoint}/v1/metrics` }),
        exportIntervalMillis: 5000,
    });

    // Initialize Logs SDK
    const logExporter = new OTLPLogExporter({ url: `${otlpEndpoint}/v1/logs` });
    loggerProvider = new LoggerProvider({ resource });
    loggerProvider.addLogRecordProcessor(new SimpleLogRecordProcessor(logExporter));
    logs.setGlobalLoggerProvider(loggerProvider);

    sdk = new NodeSDK({
        resource,
        traceExporter,
        metricReader,
        instrumentations: [new HttpInstrumentation()],
    });

    propagation.setGlobalPropagator(
        new CompositePropagator({
            propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
        })
    );

    sdk.start();
    console.log(`[OTel] ${serviceName} initialized → ${otlpEndpoint}`);

    hostMetrics = new HostMetrics({ name: serviceName });
    hostMetrics.start();
    console.log(`[OTel] ${serviceName} host metrics started`);

    return {
        sdk,
        provider: sdk,
        tracer: trace.getTracer(serviceName),
        meter: metrics.getMeter(serviceName),
        logger: logs.getLogger(serviceName),
    };
}

function emitLog(logger, message, attributes = {}, severity = 'INFO') {
    const activeContext = context.active();
    const span = trace.getSpan(activeContext);
    const spanContext = span?.spanContext();

    const severityMap = {
        'DEBUG': SeverityNumber.DEBUG,
        'INFO': SeverityNumber.INFO,
        'WARN': SeverityNumber.WARN,
        'ERROR': SeverityNumber.ERROR,
    };

    logger.emit({
        severityNumber: severityMap[severity] || SeverityNumber.INFO,
        severityText: severity,
        body: message,
        attributes: {
            ...attributes,
        },
        context: activeContext,
    });
}

function shutdown() {
    const promises = [];
    if (sdk) {
        promises.push(sdk.shutdown());
    }
    if (loggerProvider) {
        promises.push(loggerProvider.shutdown());
    }
    return Promise.all(promises);
}

module.exports = {
    initTelemetry,
    shutdown,
    emitLog,
    trace,
    metrics,
    logs,
    propagation,
    context,
    SpanKind,
    SpanStatusCode,
    SeverityNumber
};
