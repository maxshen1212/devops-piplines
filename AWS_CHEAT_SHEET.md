# AWS 設置指南 ☁️

> 按順序完成以下步驟，手動創建所有 AWS 資源

## 📋 資源清單

完成後你會擁有：

| 資源                  | 用途                   |
| --------------------- | ---------------------- |
| VPC + Subnets         | 網絡基礎               |
| Security Groups       | 防火牆規則             |
| RDS MySQL             | 數據庫                 |
| ECR                   | Docker 映像倉庫        |
| ECS Cluster + Service | 運行 Backend 容器      |
| ALB                   | 負載均衡器             |
| S3 + CloudFront       | 託管 Frontend 靜態網站 |

---

## Part 1: 網絡設置

### 1.1 創建 VPC

**AWS Console**: VPC → Create VPC

| 設定            | 值               |
| --------------- | ---------------- |
| Name            | `my-project-vpc` |
| IPv4 CIDR       | `10.0.0.0/16`    |
| 選擇            | VPC and more     |
| AZs             | 2                |
| Public subnets  | 2                |
| Private subnets | 2                |
| NAT gateways    | 1 per AZ         |

✅ **驗證**：

```bash
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=my-project-vpc" --query 'Vpcs[0].VpcId'
```

### 1.2 創建 Security Groups

**AWS Console**: VPC → Security Groups → Create

#### ALB Security Group

| 設定    | 值                         |
| ------- | -------------------------- |
| Name    | `my-project-alb-sg`        |
| VPC     | `my-project-vpc`           |
| Inbound | HTTP (80) from 0.0.0.0/0   |
| Inbound | HTTPS (443) from 0.0.0.0/0 |

#### ECS Security Group

| 設定    | 值                                |
| ------- | --------------------------------- |
| Name    | `my-project-ecs-sg`               |
| VPC     | `my-project-vpc`                  |
| Inbound | TCP 3000 from `my-project-alb-sg` |

#### RDS Security Group

| 設定    | 值                                    |
| ------- | ------------------------------------- |
| Name    | `my-project-rds-sg`                   |
| VPC     | `my-project-vpc`                      |
| Inbound | MySQL (3306) from `my-project-ecs-sg` |

---

## Part 2: 數據庫

### 2.1 創建 DB Subnet Group

**AWS Console**: RDS → Subnet groups → Create

| 設定    | 值                            |
| ------- | ----------------------------- |
| Name    | `my-project-db-subnet-group`  |
| VPC     | `my-project-vpc`              |
| Subnets | 選擇 2 個 **private** subnets |

### 2.2 創建 RDS MySQL

**AWS Console**: RDS → Databases → Create

| 設定             | 值                           |
| ---------------- | ---------------------------- |
| Engine           | MySQL 8.0                    |
| Template         | Free tier                    |
| DB identifier    | `my-project-mysql`           |
| Master username  | `admin`                      |
| Master password  | （記住這個密碼！）           |
| Instance class   | `db.t3.micro`                |
| VPC              | `my-project-vpc`             |
| Subnet group     | `my-project-db-subnet-group` |
| Public access    | **No**                       |
| Security group   | `my-project-rds-sg`          |
| Initial database | `mydb`                       |

⏱️ 等待 5-10 分鐘...

✅ **記錄 Endpoint**：

```bash
aws rds describe-db-instances --db-instance-identifier my-project-mysql \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

---

## Part 3: IAM Roles

### 3.1 ECS Task Execution Role

**AWS Console**: IAM → Roles → Create role

| 步驟           | 設定                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| Trusted entity | AWS service → Elastic Container Service → Elastic Container Service Task |
| Policy         | `AmazonECSTaskExecutionRolePolicy`                                       |
| Role name      | `ecsTaskExecutionRole`                                                   |

### 3.2 ECS Task Role

**AWS Console**: IAM → Roles → Create role

| 步驟           | 設定                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| Trusted entity | AWS service → Elastic Container Service → Elastic Container Service Task |
| Policy         | （暫時不附加）                                                           |
| Role name      | `ecsTaskRole`                                                            |

---

## Part 4: Container Registry (ECR)

**AWS Console**: ECR → Repositories → Create

| 設定       | 值                   |
| ---------- | -------------------- |
| Visibility | Private              |
| Name       | `my-project-backend` |

✅ **記錄 URI**：

```bash
aws ecr describe-repositories --repository-names my-project-backend \
  --query 'repositories[0].repositoryUri' --output text
