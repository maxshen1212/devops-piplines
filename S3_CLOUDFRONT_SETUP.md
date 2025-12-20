# S3 + CloudFront 手動設置完整指南 🌐

> 詳細教學：如何手動設置 S3 和 CloudFront 來託管 React 前端應用

## 📋 概述

本指南將教你如何：
1. 創建 S3 bucket 並配置為靜態網站託管
2. 創建 CloudFront distribution 並連接到 S3
3. 設置 Origin Access Control (OAC) 保護 S3
4. 配置 SPA 路由（處理 404 錯誤）
5. 手動部署並測試

---

## Part 1: 創建 S3 Bucket

### 步驟 1.1: 創建 Bucket

**AWS Console**: S3 → Create bucket

| 設定項目 | 值 | 說明 |
|---------|-----|------|
| **Bucket name** | `my-project-frontend-YYYYMMDD` | ⚠️ 必須全球唯一，建議加上日期 |
| **AWS Region** | `us-west-2`（或你的區域） | 選擇離你最近的區域 |
| **Object Ownership** | ACLs disabled (recommended) | 使用 bucket owner enforced |
| **Block Public Access** | ✅ **保持全部勾選** | CloudFront 會通過 OAC 訪問，不需要公開 |

點擊 **Create bucket**

### 步驟 1.2: 驗證 Bucket 創建

```bash
# 列出所有 bucket
aws s3 ls

# 查看特定 bucket 詳情
aws s3api get-bucket-location --bucket my-project-frontend-YYYYMMDD
```

✅ **記錄你的 Bucket 名稱**（後續會用到）

---

## Part 2: 創建 CloudFront Distribution

### 步驟 2.1: 創建 Distribution

**AWS Console**: CloudFront → Distributions → Create distribution

#### Origin Settings（源設置）

| 設定項目 | 值 | 說明 |
|---------|-----|------|
| **Origin domain** | 選擇你的 S3 bucket | 例如：`my-project-frontend-YYYYMMDD.s3.us-west-2.amazonaws.com` |
| **Name** | 自動填充 | 可以保持默認或自定義 |
| **Origin access** | ✅ **Origin access control settings (recommended)** | 選擇 OAC（推薦） |
| **Origin access control** | 點擊 **Create control setting** | 創建新的 OAC |

#### Origin Access Control (OAC) 設置

點擊 "Create control setting" 後會彈出對話框：

| 設定項目 | 值 |
|---------|-----|
| **Control setting name** | `my-project-s3-oac` |
| **Description** | `OAC for frontend S3 bucket` |
| **Signing behavior** | `Sign requests (recommended)` |
| **Origin type** | `S3` |

點擊 **Create**，然後在 Origin access control 下拉選單中選擇剛創建的 OAC。

#### Default Cache Behavior（默認緩存行為）

| 設定項目 | 值 | 說明 |
|---------|-----|------|
| **Viewer protocol policy** | ✅ **Redirect HTTP to HTTPS** | 強制使用 HTTPS |
| **Allowed HTTP methods** | `GET, HEAD, OPTIONS` | 靜態網站只需要這些方法 |
| **Cache policy** | `CachingOptimized` | 優化緩存策略 |
| **Compress objects automatically** | ✅ 勾選 | 啟用 Gzip 壓縮 |

#### Distribution Settings（分發設置）

| 設定項目 | 值 | 說明 |
|---------|-----|------|
| **Price class** | `Use only North America and Europe` | 降低成本（可選） |
| **Alternate domain name (CNAME)** | （可選） | 如果你有自定義域名 |
| **Default root object** | `index.html` | SPA 的入口文件 |
| **Custom SSL certificate** | （可選） | 如果有自定義域名 |

點擊 **Create distribution**

⏱️ **等待 5-15 分鐘**，直到 Status 變成 **Deployed**

### 步驟 2.2: 複製 Bucket Policy

創建完成後，CloudFront 會顯示一個警告：

> "Copy policy" - 點擊這個按鈕複製 S3 bucket policy

**重要**：先不要關閉這個頁面，我們需要這個 policy！

---

## Part 3: 配置 S3 Bucket Policy

### 步驟 3.1: 應用 Bucket Policy

**AWS Console**: S3 → 你的 bucket → Permissions → Bucket policy

1. 點擊 **Edit**
2. 將剛才複製的 policy 貼上
3. 點擊 **Save changes**

**Policy 範例**（實際值會根據你的設置自動生成）：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-project-frontend-YYYYMMDD/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/YOUR_DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

✅ **驗證**：Policy 應該顯示為有效（沒有錯誤提示）

---

## Part 4: 配置 SPA 路由（處理 404 錯誤）

