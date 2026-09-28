# Kubernetes Manifests (CCE-Ready)

These manifests deploy the ecommerce platform per the Phase 1 guide (§5.1, §11.2 Steps 5–7).
They target any standard Kubernetes cluster (CCE, Magnum/OpenStack, k3s for local testing).

## Files

| File | Contents |
|---|---|
| `00-namespace-config.yaml` | Namespace `ecommerce`, ConfigMap, Secret (placeholders) |
| `10-backend-services.yaml` | Deployments + Services: product-catalog, product-inventory, profile-management, shipping-and-handling, contact-support-team |
| `20-order-management.yaml` | Order-management Deployment + Service (actuator probes) |
| `30-frontend.yaml` | ecommerce-ui Deployment + Service |
| `40-ingress.yaml` | Ingress → ecommerce-ui (TLS) |
| `50-hpa.yaml` | HPAs for product-catalog & order-management |

## Before you apply (Phase 1 guide prerequisites)

1. **Images in SWR** — build and push all 7 services, then replace
   `swr.example.com/ecommerce/...` in the manifests:
   ```bash
   docker build -t <SWR_HOST>/ecommerce/product-catalog:1.0.0 ./product-catalog
   docker push <SWR_HOST>/ecommerce/product-catalog:1.0.0
   # ...repeat for each service
   ```
2. **Database** — RDS MySQL must be reachable and have the schema applied:
   `mysql -h <RDS_ENDPOINT> -u <user> -p < db/init.sql`
   (Also works against self-managed MySQL on a VM with a Cinder volume.)
3. **Real Secret values** — do not commit credentials. Instead:
   ```bash
   kubectl -n ecommerce create secret generic ecommerce-secrets \
     --from-literal=DB_USER=ecommerce_user \
     --from-literal=DB_PASSWORD='...' \
     --from-literal=JWT_SECRET="$(openssl rand -hex 32)"
   ```
4. **Fill in TODOs** — RDS/DCS endpoints in the ConfigMap, public domain + TLS secret
   in the Ingress, ingress-class/annotations per your cluster.

## Apply order

```bash
kubectl apply -f k8s/00-namespace-config.yaml   # namespace, config, secrets
kubectl apply -f k8s/10-backend-services.yaml   # backend deployments
kubectl apply -f k8s/20-order-management.yaml
kubectl apply -f k8s/30-frontend.yaml
kubectl apply -f k8s/40-ingress.yaml
kubectl apply -f k8s/50-hpa.yaml
```

Or all at once: `kubectl apply -f k8s/`

## Verify (guide §11.3)

```bash
kubectl -n ecommerce get pods,svc,ingress,hpa
kubectl -n ecommerce rollout status deploy/order-management
curl https://shop.example.com/health
```

## Local test (no cloud needed)

```bash
kubectl apply -f k8s/                    # uses in-cluster Services via ConfigMap
# For local clusters also deploy MySQL+Redis or port-forward to the compose stack.
```
