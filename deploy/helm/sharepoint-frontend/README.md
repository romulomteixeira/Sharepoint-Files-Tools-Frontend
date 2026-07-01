# Helm chart — sharepoint-frontend

Sobe a SPA (Nginx) no AKS. O `nginx.conf` da imagem faz `proxy_pass
http://backend:8787` para `/api`, `/health`, `/metrics`, `/api-docs` e o SSE de
scans/jobs. Este chart cria um **Service ExternalName `backend`** apontando para
o gateway do backend, então a imagem funciona **sem rebuild**.

## Pré-requisitos
- Backend já instalado no cluster (chart `sharepoint-monitor`) — o gateway
  precisa existir para o ExternalName resolver.
- `az aks get-credentials` já configurado.

## Deploy
```bash
helm upgrade --install spm-fe deploy/helm/sharepoint-frontend \
  -n sharepoint-monitor \
  --set image.tag="<TAG_DA_IMAGEM_FRONTEND>" \
  --set backend.gatewayServiceFQDN="spm-sharepoint-monitor-gateway.sharepoint-monitor.svc.cluster.local"
```
- Ajuste `gatewayServiceFQDN` se o release/namespace do backend forem outros
  (padrão: release `spm`, namespace `sharepoint-monitor`).
- A imagem é publicada pelo pipeline do repo (variável `IMAGE_NAME`,
  ex.: `romulomteixeira/sharepoint-monitor-frontend`).

## Acesso
```bash
kubectl -n sharepoint-monitor get svc spm-fe-sharepoint-frontend -w   # IP público (LoadBalancer)
```
Abra `http://<EXTERNAL-IP>/` no navegador. O nginx serve a SPA e faz proxy de
`/api` para o gateway do backend.

## Componentes
| Recurso | Função |
|---|---|
| Deployment | Nginx servindo a SPA (porta 80) |
| Service (LoadBalancer) | IP público de entrada |
| Service `backend` (ExternalName) | resolve `backend` → gateway do backend (para o proxy do nginx) |
| Ingress (opcional) | se preferir um Ingress Controller em vez de LoadBalancer |