```

---

## Part 5: CloudWatch Logs

**AWS Console**: CloudWatch → Log groups → Create

| 設定      | 值                        |
| --------- | ------------------------- |
| Name      | `/ecs/my-project-backend` |
| Retention | 7 days                    |

---

## Part 6: ECS Cluster

**AWS Console**: ECS → Clusters → Create

| 設定           | 值                   |
| -------------- | -------------------- |
| Name           | `my-project-cluster` |
| Infrastructure | AWS Fargate          |

---

## Part 7: Load Balancer

### 7.1 創建 Target Group

**AWS Console**: EC2 → Target Groups → Create

| 設定              | 值                      |
| ----------------- | ----------------------- |
| Target type       | **IP**                  |
| Name              | `my-project-backend-tg` |
| Protocol          | HTTP                    |
| Port              | 3000                    |
| VPC               | `my-project-vpc`        |
| Health check path | `/health`               |

### 7.2 創建 ALB

**AWS Console**: EC2 → Load Balancers → Create → Application Load Balancer

| 設定           | 值                                |
| -------------- | --------------------------------- |
| Name           | `my-project-alb`                  |
| Scheme         | Internet-facing                   |
| VPC            | `my-project-vpc`                  |
| Subnets        | 2 個 **public** subnets           |
| Security group | `my-project-alb-sg`               |
| Listener       | HTTP:80 → `my-project-backend-tg` |

✅ **記錄 DNS**：

```bash
aws elbv2 describe-load-balancers --names my-project-alb \
  --query 'LoadBalancers[0].DNSName' --output text
```

---

## Part 8: 構建並推送 Docker 映像

### 8.1 登入 ECR

```bash
aws ecr get-login-password --region us-west-2 | \
  docker login --username AWS --password-stdin \
  YOUR_ACCOUNT_ID.dkr.ecr.us-west-2.amazonaws.com
```

### 8.2 構建映像

```bash
cd backend

# 構建（使用 AMD64 架構，確保與 ECS 兼容）
docker build --platform linux/amd64 -t my-project-backend:v1 .
```

### 8.3 推送映像

```bash
# 標記
docker tag my-project-backend:v1 \
  YOUR_ACCOUNT_ID.dkr.ecr.us-west-2.amazonaws.com/my-project-backend:v1

