#!/bin/bash

# Test Qwen Image Edit with curl (Direct API test)
# Usage: ./test-qwen-curl.sh <image-url>
# Required: Set REPLICATE_API_TOKEN environment variable before running

if [ -z "$REPLICATE_API_TOKEN" ]; then
  echo "❌ Error: REPLICATE_API_TOKEN not set"
  echo "Usage: REPLICATE_API_TOKEN=your_token ./test-qwen-curl.sh <image-url>"
  exit 1
fi

IMAGE_URL="${1:-https://replicate.delivery/pbxt/NtGmf0mLzKb74fRmJQQJQq8LhWwjvQ6XdoMM9qJvCBQPKxoF/89020e7b-ab8e-4d8c-aaef-51b0b7a87c65.jpg}"

echo "🧪 Testing Qwen Image Edit API"
echo "Image: $IMAGE_URL"
echo ""

curl -s -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: wait" \
  -d "{
    \"input\": {
      \"image\": \"$IMAGE_URL\",
      \"prompt\": \"Remove all Nike logos and brand text\"
    }
  }" \
  https://api.replicate.com/v1/models/qwen/qwen-image-edit/predictions