React Router 等 SPA 框架使用客戶端路由，當用戶直接訪問 `/about` 時，S3 會返回 404。我們需要配置 CloudFront 將所有 404/403 錯誤重定向到 `index.html`。

### 步驟 4.1: 創建自定義錯誤響應

**AWS Console**: CloudFront → 你的 distribution → Error pages → Create custom error response

#### 處理 403 錯誤

| 設定項目 | 值 |
|---------|-----|
| **HTTP error code** | `403: Forbidden` |
| **Customize error response** | ✅ Yes |
| **Response page path** | `/index.html` |
| **HTTP response code** | `200: OK` |
| **Error caching minimum TTL** | `10`（秒） |

點擊 **Create custom error response**

#### 處理 404 錯誤

重複以上步驟，但選擇：

| 設定項目 | 值 |
|---------|-----|
| **HTTP error code** | `404: Not Found` |
| **Customize error response** | ✅ Yes |
| **Response page path** | `/index.html` |
| **HTTP response code** | `200: OK` |
| **Error caching minimum TTL** | `10`（秒） |

點擊 **Create custom error response**

✅ **驗證**：Error pages 列表應該顯示兩個自定義錯誤響應

---

## Part 5: 手動部署前端到 S3

### 步驟 5.1: 構建前端應用

```bash
cd frontend

# 安裝依賴（如果還沒安裝）
npm install

# 構建生產版本
# 注意：設置 VITE_API_BASE_URL 為你的後端 API 地址
VITE_API_BASE_URL=https://your-alb-dns.us-west-2.elb.amazonaws.com npm run build
```

這會在 `frontend/dist/` 目錄生成構建文件。

### 步驟 5.2: 上傳到 S3

```bash
# 同步 dist 目錄到 S3（--delete 會刪除 S3 中不存在的文件）
aws s3 sync frontend/dist/ s3://my-project-frontend-YYYYMMDD --delete

# 或者使用 cp 命令（不會刪除舊文件）
# aws s3 cp frontend/dist/ s3://my-project-frontend-YYYYMMDD --recursive
```

### 步驟 5.3: 驗證文件上傳

```bash
# 列出 S3 bucket 中的文件
aws s3 ls s3://my-project-frontend-YYYYMMDD --recursive

# 應該看到類似：
# index.html
# assets/index-abc123.js
# assets/index-def456.css
```

---

## Part 6: 使 CloudFront 緩存失效

當你更新 S3 中的文件後，CloudFront 可能仍在使用緩存的舊版本。需要創建 invalidation（失效）。

### 步驟 6.1: 創建 Invalidation

**AWS Console**: CloudFront → 你的 distribution → Invalidations → Create invalidation

| 設定項目 | 值 |
|---------|-----|
| **Object paths** | `/*`（使所有文件失效） |

點擊 **Create invalidation**

⏱️ **等待 1-2 分鐘**，直到 Status 變成 **Completed**

### 步驟 6.2: 使用 CLI 創建 Invalidation

```bash
# 獲取 Distribution ID
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='你的 distribution 名稱'].Id" \
  --output text)

# 創建 invalidation
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

---

## Part 7: 測試部署

### 步驟 7.1: 獲取 CloudFront URL

**AWS Console**: CloudFront → 你的 distribution → 查看 **Distribution domain name**

格式類似：`d1234abcd5678.cloudfront.net`

### 步驟 7.2: 測試訪問

```bash
# 測試主頁
curl https://d1234abcd5678.cloudfront.net

# 測試直接訪問路由（應該返回 index.html）
curl https://d1234abcd5678.cloudfront.net/about

# 在瀏覽器中打開
open https://d1234abcd5678.cloudfront.net
```

✅ **期望結果**：
- 主頁正常顯示
- 直接訪問 `/about` 等路由也能正常顯示（不會 404）
- 所有資源（JS、CSS）正常加載

---

## Part 8: 記錄配置值

完成設置後，記錄以下值（GitHub Actions 會用到）：

| 項目 | 你的值 | 如何獲取 |
|------|--------|----------|
| **S3 Bucket Name** | | S3 Console |
| **CloudFront Distribution ID** | | CloudFront Console → Distribution ID |
| **CloudFront Domain** | | CloudFront Console → Domain name |

### 使用 CLI 獲取

```bash
# 獲取 Distribution ID 和 Domain
aws cloudfront list-distributions \
  --query "DistributionList.Items[*].[Id,DomainName]" \
  --output table
```

---

## 🔍 常用命令參考

### 查看 S3 文件

```bash
# 列出所有文件
aws s3 ls s3://my-project-frontend-YYYYMMDD --recursive

