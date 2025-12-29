# AWS 設置指南 ☁️

> 按順序完成以下步驟，建立 CI/CD 所需的 AWS 資源

## 📋 架構總覽

```
Backend:  GitHub Actions → ECR → ECS (Fargate) → ALB
Frontend: GitHub Actions → S3 → CloudFront → Browser
```

| 資源            | 用途                |
| --------------- | ------------------- |
| VPC + Subnets   | 網絡隔離            |
| Security Groups | 防火牆規則          |
| RDS MySQL       | 數據庫（可選）      |
| Secrets Manager | 敏感資訊管理        |
| ECR             | Docker 映像倉庫     |
| ECS + Fargate   | 運行容器            |
| ALB             | 負載均衡            |
| S3 + CloudFront | 前端靜態網站託管    |
| IAM OIDC        | GitHub Actions 認證 |

---

## Part 1: 網絡設置

### 1.1 VPC（一鍵創建）

**Console**: VPC → Create VPC → **VPC and more**

| 設定            | 值               |
| --------------- | ---------------- |
| Name            | `doublespot-vpc` |
| IPv4 CIDR       | `10.0.0.0/16`    |
| AZs             | 2                |
| Public subnets  | 2                |
| Private subnets | 2                |
| NAT gateways    | 1 per AZ         |

### 1.2 Security Groups

**Console**: VPC → Security Groups → Create

| 名稱                | 入站規則                              |
| ------------------- | ------------------------------------- |
| `doublespot-alb-sg` | HTTP(80), HTTPS(443) from `0.0.0.0/0` |
| `doublespot-ecs-sg` | TCP 3000 from `doublespot-alb-sg`     |
| `doublespot-rds-sg` | MySQL(3306) from `doublespot-ecs-sg`  |

---

## Part 2: 數據庫（可選）

### 2.1 DB Subnet Group

**Console**: RDS → Subnet groups → Create

| 設定    | 值                            |
| ------- | ----------------------------- |
| Name    | `doublespot-db-subnet-group`  |
| Subnets | 選擇 2 個 **private** subnets |

### 2.2 RDS MySQL

**Console**: RDS → Create database

| 設定             | 值                  |
| ---------------- | ------------------- |
| Engine           | MySQL 8.0           |
| Template         | Free tier           |
| DB identifier    | `doublespot-mysql`  |
| Instance class   | `db.t3.micro`       |
| Public access    | **No**              |
| Security group   | `doublespot-rds-sg` |
| Initial database | `doublespot`        |

---

## Part 3: IAM 設定

### 3.1 ECS Roles

**Console**: IAM → Roles → Create

| Role 名稱              | Trusted Entity | Policy                             |
| ---------------------- | -------------- | ---------------------------------- |
| `ecsTaskExecutionRole` | ECS Task       | `AmazonECSTaskExecutionRolePolicy` |
| `ecsTaskRole`          | ECS Task       | （暫不附加）                       |

### 3.2 GitHub OIDC Role（關鍵！）

#### Step 1: 創建 Identity Provider

**Console**: IAM → Identity providers → Add provider

| 設定          | 值                                            |
| ------------- | --------------------------------------------- |
| Provider type | OpenID Connect                                |
| Provider URL  | `https://token.actions.githubusercontent.com` |
| Audience      | `sts.amazonaws.com`                           |

#### Step 2: 創建 Role

**Console**: IAM → Roles → Create → Web identity

| 設定              | 值                                  |
| ----------------- | ----------------------------------- |
| Identity provider | token.actions.githubusercontent.com |
| Audience          | sts.amazonaws.com                   |
| Role name         | `GitHubActionsRole`                 |

**附加 Policies**:

- `AmazonEC2ContainerRegistryPowerUser`
- `AmazonECS_FullAccess`
- `AmazonS3FullAccess`
- `CloudFrontFullAccess`

#### Step 3: 編輯 Trust Policy

