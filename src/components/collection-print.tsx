import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import type { SessionUser } from "@/lib/auth";
import { getCollection, listCollectionQuestions } from "@/lib/collections";
import { sourceLabel } from "@/lib/questions";

export async function CollectionPrintPage({
  user,
  collectionId,
}: {
  user: SessionUser;
  collectionId: string;
}) {
  const base = user.role === "counselor" ? "/counselor/collections" : "/student/collections";

  const collection = await getCollection(user.workspaceId, user.id, collectionId);
  if (!collection) notFound();

  const questions = (
    await listCollectionQuestions(user.workspaceId, user.id, collection.id)
  ).filter((question) => question.status === "active");
  const totalScore = questions.reduce((sum, question) => sum + question.score, 0);
  const fa = (value: number) => value.toLocaleString("fa-IR");

  return (
    <div className="stack print-sheet" style={{ gap: "0.8rem" }}>
      <div className="row between no-print">
        <Link href={`${base}/${collection.id}`} className="muted" style={{ fontSize: "0.82rem" }}>
          ← بازگشت به مجموعه
        </Link>
        <div className="row">
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            در پنجره چاپ، مقصد را «Save as PDF» انتخاب کنید.
          </span>
          <PrintButton label="چاپ / ذخیره PDF" />
        </div>
      </div>

      <div className="row between" style={{ alignItems: "flex-end" }}>
        <h2 style={{ margin: 0 }}>{collection.title}</h2>
        <div className="row">
          <span className="badge">{fa(questions.length)} سوال</span>
          <span className="badge">جمع بارم {fa(totalScore)}</span>
          <span className="badge">{new Date().toLocaleDateString("fa-IR")}</span>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="empty">سوال فعالی در این مجموعه نیست.</div>
      ) : (
        <>
          <div className="stack" style={{ gap: "0.7rem" }}>
            {questions.map((question, index) => (
              <div key={question.id} className="print-question">
                <div style={{ fontWeight: 700, whiteSpace: "pre-wrap" }}>
                  {fa(index + 1)}. {question.body}
                  <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem" }}>
                    {" "}
                    (بارم {fa(question.score)})
                  </span>
                </div>
                {question.optionsJson?.length ? (
                  <div style={{ marginTop: "0.25rem" }}>
                    {question.optionsJson.map((option, optionIndex) => (
                      <div key={optionIndex}>{fa(optionIndex + 1)}) {option}</div>
                    ))}
                  </div>
                ) : null}
                <div className="muted" style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>
                  منبع: {sourceLabel(question)}
                  {question.sourceRef ? ` — ${question.sourceRef}` : ""}
                </div>
              </div>
            ))}
          </div>

          <div className="answer-key-section stack" style={{ gap: "0.6rem", marginTop: "1rem" }}>
            <h2 style={{ margin: 0 }}>پاسخنامه</h2>
            {questions.map((question, index) => {
              const isMcq = question.type === "mcq" && question.optionsJson?.length;
              const correctIndex = isMcq ? Number(question.correctJson) : NaN;
              const answerText = isMcq
                ? `گزینه ${fa(correctIndex)}${
                    question.optionsJson?.[correctIndex - 1]
                      ? ` — ${question.optionsJson[correctIndex - 1]}`
                      : ""
                  }`
                : String(question.correctJson ?? "");
              return (
                <div key={question.id} className="print-question">
                  <div style={{ fontWeight: 700 }}>
                    {fa(index + 1)}. {answerText}
                  </div>
                  {question.explanation ? (
                    <div style={{ whiteSpace: "pre-wrap" }}>{question.explanation}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
