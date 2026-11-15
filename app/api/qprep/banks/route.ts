import { NextRequest } from "next/server";
import { jsonResponse, optionsResponse } from "@/lib/cors";
import { getUserByImportToken, listBanks } from "@/lib/questions";

function tokenFrom(request: NextRequest, bodyToken?: string): string {
  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (
    bodyToken ??
    request.nextUrl.searchParams.get("token") ??
    request.headers.get("x-seemorgh-token") ??
    ""
  );
}

export async function GET(request: NextRequest) {
  const user = await getUserByImportToken(tokenFrom(request));
  if (!user) {
    return jsonResponse({ ok: false, error: "کد اتصال نامعتبر است." }, { status: 401 });
  }

  const banks = await listBanks(user.workspaceId, user.id);
  return jsonResponse({
    ok: true,
    owner: user.name,
    banks: banks.map((bank) => ({
      id: bank.id,
      title: bank.title,
      subjectTitle: bank.subjectTitle,
      total: bank.total,
    })),
  });
}

export async function OPTIONS() {
  return optionsResponse();
}