限制只有你的 Repo 可以使用：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/YOUR_REPO:*"
        }
      }
    }
  ]
}
```

---

## Part 4: Secrets Manager

**Console**: Secrets Manager → Store a new secret

| 設定        | 值                   |
| ----------- | -------------------- |
| Secret type | Other type of secret |
| Secret name | `doublespot/backend` |
| Key/Value   | `DB_PASSWORD`, etc.  |

**ecsTaskExecutionRole 需加權限**: `secretsmanager:GetSecretValue`

**Task Definition 引用**（格式：`secret-arn:json-key::`）:

```json
"secrets": [
  {
    "name": "DB_PASSWORD",
    "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:doublespot/backend:DB_PASSWORD::"
  }
]
```

---

## Part 5: ECR + CloudWatch

### ECR Repository

**Console**: ECR → Create repository

| 設定       | 值                   |
| ---------- | -------------------- |
| Visibility | Private              |
| Name       | `doublespot-backend` |

### CloudWatch Log Group

**Console**: CloudWatch → Log groups → Create

| 設定      | 值                        |
| --------- | ------------------------- |
| Name      | `/ecs/doublespot-backend` |
| Retention | 7 days                    |

---

## Part 6: ECS Cluster

**Console**: ECS → Clusters → Create

| 設定           | 值                   |
| -------------- | -------------------- |
| Name           | `doublespot-cluster` |
| Infrastructure | AWS Fargate          |

---

## Part 7: Load Balancer

### 7.1 Target Group

**Console**: EC2 → Target Groups → Create

| 設定              | 值                      |
| ----------------- | ----------------------- |
| Target type       | **IP**                  |
| Name              | `doublespot-backend-tg` |
| Port              | 3000                    |
| Health check path | `/health`               |

### 7.2 ALB

**Console**: EC2 → Load Balancers → Create ALB

| 設定           | 值                                |
| -------------- | --------------------------------- |
| Name           | `doublespot-alb`                  |
| Scheme         | Internet-facing                   |
| Subnets        | 2 個 **public** subnets           |
| Security group | `doublespot-alb-sg`               |
| Listener       | HTTP:80 → `doublespot-backend-tg` |

---

## Part 8: ECS Service

**Console**: ECS → Clusters → doublespot-cluster → Create service

| 設定            | 值                       |
| --------------- | ------------------------ |
| Task definition | `doublespot-backend`     |
| Service name    | `backend-service`        |
| Desired tasks   | 1                        |
| Subnets         | 2 個 **private** subnets |
| Security group  | `doublespot-ecs-sg`      |
| Load balancer   | `doublespot-alb`         |
| Target group    | `doublespot-backend-tg`  |

> ⚠️ 首次部署需先手動 push 一個映像到 ECR，或透過 GitHub Actions 觸發

---

## Part 9: Frontend（S3 + CloudFront）

### 9.1 S3 Bucket

**Console**: S3 → Create bucket

| 設定                    | 值                        |
| ----------------------- | ------------------------- |
| Name                    | `doublespot-frontend-xxx` |
| Block all public access | ✅ 保持勾選               |

### 9.2 CloudFront

**Console**: CloudFront → Create distribution

| 設定                   | 值                     |
| ---------------------- | ---------------------- |
| Origin domain          | 選擇 S3 bucket         |
| Origin access          | Origin access control  |
| Default root object    | `index.html`           |
| Viewer protocol policy | Redirect HTTP to HTTPS |

### 9.3 新增 ALB Origin（API 代理）

> ⚠️ 這步讓前端透過 CloudFront 訪問 API，避免 CORS 問題

**CloudFront** → 你的 distribution → Origins → Create origin

| 設定          | 值                                               |
| ------------- | ------------------------------------------------ |
| Origin domain | `doublespot-alb-xxx.us-west-2.elb.amazonaws.com` |
| Protocol      | **HTTP only**                                    |
| HTTP port     | 80                                               |
| Origin name   | `alb-origin`（自動生成）                         |

### 9.4 新增 API Behavior

**CloudFront** → Behaviors → Create behavior

| 設定                   | 值                                           |
| ---------------------- | -------------------------------------------- |
| Path pattern           | `/health*`                                   |
| Origin                 | 選擇 ALB origin                              |
| Viewer protocol policy | Redirect HTTP to HTTPS                       |
| Allowed HTTP methods   | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE |
| Cache policy           | `CachingDisabled`                            |
| Origin request policy  | `AllViewerExceptHostHeader`                  |

> 💡 `/health*` 會匹配 `/health` 和 `/health/db`

### 9.5 更新 GitHub Variable

```
VITE_API_BASE_URL=https://d1234abcd.cloudfront.net
```

前端 API 呼叫範例：

```javascript
fetch(`${VITE_API_BASE_URL}/health`);
```

### 9.6 SPA Error Pages

**CloudFront** → Error pages → Create：

| HTTP Error | Response Page | Response Code |
| ---------- | ------------- | ------------- |
| 403        | `/index.html` | 200           |
| 404        | `/index.html` | 200           |

---

## Part 10: GitHub Variables 設定

**GitHub Repo** → Settings → Secrets and variables → Actions → Variables

| Variable Name                | 範例值                                                |
| ---------------------------- | ----------------------------------------------------- |
| `AWS_REGION`                 | `us-west-2`                                           |
| `AWS_ROLE_TO_ASSUME`         | `arn:aws:iam::123456789:role/GitHubActionsRole`       |
| `ECR_REPOSITORY`             | `doublespot-backend`                                  |
| `ECS_CLUSTER`                | `doublespot-cluster`                                  |
| `ECS_SERVICE`                | `backend-service`                                     |
| `CONTAINER_NAME`             | `backend`                                             |
| `S3_BUCKET`                  | `doublespot-frontend-xxx`                             |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E1234567890ABC`                                      |
| `VITE_API_BASE_URL`          | `https://d1234abcd.cloudfront.net`（透過 CloudFront） |

