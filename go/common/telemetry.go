package common

import (
	"context"
	"log"
	"os"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/host"
	"go.opentelemetry.io/contrib/instrumentation/runtime"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdkresource "go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
)

const serviceVersion = "1.0.0"

// TelemetryProviders holds all OTel providers for a service
type TelemetryProviders struct {
	TracerProvider *sdktrace.TracerProvider
	MeterProvider  *sdkmetric.MeterProvider
	LoggerProvider *sdklog.LoggerProvider
	Tracer         trace.Tracer
}

// InitTelemetry initializes all OTel providers for a service
func InitTelemetry(ctx context.Context, serviceName string) *TelemetryProviders {
	res := initResource(serviceName)

	tp := initTracerProvider(ctx, res)
	mp := initMeterProvider(ctx, res)
	lp := initLoggerProvider(ctx, res)

	if err := runtime.Start(runtime.WithMinimumReadMemStatsInterval(time.Second * 5)); err != nil {
		log.Printf("failed to start runtime metrics: %v", err)
	}

	if err := host.Start(host.WithMeterProvider(mp)); err != nil {
		log.Printf("failed to start host metrics: %v", err)
	}

	// Set global propagator for context propagation
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return &TelemetryProviders{
		TracerProvider: tp,
		MeterProvider:  mp,
		LoggerProvider: lp,
		Tracer:         tp.Tracer(serviceName),
	}
}

func initResource(serviceName string) *sdkresource.Resource {
	hostname, _ := os.Hostname()

	res, err := sdkresource.New(
		context.Background(),
		sdkresource.WithAttributes(
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion(serviceVersion),
			semconv.TelemetrySDKLanguageGo,
			semconv.HostName(hostname),
			attribute.String("deployment.environment", "demo"),
			attribute.String("container.runtime", "docker"),
		),
		sdkresource.WithHost(),
		sdkresource.WithProcess(),
		sdkresource.WithContainer(),
	)
	if err != nil {
		log.Fatalf("failed to create resource: %v", err)
	}
	return res
}

func initTracerProvider(ctx context.Context, res *sdkresource.Resource) *sdktrace.TracerProvider {
	exporter, err := otlptracegrpc.New(ctx, otlptracegrpc.WithInsecure())
	if err != nil {
		log.Fatalf("failed to create trace exporter: %v", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	return tp
}

func initMeterProvider(ctx context.Context, res *sdkresource.Resource) *sdkmetric.MeterProvider {
	exporter, err := otlpmetricgrpc.New(ctx, otlpmetricgrpc.WithInsecure())
	if err != nil {
		log.Fatalf("failed to create metric exporter: %v", err)
	}

	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exporter)),
		sdkmetric.WithResource(res),
	)
	return mp
}

func initLoggerProvider(ctx context.Context, res *sdkresource.Resource) *sdklog.LoggerProvider {
	exporter, err := otlploggrpc.New(ctx, otlploggrpc.WithInsecure())
	if err != nil {
		log.Fatalf("failed to create log exporter: %v", err)
	}

	lp := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(sdklog.NewBatchProcessor(exporter)),
		sdklog.WithResource(res),
	)
	return lp
}

// Shutdown gracefully shuts down all providers
func (t *TelemetryProviders) Shutdown(ctx context.Context) {
	if t.TracerProvider != nil {
		t.TracerProvider.Shutdown(ctx)
	}
	if t.MeterProvider != nil {
		t.MeterProvider.Shutdown(ctx)
	}
	if t.LoggerProvider != nil {
		t.LoggerProvider.Shutdown(ctx)
	}
}
