#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COUNT=${1:-10}  # Default to 10 iterations

echo "=================================="
echo "OTel Demo Mock - Multi-Language"
echo "=================================="
echo "Count: $COUNT"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

PIDS=()

cleanup() {
    echo -e "\n${YELLOW}Shutting down all services...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done
    wait
    echo -e "${GREEN}All services stopped.${NC}"
}

trap cleanup EXIT INT TERM

check_deps() {
    echo -e "${BLUE}Checking dependencies...${NC}"
    
    if ! command -v go &> /dev/null; then
        echo -e "${RED}Error: Go is not installed${NC}"
        exit 1
    fi
    
    if ! command -v python3 &> /dev/null; then
        echo -e "${RED}Error: Python3 is not installed${NC}"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}All dependencies found.${NC}"
}

setup_python() {
    echo -e "${BLUE}Setting up Python environment...${NC}"
    cd "$SCRIPT_DIR/python"
    python3 -m pip install -q -r requirements.txt 2>/dev/null || true
    cd "$SCRIPT_DIR"
}

setup_node() {
    echo -e "${BLUE}Setting up Node.js environment...${NC}"
    cd "$SCRIPT_DIR/javascript"
    npm install --silent 2>/dev/null || true
    cd "$SCRIPT_DIR"
}

build_go() {
    echo -e "${BLUE}Building Go services...${NC}"
    cd "$SCRIPT_DIR/go"
    go mod tidy 2>/dev/null || true
    go build -o ../bin/go-services . 2>/dev/null || true
    cd "$SCRIPT_DIR"
}

start_js_services() {
    echo -e "${BLUE}Starting JavaScript services...${NC}"
    cd "$SCRIPT_DIR/javascript"

    node frontend.js &
    PIDS+=($!)
    echo -e "  ${GREEN}✓ Frontend${NC}"

    PORT=8081 node payment.js &
    PIDS+=($!)
    echo -e "  ${GREEN}✓ Payment${NC}"

    PORT=8087 node ad.js &
    PIDS+=($!)
    echo -e "  ${GREEN}✓ Ad${NC}"

    PORT=8088 node email.js &
    PIDS+=($!)
    echo -e "  ${GREEN}✓ Email${NC}"

    cd "$SCRIPT_DIR"
}

start_go_services() {
    echo -e "${BLUE}Starting Go services...${NC}"
    cd "$SCRIPT_DIR/go"

    go run . --service shipping &
    PIDS+=($!)
    echo -e "  ${GREEN}✓ Shipping${NC}"

    go run . --service cart &
    PIDS+=($!)
    echo -e "  ${GREEN}✓ Cart${NC}"

    go run . --service product-catalog &
    PIDS+=($!)
    echo -e "  ${GREEN}✓ Product Catalog${NC}"

    go run . --service currency &
    PIDS+=($!)
    echo -e "  ${GREEN}✓ Currency${NC}"

    cd "$SCRIPT_DIR"
}

start_python_services() {
    echo -e "${BLUE}Starting Python services...${NC}"
    cd "$SCRIPT_DIR/python"

    python3 recommendation.py --port 8086 &
    PIDS+=($!)
    echo -e "  ${GREEN}✓ Recommendation${NC}"

    cd "$SCRIPT_DIR"
}

run_checkout() {
    echo -e "\n${BLUE}Running Checkout...${NC}"
    cd "$SCRIPT_DIR/go"
    go run . --service checkout --count "$COUNT"
    cd "$SCRIPT_DIR"
}

run_load_generator() {
    echo -e "\n${BLUE}Running Load Generator...${NC}"
    cd "$SCRIPT_DIR/python"
    python3 load_generator.py --count "$COUNT"
    cd "$SCRIPT_DIR"
}

main() {
    check_deps
    
    mkdir -p "$SCRIPT_DIR/bin"
    
    # Setup environments
    setup_python
    setup_node
    build_go
    
    echo ""
    echo -e "${GREEN}Starting all services...${NC}"
    echo ""
    
    start_js_services
    start_go_services
    start_python_services

    echo ""
    echo -e "${YELLOW}Waiting for services to start...${NC}"
    sleep 3
    
    echo ""
    echo "=================================="
    echo -e "${GREEN}All services running!${NC}"
    echo "=================================="
    echo ""
    echo "Services:"
    echo "  - Frontend:        http://localhost:8080"
    echo "  - Payment:         http://localhost:8081"
    echo "  - Shipping:        http://localhost:8082"
    echo "  - Cart:            http://localhost:8084"
    echo "  - Product Catalog: http://localhost:8085"
    echo "  - Recommendation:  http://localhost:8086"
    echo "  - Ad:              http://localhost:8087"
    echo "  - Email:           http://localhost:8088"
    echo "  - Currency:        http://localhost:8089"
    echo ""
    
    run_checkout

    echo ""
    echo -e "${GREEN}Checkout completed ${COUNT} orders.${NC}"
    echo ""

    if [[ "${RUN_LOAD_GEN:-false}" == "true" ]]; then
        run_load_generator
    fi
    
    echo -e "${YELLOW}Press Ctrl+C to stop all services...${NC}"
    wait
}

main "$@"
