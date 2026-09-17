# Hệ thống Hỗ trợ Sàng lọc và Đối chiếu Tính toàn vẹn Giấy Chứng Nhận (GCN Evidence Review)

> **Phân hệ Prototype Nghiên cứu Độc lập**  
> Định vị: **Hệ thống hỗ trợ ra quyết định (Decision Support System - DSS)**  
> Trải nghiệm trực tiếp: [studio.gonovn.me/kiem-tra-gcn](https://studio.gonovn.me/kiem-tra-gcn)  
> Tài liệu thuật toán chi tiết: [docs/technical-baseline.md](docs/technical-baseline.md)

---

## 1. Bối cảnh & Mục tiêu dự án

Dự án xuất phát từ quan sát thực tế trong quá trình tham gia hỗ trợ công tác xét duyệt tại **Liên chi hội Khoa Hệ thống Thông tin (UEL)**:

* **Áp lực thẩm định:** Mỗi mùa xét chọn danh hiệu *"Sinh viên 5 tốt"* (cấp Khoa và cấp Trường), Hội đồng xét duyệt phải rà soát thủ công hàng nghìn minh chứng giấy chứng nhận (GCN), giấy khen trong thời gian ngắn.
* **Nguy cơ can thiệp công nghệ cao:** Sự phát triển nhanh chóng của các công cụ AI chỉnh sửa ảnh (Generative Inpainting) khiến việc phát hiện các minh chứng bị sửa đổi thông tin (họ tên, ngày cấp, số hiệu, đơn vị cấp) bằng mắt thường trở nên rất khó khăn.
* **Mục đích:** Xây dựng công cụ mã nguồn độc lập nhằm hỗ trợ cán bộ rà soát tự động hóa các bước kiểm tra kỹ thuật sơ bộ (metadata, so khớp ma trận pixel phôi gốc), giúp giảm tải thời gian xét duyệt và tăng tính minh bạch cho phong trào sinh viên.

> [!IMPORTANT]
> **Triết lý vận hành (Human-in-the-loop):**  
> Đây là **công cụ hỗ trợ rà soát kỹ thuật (DSS)**, không phải phần mềm kết luận tuyệt đối và không thay thế vai trò thẩm định của Hội đồng. Mọi quyết định liên quan đến quyền lợi của sinh viên phải do con người quyết định và sinh viên luôn có cơ hội giải trình minh chứng.

---

## 2. Năng lực Kỹ thuật Đã triển khai

Hệ thống tiếp cận bài toán qua hai tầng bằng chứng độc lập, được sắp xếp theo mức độ tin cậy thực nghiệm:

### 2.1. Trọng tâm cốt lõi: Đối chiếu sai khác phôi gốc (`reference-pixel-diff`)
* **Nguyên lý:** Khi Ban Tổ chức cung cấp mẫu GCN chuẩn (hoặc file gốc đáng tin cậy), hệ thống tiến hành chuẩn hóa raster, tự động dò tìm dịch chuyển nguyên pixel (alignment trong bán kính 12px) và quét ma trận sai khác ba kênh màu RGB (ngưỡng chênh lệch > 28/255). Các ô khác biệt được gom cụm (lưới 16 × 16px) để khoanh vùng hình chữ nhật chính xác tại các vị trí nghi vấn bị thay đổi chữ.
* **Tính ưu việt:** Phương pháp này **hoàn toàn độc lập với hình thức chỉnh sửa** — dù minh chứng bị sửa bằng Generative AI, Photoshop hay can thiệp thủ công, chỉ cần có sai lệch pixel so với bản gốc là hệ thống sẽ cảnh báo và khoanh vùng trực quan.
* **Biên bản kỹ thuật:** Xuất báo cáo cấu trúc JSON kèm mã băm cryptographic **SHA-256** của cả hai file, phục vụ công tác đối soát và lưu trữ hồ sơ minh bạch.

### 2.2. Tầng bổ trợ: Quét Xuất xứ số & Metadata (`provenance-scanner`)
* **Nguyên lý:** Đọc và phân tích trực tiếp các cấu trúc container metadata: C2PA/JUMBF, IPTC Digital Source Type (`trainedAlgorithmicMedia`, `compositeWithTrainedAlgorithmicMedia`) và chuỗi nhận diện generator/model trong EXIF/XMP.
* **Giới hạn rõ ràng (Caveat):** Metadata là lớp bằng chứng xuất xứ số hữu ích khi file còn nguyên vẹn. Tuy nhiên, nếu file đã qua các ứng dụng nén lại (Zalo, Messenger, Facebook) hoặc chụp lại màn hình, metadata sẽ bị xóa sạch hoàn toàn. Do đó:
  * **Có metadata AI:** Là bằng chứng khách quan cần lưu ý.
  * **Thiếu metadata:** Chỉ xem là `unknown` (thiếu dữ liệu tham chiếu), tuyệt đối **không được coi là bằng chứng khẳng định ảnh thật hay ảnh do người tạo**.

---

## 3. Cam kết Bảo mật & Quyền riêng tư (Privacy-by-Design)

Nhằm bảo vệ dữ liệu cá nhân của sinh viên theo đúng tinh thần **Nghị định 13/2023/NĐ-CP**:

* **100% Client-Side In-Memory:** Toàn bộ quá trình giải mã ảnh, quét metadata và tính toán sai khác pixel diễn ra hoàn toàn trong bộ nhớ RAM trình duyệt người dùng (sử dụng Web Canvas API).
* **Không gửi dữ liệu ra máy chủ:** Ứng dụng không tích hợp bất kỳ API tải ảnh lên server trung gian, không gửi đến nhà cung cấp AI bên ngoài và không lưu vết vào `localStorage`.
* **Dọn dẹp tức thời:** Dữ liệu ảnh và vùng đánh dấu tự động giải phóng khi người dùng đóng hoặc tải lại trang.

---

## 4. Định hướng Nghiên cứu Tiếp theo (Roadmap)

Dự án đang trong giai đoạn tiếp tục nghiên cứu và mở rộng các giải pháp kỹ thuật:

1. **Phát hiện bất thường theo phân phối đợt cấp (Batch Anomaly Detection):** Tích hợp OCR để trích xuất thực thể (tên giải thưởng, đơn vị cấp), từ đó gom cụm các minh chứng cùng đợt để tự động cảnh báo các file có kích thước, tỉ lệ phân giải, bố cục hoặc font chữ lệch dị biệt so với phân phối chung.
2. **Lựa chọn kiến trúc xử lý an toàn dữ liệu:** Nghiên cứu so sánh giữa mô hình OCR chạy trực tiếp trên thiết bị (On-device/WASM) để giữ vững nguyên tắc không gửi ảnh ra ngoài, so với giải pháp xử lý tập trung có kiểm soát mã hóa.
3. **Xác thực chữ ký số C2PA chính thức:** Tích hợp C2PA Web SDK để thẩm tra tính toàn vẹn chữ ký mật mã (cryptographic signature) và chuỗi chứng thư số (trust chain) khi các tổ chức bắt đầu áp dụng chuẩn Content Credentials.
4. **Xây dựng bộ dữ liệu Benchmark thực nghiệm:** Thu thập mẫu thử nghiệm có kiểm soát để đo lường độ chính xác (Precision/Recall) và tỷ lệ báo động nhầm (False Positive) trên phôi giấy khen thực tế.

---

## 5. Hướng dẫn Cài đặt & Kiểm thử (Quality Gates)

### Yêu cầu môi trường
* Node.js 20.x hoặc 24.x trở lên
* npm 10.x trở lên

### Khởi chạy môi trường phát triển
```bash
npm ci
npm run dev
```
Mở trình duyệt tại: `http://localhost:3000`

### Quy trình kiểm chuẩn chất lượng (CI / Quality Gates)
```bash
# 1. Kiểm tra tĩnh kiểu dữ liệu (TypeScript)
npm run typecheck

# 2. Chạy toàn bộ 61 test case tự động (Vitest)
npm test

# 3. Kiểm tra đóng gói build production (Next.js 16 App Router)
npm run build
```
*(Đã tích hợp sẵn pipeline GitHub Actions CI tại `.github/workflows/ci.yml` tự động kiểm thử mỗi lượt push/PR).*

---

## 6. Cấu trúc Thư mục Dự án

- `src/app/page.tsx`: Giao diện không gian làm việc rà soát GCN (thiết kế 3 cột tối ưu toàn màn hình, không cuộn trang).
- `src/components/detector/`: Các thành phần giao diện nạp ảnh, danh sách kết quả, bảng so sánh pixel và thanh bằng chứng thô.
- `src/lib/detector/documentComparison.ts`: Thuật toán `reference-pixel-diff/1.0.0` (căn chỉnh dịch chuyển 12px, phân tích RGB, gom cụm lưới 16×16px).
- `src/lib/detector/provenanceSignal.ts`: Bộ chuẩn hóa và phân loại tín hiệu xuất xứ số.
- `src/lib/aiProvenance.ts`: Trình quét cấu trúc container metadata (C2PA/JUMBF, IPTC, EXIF/XMP).
- `src/store/detectorBatchStore.ts`: Quản lý danh sách file và trạng thái kiểm tra (chỉ lưu trong RAM phiên duyệt).
- `docs/technical-baseline.md`: Tài liệu kỹ thuật chi tiết: đặc tả thuật toán, bảng tham số, giới hạn, protocol benchmark và tài liệu tham khảo sơ cấp.
- `tests/`: Bộ kiểm thử đơn vị với 61 test case bao phủ toàn bộ logic parser, signals và so sánh pixel.

---

## 7. Tuyên bố Học thuật & Quan hệ Tổ chức

* **Tính chất dự án:** Đây là đề tài nghiên cứu - thử nghiệm công nghệ cá nhân của sinh viên Khoa Hệ thống Thông tin (Trường ĐH Kinh tế – Luật, ĐHQG-HCM), được tách riêng thành mã nguồn độc lập nhằm phục vụ báo cáo khoa học và tiếp thu ý kiến định hướng từ Giảng viên trong Khoa.
* **Quan hệ tổ chức:** Dự án **không phải** là hệ thống phần mềm chính thức, chưa được bảo trợ hay nghiệm thu bởi Hội Sinh viên Việt Nam, Đoàn - Hội Trường ĐH Kinh tế – Luật hay bất kỳ tổ chức ban hành văn bản nào.
* **Bản quyền & Giấy phép:** Mã nguồn hiện tại được công khai phục vụ mục đích thẩm định và góp ý chuyên môn; chưa cấp phép tái sử dụng cho mục đích thương mại.

