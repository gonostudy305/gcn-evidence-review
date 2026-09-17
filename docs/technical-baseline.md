# GCN Evidence Review — Baseline đối chiếu ảnh GCN

Cập nhật: **2026-09-16**. Trạng thái: baseline hỗ trợ xem xét thủ công; **chưa hoàn thành detector AI có xác suất được hiệu chuẩn**.

## 1. Phạm vi đã xác nhận

Người dùng cần kiểm tra ảnh giấy chứng nhận (GCN), có **bản gốc của cùng giấy đã cấp** để đối chiếu. Mục tiêu là tìm vùng có thể đã thay đổi chữ, kể cả khi phần lớn thiết kế vẫn giữ nguyên. Bản gốc phải được người vận hành lấy từ nguồn đáng tin cậy; phần mềm chưa tự xác thực nguồn cấp. Không dùng phôi mẫu hoặc giấy của người khác làm bản gốc.

Tài liệu này ghi lại phạm vi triển khai, thuật toán hiện tại, giới hạn và hướng benchmark tiếp theo của repo độc lập này. Đây là prototype phục vụ đánh giá kỹ thuật; chưa được benchmark trên bộ GCN thật và chưa đạt điều kiện để làm công cụ phán quyết.

## 2. Năng lực hiện tại

| Thành phần | Đã có | Giới hạn |
| --- | --- | --- |
| Metadata/provenance | Đọc dấu vết C2PA/JUMBF, khai báo IPTC, chuỗi generator/model | So khớp chuỗi; chưa xác minh chữ ký, hash binding hoặc trust chain |
| Phân loại tín hiệu | Phân biệt khai báo AI tạo toàn ảnh, thành phần AI, marker công cụ; thiếu tín hiệu trả về unknown | Không phải phân loại AI/người và không phải xác suất AI |
| Đối chiếu GCN | Chọn bản gốc, chuẩn hóa ảnh, bù dịch chuyển nhỏ, đánh dấu vùng pixel khác biệt | Chưa đọc chữ; không xác định chữ cũ → chữ mới; không biết AI hay người sửa |
| Báo cáo đối chiếu | JSON có tên file, SHA-256, kích thước, tham số, tọa độ vùng, trạng thái, cảnh báo | Không chứa ảnh; không ký số; không chứng minh nguồn cấp hoặc tính hợp lệ GCN |
| Batch/biên bản metadata | Luồng `/kiem-tra-gcn` có danh sách và export/in metadata | Báo cáo đối chiếu JSON tách riêng; không gộp vào biên bản metadata |

### Metadata thận trọng

`src/lib/detector/provenanceSignal.ts` bao lớp scanner legacy trong `src/lib/aiProvenance.ts`:

- `trainedAlgorithmicMedia`: khai báo AI tạo ảnh, chưa xác minh.
- `compositeWithTrainedAlgorithmicMedia`: khai báo có thành phần AI, chưa xác minh.
- Marker generator/model đủ đặc hiệu: tín hiệu công cụ ở mức thấp; tên provider đơn thuần không đủ.
- Chỉ có C2PA, `digitalCapture`, thao tác `c2pa.created`, generic composite hoặc Canva không tự trở thành tín hiệu AI.
- `provenance.c2pa` hiện chỉ có `present-unverified` hoặc `not-found`; `signatureVerified` luôn `false`.
- `confidence` medium/low/unknown mô tả tín hiệu metadata theo quy tắc hiện tại, **không phải confidence đã hiệu chuẩn hay xác suất ảnh AI**.

Metadata có thể thiếu, bị thay đổi hoặc được quét không đầy đủ. Có marker không chứng minh nội dung giả; không có marker không chứng minh ảnh do người thiết kế hay chưa bị sửa chữ. Scanner chưa phân tích đầy đủ cấu trúc và chuỗi lịch sử manifest bằng C2PA SDK.

## 3. Thuật toán đối chiếu đang chạy

Nguồn: `src/lib/detector/documentComparison.ts`; phiên bản **`reference-pixel-diff/1.0.0`**.

