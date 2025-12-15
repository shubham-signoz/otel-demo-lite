package main

import (
	"context"
	"flag"
	"log"
	"sync"
	"time"

	"otel-mock/common"
	"otel-mock/services"
)

func main() {
	service := flag.String("service", "all", "Service to run: all, checkout, shipping, product-catalog, cart, currency")
	count := flag.Int("count", 1, "Number of orders to place (only for checkout)")
	flag.Parse()

	ctx := context.Background()

	switch *service {
	case "all":
		runAllServices(ctx, *count)
	case "checkout":
		tel := common.InitTelemetry(ctx, "checkout")
		defer tel.Shutdown(ctx)
		services.RunCheckoutService(*count, tel.TracerProvider, tel.LoggerProvider)
	case "shipping":
		tel := common.InitTelemetry(ctx, "shipping")
		defer tel.Shutdown(ctx)
		services.RunShippingService(tel.TracerProvider, tel.LoggerProvider)
	case "product-catalog":
		tel := common.InitTelemetry(ctx, "product-catalog")
		defer tel.Shutdown(ctx)
		services.RunProductCatalogService(tel.TracerProvider, tel.LoggerProvider)
	case "cart":
		tel := common.InitTelemetry(ctx, "cart")
		defer tel.Shutdown(ctx)
		services.RunCartService(tel.TracerProvider, tel.LoggerProvider)
	case "currency":
		tel := common.InitTelemetry(ctx, "currency")
		defer tel.Shutdown(ctx)
		services.RunCurrencyService(tel.TracerProvider, tel.LoggerProvider)
	default:
		log.Fatalf("Unknown service: %s", *service)
	}
}

func runAllServices(ctx context.Context, count int) {
	var wg sync.WaitGroup

	// Start servers first
	wg.Add(1)
	go func() {
		defer wg.Done()
		tel := common.InitTelemetry(ctx, "shipping")
		defer tel.Shutdown(ctx)
		services.RunShippingService(tel.TracerProvider, tel.LoggerProvider)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		tel := common.InitTelemetry(ctx, "product-catalog")
		defer tel.Shutdown(ctx)
		services.RunProductCatalogService(tel.TracerProvider, tel.LoggerProvider)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		tel := common.InitTelemetry(ctx, "cart")
		defer tel.Shutdown(ctx)
		services.RunCartService(tel.TracerProvider, tel.LoggerProvider)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		tel := common.InitTelemetry(ctx, "currency")
		defer tel.Shutdown(ctx)
		services.RunCurrencyService(tel.TracerProvider, tel.LoggerProvider)
	}()

	// Kafka consumer services (accounting and fraud-detection)
	wg.Add(1)
	go func() {
		defer wg.Done()
		tel := common.InitTelemetry(ctx, "accounting")
		defer tel.Shutdown(ctx)
		server := services.InitAccountingService(":8091", tel.TracerProvider, tel.MeterProvider, tel.LoggerProvider)
		server.ListenAndServe()
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		tel := common.InitTelemetry(ctx, "fraud-detection")
		defer tel.Shutdown(ctx)
		server := services.InitFraudDetectionService(":8092", tel.TracerProvider, tel.MeterProvider, tel.LoggerProvider)
		server.ListenAndServe()
	}()

	// Checkout HTTP server
	wg.Add(1)
	go func() {
		defer wg.Done()
		tel := common.InitTelemetry(ctx, "checkout")
		defer tel.Shutdown(ctx)
		server := services.InitCheckoutServer(":8083", tel.TracerProvider, tel.LoggerProvider)
		server.ListenAndServe()
	}()

	// Wait for servers to start
	log.Println("Waiting for Go services to start...")
	time.Sleep(2 * time.Second)

	// Only run batch checkout if count > 0
	// When count=0, just run as HTTP servers (frontend drives the traces)
	if count > 0 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tel := common.InitTelemetry(ctx, "checkout")
			defer tel.Shutdown(ctx)
			services.RunCheckoutService(count, tel.TracerProvider, tel.LoggerProvider)
		}()
	} else {
		log.Println("Count=0: Running as HTTP servers only")
	}

	wg.Wait()
}
