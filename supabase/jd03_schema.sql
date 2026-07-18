-- ============================================================================
-- STELLAPET (jd-03) 리더보드 스키마
-- 공유 Supabase 프로젝트 사용을 전제로 모든 생성 요소에 jd03_ 접두사를 쓴다.
-- 실행: Supabase 대시보드 → SQL Editor에 전체 붙여넣기 → Run
-- 전제: Authentication → Sign In / Up → Anonymous sign-ins 활성화
-- ============================================================================

-- 펫 프로필 — 익명 auth 유저(기기)당 1행. 업적 화면·누적 보드의 원본
create table if not exists jd03_pets (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 10),
  stage int not null default 0 check (stage between 0 and 3),
  branch text not null default 'balanced' check (branch in ('balanced', 'speed', 'pull')),
  debris_kg bigint not null default 0 check (debris_kg >= 0 and debris_kg < 100000000),
  total_encounters int not null default 0 check (total_encounters >= 0),
  sortie_best_kg int not null default 0 check (sortie_best_kg between 0 and 999999),
  mission_started_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 주간 신기록 — (펫, 주차)당 1행. week는 KST 기준 ISO 주차 'YYYY-Www'
create table if not exists jd03_weekly_sorties (
  pet_id uuid not null references jd03_pets (id) on delete cascade,
  week text not null check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  best_kg int not null check (best_kg between 1 and 999999),
  eaten int not null default 0 check (eaten >= 0),
  hits int not null default 0 check (hits >= 0),
  updated_at timestamptz not null default now(),
  primary key (pet_id, week)
);

create index if not exists jd03_weekly_sorties_rank_idx
  on jd03_weekly_sorties (week, best_kg desc);
create index if not exists jd03_pets_debris_idx
  on jd03_pets (debris_kg desc);

-- 명예의 전당 — 주차별 1위 (조회 시 계산, 배치 잡 불필요)
create or replace view jd03_hall_of_fame
  with (security_invoker = on) as
select distinct on (w.week)
  w.week, w.best_kg, w.eaten, w.hits, w.pet_id, p.name, p.stage, p.branch
from jd03_weekly_sorties w
join jd03_pets p on p.id = w.pet_id
order by w.week desc, w.best_kg desc, w.updated_at asc;

-- ----------------------------------------------------------------------------
-- RLS: 읽기는 전체 공개, 쓰기는 본인 행만 (신뢰 기반 — 값 검증은 위 check 제약뿐)
-- ----------------------------------------------------------------------------
alter table jd03_pets enable row level security;
alter table jd03_weekly_sorties enable row level security;

drop policy if exists jd03_pets_select_all on jd03_pets;
create policy jd03_pets_select_all on jd03_pets
  for select using (true);
drop policy if exists jd03_pets_insert_own on jd03_pets;
create policy jd03_pets_insert_own on jd03_pets
  for insert with check (auth.uid() = id);
drop policy if exists jd03_pets_update_own on jd03_pets;
create policy jd03_pets_update_own on jd03_pets
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists jd03_weekly_select_all on jd03_weekly_sorties;
create policy jd03_weekly_select_all on jd03_weekly_sorties
  for select using (true);
drop policy if exists jd03_weekly_insert_own on jd03_weekly_sorties;
create policy jd03_weekly_insert_own on jd03_weekly_sorties
  for insert with check (auth.uid() = pet_id);
drop policy if exists jd03_weekly_update_own on jd03_weekly_sorties;
create policy jd03_weekly_update_own on jd03_weekly_sorties
  for update using (auth.uid() = pet_id) with check (auth.uid() = pet_id);
