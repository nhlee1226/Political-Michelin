/**
 * 뉴스 수집에 쓰는 언론사 공식 RSS 목록 (정치 섹션).
 *
 * 중립성 규칙: 통신사 + 성향이 다른 신문을 고르게 넣는다. 한쪽을 빼거나 더할 때는
 * 반대쪽도 같이 맞추고, 바꾼 이유를 PR 설명에 적는다.
 * 주소가 바뀌거나 막힌 피드는 수집기가 건너뛰고 로그에 [건너뜀]으로 알려준다.
 */
export interface Feed {
  outlet: string; // 화면에 보일 언론사명
  url: string;
  /** 전체 기사 피드만 있을 때: 기사 주소에 이 글자가 들어간 것만 씀 (예: 정치 섹션 경로) */
  only?: string;
}

export const FEEDS: Feed[] = [
  // 통신사
  { outlet: "연합뉴스", url: "https://www.yna.co.kr/rss/politics.xml" },
  { outlet: "뉴시스", url: "https://newsis.com/RSS/politics.xml" },
  // 인터넷 신문 (한겨레가 2026-11 수집기 요청을 403 으로 막아서, 우회하지 않고 성향 균형을 유지하려고 오마이뉴스로 바꿈)
  { outlet: "오마이뉴스", url: "https://rss.ohmynews.com/rss/politics.xml" },
  // 종합일간지
  { outlet: "경향신문", url: "https://www.khan.co.kr/rss/rssdata/politic_news.xml" },
  { outlet: "조선일보", url: "https://www.chosun.com/arc/outboundfeeds/rss/category/politics/?outputType=xml" },
  { outlet: "동아일보", url: "https://rss.donga.com/politics.xml" },
  { outlet: "국민일보", url: "https://www.kmib.co.kr/rss/data/kmibPolRss.xml" },
  { outlet: "서울신문", url: "https://www.seoul.co.kr/xml/rss/rss_politics.xml" },
  { outlet: "세계일보", url: "https://www.segye.com/Articles/RSSList/segye_politic.xml" },
];
