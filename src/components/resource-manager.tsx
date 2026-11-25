"use client";

import { useMemo, useState } from "react";
import {
  addResourceFromPoolAction,
  deleteResourceAction,
  updateChapterProgressAction,
  updateResourceAction,
  updateResourceCoverAction,
} from "@/app/actions/counselor";
import { SubmitButton } from "@/components/submit-button";
import { ResourceCover } from "@/components/resource-cover";
import { ResourcePicker } from "@/components/resource-picker";
import type { ResourceWithSubject } from "@/lib/counselor";
import { FIELD_LABELS } from "@/lib/subjects";

type SubjectOption = { id: string; title: string; kind: string; color?: string };

function subjectGroups(subjects: SubjectOption[]) {
  const general = subjects.filter((subject) => subject.kind !== "specialized");
  const specialized = subjects.filter((subject) => subject.kind !== "general");
  return { general, specialized };
}

function unitLabel(unitType: string): string {
  if (unitType === "exercise") return "تمرین";
  if (unitType === "page") return "صفحه";
  if (unitType === "chapter") return "فصل";
  return "تست";
}

function ResourceBookCard({
  resource,
  studentId,
}: {
  resource: ResourceWithSubject;
  studentId: string;
}) {
  const pct =
    resource.totalUnits === 0
      ? 0
      : Math.round((resource.completedUnits / resource.totalUnits) * 100);
  const totalTests = resource.chapters.reduce(
    (sum, chapter) => sum + chapter.testCount,
    0,
  );
  const totalExercises = resource.chapters.reduce(
    (sum, chapter) => sum + chapter.exerciseCount,
    0,
  );
  const showTests = totalTests > 0;
  const showExercises = totalExercises > 0;

  return (
    <details className="card" style={{ boxShadow: "none" }}>
      <summary style={{ cursor: "pointer" }}>
        <span className="row between" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          <span className="resource-title-cell">
            <ResourceCover
              coverUrl={resource.coverUrl}
              title={resource.title}
              subjectTitle={resource.subjectTitle}
              size="sm"
            />
            <strong>{resource.title}</strong>
          </span>
          <span className="badge">{pct.toLocaleString("fa-IR")}٪ پیشرفت</span>
        </span>
        <span className="muted" style={{ display: "block", fontSize: "0.78rem" }}>
          {resource.completedUnits.toLocaleString("fa-IR")}/
          {resource.totalUnits.toLocaleString("fa-IR")} {unitLabel(resource.unitType)}
          {" · "}
          {resource.chapters.length.toLocaleString("fa-IR")} فصل
          {showTests && resource.unitType !== "test"
            ? ` · ${totalTests.toLocaleString("fa-IR")} تست`
            : ""}
          {showExercises && resource.unitType !== "exercise"
            ? ` · ${totalExercises.toLocaleString("fa-IR")} تمرین`
            : ""}
          {" · "}اولویت {resource.priority.toLocaleString("fa-IR")}
        </span>
        <span
          className="progress"
          style={{ display: "block", marginTop: "0.3rem" }}
          aria-hidden
        >
          <span style={{ width: `${Math.min(100, pct)}%` }} />
        </span>
      </summary>

      <div className="stack" style={{ gap: "0.7rem", marginTop: "0.6rem" }}>
        {resource.chapters.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>فصل</th>
                  {showTests ? <th>تست</th> : null}
                  {showExercises ? <th>تمرین</th> : null}
                  <th>ثبت پیشرفت</th>
                </tr>
              </thead>
              <tbody>
                {resource.chapters.map((chapter) => (
                  <tr key={chapter.id}>
                    <td>{chapter.title}</td>
                    {showTests ? (
                      <td>
                        {chapter.completedTests.toLocaleString("fa-IR")}/
                        {chapter.testCount.toLocaleString("fa-IR")}
                      </td>
                    ) : null}
                    {showExercises ? (
                      <td>
                        {chapter.completedExercises.toLocaleString("fa-IR")}/
                        {chapter.exerciseCount.toLocaleString("fa-IR")}
                      </td>
                    ) : null}
                    <td>
                      <form
                        action={updateChapterProgressAction}
                        className="row"
                        style={{ gap: "0.2rem", flexWrap: "wrap" }}
                      >
                        <input type="hidden" name="studentId" value={studentId} />
                        <input type="hidden" name="resourceId" value={resource.id} />
                        <input type="hidden" name="chapterId" value={chapter.id} />
                        {showTests ? (
                          <input
                            name="completedTests"
                            type="number"
                            min={0}
                            defaultValue={chapter.completedTests}
                            style={{ width: "58px" }}
                            aria-label="تست انجام‌شده"
                          />
                        ) : null}
                        {showExercises ? (
                          <input
                            name="completedExercises"
                            type="number"
                            min={0}
                            defaultValue={chapter.completedExercises}
                            style={{ width: "58px" }}
                            aria-label="تمرین انجام‌شده"
                          />
                        ) : null}
                        <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
                          ثبت
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ padding: "0.6rem" }}>
            برای این منبع فصل‌بندی ثبت نشده است.
          </div>
        )}

        <div className="row between" style={{ gap: "0.6rem", flexWrap: "wrap" }}>
          <form action={updateResourceAction} className="row" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="resourceId" value={resource.id} />
            <input type="hidden" name="unitType" value={resource.unitType} />
            <span className="muted" style={{ fontSize: "0.78rem" }}>
              پیشرفت کل:
            </span>
            <input
              name="completedUnits"
              type="number"
              min={0}
              defaultValue={resource.completedUnits}
              style={{ width: "72px" }}
              aria-label="انجام‌شده"
            />
            <span className="muted">/</span>
            <input
              name="totalUnits"
              type="number"
              min={0}
              defaultValue={resource.totalUnits}
              style={{ width: "72px" }}
              aria-label="کل"
            />
            <select
              name="priority"
              defaultValue={String(resource.priority)}
              style={{ width: "80px" }}
              aria-label="اولویت"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
              ذخیره
            </SubmitButton>
          </form>

          <form
            action={updateResourceCoverAction}
            className="row"
            encType="multipart/form-data"
            style={{ gap: "0.35rem", flexWrap: "wrap" }}
          >
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="resourceId" value={resource.id} />
            <input type="file" name="cover" accept="image/*" style={{ maxWidth: "180px" }} />
            <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">
              {resource.coverUrl ? "تغییر جلد" : "افزودن جلد"}
            </SubmitButton>
          </form>

          <form action={deleteResourceAction}>
            <input type="hidden" name="studentId" value={studentId} />
            <input type="hidden" name="resourceId" value={resource.id} />
            <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
              حذف منبع
            </SubmitButton>
          </form>
        </div>
      </div>
    </details>
  );
}