# 查看特定文件
aws s3 ls s3://my-project-frontend-YYYYMMDD/index.html
```

### 刪除 S3 文件

```bash
# 刪除單個文件
aws s3 rm s3://my-project-frontend-YYYYMMDD/index.html

# 刪除整個 bucket（小心！）
aws s3 rb s3://my-project-frontend-YYYYMMDD --force
```

### 查看 CloudFront 狀態

```bash
# 列出所有 distributions
aws cloudfront list-distributions --query "DistributionList.Items[*].[Id,DomainName,Status]" --output table

# 查看特定 distribution 詳情
aws cloudfront get-distribution --id YOUR_DISTRIBUTION_ID
```

### 創建 Invalidation

```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

### 同步部署（推薦）

```bash
# 構建 + 上傳 + 失效緩存（一鍵部署）
cd frontend && \
npm run build && \
aws s3 sync dist/ s3://my-project-frontend-YYYYMMDD --delete && \
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

---

## 🐛 故障排查

### 問題 1: CloudFront 顯示 "Access Denied"

**原因**：S3 bucket policy 未正確配置

**解決方法**：
1. 確認 bucket policy 已正確應用
2. 確認 policy 中的 Distribution ARN 正確
3. 確認 OAC 設置正確

**檢查命令**：
```bash
# 查看 bucket policy
aws s3api get-bucket-policy --bucket my-project-frontend-YYYYMMDD
```

### 問題 2: 直接訪問路由返回 404

**原因**：未配置自定義錯誤響應

**解決方法**：
1. 確認已創建 403 和 404 的自定義錯誤響應
2. 確認 Response page path 設置為 `/index.html`
3. 確認 HTTP response code 設置為 `200`

### 問題 3: 更新後仍顯示舊內容

**原因**：CloudFront 緩存未失效

**解決方法**：
```bash
# 創建 invalidation
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

### 問題 4: API 請求失敗（CORS 錯誤）

**原因**：後端未設置 CORS 或 API URL 配置錯誤

**解決方法**：
1. 確認 `VITE_API_BASE_URL` 環境變數正確
2. 確認後端已設置 CORS 允許 CloudFront domain
3. 檢查瀏覽器 Console 的錯誤訊息

### 問題 5: 文件上傳失敗

**原因**：權限不足或 bucket 不存在

**解決方法**：
```bash
# 確認 bucket 存在
aws s3 ls s3://my-project-frontend-YYYYMMDD

# 確認 AWS credentials 正確
aws sts get-caller-identity

# 測試上傳權限
echo "test" > test.txt
aws s3 cp test.txt s3://my-project-frontend-YYYYMMDD/
aws s3 rm s3://my-project-frontend-YYYYMMDD/test.txt
```

---

## 📝 最佳實踐

### 1. 使用版本控制

在 bucket 名稱中加入日期或版本號，方便管理多個環境：
- `my-project-frontend-prod`
- `my-project-frontend-staging`

### 2. 啟用 S3 版本控制

**AWS Console**: S3 → 你的 bucket → Properties → Versioning → Enable

這樣可以保留舊版本，方便回滾。

### 3. 設置生命週期規則

自動刪除舊文件，節省成本：

**AWS Console**: S3 → 你的 bucket → Management → Lifecycle rules → Create

### 4. 監控 CloudFront

**AWS Console**: CloudFront → 你的 distribution → Monitoring

查看：
- 請求數量
- 錯誤率
- 緩存命中率

### 5. 使用自定義域名

1. 在 Route 53 創建記錄
2. 在 CloudFront 添加 CNAME
3. 上傳 SSL 證書（或使用 ACM）

---

## ✅ 完成檢查清單

完成設置後，確認以下項目：

- [ ] S3 bucket 已創建並配置 bucket policy
- [ ] CloudFront distribution 已創建並狀態為 "Deployed"
- [ ] 已配置 403 和 404 的自定義錯誤響應
- [ ] 前端應用已構建並上傳到 S3
- [ ] 已創建 CloudFront invalidation
- [ ] 可以通過 CloudFront URL 訪問網站
- [ ] 直接訪問路由（如 `/about`）不會返回 404
- [ ] 已記錄所有必要的配置值

---

## 🎓 下一步

完成 S3 和 CloudFront 設置後：

1. **配置 GitHub Actions**：參考 `frontend-deploy.yml`，設置自動部署
2. **設置環境變數**：在 GitHub 中添加必要的 secrets 和 variables
3. **測試 CI/CD**：Push 代碼，確認自動部署正常

---

**有問題？** 請參考 [AWS_CHEAT_SHEET.md](./AWS_CHEAT_SHEET.md) 或查看 AWS 官方文檔。

