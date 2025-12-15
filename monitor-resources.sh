#!/bin/bash
# Resource monitoring script for load testing
# Run alongside k6 to capture CPU/RAM usage

OUTPUT_FILE="resource-stats.csv"

echo "timestamp,container,cpu_percent,mem_usage_mb,mem_percent" > $OUTPUT_FILE

echo "=========================================="
echo "Resource Monitor Started"
echo "Output: $OUTPUT_FILE"
echo "Press Ctrl+C to stop"
echo "=========================================="

while true; do
    TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
    
    # Get Docker container stats
    docker stats --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" otel-mock 2>/dev/null | while read line; do
        CONTAINER=$(echo $line | cut -d',' -f1)
        CPU=$(echo $line | cut -d',' -f2 | tr -d '%')
        MEM_RAW=$(echo $line | cut -d',' -f3 | cut -d'/' -f1)
        MEM_PERCENT=$(echo $line | cut -d',' -f4 | tr -d '%')
        
        # Convert memory to MB
        if [[ $MEM_RAW == *"GiB"* ]]; then
            MEM_MB=$(echo $MEM_RAW | tr -d 'GiB' | awk '{print $1 * 1024}')
        elif [[ $MEM_RAW == *"MiB"* ]]; then
            MEM_MB=$(echo $MEM_RAW | tr -d 'MiB')
        else
            MEM_MB=$MEM_RAW
        fi
        
        echo "$TIMESTAMP,$CONTAINER,$CPU,$MEM_MB,$MEM_PERCENT" >> $OUTPUT_FILE
        echo "[$TIMESTAMP] CPU: ${CPU}% | RAM: ${MEM_MB}MB (${MEM_PERCENT}%)"
    done
    
    sleep 2
done
