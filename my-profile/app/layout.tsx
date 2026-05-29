import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { Toaster } from "sonner";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "700", "900"],
  variable: "--font-noto-sans-kr",
});

export const metadata: Metadata = {
  title: "MYLINK",
  description: "바이브코딩으로 개인화된 프로필과 링크를 간편하게 관리하는 MYLINK 공간입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKR.variable} antialiased`}>
        <Providers>
          {children}
          <Toaster 
            position="bottom-right" 
            toastOptions={{
              style: {
                background: "#000",
                color: "#fff",
                border: "1px solid #000",
                borderRadius: "0px",
                fontFamily: "var(--font-noto-sans-kr)",
                fontSize: "11px",
                letterSpacing: "0.1em",
                textTransform: "uppercase"
              }
            }} 
          />
        </Providers>
      </body>
    </html>
  );
}
