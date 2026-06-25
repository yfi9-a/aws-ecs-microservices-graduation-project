#!/usr/bin/env bash
# Builds and pushes auth, orders, notifications images to ECR.
# Usage: ./build-push.sh <aws-account-id> <aws-region> [tag]

set -euo pipefail

ACCOUNT_ID="${1:?Usage: $0 <aws-account-id> <aws-region> [tag]}"
REGION="${2:?Usage: $0 <aws-account-id> <aws-region> [tag]}"
TAG="${3:-latest}"

ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
SERVICES=(auth orders notifications)

echo "==> Logging in to ECR (${ECR_REGISTRY})"
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

for svc in "${SERVICES[@]}"; do
  REPO="${svc}-service"
  IMAGE="${ECR_REGISTRY}/${REPO}:${TAG}"

  echo "==> Ensuring ECR repo exists: ${REPO}"
  aws ecr describe-repositories --repository-names "${REPO}" --region "${REGION}" >/dev/null 2>&1 \
    || aws ecr create-repository \
         --repository-name "${REPO}" \
         --image-scanning-configuration scanOnPush=true \
         --region "${REGION}" >/dev/null

  echo "==> Building ${svc} -> ${IMAGE}"
  docker build -t "${IMAGE}" "./${svc}"

  echo "==> Pushing ${IMAGE}"
  docker push "${IMAGE}"
done

echo "==> Done. Images pushed:"
for svc in "${SERVICES[@]}"; do
  echo "  ${ECR_REGISTRY}/${svc}-service:${TAG}"
done