# 推送
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-west-2.amazonaws.com/my-project-backend:v1
```

---

## Part 9: Task Definition

### 9.1 編輯 task-definition.json

在 `backend/task-definition.json` 中填入實際值：

```json
{
  "family": "my-project-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "YOUR_ACCOUNT_ID.dkr.ecr.us-west-2.amazonaws.com/my-project-backend:v1",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "PORT", "value": "3000" },
        { "name": "NODE_ENV", "value": "production" },
        { "name": "DB_HOST", "value": "YOUR_RDS_ENDPOINT" },
        { "name": "DB_PORT", "value": "3306" },
        { "name": "DB_USER", "value": "admin" },
        { "name": "DB_PASSWORD", "value": "YOUR_PASSWORD" },
        { "name": "DB_NAME", "value": "mydb" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-project-backend",
          "awslogs-region": "us-west-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 9.2 註冊 Task Definition

```bash
aws ecs register-task-definition --cli-input-json file://backend/task-definition.json
```

---

## Part 10: ECS Service

### 10.1 獲取必要 ID

```bash
# Target Group ARN
aws elbv2 describe-target-groups --names my-project-backend-tg \
  --query 'TargetGroups[0].TargetGroupArn' --output text

# Private Subnet IDs
aws ec2 describe-subnets --filters "Name=tag:Name,Values=*private*" \
  --query 'Subnets[*].SubnetId' --output text

# ECS Security Group ID
aws ec2 describe-security-groups --filters "Name=group-name,Values=my-project-ecs-sg" \
  --query 'SecurityGroups[0].GroupId' --output text
```

### 10.2 創建 Service

**AWS Console**: ECS → Clusters → my-project-cluster → Services → Create

| 設定            | 值                      |
| --------------- | ----------------------- |
| Task definition | `my-project-backend`    |
| Service name    | `backend-service`       |
| Desired tasks   | 1                       |
| VPC             | `my-project-vpc`        |
| Subnets         | 2 個 private subnets    |
| Security group  | `my-project-ecs-sg`     |
| Load balancer   | `my-project-alb`        |
| Target group    | `my-project-backend-tg` |
| Container port  | 3000                    |

⏱️ 等待 2-5 分鐘...

### 10.3 測試

```bash
# 獲取 ALB DNS
ALB_DNS=$(aws elbv2 describe-load-balancers --names my-project-alb \
  --query 'LoadBalancers[0].DNSName' --output text)

# 測試健康檢查
curl http://$ALB_DNS/health
```

✅ **期望結果**: `{"status":"ok"}`

---

## Part 11: Frontend (S3 + CloudFront)

### 11.1 創建 S3 Bucket

**AWS Console**: S3 → Create bucket

| 設定                    | 值                                           |
| ----------------------- | -------------------------------------------- |
| Name                    | `my-project-frontend-bucket`（必須全球唯一） |
| Region                  | `us-west-2`                                  |
| Block all public access | ✅ 保持勾選                                  |

### 11.2 創建 CloudFront Distribution

**AWS Console**: CloudFront → Create distribution

| 設定                                         | 值                                                            |
| -------------------------------------------- | ------------------------------------------------------------- |
| Origin domain                                | 選擇你的 S3 bucket                                            |
| Allow private S3 bucket access to CloudFront | ✅ **勾選（推薦）**                                           |
| Origin settings                              | Use recommended origin settings                               |
| Cache settings                               | Use recommended cache settings tailored to serving S3 content |
| Default root object                          | `index.html`                                                  |
| Viewer protocol policy                       | Redirect HTTP to HTTPS                                        |

**注意**：新版本會自動創建 OAC 並更新 S3 bucket policy，無需手動操作。

### 11.3 設置 SPA 錯誤頁面

**CloudFront** → 你的 distribution → Error pages → Create custom error response

| 設定                     | 值            |
| ------------------------ | ------------- |
| HTTP error code          | 403           |
| Customize error response | Yes           |
| Response page path       | `/index.html` |
| HTTP response code       | 200           |

對 404 錯誤重複以上設定。

✅ **記錄以下值**：

- **CloudFront Domain**（例如：`d1234abcd.cloudfront.net`）
- **Distribution ID**（例如：`E1234567890ABC`）- GitHub Actions 會用到

---

## 🔍 常用命令

### 檢查 ECS 狀態

```bash
aws ecs describe-services --cluster my-project-cluster --services backend-service \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'
```

### 查看日誌

```bash
aws logs tail /ecs/my-project-backend --follow
```

### 強制重新部署

```bash
aws ecs update-service --cluster my-project-cluster --service backend-service \
  --force-new-deployment
```

### 測試 ALB

```bash
curl http://YOUR_ALB_DNS/health
```

---

## 🐛 故障排查

### 問題：ECS Task 啟動失敗

1. 查看日誌：

   ```bash
   aws logs tail /ecs/my-project-backend
   ```

2. 常見原因：
   - 映像不存在 → 確認 ECR 中有對應的 tag
   - 架構不匹配 → 使用 `--platform linux/amd64` 構建
   - 環境變數錯誤 → 檢查 DB_HOST 等設定

### 問題：Target Group 不健康

1. 確認應用監聽 port 3000
2. 確認 `/health` 端點正常
3. 檢查 Security Group 規則

### 問題：無法連接數據庫

1. 確認 RDS Security Group 允許 ECS Security Group
2. 確認 DB_HOST 是 RDS endpoint（不是 localhost）
3. 確認密碼正確

---

## 📝 需要記錄的值

完成設置後，記錄以下值（GitHub Actions 會用到）：

| 項目                       | 你的值             |
| -------------------------- | ------------------ |
| AWS Account ID             |                    |
| AWS Region                 | us-west-2          |
| ECR Repository             | my-project-backend |
| ECS Cluster                | my-project-cluster |
| ECS Service                | backend-service    |
| ALB DNS                    |                    |
| S3 Bucket                  |                    |
| CloudFront Distribution ID |                    |
| CloudFront Domain          |                    |
