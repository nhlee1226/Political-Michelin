/**
 * 의원별 의정활동 점수 (정치인 표·상세·숫자 카드가 같은 기준을 쓰도록 한 곳에 모음)
 *
 * 기준(정당·이념과 무관, 국회 공개 데이터만):
 *  - 대표발의 수: 22대에 대표발의한 법안 수
 *  - 반영 법안: 그중 원안가결·수정가결 또는 대안반영폐기(위원회 대안에 내용이 들어감)된 수
 *  - 반영률 = 반영 법안 / 대표발의 수
 *  - 별점: 300명 안에서 대표발의 수 순위(백분위)와 반영 법안 수 순위의 평균
 *          상위 20% = 3개, 상위 50% = 2개, 나머지 = 1개
 * 공약 이행률·출석률은 공식 API가 없어 점수에 넣지 않습니다. 표결 참여율은 표결 수집 후 추가 예정.
 */
import { sql } from "./db";

export const SCORE_RULE = "별점 = 대표발의 수 순위와 반영 법안 수 순위의 평균 (상위 20% ★★★, 상위 50% ★★). 정당·이념 변수 없음";

export function memberScores(monaCd: string | null, region: string | null) {
  return sql`
    with base as (
      select s.mona_cd, s.name, s.party_id, s.region_code, s.district, s.term,
             m.elect_type, m.committee,
             s.bills_proposed::int as bills_proposed,
             (select count(*)::int from bills b
               where b.proposer_mona_cd = s.mona_cd
                 and (b.proc_result like '%가결%' or b.proc_result like '대안반영%')) as bills_reflected,
             coalesce(s.total_votes, 0)::int as total_votes, s.vote_participation
      from member_stats s join members m using (mona_cd)
    ), ranked as (
      select *,
             -- 같은 값끼리는 가운데 순위를 줌 (percent_rank 와 cume_dist 의 평균)
             ((percent_rank() over (order by bills_proposed) + cume_dist() over (order by bills_proposed)) / 2
            + (percent_rank() over (order by bills_reflected) + cume_dist() over (order by bills_reflected)) / 2) / 2 as score
      from base
    )
    select mona_cd, name, party_id, region_code, district, term, elect_type, committee,
           bills_proposed, bills_reflected,
           case when bills_proposed > 0 then round(100.0 * bills_reflected / bills_proposed, 1) end as reflect_rate,
           total_votes, vote_participation,
           case when score >= 0.8 then 3 when score >= 0.5 then 2 else 1 end as stars
    from ranked
    where (${monaCd}::text is null or mona_cd = ${monaCd})
      and (${region}::text is null or region_code = ${region})
    order by name`;
}
