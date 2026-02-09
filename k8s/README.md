# E-Ticaret Kubernetes Deployment

Bu klasör, e-ticaret mikroservislerinin Kubernetes üzerinde deploy edilmesi için gerekli yapılandırma dosyalarını içerir.

## 📁 Dosya Yapısı

```
k8s/
├── configmap.yaml      # Paylaşılan yapılandırmalar (BASE_DOMAIN, paths)
├── secrets.yaml        # Hassas bilgiler (JWT secret, DB credentials)
├── ingress.yaml        # Path-based routing yapılandırması
├── search-service.yaml # Search Service deployment & service
├── auth-service.yaml   # Auth Service deployment & service
└── README.md           # Bu dosya
```

## 🌐 Mimari

```
                    ┌─────────────────────────────────────────────────────┐
                    │                   INGRESS                            │
                    │            suleymanakturk.online                     │
                    └─────────────────────────────────────────────────────┘
                                          │
           ┌──────────────────────────────┼──────────────────────────────┐
           │                              │                              │
           ▼                              ▼                              ▼
    ┌──────────────┐             ┌──────────────┐             ┌──────────────┐
    │     /        │             │   /login     │             │  /products   │
    │ search-svc   │             │ auth-svc-fe  │             │ product-svc  │
    │   :3007      │             │   :3001      │             │   :3006      │
    └──────────────┘             └──────────────┘             └──────────────┘
```

## 🚀 Deployment Adımları

### 1. Secrets oluşturun (ÖNEMLİ: Production değerlerini kullanın!)

```bash
# secrets.yaml dosyasını düzenleyin, sonra:
kubectl apply -f secrets.yaml
```

### 2. ConfigMap oluşturun

```bash
kubectl apply -f configmap.yaml
```

### 3. Servisleri deploy edin

```bash
kubectl apply -f search-service.yaml
kubectl apply -f auth-service.yaml
# Diğer servisler için de aynı şekilde...
```

### 4. Ingress'i oluşturun

```bash
kubectl apply -f ingress.yaml
```

## 🔧 Domain Değiştirme

Domain değiştirmek için:

1. `configmap.yaml` dosyasında `BASE_DOMAIN` değerini güncelleyin
2. `ingress.yaml` dosyasında `host` değerini güncelleyin
3. ConfigMap'i yeniden uygulayın:
   ```bash
   kubectl apply -f configmap.yaml
   ```
4. Pod'ları yeniden başlatın:
   ```bash
   kubectl rollout restart deployment --all
   ```

## 📋 Path Routing Tablosu

| Path        | Kubernetes Service      | Port |
|-------------|-------------------------|------|
| `/`         | search-service          | 3007 |
| `/login`    | auth-service-frontend   | 3001 |
| `/categories` | category-service      | 3002 |
| `/seller`   | seller-service          | 3005 |
| `/products` | product-service         | 3006 |
| `/cart`     | cart-service            | 3008 |
| `/orders`   | order-service           | 3009 |

## ⚡ İletişim Türleri

### Frontend Yönlendirmeleri (Tarayıcı)
- Kullanıcı tarayıcısında görünen URL'ler
- Örnek: `https://suleymanakturk.online/login`
- Bu istekler Ingress üzerinden ilgili servise yönlendirilir

### Backend API Çağrıları (Tarayıcı → Ingress → Servis)
- Frontend JavaScript'ten yapılan API çağrıları
- Örnek: `fetch('https://suleymanakturk.online/categories/api/categories')`
- Yine Ingress üzerinden yönlendirilir

### Servis-arası İletişim (Kubernetes DNS)
- Bir servisin diğer servisi doğrudan çağırması
- Örnek: `http://category-service:3002/api/categories`
- Kubernetes internal DNS kullanılır

## 🔒 TLS/SSL

Production'da TLS sertifikası ekleyin:

```bash
# Let's Encrypt ile cert-manager kullanarak:
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# ClusterIssuer oluşturun
# Ingress'e annotation ekleyin: cert-manager.io/cluster-issuer: "letsencrypt-prod"
```
