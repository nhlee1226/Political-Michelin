import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "정치 미슐랭 | Political Michelin",
  description: "지도 기반 인터페이스와 AI 분석으로 대한민국 정치 정보를 객관적으로 한눈에.",
};

/** 저장된 테마(src/lib/theme.ts 의 "pm-theme" 키)를 첫 페인트 전에 적용 */
const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("pm-theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export const viewport: Viewport = { themeColor: "#0d0f12" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Pretendard (한글 UI 폰트) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
