import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PoliticianLinkProvider } from "@/components/politician/politician-link";

export const metadata: Metadata = {
  title: "정치 미슐랭 | Political Michelin",
  description: "지도 기반 인터페이스와 AI 분석으로 대한민국 정치 정보를 객관적으로 한눈에.",
};

/** 저장된 테마(src/lib/theme.ts 의 "pm-theme" 키)를 첫 페인트 전에 적용 */
// 테마·글자 크기를 첫 페인트 전에 적용 (src/lib/theme.ts, src/lib/font-size.ts 와 같은 localStorage 키)
const THEME_INIT_SCRIPT = `try{var d=document.documentElement;if(localStorage.getItem("pm-theme")==="light")d.dataset.theme="light";var f=localStorage.getItem("pm-font-size");if(f==="sm"||f==="lg"||f==="xl")d.dataset.fontSize=f}catch(e){}`;

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
      <body>
        {/* 정치인 이름을 누르면 옆에 "정치인 상세 페이지로 이동" 버튼 (사이트 전체) */}
        <PoliticianLinkProvider>{children}</PoliticianLinkProvider>
      </body>
    </html>
  );
}
