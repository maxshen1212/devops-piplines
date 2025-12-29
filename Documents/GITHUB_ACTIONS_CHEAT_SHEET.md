# GitHub Actions 設置指南 🔄

> 設置 CI/CD：Git Push 後自動部署到 AWS

## 📋 前置條件

- ✅ 已完成 [AWS_CHEAT_SHEET.md](./AWS_CHEAT_SHEET.md) 所有步驟
- ✅ ECS Service 運行正常
- ✅ S3 + CloudFront 已創建

---

## Part 1: 創建 OIDC Provider

> OIDC 讓 GitHub Actions 安全地存取 AWS，無需長期密鑰

**AWS Console**: IAM → Identity providers → Add provider

| 設定          | 值                                            |
| ------------- | --------------------------------------------- |
| Provider type | OpenID Connect                                |
| Provider URL  | `https://token.actions.githubusercontent.com` |
| Audience      | `sts.amazonaws.com`                           |

1. 點擊 **Get thumbprint**
2. 點擊 **Add provider**

✅ **驗證**：

```bash
aws iam list-open-id-connect-providers
```

---

## Part 2: 創建 IAM Policy

**AWS Console**: IAM → Policies → Create policy → JSON

貼上以下內容（替換 `YOUR_ACCOUNT_ID` 和其他值）：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "arn:aws:ecr:us-west-2:YOUR_ACCOUNT_ID:repository/my-project-backend"
    },
    {
      "Sid": "ECS",
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:DescribeTasks",
        "ecs:ListTasks",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskExecutionRole",
        "arn:aws:iam::YOUR_ACCOUNT_ID:role/ecsTaskRole"
      ]
    },
    {
      "Sid": "S3",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR_S3_BUCKET",
        "arn:aws:s3:::YOUR_S3_BUCKET/*"
      ]
    },
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/YOUR_DISTRIBUTION_ID"
    }
  ]
}
```

| 設定        | 值                          |
| ----------- | --------------------------- |
| Policy name | `GitHubActionsDeployPolicy` |

---

## Part 3: 創建 IAM Role

**AWS Console**: IAM → Roles → Create role

### Step 1: Trust Policy

選擇 **Web identity**：

| 設定              | 值                                    |
| ----------------- | ------------------------------------- |
| Identity provider | `token.actions.githubusercontent.com` |
| Audience          | `sts.amazonaws.com`                   |

### Step 2: 附加 Policy

選擇 `GitHubActionsDeployPolicy`

### Step 3: 命名

| 設定      | 值                           |
| --------- | ---------------------------- |
| Role name | `github-actions-deploy-role` |

### Step 4: 編輯 Trust Policy（限制分支）

創建後，編輯 Role 的 Trust relationships：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_USERNAME/YOUR_REPO:*"
        }
      }
    }
  ]
}
```

> 💡 把 `YOUR_GITHUB_USERNAME/YOUR_REPO` 替換成你的 GitHub 倉庫

✅ **記錄 Role ARN**：

```bash
aws iam get-role --role-name github-actions-deploy-role --query 'Role.Arn' --output text
```

---

## Part 4: 配置 GitHub Variables

**GitHub**: Repository → Settings → Secrets and variables → Actions → Variables

點擊 **New repository variable** 添加以下變數：

### Backend 變數

| Variable Name        | Value                                                          |
| -------------------- | -------------------------------------------------------------- |
| `AWS_REGION`         | `us-west-2`                                                    |
| `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::YOUR_ACCOUNT_ID:role/github-actions-deploy-role` |
| `ECR_REPOSITORY`     | `my-project-backend`                                           |
| `ECS_CLUSTER`        | `my-project-cluster`                                           |
| `ECS_SERVICE`        | `backend-service`                                              |
| `CONTAINER_NAME`     | `backend`                                                      |

### Frontend 變數

| Variable Name                | Value                        |
| ---------------------------- | ---------------------------- |
| `S3_BUCKET`                  | `my-project-frontend-bucket` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `E1234ABCD5678`（你的 ID）   |
| `VITE_API_BASE_URL`          | `http://YOUR_ALB_DNS`        |

---

## Part 5: 理解 Workflow 文件

### Backend: `.github/workflows/backend-ci-cd.yml`