1. Kiểm tra file, magic bytes/MIME, đọc kích thước khai báo trước giải mã. Từ chối PNG/WebP động được nhận diện, ảnh vượt giới hạn hoặc không đọc được kích thước.
2. Giải mã bằng `createImageBitmap`, kiểm tra lại kích thước. Vẽ lên nền trắng bằng Canvas; alpha được xử lý trên nền trắng.
3. Chuẩn hóa cả hai ảnh về cùng raster theo ảnh đang kiểm tra, cạnh tối đa 1.600px; không phóng lớn hơn kích thước bản gốc. Đây là resize toàn ảnh, chưa căn chỉnh phối cảnh.
4. Chọn mẫu cạnh trong ảnh xám và tìm dịch chuyển nguyên pixel có sai số nhỏ nhất trong bán kính tối đa 12px. Khi bằng điểm, ưu tiên dịch chuyển nhỏ hơn.
5. Trong phần giao nhau, tính chênh lệch lớn nhất của ba kênh RGB. Pixel được tính là thay đổi khi chênh lệch **lớn hơn 28/255**.
6. Chia lưới 16 × 16px. Ô có ít nhất 4 pixel thay đổi được giữ; ghép các ô kề nhau theo 8 hướng thành vùng hình chữ nhật. Sắp xếp vùng theo số pixel thay đổi.
7. Tạo overlay trên raster ảnh đang kiểm tra, SHA-256 của hai file gốc và dữ liệu báo cáo.

| Tham số/điều kiện | Giá trị hiện tại |
| --- | --- |
| Cạnh raster phân tích tối đa | 1.600px |
| Bán kính tìm dịch chuyển | `min(12, floor(min(width, height) / 12))` |
| Mẫu cạnh tối thiểu để căn chỉnh | 12 |
| Sai số căn chỉnh đáng chấp nhận | Trung bình sai số cạnh < 28; offset không chạm biên tìm kiếm |
| Ngưỡng pixel khác biệt | Max chênh lệch RGB > 28 |
| Kích thước ô / số pixel tối thiểu | 16 × 16px / 4 |
| Chưa đủ điều kiện kết luận | Cạnh ngắn < 64px; căn chỉnh không đạt khi ảnh không trùng; tỷ lệ pixel thay đổi > 20%; hoặc > 50% ô có khác biệt |
| Tỷ lệ khung hình | Sai lệch tương đối > 2% buộc trạng thái `inconclusive` |

Các ngưỡng trên là heuristic chưa benchmark trên bộ GCN thực tế. Ảnh trùng theo phép so sánh hiện tại được miễn yêu cầu độ tin cậy căn chỉnh; điều này không có nghĩa file giống nhau từng byte.

### Cách đọc kết quả

- `differences-found`: có vùng khác biệt cần đối chiếu.
- `no-significant-difference`: chưa thấy vùng vượt ngưỡng; **không chứng minh ảnh nguyên bản**. Pixel thay đổi có thể tồn tại nhưng chưa đủ 4 pixel trong một ô để tạo vùng.
- `inconclusive`: điều kiện so sánh chưa đủ; overlay nếu có chỉ để tham khảo.
- `changedPixelRatio`: số pixel vượt ngưỡng / số pixel trong phần giao nhau được kiểm tra. Đây không phải tỷ lệ chữ bị sửa và không phải xác suất AI.
- `alignment.offsetX/offsetY`: dịch chuyển từ vị trí bản gốc sang ảnh đang kiểm tra trong raster chuẩn hóa. Dải biên ngoài phần giao nhau không được kiểm tra.
- `regions`: `{x, y, width, height, changedPixels}` trong **raster chuẩn hóa của ảnh đang kiểm tra**, không phải tọa độ trực tiếp trên file gốc. Muốn quy đổi cần dùng `normalizedRaster` và `sourceDimensions.candidate`, có tính đến cách browser giải mã orientation.

## 4. Giới hạn file, tài nguyên và dữ liệu

| Luồng | Giới hạn |
| --- | --- |
| Ảnh đang kiểm tra qua detector dropzone | JPEG/PNG/WebP, tối đa 10 × 1.024² byte, UI ghi 10MB |
| Ảnh tham chiếu trong panel | JPEG/PNG/WebP, tối đa 20 × 1.024² byte, UI ghi 20MB |
| Hàm đối chiếu dùng riêng | Mỗi file 1 byte đến 20 × 1.024² byte |
| Kiểm tra kích thước của đối chiếu | Tối đa 40.000.000 pixel; mỗi cạnh tối đa 16.000px |
| Batch GCN hiện tại | Tối đa 20 ảnh đang kiểm tra |

Ảnh tham chiếu được kiểm tra trước khi tạo preview. Trang GCN cũng gọi `validateDocumentImage` cho ảnh đang kiểm tra trước khi thêm vào danh sách/tạo preview. Hai file được kiểm tra lại khi chạy đối chiếu. Giới hạn 40MP/16.000px vì vậy áp dụng cả hai phía trong luồng GCN; dropzone dùng chung của `/detect` chỉ kiểm tra MIME, magic bytes và dung lượng, không đồng nghĩa mọi preview của ứng dụng đều có giới hạn giải mã đó.

