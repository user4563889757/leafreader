#!/usr/bin/env bash
# Deploy Leafreader to S3 + CloudFront using only the AWS CLI.
#
#   ./deploy/aws/deploy.sh
#   STACK=my-leafreader BUCKET_NAME=my-unique-bucket ./deploy/aws/deploy.sh
#
# The stack keeps the bucket private and serves it through CloudFront with
# signed origin access. It does not create a hosted zone, certificate, or any
# paid resource. HTTPS works on the *.cloudfront.net domain immediately.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK="${STACK:-leafreader}"
REGION="${AWS_REGION:-us-east-1}"
BUCKET_NAME="${BUCKET_NAME:-}"
TEMPLATE="$ROOT/deploy/aws/template.yaml"

command -v aws >/dev/null 2>&1 || {
  echo "AWS CLI v2 is required: https://aws.amazon.com/cli/" >&2
  exit 1
}

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "No AWS credentials found. Run 'aws configure' (or set a profile) first." >&2
  exit 1
fi

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
echo "Account: $ACCOUNT"
echo "Stack:   $STACK ($REGION)"

echo "→ deploying CloudFormation stack"
aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file "$TEMPLATE" \
  --region "$REGION" \
  --parameter-overrides "BucketName=$BUCKET_NAME" \
  --no-fail-on-empty-changeset \
  --tags Project=leafreader

output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1']|[0].OutputValue" \
    --output text
}

BUCKET="$(output Bucket)"
DISTRIBUTION="$(output DistributionId)"
SITE_URL="$(output SiteURL)"

echo "→ uploading site to s3://$BUCKET"
aws s3 sync "$ROOT" "s3://$BUCKET" \
  --region "$REGION" \
  --delete \
  --exclude ".git/*" \
  --exclude ".git" \
  --exclude "deploy/*" \
  --exclude "scripts/*" \
  --exclude "README.md" \
  --exclude "LICENSE" \
  --exclude "SECURITY.md" \
  --exclude "_headers" \
  --exclude ".gitignore" \
  --exclude ".nojekyll" \
  --exclude "__pycache__/*" \
  --exclude "*.pyc" \
  --cache-control "public,max-age=300"

# Make the entry points and service worker revalidate on every visit.
for file in index.html read.html 404.html; do
  aws s3 cp "$ROOT/$file" "s3://$BUCKET/$file" \
    --region "$REGION" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "no-cache"
done

aws s3 cp "$ROOT/sw.js" "s3://$BUCKET/sw.js" \
  --region "$REGION" \
  --content-type "text/javascript; charset=utf-8" \
  --cache-control "no-cache"

aws s3 cp "$ROOT/manifest.webmanifest" "s3://$BUCKET/manifest.webmanifest" \
  --region "$REGION" \
  --content-type "application/manifest+json" \
  --cache-control "public,max-age=3600"

aws s3 sync "$ROOT/data" "s3://$BUCKET/data" \
  --region "$REGION" \
  --cache-control "public,max-age=60"

aws s3 sync "$ROOT/assets" "s3://$BUCKET/assets" \
  --region "$REGION" \
  --cache-control "public,max-age=300"

echo "→ invalidating CloudFront cache"
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION" \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text >/dev/null

echo
echo "Done."
echo "  Site:      $SITE_URL"
echo "  Bucket:    $BUCKET"
echo "  Stack:     $STACK"
echo
echo "CloudFront can take a few minutes to finish the first deployment."
echo "Optional: set a budget alarm so free-tier overages can never surprise you:"
echo "  aws budgets create-budget --account-id $ACCOUNT \\"
echo "    --budget '{\"BudgetName\":\"leafreader-guard\",\"BudgetLimit\":{\"Amount\":\"1\",\"Unit\":\"USD\"},\"TimeUnit\":\"MONTHLY\",\"BudgetType\":\"COST\"}'"
