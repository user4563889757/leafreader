# Deploying to AWS (free-tier friendly)

This deploys the static site to a **private S3 bucket** served through
**CloudFront** over HTTPS. There is no server, no database, and no AWS-specific
code in the app.

```
Browser ──HTTPS──▶ CloudFront ──signed request (OAC)──▶ S3 bucket (private)
```

## What this creates

| Resource | Purpose | Free-tier note |
| --- | --- | --- |
| S3 bucket | Stores ~2–5 MB of HTML/JSON | Small; S3 has a free allowance for new accounts |
| CloudFront distribution | HTTPS, CDN, default `*.cloudfront.net` domain | CloudFront has an always-free monthly allowance |
| Origin Access Control | Lets CloudFront read the private bucket | Free |
| Response headers policy | CSP, HSTS, `nosniff`, frame/referrer/permissions policy | Free |
| Bucket policy | Denies public access; allows only this distribution | Free |

It deliberately does **not** create:

- **Route 53 hosted zone** — that is $0.50/month and unnecessary.
- **ACM certificate** — unnecessary on the default CloudFront domain.
- **NAT gateway, EC2, RDS, load balancer** — none are needed for a static site.

## Prerequisites

- An AWS account.
- [AWS CLI v2](https://aws.amazon.com/cli/) installed.
- Credentials with permission to manage CloudFormation, S3, and CloudFront:

```bash
aws configure
aws sts get-caller-identity
```

If you use an IAM user instead of an admin, attach a scoped policy for
`cloudformation:*`, `s3:*`, `cloudfront:*`, and `sts:GetCallerIdentity` on the
resources this stack owns. For a personal account, the simplest safe path is to
run the deploy once with admin credentials, then remove them.

## Deploy

```bash
chmod +x deploy/aws/deploy.sh
./deploy/aws/deploy.sh
```

Optional overrides:

```bash
STACK=my-leafreader \
BUCKET_NAME=my-globally-unique-bucket \
AWS_REGION=us-east-1 \
./deploy/aws/deploy.sh
```

Output ends with a `https://dxxxxxxxxxxxxx.cloudfront.net` URL. The first
deployment can take 5–15 minutes while CloudFront propagates.

### What the script does

1. Creates/updates the CloudFormation stack in `template.yaml`.
2. Uploads the site with `aws s3 sync` (excluding `.git`, `deploy/`, `scripts/`).
3. Sets `no-cache` on HTML and the service worker, short TTLs on data, longer
   TTLs on assets.
4. Invalidates `/*` so the new version appears immediately.

Re-running the script deploys changes. It is safe to run repeatedly.

## Cost guardrails (do this)

Free-tier terms change, and new AWS accounts may be on a credit-based free plan
rather than the old 12-month service allowances. Check the current
[AWS Free Tier page](https://aws.amazon.com/free/) before deploying.

At this site's size the steady-state cost should be fractions of a cent, but a
traffic spike or a misconfigured resource can bill you. Set a budget:

```bash
aws budgets create-budget \
  --account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --budget '{
    "BudgetName": "leafreader-guard",
    "BudgetLimit": {"Amount": "1", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }'
```

Also:

- Keep **PriceClass_100** (US/Europe) as configured, unless you need global edge
  locations.
- Do not enable S3 static website hosting; CloudFront + OAC is the supported path.
- Do not create a Route 53 zone just for this demo.
- Delete the stack when you are done (see below).

## Tear down

CloudFormation will not delete a non-empty bucket, so empty it first:

```bash
STACK=leafreader
BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='Bucket']|[0].OutputValue" --output text)

aws s3 rm "s3://$BUCKET" --recursive
aws cloudformation delete-stack --stack-name "$STACK"
aws cloudformation wait stack-delete-complete --stack-name "$STACK"
```

## Custom domain (optional, not free)

A custom domain is the only recurring cost in this setup. If you want one:

1. Register the domain (Route 53, Cloudflare, Namecheap, etc.).
2. Request a free ACM certificate in **us-east-1** (CloudFront only reads
   certificates from that region).
3. Add an alternate domain name and certificate to the distribution.
4. Point DNS at the CloudFront distribution.

For a **decentralized domain**, skip this and use the IPFS/ENS track in
[`deploy/ipfs/`](../ipfs/README.md). ENS `contenthash` points at content, not at
an AWS hostname, so the two tracks mirror the same files rather than chaining
CloudFront behind ENS.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `AccessDenied` from CloudFront | Wait for the distribution to finish deploying; check the bucket policy has the distribution ARN |
| 403 for `/` | Confirm `DefaultRootObject` is `index.html` and the object exists |
| Old content after deploy | Run an invalidation: `aws cloudfront create-invalidation --distribution-id <id> --paths '/*'` |
| `No credentials found` | Run `aws configure` or set `AWS_PROFILE` |
| Stack stuck | Check the CloudFormation events tab; most failures are bucket-name collisions or missing permissions |