Đối chiếu và quét metadata trong luồng này xử lý file trên browser, không gọi AI provider hay cloud upload. Overlay dùng để hiển thị trong phiên. Báo cáo `gono-gcn-comparison.json` dùng allowlist trường, không kèm ảnh/overlay; tên file vẫn có thể chứa thông tin cá nhân. SHA-256 nhận diện file đã so sánh, không xác thực ai cấp giấy.

Claim xử lý local chỉ áp dụng cho các luồng trong repo này; nếu sau này thêm server, đồng bộ hoặc provider thì cần cập nhật data flow và thông báo rõ trước khi gửi dữ liệu.

Giới hạn hiện tại:

- Thu nhỏ ảnh có thể xóa dấu vết sửa một dấu tiếng Việt, một nét hoặc một chữ số.
- Nén, resize, đổi màu, scan hoặc ảnh chụp lại có thể tạo khác biệt không liên quan thay chữ.
- Chưa hỗ trợ xoay, crop, homography/phối cảnh; resize không thay thế các bước đó.
- Vùng đánh dấu là ô pixel được ghép, chưa phải bounding box chữ hay mask chỉnh sửa chính xác.
- Tính toán pixel và Canvas còn chạy trên main thread; chưa có worker/cancel tính toán. Run token ngăn kết quả cũ cập nhật UI sau khi thay reference hoặc unmount, không hủy công việc đã chạy.
- Chưa có kết quả accuracy/recall thực tế để cam kết “phát hiện tốt mọi chỉnh sửa tinh vi”.

## 5. Các phần chưa triển khai và thứ tự tiếp theo

| Ưu tiên | Việc tiếp theo | Điều kiện nghiệm thu đề xuất |
| --- | --- | --- |
| 1 | Thu cặp GCN gốc/biến thể có quyền sử dụng; chạy benchmark baseline | Có nhãn trường/vùng sửa, split độc lập và báo cáo false positive/negative; chọn ngưỡng sau validation |
| 2 | OCR tiếng Việt trên hai ảnh, đối chiếu trường/chữ cũ → mới | Hiển thị OCR confidence, vùng chữ và khác biệt nội dung; kiểm thử riêng tên, số hiệu, ngày, dấu tiếng Việt; không coi lỗi OCR là sửa chữ |
| 3 | Căn chỉnh affine/homography và kiểm tra chất lượng | Từ chối căn chỉnh khi thiếu điểm/inlier; đánh giá lại tọa độ, crop và ảnh chụp; giữ bản gốc để đối chiếu |
| 4 | Xác minh C2PA thật bằng SDK duy trì chính thức | Xác minh signature, asset binding, trust chain; phân biệt không có/không hỗ trợ/lỗi/không tin cậy/hợp lệ; kiểm thử offline và network policy |
| 5 | Đánh giá model phát hiện/khoanh vùng AI editing nếu cần | Xác minh quyền code/weights/data; benchmark GCN độc lập; hiệu chuẩn xác suất và có quyền trả về không đủ bằng chứng |

OCR, ánh xạ text cũ → mới, homography, C2PA signature verification và model AI/calibrated probability **đều chưa được triển khai trong baseline này**. Chọn công nghệ/model cụ thể sau khi có mẫu, yêu cầu độ trễ, ngân sách và kiểm tra license. Ưu tiên tận dụng bản gốc đã có để phát hiện nội dung thay đổi; chỉ quy thuộc cho AI khi có bằng chứng phù hợp.

## 6. Protocol benchmark đề xuất

1. **Đơn vị dữ liệu:** một GCN gốc đáng tin cậy và các biến thể liên quan. Lưu ID tài liệu, template/đơn vị cấp, quyền sử dụng, nguồn tạo biến thể, loại trường, vùng sửa và nhãn AI/chỉnh tay/không sửa nếu biết chắc.
2. **Các nhóm:** bản xuất không sửa; resize/nén/scan/chụp lại hợp lệ; chỉnh tay; AI sửa vùng chữ nhỏ; AI sinh toàn ảnh; file thiếu hoặc có metadata. Tách nhãn “đã sửa” khỏi nhãn “do AI sửa”.
3. **Ca khó bắt buộc:** một chữ số, dấu tiếng Việt, họ tên, ngày/số hiệu; chữ mảnh; nền hoa văn; góc ảnh; thay đổi nằm ở biên sau căn chỉnh; crop/phối cảnh; reference sai/phôi trắng; ảnh mờ hoặc quá nhỏ. Dùng tài liệu giả lập hoặc được cho phép khi tạo biến thể thử nghiệm.
4. **Chia tập:** giữ mọi biến thể của cùng tài liệu trong cùng nhóm; tách train/validation/test theo tài liệu. Có test riêng với template/đơn vị cấp và generator chưa thấy. Không chỉnh ngưỡng dựa trên test; lưu version dữ liệu, code và tham số.
5. **Metric:** precision/recall phát hiện sửa ở mức GCN và mức trường; false-positive trên ảnh không đổi nội dung; IoU/F1 hoặc recall vùng sửa; tỷ lệ `inconclusive`, độ trễ và bộ nhớ theo thiết bị. Báo cáo theo nhóm, không chỉ điểm tổng.
6. **Khi có OCR/model:** thêm lỗi nhận dạng chữ, độ chính xác text cũ → mới, calibration và tỷ lệ từ chối kết luận. Probability phải được kiểm tra hiệu chuẩn trước khi hiển thị cho người dùng.
7. **Gate:** xác định mức false-positive chấp nhận được, recall cần đạt, cỡ mẫu và khoảng tin cậy **TBD** trước quyết định pilot. Unit test của thuật toán không thay thế benchmark này.

