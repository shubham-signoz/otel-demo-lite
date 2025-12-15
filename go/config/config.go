package config

import "os"

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

var (
	FrontendURL       = getEnv("FRONTEND_URL", "http://localhost:8080")
	PaymentURL        = getEnv("PAYMENT_URL", "http://localhost:8081")
	ShippingURL       = getEnv("SHIPPING_URL", "http://localhost:8082")
	CheckoutURL       = getEnv("CHECKOUT_URL", "http://localhost:8083")
	CartURL           = getEnv("CART_URL", "http://localhost:8084")
	ProductCatalogURL = getEnv("PRODUCT_CATALOG_URL", "http://localhost:8085")
	RecommendationURL = getEnv("RECOMMENDATION_URL", "http://localhost:8086")
	AdURL             = getEnv("AD_URL", "http://localhost:8087")
	EmailURL          = getEnv("EMAIL_URL", "http://localhost:8088")
	CurrencyURL       = getEnv("CURRENCY_URL", "http://localhost:8089")
	AccountingURL     = getEnv("ACCOUNTING_URL", "http://localhost:8091")
	FraudDetectionURL = getEnv("FRAUD_DETECTION_URL", "http://localhost:8092")
	QuoteURL          = getEnv("QUOTE_URL", "http://localhost:8094")
)
