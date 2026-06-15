-- Migration v4 : Annotations de correction (RF-10)
-- Permet aux enseignants d'annoter des parties spécifiques des copies

-- ============================================================
-- Table : correction_annotations
-- ============================================================
create table if not exists correction_annotations (
    id              bigint generated always as identity primary key,
    correction_id   bigint not null references corrections(id) on delete cascade,
    submission_id   bigint not null references submissions(id) on delete cascade,
    teacher_id      bigint not null references teachers(id) on delete cascade,
    exercise_id     bigint references exercises(id) on delete set null,
    annotation_type text not null default 'comment'
                    check (annotation_type in ('comment', 'correction', 'highlight', 'remark', 'error', 'praise')),
    selection_start integer,          -- position de début dans le texte de la copie
    selection_end   integer,          -- position de fin dans le texte
    selected_text   text,             -- le texte sélectionné/taggé
    content         text not null,    -- contenu de l'annotation
    score           numeric(5,2),     -- score optionnel pour cette partie
    max_score       numeric(5,2),     -- score max pour cette partie
    is_resolved     boolean not null default false,
    resolved_at     timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Index pour requêtes par soumission
create index if not exists idx_correction_annotations_submission
    on correction_annotations(submission_id);

create index if not exists idx_correction_annotations_correction
    on correction_annotations(correction_id);

create index if not exists idx_correction_annotations_teacher
    on correction_annotations(teacher_id);

-- ============================================================
-- Table : correction_rubrics (grilles d'évaluation)
-- ============================================================
create table if not exists correction_rubrics (
    id              bigint generated always as identity primary key,
    session_id      bigint not null references exam_sessions(id) on delete cascade,
    teacher_id      bigint not null references teachers(id) on delete cascade,
    title           text not null,
    description     text,
    criteria        jsonb not null default '[]'::jsonb,
    -- criteria: [{"id": "c1", "name": "...", "max_points": 5, "description": "..."}, ...]
    max_score       numeric(5,2),
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_correction_rubrics_session
    on correction_rubrics(session_id);

-- ============================================================
-- Colonnes additionnelles pour corrections
-- ============================================================
alter table corrections add column if not exists annotation_count integer not null default 0;
alter table corrections add column if not exists rubric_id bigint references correction_rubrics(id) on delete set null;
alter table corrections add column if not exists rubric_scores jsonb default '{}'::jsonb;
-- rubric_scores: {"c1": 4, "c2": 3, ...}

-- ============================================================
-- Trigger updated_at pour correction_annotations
-- ============================================================
create or replace function update_correction_annotations_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_correction_annotations_updated_at on correction_annotations;
create trigger trg_correction_annotations_updated_at
    before update on correction_annotations
    for each row execute function update_correction_annotations_updated_at();

-- ============================================================
-- Trigger : mettre à jour annotation_count sur corrections
-- ============================================================
create or replace function update_correction_annotation_count()
returns trigger as $$
begin
    if tg_op = 'INSERT' then
        update corrections
        set annotation_count = (
            select count(*) from correction_annotations where correction_id = new.correction_id
        )
        where id = new.correction_id;
        return new;
    elsif tg_op = 'DELETE' then
        update corrections
        set annotation_count = (
            select count(*) from correction_annotations where correction_id = old.correction_id
        )
        where id = old.correction_id;
        return old;
    end if;
end;
$$ language plpgsql;

drop trigger if exists trg_correction_annotations_count on correction_annotations;
create trigger trg_correction_annotations_count
    after insert or delete on correction_annotations
    for each row execute function update_correction_annotation_count();

-- ============================================================
-- RLS
-- ============================================================
alter table correction_annotations enable row level security;
alter table correction_rubrics enable row level security;

-- Les annotations sont accessibles par le propriétaire (teacher) et l'étudiant
create policy "Annotations accessibles par le teacher"
    on correction_annotations for select
    using (teacher_id = auth.uid()::bigint);

create policy "Rubrics accessibles par le teacher"
    on correction_rubrics for select
    using (teacher_id = auth.uid()::bigint);
