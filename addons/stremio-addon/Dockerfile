# Sử dụng alpine-based image nhỏ gọn nhất
FROM node:22-alpine

# Thiết lập thư mục làm việc
WORKDIR /app

# Sao chép package.json và package-lock.json trước để tối ưu hóa cache layer
COPY package*.json ./

# Chỉ cài đặt các dependencies production để giảm dung lượng ảnh tối đa
RUN npm ci --only=production && npm cache clean --force

# Sao chép mã nguồn của ứng dụng
COPY api.js manifest.js landing.html index.js ./

# Mở cổng 7000
EXPOSE 7000

# Chạy ứng dụng dưới chế độ production
ENV NODE_ENV=production
CMD ["node", "index.js"]
