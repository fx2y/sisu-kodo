import { NextResponse } from "next/server";
import { getServices } from "@src/server/singleton";
import { getArtifactService } from "@src/server/ui-api";

type Props = {
  params: Promise<{ id: string[] }>;
};

export async function GET(_req: Request, { params }: Props) {
  try {
    const { pool } = await getServices();
    const { id: segments } = await params;

    // Join segments back to restore original ID if it was split by slashes
    // This handles both encoded and unencoded slashes depending on how Next.js receives it.
    const id = decodeURIComponent(segments.join("/"));

    const artifact = await getArtifactService(pool, id);
    if (!artifact) {
      return NextResponse.json({ error: "artifact not found" }, { status: 404 });
    }

    const jsonKinds = new Set(["json", "raw", "timings", "artifact_index", "question_card"]);
    const textKinds = new Set(["text", "stdout", "stderr", "none", "file"]);

    const contentType = jsonKinds.has(artifact.kind)
      ? "application/json"
      : artifact.kind === "svg"
        ? "image/svg+xml"
        : "text/plain";

    if (artifact.inline) {
      let body: string;
      if (jsonKinds.has(artifact.kind)) {
        try {
          const inlineObj =
            typeof artifact.inline === "string" ? JSON.parse(artifact.inline) : artifact.inline;
          const finalData =
            inlineObj.json !== undefined
              ? inlineObj.json
              : inlineObj.text !== undefined
                ? inlineObj.text
                : inlineObj;
          body = typeof finalData === "string" ? finalData : JSON.stringify(finalData, null, 2);
        } catch {
          body =
            typeof artifact.inline === "string" ? artifact.inline : JSON.stringify(artifact.inline);
        }
      } else if (textKinds.has(artifact.kind)) {
        try {
          const inlineObj =
            typeof artifact.inline === "string" ? JSON.parse(artifact.inline) : artifact.inline;
          body =
            inlineObj.text !== undefined
              ? inlineObj.text
              : typeof inlineObj === "string"
                ? inlineObj
                : JSON.stringify(inlineObj, null, 2);
        } catch {
          body =
            typeof artifact.inline === "string" ? artifact.inline : JSON.stringify(artifact.inline);
        }
      } else {
        body =
          typeof artifact.inline === "string" ? artifact.inline : JSON.stringify(artifact.inline);
      }
      return new Response(body, {
        status: 200,
        headers: { "content-type": contentType }
      });
    } else {
      return NextResponse.json(artifact, { status: 200 });
    }
  } catch (error: unknown) {
    console.error(`[API] GET /api/artifacts/:id error:`, error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
