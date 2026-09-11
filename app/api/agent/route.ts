import { runAction } from "@/lib/market";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json(
        { error: "Cross-origin requests are not supported." },
        { status: 403 },
      );
    const raw = await request.text();
    if (raw.length > 4096)
      return Response.json({ error: "Request too large." }, { status: 413 });
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw Error("Invalid request.");
    return Response.json(await runAction(body), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : "The agent could not complete this action.";
    // Provider errors can include transaction internals; keep those off the public endpoint.
    const safe =
      message.length < 240 && !message.includes("0x")
        ? message
        : "The testnet transaction could not be confirmed. Retry the same session to recover; do not create another purchase.";
    return Response.json(
      { error: safe },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