export type PoolResourceOption = {
  id: string;
  subjectId: string;
  subjectTitle: string;
  title: string;
  publisher: string;
  grade: string;
  totalUnits: number;
  coverUrl: string | null;
  coverSource: string | null;
  chapters: { id: string; title: string; testCount: number; exerciseCount: number }[];
};

export function ResourceManager({
  studentId,
  field,
  resources,
  subjects,
  poolResources,
}: {
  studentId: string;
  field?: string;
  resources: ResourceWithSubject[];
  subjects: SubjectOption[];
  poolResources: PoolResourceOption[];
}) {
  const groups = subjectGroups(subjects);
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [poolId, setPoolId] = useState("");
  const [priority, setPriority] = useState("3");

  const poolForSubject = useMemo(
    () => poolResources.filter((resource) => resource.subjectId === subjectId),
    [poolResources, subjectId],
  );
  const selectedPool = poolForSubject.find((resource) => resource.id === poolId);

  const sections = useMemo(() => {
    const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]));
    const bySubject = new Map<string, ResourceWithSubject[]>();
    for (const resource of resources) {
      const list = bySubject.get(resource.subjectId) ?? [];
      list.push(resource);
      bySubject.set(resource.subjectId, list);
    }

    const build = (kind: "specialized" | "general") =>
      [...bySubject.entries()]
        .filter(([id]) => {
          const subjectKind = subjectMap.get(id)?.kind ?? "specialized";
          return kind === "specialized"
            ? subjectKind !== "general"
            : subjectKind === "general";
        })
        .map(([id, list]) => ({
          id,
          title: subjectMap.get(id)?.title ?? list[0]?.subjectTitle ?? "",
          resources: [...list].sort((a, b) => a.title.localeCompare(b.title, "fa")),
        }))
        .sort((a, b) => a.title.localeCompare(b.title, "fa"));

    const fieldLabel = field ? FIELD_LABELS[field] ?? field : null;
    return [
      {
        key: "specialized",
        title: fieldLabel ? `دروس اختصاصی — ${fieldLabel}` : "دروس اختصاصی",
        subjects: build("specialized"),
      },
      { key: "general", title: "دروس عمومی", subjects: build("general") },
    ].filter((section) => section.subjects.length > 0);
  }, [field, resources, subjects]);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="card">
        <div className="section-head">
          <div>
            <h2>فهرست منابع</h2>
            <small>
              منابع به ترتیب دروس اختصاصی و عمومی، سپس درس و کتاب دسته‌بندی شده‌اند. برای دیدن
              فصل‌بندی و آمار تست/تمرین هر کتاب، روی آن کلیک کنید.
            </small>
          </div>
          <small>{resources.length.toLocaleString("fa-IR")} منبع</small>
        </div>

        {resources.length === 0 ? (
          <div className="empty">هنوز منبعی ثبت نشده است.</div>
        ) : (
          <div className="stack" style={{ gap: "1rem" }}>
            {sections.map((section) => (
              <div key={section.key} className="stack" style={{ gap: "0.6rem" }}>
                <h3 style={{ margin: 0 }}>{section.title}</h3>
                {section.subjects.map((subject) => (
                  <div key={subject.id} className="stack" style={{ gap: "0.4rem" }}>
                    <div className="row between">
                      <h4 style={{ margin: 0, fontSize: "0.95rem" }}>{subject.title}</h4>
                      <span className="muted" style={{ fontSize: "0.76rem" }}>
                        {subject.resources.length.toLocaleString("fa-IR")} منبع
                      </span>
                    </div>
                    {subject.resources.map((resource) => (
                      <ResourceBookCard
                        key={resource.id}
                        resource={resource}
                        studentId={studentId}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>افزودن منبع از استخر</h2>
          <small>
            فقط منابع رشته همین دانش‌آموز نمایش داده می‌شود؛ فصل‌بندی و تعداد تست/تمرین از قبل ثبت شده است.
          </small>
        </div>
        <form action={addResourceFromPoolAction} className="form-grid">
          <input type="hidden" name="studentId" value={studentId} />
          <div className="field">
            <label>درس</label>
            <select
              name="subjectId"
              required
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value);
                setPoolId("");
              }}
            >
              <optgroup label="عمومی">
                {groups.general.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="تخصصی">
                {groups.specialized.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>منبع از استخر</label>
            <ResourcePicker
              name="poolId"
              value={poolId}
              onChange={setPoolId}
              resources={poolForSubject.map((resource) => ({
                id: resource.id,
                title: resource.title,
                subjectId: resource.subjectId,
                subjectTitle: resource.subjectTitle,
                publisher: resource.publisher,
                grade: resource.grade,
                coverUrl: resource.coverUrl,
                chapters: resource.chapters,
              }))}
              ariaLabel="انتخاب منبع از استخر"
            />
            {poolForSubject.length === 0 ? (
              <small className="muted">برای این درس هنوز منبعی در استخر ثبت نشده است.</small>
            ) : null}
          </div>
          {selectedPool ? (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>فصل‌های این منبع</label>
              <small className="muted">
                {selectedPool.chapters
                  .slice(0, 6)
                  .map(
                    (chapter) =>
                      `${chapter.title} (${chapter.testCount.toLocaleString("fa-IR")} تست)`,
                  )
                  .join(" · ")}
                {selectedPool.chapters.length > 6 ? " …" : ""}
              </small>
            </div>
          ) : null}
          <div className="field">
            <label>اولویت</label>
            <select
              name="priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <SubmitButton className="btn-secondary">افزودن از استخر</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
