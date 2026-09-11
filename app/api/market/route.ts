import { marketSnapshot } from "@/lib/market";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await marketSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Testnet RPC is temporarily unavailable. Please retry." },
      { status: 503 },
    );
  }
}
