# GCN Evidence Review

Ứng dụng prototype độc lập để hỗ trợ rà soát ảnh Giấy Chứng Nhận (GCN). Repo gồm hai luồng bằng chứng riêng: đọc metadata/provenance của ảnh và so sánh ảnh với **bản gốc đáng tin cậy do người rà soát cung cấp**.

## Trạng thái và giới hạn

Đây là prototype nghiên cứu, chưa được benchmark trên tập GCN thực tế. Công cụ không kết luận giấy tờ thật/giả, không xác định ảnh do AI tạo, không quy kết gian lận và không thay thế hội đồng.

- Metadata được đọc bằng các bộ quét byte và so khớp chuỗi. Repo chưa xác minh chữ ký số C2PA, content binding, hash hay trust chain.
- Pixel comparison chỉ khoanh vùng khác biệt vượt ngưỡng giữa hai ảnh. Khác biệt không chứng minh có sửa chữ; không thấy khác biệt cũng không chứng minh ảnh nguyên bản.
- Tín hiệu metadata không có không phải bằng chứng ảnh do người tạo. Ảnh chụp màn hình, nén hoặc chuyển qua ứng dụng khác có thể làm mất metadata.
- Không có visual AI detector, OCR tiếng Việt hoặc xác suất AI đã được hiệu chuẩn trong repo này.
- Người được giao xét duyệt phải tự xác minh nguồn bản gốc và tự đưa ra kết luận. Sinh viên cần có cơ hội giải trình trước quyết định bất lợi.

## Quyền riêng tư

Trong các luồng hiện tại, file ảnh được đọc và xử lý trong trình duyệt; repo không gửi ảnh lên API, AI provider hay cơ sở dữ liệu và không lưu lịch sử vào `localStorage`. Metadata và ảnh đối chiếu chỉ nằm trong bộ nhớ của phiên trình duyệt. Báo cáo tải xuống có thể chứa tên file, chuỗi metadata và hash SHA-256; người vận hành cần quản lý các báo cáo đó phù hợp. Khi bổ sung dịch vụ mạng trong tương lai, README và giao diện phải được cập nhật trước khi sử dụng.

## Chạy tại máy

Cần Node.js 24 và npm.

```bash
npm ci
npm run dev
```

Mở `http://localhost:3000`. Kiểm tra trước khi gửi thay đổi:

```bash
npm run typecheck
npm test
npm run build
```

## Cấu trúc

- `src/app/page.tsx`: trang rà soát GCN, chọn nhiều ảnh, metadata, đối chiếu với ảnh gốc và xuất báo cáo.
- `src/lib/aiProvenance.ts`: trích xuất và phân loại chuỗi provenance trong các container metadata.
- `src/lib/detector/provenanceSignal.ts`: chuyển kết quả quét thành evidence có caveat.
- `src/lib/detector/documentComparison.ts`: kiểm tra file, chuẩn hóa ảnh và heuristic pixel comparison.
- `src/components/detector/`: giao diện upload, kết quả, bằng chứng thô và đối chiếu.
- `src/store/detectorBatchStore.ts`: trạng thái batch chỉ lưu trong bộ nhớ.
- `docs/technical-baseline.md`: thuật toán, ngưỡng, giới hạn, benchmark protocol và nguồn tham khảo.
- `tests/`: kiểm thử parser, provenance signal, báo cáo và pixel comparison.

## Chia sẻ và quan hệ tổ chức

Mã nguồn được tách từ một dự án cá nhân trước đó và bắt đầu lịch sử Git riêng tại repo này để tiếp tục phát triển, theo dõi thay đổi và để người hướng dẫn đánh giá. Đây là dự án cá nhân, không phải hệ thống chính thức, không được xác nhận hay bảo trợ bởi Hội Sinh viên Việt Nam, UEL hoặc bất kỳ đơn vị cấp giấy nào.

Chưa kèm giấy phép sử dụng lại mã nguồn; điều khoản cấp phép sẽ được quyết định riêng.
