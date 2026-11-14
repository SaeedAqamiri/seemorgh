"use client";

import { useMemo, useState } from "react";
import {
  addResourceFromPoolAction,
  deleteResourceAction,
  updateChapterProgressAction,
  updateResourceAction,
} from "@/app/actions/counselor";
import { SubmitButton } from "@/components/submit-button";
import type { ResourceWithSubject } from "@/lib/counselor";
import { formatChapterPlan } from "@/lib/resources";
import { UNIT_TYPE_LABELS } from "@/lib/subjects";

type SubjectOption = { id: string; title: string; kind: string; color?: string };

function subjectGroups(subjects: SubjectOption[]) {
  const general = subjects.filter((subject) => subject.kind !== "specialized");
  const specialized = subjects.filter((subject) => subject.kind !== "general");
  return { general, specialized };
}

export type PoolResourceOption = {
  id: string;
  subjectId: string;
  subjectTitle: string;
  title: string;
  publisher: string;
  grade: string;
  totalUnits: number;
  chapters: { id: string; title: string; testCount: number; exerciseCount: number }[];
};

export function ResourceManager({
  studentId,
  resources,
  subjects,
  poolResources,
}: {
  studentId: string;
  resources: ResourceWithSubject[];
  subjects: SubjectOption[];
  poolResources: PoolResourceOption[];
}) {
  const groups = subjectGroups(subjects);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [poolId, setPoolId] = useState("");
  const [priority, setPriority] = useState("3");

  const poolForSubject = useMemo(
    () => poolResources.filter((resource) => resource.subjectId === subjectId),
    [poolResources, subjectId],
  );
  const selectedPool = poolForSubject.find((resource) => resource.id === poolId);

  return (
    <div className="stack" style={{ gap: "1rem" }}>
      <div className="card">
        <div className="section-head">
          <div>
            <h2>فهرست منابع</h2>
            <small>
              پیشرفت هر فصل به صورت تست، تمرین و صفحه جداگانه ثبت می‌شود؛ گزارش عملکرد هم این
              پیشرفت را خودکار به‌روز می‌کند.
            </small>
          </div>
          <small>{resources.length} منبع</small>
        </div>

        {resources.length === 0 ? (
          <div className="empty">هنوز منبعی ثبت نشده است.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>منبع</th>
                  <th>نوع</th>
                  <th>پیشرفت</th>
                  <th>اولویت</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resources.map((resource) => {
                  const pct =
                    resource.totalUnits === 0
                      ? 0
                      : Math.round((resource.completedUnits / resource.totalUnits) * 100);
                  return (
                    <tr key={resource.id}>
                      <td>
                        <strong>{resource.subjectTitle}</strong>
                        <div className="muted" style={{ fontSize: "0.78rem" }}>
                          {resource.title}
                        </div>
                        <div className="progress" style={{ marginTop: "0.3rem" }}>
                          <span style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        {resource.chapters.length ? (
                          <details style={{ marginTop: "0.35rem" }}>
                            <summary className="muted" style={{ fontSize: "0.78rem", cursor: "pointer" }}>
                              {resource.chapters.length} فصل — پیشرفت تفکیکی
                            </summary>
                            <div className="table-wrap" style={{ marginTop: "0.35rem" }}>
                              <table>
                                <thead>
                                  <tr>
                                    <th>فصل</th>
                                    <th>تست</th>
                                    <th>تمرین</th>
                                    <th>صفحه</th>
                                    <th />
                                  </tr>
                                </thead>
                                <tbody>
                                  {resource.chapters.map((chapter) => (
                                    <tr key={chapter.id}>
                                      <td>{chapter.title}</td>
                                      <td>
                                        {chapter.completedTests.toLocaleString("fa-IR")}/
                                        {chapter.testCount.toLocaleString("fa-IR")}
                                      </td>
                                      <td>
                                        {chapter.completedExercises.toLocaleString("fa-IR")}/
                                        {chapter.exerciseCount.toLocaleString("fa-IR")}
                                      </td>
                                      <td>
                                        {chapter.completedPages.toLocaleString("fa-IR")}/
                                        {chapter.pages.toLocaleString("fa-IR")}
                                      </td>
                                      <td>
                                        <form
                                          action={updateChapterProgressAction}
                                          className="row"
                                          style={{ gap: "0.2rem", flexWrap: "wrap" }}
                                        >
                                          <input type="hidden" name="studentId" value={studentId} />
                                          <input type="hidden" name="resourceId" value={resource.id} />
                                          <input type="hidden" name="chapterId" value={chapter.id} />
                                          <input
                                            name="completedTests"
                                            type="number"
                                            min={0}
                                            defaultValue={chapter.completedTests}
                                            style={{ width: "58px" }}
                                            aria-label="تست انجام‌شده"
                                          />
                                          <input
                                            name="completedExercises"
                                            type="number"
                                            min={0}
                                            defaultValue={chapter.completedExercises}
                                            style={{ width: "58px" }}
                                            aria-label="تمرین انجام‌شده"
                                          />
                                          <input
                                            name="completedPages"
                                            type="number"
                                            min={0}
                                            defaultValue={chapter.completedPages}
                                            style={{ width: "58px" }}
                                            aria-label="صفحه انجام‌شده"
                                          />
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
                          </details>
                        ) : null}
                      </td>
                      <td>{UNIT_TYPE_LABELS[resource.unitType]}</td>
                      <td>
                        <form action={updateResourceAction} className="stack" style={{ gap: "0.25rem" }}>
                          <input type="hidden" name="studentId" value={studentId} />
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <input type="hidden" name="unitType" value={resource.unitType} />
                          <div className="row" style={{ gap: "0.25rem" }}>
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
                          </div>
                          <div className="field">
                            <label style={{ fontSize: "0.72rem" }}>
                              فصل‌بندی (هر خط: عنوان | تست | تمرین | صفحه)
                            </label>
                            <textarea
                              name="chapters"
                              rows={3}
                              defaultValue={formatChapterPlan(resource.chaptersJson)}
                              style={{ minHeight: "62px", fontSize: "0.78rem" }}
                            />
                          </div>
                          <div className="row" style={{ gap: "0.25rem" }}>
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
                          </div>
                        </form>
                      </td>
                      <td>{resource.priority}</td>
                      <td>
                        <form action={deleteResourceAction}>
                          <input type="hidden" name="studentId" value={studentId} />
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <SubmitButton className="btn-danger btn-sm" pendingLabel="…">
                            حذف
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>افزودن منبع از استخر</h2>
          <small>
            منبع را از استخر منابع دفتر انتخاب کنید؛ فصل‌بندی و تعداد تست/تمرین از قبل ثبت شده است.
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
            <select
              name="poolId"
              required
              value={poolId}
              onChange={(event) => setPoolId(event.target.value)}
            >
              <option value="">منبع را انتخاب کنید…</option>
              {poolForSubject.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.title}
                  {resource.grade ? ` (${resource.grade})` : ""} —{" "}
                  {resource.totalUnits.toLocaleString("fa-IR")} تست · {resource.chapters.length} فصل
                </option>
              ))}
            </select>
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
