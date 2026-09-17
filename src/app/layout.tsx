import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { absolute: "Rà soát ảnh Giấy Chứng Nhận (GCN)" },
  description:
    "Prototype hỗ trợ đọc metadata ảnh và đối chiếu ảnh minh chứng với bản gốc tham chiếu. Kết quả cần được con người xem xét.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <div className="h-screen flex flex-col overflow-hidden bg-[#F7FAFC] text-[#172033] selection:bg-[#BCEBFA] print:h-auto print:overflow-visible">
          <main className="flex-1 flex w-full flex-col overflow-hidden print:h-auto print:overflow-visible">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