## 7. Kiểm tra triển khai

Kiểm tra workspace tách riêng ngày 2026-09-17:

- `npm run typecheck`: passed.
- `npm test`: 4 test files, 61 tests passed.
- `npm run build`: passed; route `/` được prerender tĩnh.
- Repo hiện chưa kèm bộ kiểm thử E2E.

Các test tổng hợp xác nhận một số hành vi của parser, provenance signal và pixel comparison. Chúng **không đo accuracy trên GCN thật**, không thay thế protocol benchmark ở mục 6 và không chứng minh phát hiện được mọi chỉnh sửa AI.

## 8. Nguồn nghiên cứu sơ cấp

Các nguồn được tra cứu ngày 2026-09-15; cần xác minh lại version/API và license tại thời điểm tích hợp.

- [C2PA Explainer](https://c2pa.org/specifications/specifications/2.2/explainer/Explainer.html): provenance hợp lệ không chứng minh nội dung là sự thật hoặc chính xác.
- [C2PA technical specification 2.4](https://spec.c2pa.org/specifications/specifications/2.4/specs/ContentCredentials.html): assertion, content binding, chữ ký và trust model.
- [CAI assertions/actions](https://opensource.contentauthenticity.org/docs/manifest/writing/assertions-actions/): phân biệt `trainedAlgorithmicMedia` và `compositeWithTrainedAlgorithmicMedia`.
- [CAI JavaScript SDK](https://opensource.contentauthenticity.org/docs/c2pa-js/), [c2pa-web](https://opensource.contentauthenticity.org/docs/sdk-repos/c2pa-js/packages/c2pa-web/), [trust settings](https://opensource.contentauthenticity.org/docs/tasks/settings/): package browser hiện tại `@contentauth/c2pa-web`, Node `@contentauth/c2pa-node`; SDK browser cũ chuyển thành legacy. Chưa thêm SDK vào baseline. Cần kiểm soát tải WASM, trust-list và remote manifests trước khi mô tả chế độ offline/local.
- [Google SynthID](https://deepmind.google/models/synthid/), [OpenAI provenance](https://help.openai.com/en/articles/8912793-c2pa-in-images): watermark trong nội dung khác metadata; khả năng kiểm tra phụ thuộc dịch vụ và loại tín hiệu được hỗ trợ. Chưa xác nhận public image-verification API phù hợp để tích hợp.
- [DocTamper — repo tác giả](https://github.com/qcf-568/DocTamper): dataset gốc không bao phủ AIGC text tampering và giới hạn non-commercial; không mặc định dùng cho SaaS.
- [TruFor — repo tác giả](https://github.com/grip-unina/TruFor): có localization/reliability map; README giới hạn informational/nonprofit. Quyền dùng thương mại code/weights cần làm rõ trước tích hợp.
- [AIForge-Doc — preprint 2026](https://arxiv.org/html/2602.20569v1): benchmark sửa trường số nhỏ bằng AI trên receipts/forms; tác giả báo cáo hạn chế đáng kể của các detector zero-shot. Kết quả này không chứng minh độ chính xác trên GCN Việt Nam và không được dùng làm claim cho prototype này.

## 9. Unresolved

- Tập GCN mẫu, quyền sử dụng và nguồn bản gốc; cơ chế xác minh đơn vị cấp.
- Cỡ mẫu, target false-positive/recall, ngưỡng và báo cáo benchmark detector.
- OCR/model/provider, quyền thương mại code/weights/data, ngân sách và thiết bị mục tiêu.
- Chính sách lưu/thu mẫu, consent và legal review nếu bổ sung cloud/provider.
- Canonical domain, payment path, ICP toàn sản phẩm, social URLs và ngày launch chính xác: **TBD**.