```yaml
name: Backend CI/CD

on:
  push:
    branches: [main]
    paths: ["backend/**"] # 只有 backend 變更時觸發

permissions:
  id-token: write # 需要 OIDC
  contents: read

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend

    steps:
      # 1. 拉取代碼
      - uses: actions/checkout@v4

      # 2. 設置 Node.js
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      # 3. 安裝依賴
      - run: npm ci

      # 4. 構建
      - run: npm run build

      # 5. 配置 AWS（使用 OIDC）
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_ROLE_TO_ASSUME }}
          aws-region: ${{ vars.AWS_REGION }}

      # 6. 登入 ECR
      - uses: aws-actions/amazon-ecr-login@v2
        id: login-ecr

      # 7. 構建並推送 Docker 映像
      - name: Build and push
        run: |
          docker build --platform linux/amd64 \
            -t ${{ steps.login-ecr.outputs.registry }}/${{ vars.ECR_REPOSITORY }}:${{ github.sha }} .
          docker push ${{ steps.login-ecr.outputs.registry }}/${{ vars.ECR_REPOSITORY }}:${{ github.sha }}

      # 8. 更新 Task Definition
      - name: Render task definition
        run: |
          # 用實際值替換模板中的佔位符
          sed -e "s|__IMAGE_URI__|...|g" taskdef.template.json > task-definition.json

      # 9. 部署到 ECS
      - uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: backend/task-definition.json
          service: ${{ vars.ECS_SERVICE }}
          cluster: ${{ vars.ECS_CLUSTER }}
          wait-for-service-stability: true
```

### Frontend: `.github/workflows/frontend-deploy.yml`

```yaml
name: Frontend Deploy

on:
  push:
    branches: [main]
    paths: ["frontend/**"] # 只有 frontend 變更時觸發

permissions:
  id-token: write
  contents: read

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend

    steps:
      # 1. 拉取代碼
      - uses: actions/checkout@v4

      # 2. 設置 Node.js
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      # 3. 安裝依賴
      - run: npm ci

      # 4. 構建（注入 API URL）
      - run: npm run build
        env:
          VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}

      # 5. 配置 AWS
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_ROLE_TO_ASSUME }}
          aws-region: ${{ vars.AWS_REGION }}

      # 6. 上傳到 S3
      - run: aws s3 sync dist/ s3://${{ vars.S3_BUCKET }} --delete

      # 7. 清除 CloudFront 緩存
      - run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ vars.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

---

## Part 6: 測試部署

### 測試 Backend

```bash
cd backend
echo "# Test" >> README.md
git add .
git commit -m "test: trigger backend deploy"
git push origin main
```

前往 GitHub → Actions → 查看運行結果

### 測試 Frontend

```bash
cd frontend
echo "# Test" >> README.md
git add .
git commit -m "test: trigger frontend deploy"
git push origin main
```

---

## 🐛 故障排查

### 錯誤：User is not authorized to perform sts:AssumeRoleWithWebIdentity

**原因**：Trust Policy 配置錯誤

**解決**：

1. 檢查 GitHub username/repo 是否正確
2. 確認 OIDC Provider 已創建
3. 檢查 Role 的 Trust Policy

### 錯誤：Invalid bucket name ""

**原因**：缺少 GitHub Variable

**解決**：

1. 前往 GitHub → Settings → Variables
2. 確認 `S3_BUCKET` 等變數已添加
3. 變數名稱必須完全匹配（區分大小寫）

### 錯誤：Access Denied when pushing to ECR

**原因**：IAM Policy 權限不足

**解決**：

1. 檢查 Policy 中的 ECR Repository ARN
2. 確認 Account ID 正確

### 錯誤：Task definition does not exist

**原因**：Task Definition 渲染失敗

**解決**：

1. 檢查 `taskdef.template.json` 是否存在
2. 確認佔位符格式正確
3. 查看 workflow 日誌中的 sed 命令輸出

---

## ✅ 成功標準

完成設置後：

- [ ] Push backend 代碼 → ECS 自動更新
- [ ] Push frontend 代碼 → S3/CloudFront 自動更新
- [ ] GitHub Actions 顯示綠色 ✓
- [ ] ALB 返回新版本的響應
- [ ] CloudFront 顯示新版本的頁面

---

## 🎉 完成！

現在你的 CI/CD 管道已經完全自動化：

```
開發者 Push 代碼
      ↓
GitHub Actions 自動觸發
      ↓
   ┌──────────┬──────────┐
   ↓          ↓
Backend    Frontend
   ↓          ↓
構建 Docker  構建靜態文件
   ↓          ↓
推送到 ECR   上傳到 S3
   ↓          ↓
更新 ECS     清除 CDN 緩存
   ↓          ↓
🎉 上線！    🎉 上線！
```

**下次部署只需要**：

```bash
git add .
git commit -m "feat: your changes"
git push origin main
```

GitHub Actions 會自動處理一切！