---

## 🔧 常用命令

```bash
# 查看 ECS 服務狀態
aws ecs describe-services --cluster doublespot-cluster --services backend-service \
  --query 'services[0].{Status:status,Running:runningCount}'

# 查看日誌
aws logs tail /ecs/doublespot-backend --follow

# 強制重新部署
aws ecs update-service --cluster doublespot-cluster --service backend-service \
  --force-new-deployment

# 測試 Health Check（直接訪問 ALB）
curl http://YOUR_ALB_DNS/health

# 測試 Health Check（透過 CloudFront）
curl https://YOUR_CLOUDFRONT_DOMAIN/health
```

---

## 🐛 常見問題

| 問題                    | 解決方案                                         |
| ----------------------- | ------------------------------------------------ |
| ECS Task 啟動失敗       | 查看 CloudWatch 日誌，確認映像存在               |
| Target Group 不健康     | 確認 `/health` 返回 200，檢查 Security Group     |
| 無法連接數據庫          | 確認 RDS SG 允許 ECS SG，檢查 DB_HOST 設定       |
| Secret 讀取失敗         | 確認 ecsTaskExecutionRole 有 secretsmanager 權限 |
| GitHub Actions 認證失敗 | 確認 OIDC Trust Policy 的 repo 名稱正確          |
| CloudFront 403          | 確認 OAC 設定正確，S3 bucket policy 已更新       |
| API 請求 502/504        | 確認 ALB Origin 使用 HTTP only，port 80          |

---

## 📝 設置完成檢查清單

- [ ] VPC + Subnets 創建完成
- [ ] Security Groups 規則正確
- [ ] IAM OIDC Provider 已創建
- [ ] GitHubActionsRole 創建並設定 Trust Policy
- [ ] Secrets Manager 存放敏感資訊
- [ ] ecsTaskExecutionRole 有 Secrets Manager 讀取權限
- [ ] ECR Repository 創建完成
- [ ] ECS Cluster 創建完成
- [ ] ALB + Target Group 創建完成
- [ ] S3 Bucket 創建完成
- [ ] CloudFront Distribution 創建完成
- [ ] CloudFront ALB Origin + `/health*` Behavior 設定完成
- [ ] GitHub Variables 全部設定完成
- [ ] 首次部署成功，`/health` 返回 200
